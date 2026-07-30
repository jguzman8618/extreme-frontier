import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import db from './db';
import { containsForbiddenWord } from './moderation';
import {
  BiomeId, Direction, BIOMES, doorPosition, oppositeDirection,
  plotAt, plotCenter, isWalkable, randomFreeResourceSpot,
  CROPS, BUILDINGS, LIVESTOCK, STARTING_INVENTORY,
  SELL_PRICES, CRAFT_RECIPES, DEMAND_STEP, DEMAND_RECOVERY_MS,
  HOMESTEAD_TIERS, MAX_HOMESTEADS_PER_PLAYER, SHOP_DOOR, MATERIAL_ICONS,
  PlotConfig,
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

function allPlayersInBiome(biome: string) {
  return db.prepare('SELECT id, username, x, y, biome FROM players WHERE biome = ?').all(biome) as
    Pick<PlayerRow, 'id' | 'username' | 'x' | 'y' | 'biome'>[];
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

function allBuildingsInBiome(biome: string): BuildingRow[] {
  return db.prepare('SELECT * FROM buildings WHERE biome = ?').all(biome) as BuildingRow[];
}

function allCropsInBiome(biome: string) {
  const rows = db.prepare('SELECT * FROM crops WHERE biome = ?').all(biome) as CropRow[];
  return rows.map((r) => {
    const cfg = CROPS[r.crop_type];
    const ready = !!cfg && Date.now() - r.planted_at >= cfg.growTimeMs;
    return { x: r.x, y: r.y, ownerId: r.owner_id, cropType: r.crop_type, plantedAt: r.planted_at, ready };
  });
}

interface LivestockRow { biome: string; x: number; y: number; plot_id: string; owner_id: string; type: string; last_collected_at: number }
function allLivestockInBiome(biome: string) {
  const rows = db.prepare('SELECT * FROM livestock WHERE biome = ?').all(biome) as LivestockRow[];
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
for (const biome of Object.values(BIOMES)) {
  for (const n of biome.resourceNodes) seedResourceState(n.id, n.x, n.y);
}

// Defensive: if a biome's layout changed (building resized, water reshaped)
// since a node was last placed, its stored position could now be inside
// something solid. Fix that on boot rather than waiting for it to be
// gathered again.
function validateAndFixNodePosition(biomeId: BiomeId, node: { id: string }): void {
  const row = db.prepare('SELECT x, y FROM resource_state WHERE node_id = ?').get(node.id) as { x: number; y: number } | undefined;
  if (!row) return;
  if (isWalkable(biomeId, row.x, row.y) && !plotAt(biomeId, row.x, row.y)) return;
  const biome = BIOMES[biomeId];
  const occupied = (x: number, y: number) =>
    biome.resourceNodes.some((other) => {
      if (other.id === node.id) return false;
      const otherRow = db.prepare('SELECT x, y FROM resource_state WHERE node_id = ?').get(other.id) as { x: number; y: number } | undefined;
      return otherRow?.x === x && otherRow?.y === y;
    });
  const fixed = randomFreeResourceSpot(biomeId, occupied);
  db.prepare('UPDATE resource_state SET x = ?, y = ? WHERE node_id = ?').run(fixed.x, fixed.y, node.id);
  console.log(`Fixed out-of-bounds resource node ${node.id} in ${biomeId}: moved to (${fixed.x},${fixed.y})`);
}

for (const [biomeId, biome] of Object.entries(BIOMES) as [BiomeId, typeof BIOMES[BiomeId]][]) {
  for (const n of biome.resourceNodes) validateAndFixNodePosition(biomeId, n);
}

function resourceNodeStatesForBiome(biomeId: BiomeId) {
  const nodes = BIOMES[biomeId].resourceNodes;
  if (nodes.length === 0) return [];
  // Self-healing: re-validate every time state is fetched, not just at
  // server boot — this way a bad position can never persist regardless
  // of deploy/restart timing.
  for (const n of nodes) validateAndFixNodePosition(biomeId, n);
  const rows = db.prepare('SELECT * FROM resource_state').all() as { node_id: string; x: number; y: number; depleted_until: number }[];
  const byId: Record<string, { x: number; y: number; depleted_until: number }> = {};
  for (const r of rows) byId[r.node_id] = r;
  return nodes.map((n) => {
    const state = byId[n.id] ?? { x: n.x, y: n.y, depleted_until: 0 };
    return { ...n, x: state.x, y: state.y, depletedUntil: state.depleted_until, available: state.depleted_until <= Date.now() };
  });
}

function currentResourcePositions(biomeId: BiomeId): Record<string, { x: number; y: number }> {
  const nodeIds = new Set(BIOMES[biomeId].resourceNodes.map((n) => n.id));
  const rows = db.prepare('SELECT node_id, x, y FROM resource_state').all() as { node_id: string; x: number; y: number }[];
  const out: Record<string, { x: number; y: number }> = {};
  for (const r of rows) if (nodeIds.has(r.node_id)) out[r.node_id] = { x: r.x, y: r.y };
  return out;
}

function findSpawnPoint(biomeId: BiomeId): { x: number; y: number } {
  const b = BIOMES[biomeId];
  let x = Math.floor(b.mapW / 2);
  let y = Math.floor(b.mapH / 2);
  for (let r = 0; r < 20 && !isWalkable(biomeId, x, y); r++) x += 1;
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

function hasBuilding(biome: string, plotId: string, type: string): boolean {
  return !!db.prepare('SELECT 1 FROM buildings WHERE biome = ? AND plot_id = ? AND type = ?').get(biome, plotId, type);
}

function tileOccupied(biome: string, x: number, y: number): boolean {
  return !!(
    db.prepare('SELECT 1 FROM buildings WHERE biome = ? AND x = ? AND y = ?').get(biome, x, y) ||
    db.prepare('SELECT 1 FROM crops WHERE biome = ? AND x = ? AND y = ?').get(biome, x, y) ||
    db.prepare('SELECT 1 FROM livestock WHERE biome = ? AND x = ? AND y = ?').get(biome, x, y)
  );
}

function findPlotById(plotId: string): { plot: PlotConfig; biome: BiomeId } | undefined {
  for (const biomeId of Object.keys(BIOMES) as BiomeId[]) {
    const p = BIOMES[biomeId].plots.find((pl) => pl.id === plotId);
    if (p) return { plot: p, biome: biomeId };
  }
  return undefined;
}

// ---------- supply and demand pricing ----------

function decayedSoldUnits(item: string, now: number): number {
  const row = db.prepare('SELECT sold_units, last_update FROM market_state WHERE item = ?').get(item) as
    { sold_units: number; last_update: number } | undefined;
  if (!row) return 0;
  const elapsed = now - row.last_update;
  const recovered = elapsed / DEMAND_RECOVERY_MS;
  return Math.max(0, row.sold_units - recovered);
}

function currentPrice(item: string): number {
  const base = SELL_PRICES[item];
  if (!base) return 0;
  const sold = decayedSoldUnits(item, Date.now());
  return Math.max(1, base - Math.floor(sold / DEMAND_STEP));
}

function allCurrentPrices(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of Object.keys(SELL_PRICES)) out[item] = currentPrice(item);
  return out;
}

function recordSale(item: string, qty: number) {
  const now = Date.now();
  const sold = decayedSoldUnits(item, now) + qty;
  db.prepare(`
    INSERT INTO market_state (item, sold_units, last_update) VALUES (?, ?, ?)
    ON CONFLICT(item) DO UPDATE SET sold_units = excluded.sold_units, last_update = excluded.last_update
  `).run(item, sold, now);
}

// ---------- crafting job state ----------

interface CraftingJobRow { player_id: string; recipe_id: string; started_at: number }
function currentCraftJob(playerId: string) {
  const row = db.prepare('SELECT * FROM crafting_jobs WHERE player_id = ?').get(playerId) as CraftingJobRow | undefined;
  if (!row) return null;
  const cfg = CRAFT_RECIPES[row.recipe_id];
  const ready = !!cfg && Date.now() - row.started_at >= cfg.craftTimeMs;
  return { recipeId: row.recipe_id, startedAt: row.started_at, ready };
}

// ---------- auth ----------

app.post('/api/login', (req: Request, res: Response) => {
  const { username } = req.body ?? {};
  if (!username || typeof username !== 'string' || username.trim().length < 2) {
    return res.status(400).json({ error: 'username required (min 2 chars)' });
  }
  const clean = username.trim().slice(0, 20);
  if (containsForbiddenWord(clean)) return res.status(400).json({ error: 'that name is not allowed' });

  const existing = db.prepare('SELECT 1 FROM players WHERE username = ?').get(clean);
  if (existing) return res.status(409).json({ error: 'that username is already taken' });

  const id = randomUUID();
  const spawn = findSpawnPoint('homestead');
  db.prepare('INSERT INTO players (id, username, biome, x, y, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, clean, 'homestead', spawn.x, spawn.y, Date.now());
  for (const [item, qty] of Object.entries(STARTING_INVENTORY)) addItem(id, item, qty);

  const player = getPlayerById(id)!;
  io.emit('playerJoined', { id: player.id, username: player.username, x: player.x, y: player.y, biome: player.biome });
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
      const spawn = findSpawnPoint('homestead');
      db.prepare('INSERT INTO players (id, username, discord_id, biome, x, y, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, candidate, me.id, 'homestead', spawn.x, spawn.y, Date.now());
      for (const [item, qty] of Object.entries(STARTING_INVENTORY)) addItem(id, item, qty);
      player = getPlayerById(id)!;
      io.emit('playerJoined', { id: player.id, username: player.username, x: player.x, y: player.y, biome: player.biome });
    }
    res.json({ token: player.id, player, inventory: getInventory(player.id) });
  } catch {
    res.status(502).json({ error: 'discord user lookup failed' });
  }
});

// ---------- world + state ----------

app.get('/api/world', (req: Request, res: Response) => {
  const biomeParam = (req.query.biome as string) || 'homestead';
  const biome = BIOMES[biomeParam as BiomeId];
  if (!biome) return res.status(400).json({ error: 'unknown biome' });

  const terrain: string[][] = [];
  for (let y = 0; y < biome.mapH; y++) {
    const row: string[] = [];
    for (let x = 0; x < biome.mapW; x++) row.push(biome.terrainAt(x, y));
    terrain.push(row);
  }

  res.json({
    biomeId: biome.id,
    biomeName: biome.name,
    mapW: biome.mapW,
    mapH: biome.mapH,
    terrain,
    plots: biome.plots,
    decorations: biome.decorations,
    paths: biome.paths,
    doors: biome.doors,
    homesteadsAllowed: biome.homesteadsAllowed,
    building: biome.building ?? null,
    shopDoor: SHOP_DOOR,
    crops: Object.fromEntries(Object.entries(CROPS).filter(([id]) => biome.allowedCrops.includes(id))),
    buildings: BUILDINGS,
    livestock: LIVESTOCK,
    sellPrices: SELL_PRICES,
    craftRecipes: CRAFT_RECIPES,
    homesteadTiers: HOMESTEAD_TIERS,
    maxHomesteads: MAX_HOMESTEADS_PER_PLAYER,
    materialIcons: MATERIAL_ICONS,
  });
});

app.get('/api/state', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const biome = player.biome as BiomeId;
  res.json({
    player,
    inventory: getInventory(player.id),
    players: allPlayersInBiome(biome),
    plotOwners: allPlotOwners(),
    buildings: allBuildingsInBiome(biome),
    crops: allCropsInBiome(biome),
    livestock: allLivestockInBiome(biome),
    resourceNodes: resourceNodeStatesForBiome(biome),
    craftJob: currentCraftJob(player.id),
    shopPrices: allCurrentPrices(),
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
  if (!isWalkable(player.biome as BiomeId, x, y)) return res.status(400).json({ error: 'not walkable' });
  const blocked = db.prepare('SELECT type FROM buildings WHERE biome = ? AND x = ? AND y = ?').get(player.biome, x, y) as { type: string } | undefined;
  if (blocked) return res.status(400).json({ error: `blocked by a ${blocked.type}` });

  db.prepare('UPDATE players SET x = ?, y = ? WHERE id = ?').run(x, y, player.id);
  io.emit('playerMoved', { id: player.id, x, y, biome: player.biome, username: player.username });
  res.json({ x, y });
});

// ---------- travel between biomes ----------

app.post('/api/travel', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const { direction } = req.body ?? {};
  if (!['north', 'south', 'east', 'west'].includes(direction)) return res.status(400).json({ error: 'invalid direction' });

  const biome = BIOMES[player.biome as BiomeId];
  const destId = biome.doors[direction as Direction];
  if (!destId) return res.status(400).json({ error: 'nothing that way yet' });

  const doorPos = doorPosition(biome, direction as Direction);
  if (player.x !== doorPos.x || player.y !== doorPos.y) return res.status(400).json({ error: 'stand on the door to travel' });

  const destBiome = BIOMES[destId];
  const arriveDir = oppositeDirection(direction as Direction);
  const arrivePos = doorPosition(destBiome, arriveDir);

  db.prepare('UPDATE players SET biome = ?, x = ?, y = ? WHERE id = ?').run(destId, arrivePos.x, arrivePos.y, player.id);
  io.emit('playerMoved', { id: player.id, x: arrivePos.x, y: arrivePos.y, biome: destId, username: player.username });

  res.json({ biome: destId, x: arrivePos.x, y: arrivePos.y });
});

// ---------- gathering ----------

app.post('/api/gather', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const biome = player.biome as BiomeId;
  const { nodeId } = req.body ?? {};
  const nodeCfg = BIOMES[biome].resourceNodes.find((n) => n.id === nodeId);
  if (!nodeCfg) return res.status(400).json({ error: 'nothing to gather here' });

  const positions = currentResourcePositions(biome);
  const pos = positions[nodeId] ?? { x: nodeCfg.x, y: nodeCfg.y };
  if (chebyshev(player.x, player.y, pos.x, pos.y) > 1) return res.status(400).json({ error: 'too far away' });

  const stateRow = db.prepare('SELECT depleted_until FROM resource_state WHERE node_id = ?').get(nodeId) as { depleted_until: number } | undefined;
  if (stateRow && stateRow.depleted_until > Date.now()) return res.status(400).json({ error: 'not ready yet' });

  addItem(player.id, nodeCfg.type, nodeCfg.yieldAmount);

  const occupied = (x: number, y: number) => Object.values(positions).some((p) => p.x === x && p.y === y);
  const newSpot = randomFreeResourceSpot(biome, occupied);
  const depletedUntil = Date.now() + nodeCfg.respawnMs;
  db.prepare('UPDATE resource_state SET x = ?, y = ?, depleted_until = ? WHERE node_id = ?')
    .run(newSpot.x, newSpot.y, depletedUntil, nodeId);

  io.emit('resourceUpdate', { id: nodeId, x: newSpot.x, y: newSpot.y, depletedUntil });
  res.json({ inventory: getInventory(player.id) });
});

// ---------- homestead plots ----------

app.post('/api/plots/:plotId/claim', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const found = findPlotById(req.params.plotId);
  if (!found) return res.status(400).json({ error: 'unknown plot' });
  const { plot, biome } = found;
  if (player.biome !== biome) return res.status(400).json({ error: 'stand on the plot to claim it' });

  const already = db.prepare('SELECT 1 FROM plot_owners WHERE plot_id = ?').get(plot.id);
  if (already) return res.status(400).json({ error: 'plot already claimed' });

  const owned = db.prepare('SELECT COUNT(*) as c FROM plot_owners WHERE owner_id = ?').get(player.id) as { c: number };
  if (owned.c >= MAX_HOMESTEADS_PER_PLAYER) {
    return res.status(400).json({ error: `you can only own ${MAX_HOMESTEADS_PER_PLAYER} homesteads` });
  }

  const inside = player.x >= plot.x && player.x < plot.x + plot.size && player.y >= plot.y && player.y < plot.y + plot.size;
  if (!inside) return res.status(400).json({ error: 'stand on the plot to claim it' });

  const tier = HOMESTEAD_TIERS[plot.size];
  const paid = removeItem(player.id, 'coin', tier.cost);
  if (!paid) return res.status(400).json({ error: `not enough coins (need ${tier.cost} for a ${tier.label} homestead)` });

  db.prepare('INSERT INTO plot_owners (plot_id, owner_id, claimed_at) VALUES (?, ?, ?)').run(plot.id, player.id, Date.now());
  io.emit('plotUpdate', { plotId: plot.id, ownerId: player.id, username: player.username, farmName: null });
  res.json({ ok: true, inventory: getInventory(player.id) });
});

app.post('/api/plots/:plotId/name', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const found = findPlotById(req.params.plotId);
  if (!found) return res.status(400).json({ error: 'unknown plot' });
  const { plot } = found;
  const { name } = req.body ?? {};
  if (typeof name !== 'string' || name.trim().length < 1) return res.status(400).json({ error: 'name required' });

  const owner = db.prepare('SELECT owner_id FROM plot_owners WHERE plot_id = ?').get(plot.id) as { owner_id: string } | undefined;
  if (!owner || owner.owner_id !== player.id) return res.status(403).json({ error: 'not your plot' });

  const clean = name.trim().slice(0, 30);
  if (containsForbiddenWord(clean)) return res.status(400).json({ error: 'that name is not allowed' });

  db.prepare('UPDATE plot_owners SET farm_name = ? WHERE plot_id = ?').run(clean, plot.id);
  io.emit('plotUpdate', { plotId: plot.id, ownerId: player.id, username: player.username, farmName: clean });
  res.json({ ok: true, farmName: clean });
});

