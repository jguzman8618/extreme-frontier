import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import db from './db';
import {
  MAP_W, MAP_H, terrainAt, isWalkable,
  RESOURCE_NODES, randomFreeResourceSpot,
  PLOTS, plotAt,
  CROPS, BUILDINGS, LIVESTOCK, STARTING_INVENTORY,
  SHOP_LOCATION, SELL_PRICES, CRAFT_RECIPES,
  HOMESTEAD_COST, MAX_HOMESTEADS_PER_PLAYER,
} from './world';
import { PlayerRow, CropRow, BuildingRow } from './types';

const app = express();
app.use(cors());
app.use(express.json());

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const hasClientBuild = fs.existsSync(path.join(PUBLIC_DIR, 'index.html'));
if (hasClientBuild) app.use(express.static(PUBLIC_DIR));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ---------- helpers ----------

function getPlayerById(id: string): PlayerRow | undefined {
  return db.prepare('SELECT * FROM players WHERE id = ?').get(id) as PlayerRow | undefined;
}

function getInventory(playerId: string): Record<string, number> {
  const rows = db.prepare('SELECT item, qty FROM inventory WHERE player_id = ?').all(playerId) as { item: string; qty: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.item] = r.qty;
  return out;
}

function addItem(playerId: string, item: string, qty: number) {
  db.prepare(`
    INSERT INTO inventory (player_id, item, qty) VALUES (?, ?, ?)
    ON CONFLICT(player_id, item) DO UPDATE SET qty = qty + excluded.qty
  `).run(playerId, item, qty);
}

function removeItem(playerId: string, item: string, qty: number): boolean {
  const row = db.prepare('SELECT qty FROM inventory WHERE player_id = ? AND item = ?').get(playerId, item) as { qty: number } | undefined;
  if (!row || row.qty < qty) return false;
  db.prepare('UPDATE inventory SET qty = qty - ? WHERE player_id = ? AND item = ?').run(qty, playerId, item);
  return true;
}

function allPlayersPublic() {
  return db.prepare('SELECT id, username, x, y FROM players').all() as Pick<PlayerRow, 'id' | 'username' | 'x' | 'y'>[];
}

function allPlotOwners(): Record<string, { ownerId: string; username: string; farmName: string | null }> {
  const rows = db.prepare(`
    SELECT po.plot_id, po.owner_id, po.farm_name, p.username FROM plot_owners po
    JOIN players p ON p.id = po.owner_id
  `).all() as { plot_id: string; owner_id: string; farm_name: string | null; username: string }[];
  const out: Record<string, { ownerId: string; username: string; farmName: string | null }> = {};
  for (const r of rows) out[r.plot_id] = { ownerId: r.owner_id, username: r.username, farmName: r.farm_name };
  return out;
}

function allBuildings(): BuildingRow[] {
  return db.prepare('SELECT * FROM buildings').all() as BuildingRow[];
}

function allCrops() {
  const rows = db.prepare('SELECT * FROM crops').all() as CropRow[];
  return rows.map((r) => {
    const cfg = CROPS[r.crop_type];
    const ready = !!cfg && Date.now() - r.planted_at >= cfg.growTimeMs;
    return { x: r.x, y: r.y, ownerId: r.owner_id, cropType: r.crop_type, plantedAt: r.planted_at, ready };
  });
}

interface LivestockRow { x: number; y: number; plot_id: string; owner_id: string; type: string; last_collected_at: number }
function allLivestock() {
  const rows = db.prepare('SELECT * FROM livestock').all() as LivestockRow[];
  return rows.map((r) => {
    const cfg = LIVESTOCK[r.type];
    const ready = !!cfg && Date.now() - r.last_collected_at >= cfg.produceTimeMs;
    return { x: r.x, y: r.y, ownerId: r.owner_id, type: r.type, lastCollectedAt: r.last_collected_at, ready };
  });
}