// ---------- buildings ----------

app.post('/api/buildings', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const biome = player.biome;
  const { x, y, type } = req.body ?? {};
  const cfg = BUILDINGS[type];
  if (!cfg) return res.status(400).json({ error: 'unknown building type' });
  if (typeof x !== 'number' || typeof y !== 'number') return res.status(400).json({ error: 'x,y required' });

  const plot = plotAt(biome as BiomeId, x, y);
  if (!plot) return res.status(400).json({ error: 'not inside a homestead plot' });
  const owner = db.prepare('SELECT owner_id FROM plot_owners WHERE plot_id = ?').get(plot.id) as { owner_id: string } | undefined;
  if (!owner || owner.owner_id !== player.id) return res.status(403).json({ error: 'not your plot' });

  if (type !== 'cabin' && !hasBuilding(biome, plot.id, 'cabin')) {
    return res.status(400).json({ error: 'build a Cabin first — nothing else works without one' });
  }
  if (tileOccupied(biome, x, y)) return res.status(400).json({ error: 'tile already in use' });

  for (const [item, qty] of Object.entries(cfg.cost)) {
    if ((getInventory(player.id)[item!] ?? 0) < (qty as number)) return res.status(400).json({ error: `not enough ${item}` });
  }
  for (const [item, qty] of Object.entries(cfg.cost)) removeItem(player.id, item!, qty as number);

  db.prepare('INSERT INTO buildings (biome, x, y, plot_id, owner_id, type) VALUES (?, ?, ?, ?, ?, ?)').run(biome, x, y, plot.id, player.id, type);
  io.emit('buildingUpdate', { x, y, plotId: plot.id, ownerId: player.id, type });
  res.json({ inventory: getInventory(player.id) });
});

// ---------- farming ----------

app.post('/api/crops/plant', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const biome = player.biome;
  const { x, y, cropType } = req.body ?? {};
  const cfg = CROPS[cropType];
  if (!cfg) return res.status(400).json({ error: 'unknown crop' });
  if (!BIOMES[biome as BiomeId].allowedCrops.includes(cropType)) {
    return res.status(400).json({ error: `${cfg.name} doesn't grow here` });
  }

  const plot = plotAt(biome as BiomeId, x, y);
  if (!plot) return res.status(400).json({ error: 'not inside a homestead plot' });
  const owner = db.prepare('SELECT owner_id FROM plot_owners WHERE plot_id = ?').get(plot.id) as { owner_id: string } | undefined;
  if (!owner || owner.owner_id !== player.id) return res.status(403).json({ error: 'not your plot' });

  if (!hasBuilding(biome, plot.id, 'cabin')) return res.status(400).json({ error: 'build a Cabin first' });
  if (!hasBuilding(biome, plot.id, 'shed')) return res.status(400).json({ error: 'build a Shed to farm crops' });
  if (tileOccupied(biome, x, y)) return res.status(400).json({ error: 'tile already in use' });

  db.prepare('INSERT INTO crops (biome, x, y, owner_id, crop_type, planted_at) VALUES (?, ?, ?, ?, ?, ?)').run(biome, x, y, player.id, cropType, Date.now());
  io.emit('cropUpdate', { x, y, ownerId: player.id, cropType, plantedAt: Date.now(), removed: false });
  res.json({ ok: true });
});