function seedResourceState(nodeId: string, defaultX: number, defaultY: number) {
  const existing = db.prepare('SELECT * FROM resource_state WHERE node_id = ?').get(nodeId);
  if (!existing) {
    db.prepare('INSERT INTO resource_state (node_id, x, y, depleted_until) VALUES (?, ?, ?, 0)').run(nodeId, defaultX, defaultY);
  }
}
for (const n of RESOURCE_NODES) seedResourceState(n.id, n.x, n.y);

function resourceNodeStates() {
  const rows = db.prepare('SELECT * FROM resource_state').all() as { node_id: string; x: number; y: number; depleted_until: number }[];
  const byId: Record<string, { x: number; y: number; depleted_until: number }> = {};
  for (const r of rows) byId[r.node_id] = r;
  return RESOURCE_NODES.map((n) => {
    const state = byId[n.id] ?? { x: n.x, y: n.y, depleted_until: 0 };
    return { ...n, x: state.x, y: state.y, depletedUntil: state.depleted_until, available: state.depleted_until <= Date.now() };
  });
}

function currentResourcePositions(): Record<string, { x: number; y: number }> {
  const rows = db.prepare('SELECT node_id, x, y FROM resource_state').all() as { node_id: string; x: number; y: number }[];
  const out: Record<string, { x: number; y: number }> = {};
  for (const r of rows) out[r.node_id] = { x: r.x, y: r.y };
  return out;
}

function findSpawnPoint(): { x: number; y: number } {
  let x = Math.floor(MAP_W / 2);
  let y = Math.floor(MAP_H / 2);
  for (let r = 0; r < 20 && !isWalkable(x, y); r++) x += 1;
  return { x, y };
}

function chebyshev(ax: number, ay: number, bx: number, by: number) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function distToRect(px: number, py: number, rx: number, ry: number, size: number) {
  const dx = Math.max(rx - px, 0, px - (rx + size - 1));
  const dy = Math.max(ry - py, 0, py - (ry + size - 1));
  return Math.max(dx, dy);
}

function hasBuilding(plotId: string, type: string): boolean {
  return !!db.prepare('SELECT 1 FROM buildings WHERE plot_id = ? AND type = ?').get(plotId, type);
}

function tileOccupied(x: number, y: number): boolean {
  return !!(
    db.prepare('SELECT 1 FROM buildings WHERE x = ? AND y = ?').get(x, y) ||
    db.prepare('SELECT 1 FROM crops WHERE x = ? AND y = ?').get(x, y) ||
    db.prepare('SELECT 1 FROM livestock WHERE x = ? AND y = ?').get(x, y)
  );
}

// ---------- auth ----------

app.post('/api/login', (req: Request, res: Response) => {
  const { username } = req.body ?? {};
  if (!username || typeof username !== 'string' || username.trim().length < 2) {
    return res.status(400).json({ error: 'username required (min 2 chars)' });
  }
  const clean = username.trim().slice(0, 20);

  const existing = db.prepare('SELECT 1 FROM players WHERE username = ?').get(clean);
  if (existing) return res.status(409).json({ error: 'that username is already taken' });

  const id = randomUUID();
  const spawn = findSpawnPoint();
  db.prepare('INSERT INTO players (id, username, x, y, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, clean, spawn.x, spawn.y, Date.now());
  for (const [item, qty] of Object.entries(STARTING_INVENTORY)) addItem(id, item, qty);

  const player = getPlayerById(id)!;
  io.emit('playerJoined', { id: player.id, username: player.username, x: player.x, y: player.y });
  res.json({ token: player.id, player, inventory: getInventory(id) });
});

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
  const player = token ? getPlayerById(token) : undefined;
  if (!player) return res.status(401).json({ error: 'unauthorized' });
  (req as any).player = player as PlayerRow;
  next();
}