app.post('/api/crops/harvest', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const biome = player.biome;
  const { x, y } = req.body ?? {};
  const crop = db.prepare('SELECT * FROM crops WHERE biome = ? AND x = ? AND y = ?').get(biome, x, y) as CropRow | undefined;
  if (!crop || crop.owner_id !== player.id) return res.status(403).json({ error: 'not your crop' });

  const cfg = CROPS[crop.crop_type];
  if (Date.now() - crop.planted_at < cfg.growTimeMs) return res.status(400).json({ error: 'not ready yet' });

  addItem(player.id, crop.crop_type, cfg.yieldAmount);
  db.prepare('DELETE FROM crops WHERE biome = ? AND x = ? AND y = ?').run(biome, x, y);
  io.emit('cropUpdate', { x, y, removed: true });
  res.json({ inventory: getInventory(player.id) });
});

// ---------- livestock ----------

app.post('/api/livestock/buy', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const biome = player.biome;
  const { x, y, type } = req.body ?? {};
  const cfg = LIVESTOCK[type];
  if (!cfg) return res.status(400).json({ error: 'unknown animal' });

  const plot = plotAt(biome as BiomeId, x, y);
  if (!plot) return res.status(400).json({ error: 'not inside a homestead plot' });
  const owner = db.prepare('SELECT owner_id FROM plot_owners WHERE plot_id = ?').get(plot.id) as { owner_id: string } | undefined;
  if (!owner || owner.owner_id !== player.id) return res.status(403).json({ error: 'not your plot' });

  if (!hasBuilding(biome, plot.id, 'cabin')) return res.status(400).json({ error: 'build a Cabin first' });
  if (!hasBuilding(biome, plot.id, 'barn')) return res.status(400).json({ error: 'build a Barn to keep livestock' });
  if (tileOccupied(biome, x, y)) return res.status(400).json({ error: 'tile already in use' });

  const paid = removeItem(player.id, 'coin', cfg.cost);
  if (!paid) return res.status(400).json({ error: `not enough coins (need ${cfg.cost})` });

  db.prepare('INSERT INTO livestock (biome, x, y, plot_id, owner_id, type, last_collected_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(biome, x, y, plot.id, player.id, type, Date.now());
  io.emit('livestockUpdate', { x, y, ownerId: player.id, type, lastCollectedAt: Date.now(), removed: false });
  res.json({ inventory: getInventory(player.id) });
});

app.post('/api/livestock/collect', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const biome = player.biome;
  const { x, y } = req.body ?? {};
  const animal = db.prepare('SELECT * FROM livestock WHERE biome = ? AND x = ? AND y = ?').get(biome, x, y) as LivestockRow | undefined;
  if (!animal || animal.owner_id !== player.id) return res.status(403).json({ error: 'not your animal' });

  const cfg = LIVESTOCK[animal.type];
  if (Date.now() - animal.last_collected_at < cfg.produceTimeMs) return res.status(400).json({ error: 'not ready yet' });

  addItem(player.id, cfg.produceItem, cfg.produceQty);
  const now = Date.now();
  db.prepare('UPDATE livestock SET last_collected_at = ? WHERE biome = ? AND x = ? AND y = ?').run(now, biome, x, y);
  io.emit('livestockUpdate', { x, y, ownerId: player.id, type: animal.type, lastCollectedAt: now, removed: false });
  res.json({ inventory: getInventory(player.id) });
});

// ---------- crafting ----------

app.post('/api/craft', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const { recipeId } = req.body ?? {};
  const recipe = CRAFT_RECIPES[recipeId];
  if (!recipe) return res.status(400).json({ error: 'unknown recipe' });

  const existingJob = db.prepare('SELECT 1 FROM crafting_jobs WHERE player_id = ?').get(player.id);
  if (existingJob) return res.status(400).json({ error: 'you already have something crafting — collect it first' });

  const inv = getInventory(player.id);
  for (const [item, qty] of Object.entries(recipe.inputs)) {
    if ((inv[item] ?? 0) < qty) return res.status(400).json({ error: `not enough ${item}` });
  }

  const tx = db.transaction(() => {
    for (const [item, qty] of Object.entries(recipe.inputs)) removeItem(player.id, item, qty);
    db.prepare('INSERT INTO crafting_jobs (player_id, recipe_id, started_at) VALUES (?, ?, ?)').run(player.id, recipeId, Date.now());
  });
  tx();

  res.json({ inventory: getInventory(player.id), craftJob: currentCraftJob(player.id) });
});