app.post('/api/discord/token', async (req: Request, res: Response) => {
  const { code } = req.body ?? {};
  if (!code) return res.status(400).json({ error: 'code required' });
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'server missing DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET' });
  }
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code }),
    });
    if (!tokenRes.ok) return res.status(502).json({ error: 'discord token exchange failed', detail: await tokenRes.text() });
    const tokenData = await tokenRes.json();
    res.json({ access_token: tokenData.access_token });
  } catch {
    res.status(502).json({ error: 'discord token exchange failed' });
  }
});

app.post('/api/login/discord', async (req: Request, res: Response) => {
  const { access_token } = req.body ?? {};
  if (!access_token) return res.status(400).json({ error: 'access_token required' });
  try {
    const meRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${access_token}` } });
    if (!meRes.ok) return res.status(401).json({ error: 'invalid discord access token' });
    const me = await meRes.json();

    let player = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(me.id) as PlayerRow | undefined;
    if (!player) {
      const id = randomUUID();
      const baseName = (me.username as string).slice(0, 20);
      let candidate = baseName;
      let n = 1;
      while (db.prepare('SELECT 1 FROM players WHERE username = ?').get(candidate)) candidate = `${baseName}${++n}`;
      const spawn = findSpawnPoint();
      db.prepare('INSERT INTO players (id, username, discord_id, x, y, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, candidate, me.id, spawn.x, spawn.y, Date.now());
      for (const [item, qty] of Object.entries(STARTING_INVENTORY)) addItem(id, item, qty);
      player = getPlayerById(id)!;
      io.emit('playerJoined', { id: player.id, username: player.username, x: player.x, y: player.y });
    }
    res.json({ token: player.id, player, inventory: getInventory(player.id) });
  } catch {
    res.status(502).json({ error: 'discord user lookup failed' });
  }
});

// ---------- world + state ----------

app.get('/api/world', (_req: Request, res: Response) => {
  const terrain: string[][] = [];
  for (let y = 0; y < MAP_H; y++) {
    const row: string[] = [];
    for (let x = 0; x < MAP_W; x++) row.push(terrainAt(x, y));
    terrain.push(row);
  }
  res.json({
    mapW: MAP_W,
    mapH: MAP_H,
    terrain,
    plots: PLOTS,
    crops: CROPS,
    buildings: BUILDINGS,
    livestock: LIVESTOCK,
    shopLocation: SHOP_LOCATION,
    sellPrices: SELL_PRICES,
    craftRecipes: CRAFT_RECIPES,
    homesteadCost: HOMESTEAD_COST,
    maxHomesteads: MAX_HOMESTEADS_PER_PLAYER,
  });
});

app.get('/api/state', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  res.json({
    player,
    inventory: getInventory(player.id),
    players: allPlayersPublic(),
    plotOwners: allPlotOwners(),
    buildings: allBuildings(),
    crops: allCrops(),
    livestock: allLivestock(),
    resourceNodes: resourceNodeStates(),
  });
});

// ---------- movement ----------

app.post('/api/move', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const { x, y } = req.body ?? {};
  if (typeof x !== 'number' || typeof y !== 'number') return res.status(400).json({ error: 'x,y required' });

  const dx = Math.abs(x - player.x);
  const dy = Math.abs(y - player.y);
  if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) return res.status(400).json({ error: 'can only move one tile at a time' });
  if (!isWalkable(x, y)) return res.status(400).json({ error: 'not walkable' });
  const blocked = db.prepare('SELECT type FROM buildings WHERE x = ? AND y = ?').get(x, y) as { type: string } | undefined;
  if (blocked) return res.status(400).json({ error: `blocked by a ${blocked.type}` });

  db.prepare('UPDATE players SET x = ?, y = ? WHERE id = ?').run(x, y, player.id);
  io.emit('playerMoved', { id: player.id, x, y });
  res.json({ x, y });
});

// ---------- gathering ----------

app.post('/api/gather', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const { nodeId } = req.body ?? {};
  const nodeCfg = RESOURCE_NODES.find((n) => n.id === nodeId);
  if (!nodeCfg) return res.status(400).json({ error: 'unknown resource node' });

  const positions = currentResourcePositions();
  const pos = positions[nodeId] ?? { x: nodeCfg.x, y: nodeCfg.y };
  if (chebyshev(player.x, player.y, pos.x, pos.y) > 1) return res.status(400).json({ error: 'too far away' });

  const stateRow = db.prepare('SELECT depleted_until FROM resource_state WHERE node_id = ?').get(nodeId) as { depleted_until: number } | undefined;
  if (stateRow && stateRow.depleted_until > Date.now()) return res.status(400).json({ error: 'not ready yet' });

  addItem(player.id, nodeCfg.type, nodeCfg.yieldAmount);

  const occupied = (x: number, y: number) => Object.values(positions).some((p) => p.x === x && p.y === y);
  const newSpot = randomFreeResourceSpot(occupied);
  const depletedUntil = Date.now() + nodeCfg.respawnMs;
  db.prepare('UPDATE resource_state SET x = ?, y = ?, depleted_until = ? WHERE node_id = ?')
    .run(newSpot.x, newSpot.y, depletedUntil, nodeId);

  io.emit('resourceUpdate', { id: nodeId, x: newSpot.x, y: newSpot.y, depletedUntil });
  res.json({ inventory: getInventory(player.id) });
});

// ---------- homestead plots ----------

app.post('/api/plots/:plotId/claim', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const plot = PLOTS.find((p) => p.id === req.params.plotId);
  if (!plot) return res.status(400).json({ error: 'unknown plot' });

  const already = db.prepare('SELECT 1 FROM plot_owners WHERE plot_id = ?').get(plot.id);
  if (already) return res.status(400).json({ error: 'plot already claimed' });

  const owned = db.prepare('SELECT COUNT(*) as c FROM plot_owners WHERE owner_id = ?').get(player.id) as { c: number };
  if (owned.c >= MAX_HOMESTEADS_PER_PLAYER) {
    return res.status(400).json({ error: `you can only own ${MAX_HOMESTEADS_PER_PLAYER} homesteads` });
  }

  const inside = player.x >= plot.x && player.x < plot.x + plot.size && player.y >= plot.y && player.y < plot.y + plot.size;
  if (!inside) return res.status(400).json({ error: 'stand on the plot to claim it' });

  const paid = removeItem(player.id, 'coin', HOMESTEAD_COST);
  if (!paid) return res.status(400).json({ error: `not enough coins (need ${HOMESTEAD_COST})` });

  db.prepare('INSERT INTO plot_owners (plot_id, owner_id, claimed_at) VALUES (?, ?, ?)').run(plot.id, player.id, Date.now());
  io.emit('plotUpdate', { plotId: plot.id, ownerId: player.id, username: player.username, farmName: null });
  res.json({ ok: true, inventory: getInventory(player.id) });
});

app.post('/api/plots/:plotId/name', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const plot = PLOTS.find((p) => p.id === req.params.plotId);
  if (!plot) return res.status(400).json({ error: 'unknown plot' });
  const { name } = req.body ?? {};
  if (typeof name !== 'string' || name.trim().length < 1) return res.status(400).json({ error: 'name required' });

  const owner = db.prepare('SELECT owner_id FROM plot_owners WHERE plot_id = ?').get(plot.id) as { owner_id: string } | undefined;
  if (!owner || owner.owner_id !== player.id) return res.status(403).json({ error: 'not your plot' });

  const clean = name.trim().slice(0, 30);
  db.prepare('UPDATE plot_owners SET farm_name = ? WHERE plot_id = ?').run(clean, plot.id);
  io.emit('plotUpdate', { plotId: plot.id, ownerId: player.id, username: player.username, farmName: clean });
  res.json({ ok: true, farmName: clean });
});

// ---------- buildings ----------

app.post('/api/buildings', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const { x, y, type } = req.body ?? {};
  const cfg = BUILDINGS[type];
  if (!cfg) return res.status(400).json({ error: 'unknown building type' });
  if (typeof x !== 'number' || typeof y !== 'number') return res.status(400).json({ error: 'x,y required' });

  const plot = plotAt(x, y);
  if (!plot) return res.status(400).json({ error: 'not inside a homestead plot' });
  const owner = db.prepare('SELECT owner_id FROM plot_owners WHERE plot_id = ?').get(plot.id) as { owner_id: string } | undefined;
  if (!owner || owner.owner_id !== player.id) return res.status(403).json({ error: 'not your plot' });

  if (type !== 'cabin' && !hasBuilding(plot.id, 'cabin')) {
    return res.status(400).json({ error: 'build a Cabin first — nothing else works without one' });
  }
  if (tileOccupied(x, y)) return res.status(400).json({ error: 'tile already in use' });

  for (const [item, qty] of Object.entries(cfg.cost)) {
    if ((getInventory(player.id)[item!] ?? 0) < (qty as number)) return res.status(400).json({ error: `not enough ${item}` });
  }
  for (const [item, qty] of Object.entries(cfg.cost)) removeItem(player.id, item!, qty as number);

  db.prepare('INSERT INTO buildings (x, y, plot_id, owner_id, type) VALUES (?, ?, ?, ?, ?)').run(x, y, plot.id, player.id, type);
  io.emit('buildingUpdate', { x, y, plotId: plot.id, ownerId: player.id, type });
  res.json({ inventory: getInventory(player.id) });
});

// ---------- farming ----------

app.post('/api/crops/plant', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const { x, y, cropType } = req.body ?? {};
  const cfg = CROPS[cropType];
  if (!cfg) return res.status(400).json({ error: 'unknown crop' });

  const plot = plotAt(x, y);
  if (!plot) return res.status(400).json({ error: 'not inside a homestead plot' });
  const owner = db.prepare('SELECT owner_id FROM plot_owners WHERE plot_id = ?').get(plot.id) as { owner_id: string } | undefined;
  if (!owner || owner.owner_id !== player.id) return res.status(403).json({ error: 'not your plot' });

  if (!hasBuilding(plot.id, 'cabin')) return res.status(400).json({ error: 'build a Cabin first' });
  if (!hasBuilding(plot.id, 'shed')) return res.status(400).json({ error: 'build a Shed to farm crops' });
  if (tileOccupied(x, y)) return res.status(400).json({ error: 'tile already in use' });

  db.prepare('INSERT INTO crops (x, y, owner_id, crop_type, planted_at) VALUES (?, ?, ?, ?, ?)').run(x, y, player.id, cropType, Date.now());
  io.emit('cropUpdate', { x, y, ownerId: player.id, cropType, plantedAt: Date.now(), removed: false });
  res.json({ ok: true });
});

app.post('/api/crops/harvest', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const { x, y } = req.body ?? {};
  const crop = db.prepare('SELECT * FROM crops WHERE x = ? AND y = ?').get(x, y) as CropRow | undefined;
  if (!crop || crop.owner_id !== player.id) return res.status(403).json({ error: 'not your crop' });

  const cfg = CROPS[crop.crop_type];
  if (Date.now() - crop.planted_at < cfg.growTimeMs) return res.status(400).json({ error: 'not ready yet' });

  addItem(player.id, crop.crop_type, cfg.yieldAmount);
  db.prepare('DELETE FROM crops WHERE x = ? AND y = ?').run(x, y);
  io.emit('cropUpdate', { x, y, removed: true });
  res.json({ inventory: getInventory(player.id) });
});

// ---------- livestock ----------

app.post('/api/livestock/buy', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const { x, y, type } = req.body ?? {};
  const cfg = LIVESTOCK[type];
  if (!cfg) return res.status(400).json({ error: 'unknown animal' });

  const plot = plotAt(x, y);
  if (!plot) return res.status(400).json({ error: 'not inside a homestead plot' });
  const owner = db.prepare('SELECT owner_id FROM plot_owners WHERE plot_id = ?').get(plot.id) as { owner_id: string } | undefined;
  if (!owner || owner.owner_id !== player.id) return res.status(403).json({ error: 'not your plot' });

  if (!hasBuilding(plot.id, 'cabin')) return res.status(400).json({ error: 'build a Cabin first' });
  if (!hasBuilding(plot.id, 'barn')) return res.status(400).json({ error: 'build a Barn to keep livestock' });
  if (tileOccupied(x, y)) return res.status(400).json({ error: 'tile already in use' });

  const paid = removeItem(player.id, 'coin', cfg.cost);
  if (!paid) return res.status(400).json({ error: `not enough coins (need ${cfg.cost})` });

  db.prepare('INSERT INTO livestock (x, y, plot_id, owner_id, type, last_collected_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(x, y, plot.id, player.id, type, Date.now());
  io.emit('livestockUpdate', { x, y, ownerId: player.id, type, lastCollectedAt: Date.now(), removed: false });
  res.json({ inventory: getInventory(player.id) });
});

app.post('/api/livestock/collect', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const { x, y } = req.body ?? {};
  const animal = db.prepare('SELECT * FROM livestock WHERE x = ? AND y = ?').get(x, y) as LivestockRow | undefined;
  if (!animal || animal.owner_id !== player.id) return res.status(403).json({ error: 'not your animal' });

  const cfg = LIVESTOCK[animal.type];
  if (Date.now() - animal.last_collected_at < cfg.produceTimeMs) return res.status(400).json({ error: 'not ready yet' });

  addItem(player.id, cfg.produceItem, cfg.produceQty);
  const now = Date.now();
  db.prepare('UPDATE livestock SET last_collected_at = ? WHERE x = ? AND y = ?').run(now, x, y);
  io.emit('livestockUpdate', { x, y, ownerId: player.id, type: animal.type, lastCollectedAt: now, removed: false });
  res.json({ inventory: getInventory(player.id) });
});

// ---------- crafting ----------

app.post('/api/craft', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const { recipeId } = req.body ?? {};
  const recipe = CRAFT_RECIPES[recipeId];
  if (!recipe) return res.status(400).json({ error: 'unknown recipe' });

  const inv = getInventory(player.id);
  for (const [item, qty] of Object.entries(recipe.inputs)) {
    if ((inv[item] ?? 0) < qty) return res.status(400).json({ error: `not enough ${item}` });
  }
  for (const [item, qty] of Object.entries(recipe.inputs)) removeItem(player.id, item, qty);
  addItem(player.id, recipe.id, recipe.outputQty);

  res.json({ inventory: getInventory(player.id) });
});

// ---------- general store ----------

app.post('/api/shop/sell', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const { item, qty } = req.body ?? {};
  const price = SELL_PRICES[item];
  if (!price || typeof qty !== 'number' || qty <= 0) return res.status(400).json({ error: 'invalid item or quantity' });
  if (distToRect(player.x, player.y, SHOP_LOCATION.x, SHOP_LOCATION.y, SHOP_LOCATION.size) > 1) return res.status(400).json({ error: 'not near the store' });

  const ok = removeItem(player.id, item, qty);
  if (!ok) return res.status(400).json({ error: `not enough ${item}` });
  addItem(player.id, 'coin', price * qty);

  res.json({ inventory: getInventory(player.id) });
});

// ---------- live barter trading ----------

interface TradeSession {
  id: string;
  players: [string, string];
  offers: Record<string, Record<string, number>>;
  confirmed: Record<string, boolean>;
}
const sockets = new Map<string, Socket>();
const trades = new Map<string, TradeSession>();

io.on('connection', (socket: Socket) => {
  let playerId: string | null = null;

  socket.on('identify', (token: string) => {
    const player = getPlayerById(token);
    if (!player) return;
    playerId = player.id;
    sockets.set(playerId, socket);
  });

  socket.on('tradeRequest', ({ targetId }: { targetId: string }) => {
    if (!playerId) return;
    const me = getPlayerById(playerId);
    const target = getPlayerById(targetId);
    if (!me || !target || chebyshev(me.x, me.y, target.x, target.y) > 1) return;
    sockets.get(targetId)?.emit('tradeInvite', { fromId: playerId, fromUsername: me.username });
  });

  socket.on('tradeAccept', ({ fromId }: { fromId: string }) => {
    if (!playerId) return;
    const sessionId = randomUUID();
    const session: TradeSession = {
      id: sessionId,
      players: [fromId, playerId],
      offers: { [fromId]: {}, [playerId]: {} },
      confirmed: { [fromId]: false, [playerId]: false },
    };
    trades.set(sessionId, session);
    const a = getPlayerById(fromId);
    const b = getPlayerById(playerId);
    sockets.get(fromId)?.emit('tradeStarted', { sessionId, otherUsername: b?.username, otherId: playerId });
    sockets.get(playerId)?.emit('tradeStarted', { sessionId, otherUsername: a?.username, otherId: fromId });
  });

  socket.on('tradeDecline', ({ fromId }: { fromId: string }) => {
    sockets.get(fromId)?.emit('tradeDeclined', {});
  });

  socket.on('tradeOffer', ({ sessionId, items }: { sessionId: string; items: Record<string, number> }) => {
    if (!playerId) return;
    const session = trades.get(sessionId);
    if (!session || !session.players.includes(playerId)) return;
    session.offers[playerId] = items;
    session.confirmed[session.players[0]] = false;
    session.confirmed[session.players[1]] = false;
    for (const pid of session.players) sockets.get(pid)?.emit('tradeUpdate', { sessionId, offers: session.offers, confirmed: session.confirmed });
  });

  socket.on('tradeConfirm', ({ sessionId }: { sessionId: string }) => {
    if (!playerId) return;
    const session = trades.get(sessionId);
    if (!session || !session.players.includes(playerId)) return;
    session.confirmed[playerId] = true;

    const [a, b] = session.players;
    if (session.confirmed[a] && session.confirmed[b]) {
      const okA = Object.entries(session.offers[a]).every(([item, qty]) => (getInventory(a)[item] ?? 0) >= qty);
      const okB = Object.entries(session.offers[b]).every(([item, qty]) => (getInventory(b)[item] ?? 0) >= qty);
      if (!okA || !okB) {
        for (const pid of session.players) sockets.get(pid)?.emit('tradeFailed', { sessionId, reason: 'one side no longer has the offered goods' });
        trades.delete(sessionId);
        return;
      }
      const tx = db.transaction(() => {
        for (const [item, qty] of Object.entries(session.offers[a])) { removeItem(a, item, qty); addItem(b, item, qty); }
        for (const [item, qty] of Object.entries(session.offers[b])) { removeItem(b, item, qty); addItem(a, item, qty); }
      });
      tx();
      for (const pid of session.players) sockets.get(pid)?.emit('tradeComplete', { sessionId, inventory: getInventory(pid) });
      trades.delete(sessionId);
    } else {
      for (const pid of session.players) sockets.get(pid)?.emit('tradeUpdate', { sessionId, offers: session.offers, confirmed: session.confirmed });
    }
  });

  socket.on('tradeCancel', ({ sessionId }: { sessionId: string }) => {
    const session = trades.get(sessionId);
    if (!session) return;
    for (const pid of session.players) sockets.get(pid)?.emit('tradeCancelled', { sessionId });
    trades.delete(sessionId);
  });

  socket.on('disconnect', () => {
    if (playerId && sockets.get(playerId) === socket) sockets.delete(playerId);
  });
});

// ---------- static client + catch-all ----------

if (hasClientBuild) {
  app.get('*', (req: Request, res: Response) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'not found' });
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

const PORT = Number(process.env.PORT) || 3001;
server.listen(PORT, () => console.log(`Extreme Frontier server listening on http://localhost:${PORT}`));