app.post('/api/craft/collect', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const job = db.prepare('SELECT * FROM crafting_jobs WHERE player_id = ?').get(player.id) as CraftingJobRow | undefined;
  if (!job) return res.status(400).json({ error: 'nothing is crafting' });

  const recipe = CRAFT_RECIPES[job.recipe_id];
  if (!recipe || Date.now() - job.started_at < recipe.craftTimeMs) return res.status(400).json({ error: 'not ready yet' });

  const tx = db.transaction(() => {
    addItem(player.id, recipe.id, recipe.outputQty);
    db.prepare('DELETE FROM crafting_jobs WHERE player_id = ?').run(player.id);
  });
  tx();

  res.json({ inventory: getInventory(player.id), craftJob: null });
});

// ---------- general store (only usable inside the Shop biome) ----------

app.post('/api/shop/sell', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const { item, qty } = req.body ?? {};
  if (!SELL_PRICES[item] || typeof qty !== 'number' || qty <= 0) return res.status(400).json({ error: 'invalid item or quantity' });
  if (player.biome !== 'shop') return res.status(400).json({ error: 'the store is in the Shop — travel there first' });
  if (chebyshev(player.x, player.y, SHOP_DOOR.x, SHOP_DOOR.y) > 1) return res.status(400).json({ error: 'not near the store' });

  const price = currentPrice(item);
  const ok = removeItem(player.id, item, qty);
  if (!ok) return res.status(400).json({ error: `not enough ${item}` });
  addItem(player.id, 'coin', price * qty);
  recordSale(item, qty);

  res.json({ inventory: getInventory(player.id), shopPrices: allCurrentPrices() });
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
    if (!me || !target || me.biome !== target.biome || chebyshev(me.x, me.y, target.x, target.y) > 1) return;
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
