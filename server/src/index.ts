import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { Pool, PoolClient } from 'pg';
import pool, { initDb } from './db';
import { containsForbiddenWord } from './moderation';
import {
  BiomeId, Direction, BIOMES, doorPosition, oppositeDirection,
  plotAt, plotCenter, isWalkable, randomFreeResourceSpot,
  CROPS, BUILDINGS, LIVESTOCK, STARTING_INVENTORY,
  SELL_PRICES, CRAFT_RECIPES, DEMAND_STEP, DEMAND_RECOVERY_MS,
  HOMESTEAD_TIERS, MAX_HOMESTEADS_PER_PLAYER, SHOP_DOOR, MATERIAL_ICONS, HOMESTEAD_SELL_REFUND_RATE,
  PlotConfig,
} from './world';
import { PlayerRow, CropRow, BuildingRow } from './types';

type Queryable = Pool | PoolClient;

const app = express();
app.use(cors());
app.use(express.json());

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const hasClientBuild = fs.existsSync(path.join(PUBLIC_DIR, 'index.html'));
if (hasClientBuild) app.use(express.static(PUBLIC_DIR));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ---------- transaction helper ----------

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ---------- helpers ----------

async function getPlayerById(db: Queryable, id: string): Promise<PlayerRow | undefined> {
  const r = await db.query('SELECT * FROM players WHERE id = $1', [id]);
  return r.rows[0] as PlayerRow | undefined;
}

async function getInventory(db: Queryable, playerId: string): Promise<Record<string, number>> {
  const r = await db.query('SELECT item, qty FROM inventory WHERE player_id = $1', [playerId]);
  const out: Record<string, number> = {};
  for (const row of r.rows) out[row.item] = row.qty;
  return out;
}

async function addItem(db: Queryable, playerId: string, item: string, qty: number): Promise<void> {
  await db.query(
    `INSERT INTO inventory (player_id, item, qty) VALUES ($1, $2, $3)
     ON CONFLICT (player_id, item) DO UPDATE SET qty = inventory.qty + EXCLUDED.qty`,
    [playerId, item, qty]
  );
}

async function removeItem(db: Queryable, playerId: string, item: string, qty: number): Promise<boolean> {
  const r = await db.query('SELECT qty FROM inventory WHERE player_id = $1 AND item = $2', [playerId, item]);
  const row = r.rows[0];
  if (!row || row.qty < qty) return false;
  await db.query('UPDATE inventory SET qty = qty - $1 WHERE player_id = $2 AND item = $3', [qty, playerId, item]);
  return true;
}

async function allPlayersInBiome(biome: string) {
  const r = await pool.query('SELECT id, username, x, y, biome FROM players WHERE biome = $1', [biome]);
  return r.rows as Pick<PlayerRow, 'id' | 'username' | 'x' | 'y' | 'biome'>[];
}

async function allPlotOwners(): Promise<Record<string, { ownerId: string; username: string; farmName: string | null }>> {
  const r = await pool.query(`
    SELECT po.plot_id, po.owner_id, po.farm_name, p.username FROM plot_owners po
    JOIN players p ON p.id = po.owner_id
  `);
  const out: Record<string, { ownerId: string; username: string; farmName: string | null }> = {};
  for (const row of r.rows) out[row.plot_id] = { ownerId: row.owner_id, username: row.username, farmName: row.farm_name };
  return out;
}

async function allBuildingsInBiome(biome: string): Promise<BuildingRow[]> {
  const r = await pool.query('SELECT * FROM buildings WHERE biome = $1', [biome]);
  return r.rows as BuildingRow[];
}

async function allCropsInBiome(biome: string) {
  const r = await pool.query('SELECT * FROM crops WHERE biome = $1', [biome]);
  return (r.rows as CropRow[]).map((row) => {
    const cfg = CROPS[row.crop_type];
    const ready = !!cfg && Date.now() - row.planted_at >= cfg.growTimeMs;
    return { x: row.x, y: row.y, ownerId: row.owner_id, cropType: row.crop_type, plantedAt: row.planted_at, ready };
  });
}

interface LivestockRow { biome: string; x: number; y: number; plot_id: string; owner_id: string; type: string; last_collected_at: number }
async function allLivestockInBiome(biome: string) {
  const r = await pool.query('SELECT * FROM livestock WHERE biome = $1', [biome]);
  return (r.rows as LivestockRow[]).map((row) => {
    const cfg = LIVESTOCK[row.type];
    const ready = !!cfg && Date.now() - row.last_collected_at >= cfg.produceTimeMs;
    return { x: row.x, y: row.y, ownerId: row.owner_id, type: row.type, lastCollectedAt: row.last_collected_at, ready };
  });
}

async function seedResourceState(nodeId: string, defaultX: number, defaultY: number): Promise<void> {
  const existing = await pool.query('SELECT 1 FROM resource_state WHERE node_id = $1', [nodeId]);
  if (existing.rows.length === 0) {
    await pool.query('INSERT INTO resource_state (node_id, x, y, depleted_until) VALUES ($1, $2, $3, 0)', [nodeId, defaultX, defaultY]);
  }
}

// Defensive: if a biome's layout changed (building resized, water reshaped)
// since a node was last placed, its stored position could now be inside
// something solid. Fix that on boot and again on every state fetch, rather
// than waiting for it to be gathered again.
async function validateAndFixNodePosition(biomeId: BiomeId, node: { id: string }): Promise<void> {
  const r = await pool.query('SELECT x, y FROM resource_state WHERE node_id = $1', [node.id]);
  const row = r.rows[0] as { x: number; y: number } | undefined;
  if (!row) return;
  if (isWalkable(biomeId, row.x, row.y) && !plotAt(biomeId, row.x, row.y)) return;
  const biome = BIOMES[biomeId];
  const positions = await pool.query('SELECT node_id, x, y FROM resource_state');
  const byId: Record<string, { x: number; y: number }> = {};
  for (const p of positions.rows) byId[p.node_id] = { x: p.x, y: p.y };
  const occupied = (x: number, y: number) =>
    biome.resourceNodes.some((other) => other.id !== node.id && byId[other.id]?.x === x && byId[other.id]?.y === y);
  const fixed = randomFreeResourceSpot(biomeId, occupied);
  await pool.query('UPDATE resource_state SET x = $1, y = $2 WHERE node_id = $3', [fixed.x, fixed.y, node.id]);
  console.log(`Fixed out-of-bounds resource node ${node.id} in ${biomeId}: moved to (${fixed.x},${fixed.y})`);
}

async function resourceNodeStatesForBiome(biomeId: BiomeId) {
  const nodes = BIOMES[biomeId].resourceNodes;
  if (nodes.length === 0) return [];
  for (const n of nodes) await validateAndFixNodePosition(biomeId, n);
  const r = await pool.query('SELECT * FROM resource_state');
  const byId: Record<string, { node_id: string; x: number; y: number; depleted_until: number }> = {};
  for (const row of r.rows) byId[row.node_id] = row;
  return nodes.map((n) => {
    const state = byId[n.id] ?? { x: n.x, y: n.y, depleted_until: 0 };
    return { ...n, x: state.x, y: state.y, depletedUntil: state.depleted_until, available: state.depleted_until <= Date.now() };
  });
}

async function currentResourcePositions(biomeId: BiomeId): Promise<Record<string, { x: number; y: number }>> {
  const nodeIds = new Set(BIOMES[biomeId].resourceNodes.map((n) => n.id));
  const r = await pool.query('SELECT node_id, x, y FROM resource_state');
  const out: Record<string, { x: number; y: number }> = {};
  for (const row of r.rows) if (nodeIds.has(row.node_id)) out[row.node_id] = { x: row.x, y: row.y };
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

async function hasBuilding(biome: string, plotId: string, type: string): Promise<boolean> {
  const r = await pool.query('SELECT 1 FROM buildings WHERE biome = $1 AND plot_id = $2 AND type = $3', [biome, plotId, type]);
  return r.rows.length > 0;
}

async function tileOccupied(biome: string, x: number, y: number): Promise<boolean> {
  const [b, c, l] = await Promise.all([
    pool.query('SELECT 1 FROM buildings WHERE biome = $1 AND x = $2 AND y = $3', [biome, x, y]),
    pool.query('SELECT 1 FROM crops WHERE biome = $1 AND x = $2 AND y = $3', [biome, x, y]),
    pool.query('SELECT 1 FROM livestock WHERE biome = $1 AND x = $2 AND y = $3', [biome, x, y]),
  ]);
  return b.rows.length > 0 || c.rows.length > 0 || l.rows.length > 0;
}

function findPlotById(plotId: string): { plot: PlotConfig; biome: BiomeId } | undefined {
  for (const biomeId of Object.keys(BIOMES) as BiomeId[]) {
    const p = BIOMES[biomeId].plots.find((pl) => pl.id === plotId);
    if (p) return { plot: p, biome: biomeId };
  }
  return undefined;
}

// ---------- supply and demand pricing ----------

async function decayedSoldUnits(item: string, now: number): Promise<number> {
  const r = await pool.query('SELECT sold_units, last_update FROM market_state WHERE item = $1', [item]);
  const row = r.rows[0] as { sold_units: number; last_update: number } | undefined;
  if (!row) return 0;
  const elapsed = now - row.last_update;
  const recovered = elapsed / DEMAND_RECOVERY_MS;
  return Math.max(0, row.sold_units - recovered);
}

async function currentPrice(item: string): Promise<number> {
  const base = SELL_PRICES[item];
  if (!base) return 0;
  const sold = await decayedSoldUnits(item, Date.now());
  return Math.max(1, base - Math.floor(sold / DEMAND_STEP));
}

async function allCurrentPrices(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const item of Object.keys(SELL_PRICES)) out[item] = await currentPrice(item);
  return out;
}

async function recordSale(item: string, qty: number): Promise<void> {
  const now = Date.now();
  const sold = (await decayedSoldUnits(item, now)) + qty;
  await pool.query(
    `INSERT INTO market_state (item, sold_units, last_update) VALUES ($1, $2, $3)
     ON CONFLICT (item) DO UPDATE SET sold_units = EXCLUDED.sold_units, last_update = EXCLUDED.last_update`,
    [item, sold, now]
  );
}

// ---------- crafting job state ----------

interface CraftingJobRow { player_id: string; recipe_id: string; started_at: number }
async function currentCraftJob(playerId: string) {
  const r = await pool.query('SELECT * FROM crafting_jobs WHERE player_id = $1', [playerId]);
  const row = r.rows[0] as CraftingJobRow | undefined;
  if (!row) return null;
  const cfg = CRAFT_RECIPES[row.recipe_id];
  const ready = !!cfg && Date.now() - row.started_at >= cfg.craftTimeMs;
  return { recipeId: row.recipe_id, startedAt: row.started_at, ready };
}

// ---------- auth ----------

app.post('/api/login', async (req: Request, res: Response) => {
  const { username } = req.body ?? {};
  if (!username || typeof username !== 'string' || username.trim().length < 2) {
    return res.status(400).json({ error: 'username required (min 2 chars)' });
  }
  const clean = username.trim().slice(0, 20);
  if (containsForbiddenWord(clean)) return res.status(400).json({ error: 'that name is not allowed' });

  const existing = await pool.query('SELECT 1 FROM players WHERE username = $1', [clean]);
  if (existing.rows.length > 0) return res.status(409).json({ error: 'that username is already taken' });

  const id = randomUUID();
  const spawn = findSpawnPoint('homestead');
  await pool.query(
    'INSERT INTO players (id, username, biome, x, y, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, clean, 'homestead', spawn.x, spawn.y, Date.now()]
  );
  for (const [item, qty] of Object.entries(STARTING_INVENTORY)) await addItem(pool, id, item, qty);

  const player = (await getPlayerById(pool, id))!;
  io.emit('playerJoined', { id: player.id, username: player.username, x: player.x, y: player.y, biome: player.biome });
  res.json({ token: player.id, player, inventory: await getInventory(pool, id) });
});

async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
  const player = token ? await getPlayerById(pool, token) : undefined;
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

    const existingR = await pool.query('SELECT * FROM players WHERE discord_id = $1', [me.id]);
    let player = existingR.rows[0] as PlayerRow | undefined;
    if (!player) {
      const id = randomUUID();
      const baseName = (me.username as string).slice(0, 20);
      let candidate = baseName;
      let n = 1;
      while ((await pool.query('SELECT 1 FROM players WHERE username = $1', [candidate])).rows.length > 0) {
        candidate = `${baseName}${++n}`;
      }
      const spawn = findSpawnPoint('homestead');
      await pool.query(
        'INSERT INTO players (id, username, discord_id, biome, x, y, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [id, candidate, me.id, 'homestead', spawn.x, spawn.y, Date.now()]
      );
      for (const [item, qty] of Object.entries(STARTING_INVENTORY)) await addItem(pool, id, item, qty);
      player = (await getPlayerById(pool, id))!;
      io.emit('playerJoined', { id: player.id, username: player.username, x: player.x, y: player.y, biome: player.biome });
    }
    res.json({ token: player.id, player, inventory: await getInventory(pool, player.id) });
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
    homesteadSellRefundRate: HOMESTEAD_SELL_REFUND_RATE,
    materialIcons: MATERIAL_ICONS,
  });
});

app.get('/api/state', authMiddleware, async (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const biome = player.biome as BiomeId;
  res.json({
    player,
    inventory: await getInventory(pool, player.id),
    players: await allPlayersInBiome(biome),
    plotOwners: await allPlotOwners(),
    buildings: await allBuildingsInBiome(biome),
    crops: await allCropsInBiome(biome),
    livestock: await allLivestockInBiome(biome),
    resourceNodes: await resourceNodeStatesForBiome(biome),
    craftJob: await currentCraftJob(player.id),
    shopPrices: await allCurrentPrices(),
  });
});

// ---------- movement ----------

app.post('/api/move', authMiddleware, async (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const { x, y } = req.body ?? {};
  if (typeof x !== 'number' || typeof y !== 'number') return res.status(400).json({ error: 'x,y required' });

  const dx = Math.abs(x - player.x);
  const dy = Math.abs(y - player.y);
  if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) return res.status(400).json({ error: 'can only move one tile at a time' });
  if (!isWalkable(player.biome as BiomeId, x, y)) return res.status(400).json({ error: 'not walkable' });
  const blockedR = await pool.query('SELECT type FROM buildings WHERE biome = $1 AND x = $2 AND y = $3', [player.biome, x, y]);
  const blocked = blockedR.rows[0] as { type: string } | undefined;
  if (blocked) return res.status(400).json({ error: `blocked by a ${blocked.type}` });

  await pool.query('UPDATE players SET x = $1, y = $2 WHERE id = $3', [x, y, player.id]);
  io.emit('playerMoved', { id: player.id, x, y, biome: player.biome, username: player.username });
  res.json({ x, y });
});

// ---------- travel between biomes ----------

app.post('/api/travel', authMiddleware, async (req: Request, res: Response) => {
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

  await pool.query('UPDATE players SET biome = $1, x = $2, y = $3 WHERE id = $4', [destId, arrivePos.x, arrivePos.y, player.id]);
  io.emit('playerMoved', { id: player.id, x: arrivePos.x, y: arrivePos.y, biome: destId, username: player.username });

  res.json({ biome: destId, x: arrivePos.x, y: arrivePos.y });
});

// ---------- gathering ----------

app.post('/api/gather', authMiddleware, async (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const biome = player.biome as BiomeId;
  const { nodeId } = req.body ?? {};
  const nodeCfg = BIOMES[biome].resourceNodes.find((n) => n.id === nodeId);
  if (!nodeCfg) return res.status(400).json({ error: 'nothing to gather here' });

  const positions = await currentResourcePositions(biome);
  const pos = positions[nodeId] ?? { x: nodeCfg.x, y: nodeCfg.y };
  if (chebyshev(player.x, player.y, pos.x, pos.y) > 1) return res.status(400).json({ error: 'too far away' });

  const stateR = await pool.query('SELECT depleted_until FROM resource_state WHERE node_id = $1', [nodeId]);
  const stateRow = stateR.rows[0] as { depleted_until: number } | undefined;
  if (stateRow && stateRow.depleted_until > Date.now()) return res.status(400).json({ error: 'not ready yet' });

  await addItem(pool, player.id, nodeCfg.type, nodeCfg.yieldAmount);

  const occupied = (x: number, y: number) => Object.values(positions).some((p) => p.x === x && p.y === y);
  const newSpot = randomFreeResourceSpot(biome, occupied);
  const depletedUntil = Date.now() + nodeCfg.respawnMs;
  await pool.query('UPDATE resource_state SET x = $1, y = $2, depleted_until = $3 WHERE node_id = $4', [newSpot.x, newSpot.y, depletedUntil, nodeId]);

  io.emit('resourceUpdate', { id: nodeId, x: newSpot.x, y: newSpot.y, depletedUntil });
  res.json({ inventory: await getInventory(pool, player.id) });
});

// ---------- homestead plots ----------

app.post('/api/plots/:plotId/claim', authMiddleware, async (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const found = findPlotById(req.params.plotId);
  if (!found) return res.status(400).json({ error: 'unknown plot' });
  const { plot, biome } = found;
  if (player.biome !== biome) return res.status(400).json({ error: 'stand on the plot to claim it' });

  const alreadyR = await pool.query('SELECT 1 FROM plot_owners WHERE plot_id = $1', [plot.id]);
  if (alreadyR.rows.length > 0) return res.status(400).json({ error: 'plot already claimed' });

  const ownedR = await pool.query('SELECT COUNT(*) as c FROM plot_owners WHERE owner_id = $1', [player.id]);
  const owned = Number(ownedR.rows[0].c);
  if (owned >= MAX_HOMESTEADS_PER_PLAYER) {
    return res.status(400).json({ error: `you can only own ${MAX_HOMESTEADS_PER_PLAYER} homesteads` });
  }

  const inside = player.x >= plot.x && player.x < plot.x + plot.size && player.y >= plot.y && player.y < plot.y + plot.size;
  if (!inside) return res.status(400).json({ error: 'stand on the plot to claim it' });

  const tier = HOMESTEAD_TIERS[plot.size];
  const paid = await removeItem(pool, player.id, 'coin', tier.cost);
  if (!paid) return res.status(400).json({ error: `not enough coins (need ${tier.cost} for a ${tier.label} homestead)` });

  await pool.query('INSERT INTO plot_owners (plot_id, owner_id, claimed_at) VALUES ($1, $2, $3)', [plot.id, player.id, Date.now()]);
  io.emit('plotUpdate', { plotId: plot.id, ownerId: player.id, username: player.username, farmName: null });
  res.json({ ok: true, inventory: await getInventory(pool, player.id) });
});

app.post('/api/plots/:plotId/sell', authMiddleware, async (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const found = findPlotById(req.params.plotId);
  if (!found) return res.status(400).json({ error: 'unknown plot' });
  const { plot, biome } = found;

  const ownerR = await pool.query('SELECT owner_id FROM plot_owners WHERE plot_id = $1', [plot.id]);
  const owner = ownerR.rows[0] as { owner_id: string } | undefined;
  if (!owner || owner.owner_id !== player.id) return res.status(403).json({ error: 'not your plot' });

  const tier = HOMESTEAD_TIERS[plot.size];
  const refund = Math.floor(tier.cost * HOMESTEAD_SELL_REFUND_RATE);

  await withTransaction(async (client) => {
    await client.query('DELETE FROM buildings WHERE biome = $1 AND plot_id = $2', [biome, plot.id]);
    await client.query('DELETE FROM livestock WHERE biome = $1 AND plot_id = $2', [biome, plot.id]);
    await client.query('DELETE FROM crops WHERE biome = $1 AND x >= $2 AND x < $3 AND y >= $4 AND y < $5', [biome, plot.x, plot.x + plot.size, plot.y, plot.y + plot.size]);
    await client.query('DELETE FROM plot_owners WHERE plot_id = $1', [plot.id]);
    await addItem(client, player.id, 'coin', refund);
  });

  io.emit('plotUpdate', { plotId: plot.id, removed: true });
  io.emit('plotCleared', { biome, plotId: plot.id, x: plot.x, y: plot.y, size: plot.size });
  res.json({ ok: true, refund, inventory: await getInventory(pool, player.id) });
});

app.post('/api/plots/:plotId/name', authMiddleware, async (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const found = findPlotById(req.params.plotId);
  if (!found) return res.status(400).json({ error: 'unknown plot' });
  const { plot } = found;
  const { name } = req.body ?? {};
  if (typeof name !== 'string' || name.trim().length < 1) return res.status(400).json({ error: 'name required' });

  const ownerR = await pool.query('SELECT owner_id FROM plot_owners WHERE plot_id = $1', [plot.id]);
  const owner = ownerR.rows[0] as { owner_id: string } | undefined;
  if (!owner || owner.owner_id !== player.id) return res.status(403).json({ error: 'not your plot' });

  const clean = name.trim().slice(0, 30);
  if (containsForbiddenWord(clean)) return res.status(400).json({ error: 'that name is not allowed' });

  await pool.query('UPDATE plot_owners SET farm_name = $1 WHERE plot_id = $2', [clean, plot.id]);
  io.emit('plotUpdate', { plotId: plot.id, ownerId: player.id, username: player.username, farmName: clean });
  res.json({ ok: true, farmName: clean });
});

// ---------- buildings ----------

app.post('/api/buildings', authMiddleware, async (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const biome = player.biome;
  const { x, y, type } = req.body ?? {};
  const cfg = BUILDINGS[type];
  if (!cfg) return res.status(400).json({ error: 'unknown building type' });
  if (typeof x !== 'number' || typeof y !== 'number') return res.status(400).json({ error: 'x,y required' });

  const plot = plotAt(biome as BiomeId, x, y);
  if (!plot) return res.status(400).json({ error: 'not inside a homestead plot' });
  const ownerR = await pool.query('SELECT owner_id FROM plot_owners WHERE plot_id = $1', [plot.id]);
  const owner = ownerR.rows[0] as { owner_id: string } | undefined;
  if (!owner || owner.owner_id !== player.id) return res.status(403).json({ error: 'not your plot' });

  if (type !== 'cabin' && !(await hasBuilding(biome, plot.id, 'cabin'))) {
    return res.status(400).json({ error: 'build a Cabin first — nothing else works without one' });
  }
  if (await tileOccupied(biome, x, y)) return res.status(400).json({ error: 'tile already in use' });

  const inv = await getInventory(pool, player.id);
  for (const [item, qty] of Object.entries(cfg.cost)) {
    if ((inv[item!] ?? 0) < (qty as number)) return res.status(400).json({ error: `not enough ${item}` });
  }
  for (const [item, qty] of Object.entries(cfg.cost)) await removeItem(pool, player.id, item!, qty as number);

  await pool.query('INSERT INTO buildings (biome, x, y, plot_id, owner_id, type) VALUES ($1, $2, $3, $4, $5, $6)', [biome, x, y, plot.id, player.id, type]);
  io.emit('buildingUpdate', { x, y, plotId: plot.id, ownerId: player.id, type });
  res.json({ inventory: await getInventory(pool, player.id) });
});

// ---------- farming ----------

app.post('/api/crops/plant', authMiddleware, async (req: Request, res: Response) => {
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
  const ownerR = await pool.query('SELECT owner_id FROM plot_owners WHERE plot_id = $1', [plot.id]);
  const owner = ownerR.rows[0] as { owner_id: string } | undefined;
  if (!owner || owner.owner_id !== player.id) return res.status(403).json({ error: 'not your plot' });

  if (!(await hasBuilding(biome, plot.id, 'cabin'))) return res.status(400).json({ error: 'build a Cabin first' });
  if (!(await hasBuilding(biome, plot.id, 'shed'))) return res.status(400).json({ error: 'build a Shed to farm crops' });
  if (await tileOccupied(biome, x, y)) return res.status(400).json({ error: 'tile already in use' });

  const paid = await removeItem(pool, player.id, 'coin', cfg.plantCost);
  if (!paid) return res.status(400).json({ error: `not enough coins (need ${cfg.plantCost} to plant ${cfg.name})` });

  const plantedAt = Date.now();
  await pool.query('INSERT INTO crops (biome, x, y, owner_id, crop_type, planted_at) VALUES ($1, $2, $3, $4, $5, $6)', [biome, x, y, player.id, cropType, plantedAt]);
  io.emit('cropUpdate', { x, y, ownerId: player.id, cropType, plantedAt, removed: false });
  res.json({ ok: true, inventory: await getInventory(pool, player.id) });
});

app.post('/api/crops/harvest', authMiddleware, async (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const biome = player.biome;
  const { x, y } = req.body ?? {};
  const cropR = await pool.query('SELECT * FROM crops WHERE biome = $1 AND x = $2 AND y = $3', [biome, x, y]);
  const crop = cropR.rows[0] as CropRow | undefined;
  if (!crop || crop.owner_id !== player.id) return res.status(403).json({ error: 'not your crop' });

  const cfg = CROPS[crop.crop_type];
  if (Date.now() - crop.planted_at < cfg.growTimeMs) return res.status(400).json({ error: 'not ready yet' });

  await addItem(pool, player.id, crop.crop_type, cfg.yieldAmount);
  await pool.query('DELETE FROM crops WHERE biome = $1 AND x = $2 AND y = $3', [biome, x, y]);
  io.emit('cropUpdate', { x, y, removed: true });
  res.json({ inventory: await getInventory(pool, player.id) });
});

// ---------- livestock ----------

app.post('/api/livestock/buy', authMiddleware, async (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const biome = player.biome;
  const { x, y, type } = req.body ?? {};
  const cfg = LIVESTOCK[type];
  if (!cfg) return res.status(400).json({ error: 'unknown animal' });

  const plot = plotAt(biome as BiomeId, x, y);
  if (!plot) return res.status(400).json({ error: 'not inside a homestead plot' });
  const ownerR = await pool.query('SELECT owner_id FROM plot_owners WHERE plot_id = $1', [plot.id]);
  const owner = ownerR.rows[0] as { owner_id: string } | undefined;
  if (!owner || owner.owner_id !== player.id) return res.status(403).json({ error: 'not your plot' });

  if (!(await hasBuilding(biome, plot.id, 'cabin'))) return res.status(400).json({ error: 'build a Cabin first' });
  if (!(await hasBuilding(biome, plot.id, 'barn'))) return res.status(400).json({ error: 'build a Barn to keep livestock' });
  if (await tileOccupied(biome, x, y)) return res.status(400).json({ error: 'tile already in use' });

  const paid = await removeItem(pool, player.id, 'coin', cfg.cost);
  if (!paid) return res.status(400).json({ error: `not enough coins (need ${cfg.cost})` });

  const lastCollectedAt = Date.now();
  await pool.query(
    'INSERT INTO livestock (biome, x, y, plot_id, owner_id, type, last_collected_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [biome, x, y, plot.id, player.id, type, lastCollectedAt]
  );
  io.emit('livestockUpdate', { x, y, ownerId: player.id, type, lastCollectedAt, removed: false });
  res.json({ inventory: await getInventory(pool, player.id) });
});

app.post('/api/livestock/collect', authMiddleware, async (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const biome = player.biome;
  const { x, y } = req.body ?? {};
  const animalR = await pool.query('SELECT * FROM livestock WHERE biome = $1 AND x = $2 AND y = $3', [biome, x, y]);
  const animal = animalR.rows[0] as LivestockRow | undefined;
  if (!animal || animal.owner_id !== player.id) return res.status(403).json({ error: 'not your animal' });

  const cfg = LIVESTOCK[animal.type];
  if (Date.now() - animal.last_collected_at < cfg.produceTimeMs) return res.status(400).json({ error: 'not ready yet' });

  await addItem(pool, player.id, cfg.produceItem, cfg.produceQty);
  const now = Date.now();
  await pool.query('UPDATE livestock SET last_collected_at = $1 WHERE biome = $2 AND x = $3 AND y = $4', [now, biome, x, y]);
  io.emit('livestockUpdate', { x, y, ownerId: player.id, type: animal.type, lastCollectedAt: now, removed: false });
  res.json({ inventory: await getInventory(pool, player.id) });
});

// ---------- crafting ----------

app.post('/api/craft', authMiddleware, async (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const { recipeId } = req.body ?? {};
  const recipe = CRAFT_RECIPES[recipeId];
  if (!recipe) return res.status(400).json({ error: 'unknown recipe' });

  const existingJobR = await pool.query('SELECT 1 FROM crafting_jobs WHERE player_id = $1', [player.id]);
  if (existingJobR.rows.length > 0) return res.status(400).json({ error: 'you already have something crafting — collect it first' });

  const inv = await getInventory(pool, player.id);
  for (const [item, qty] of Object.entries(recipe.inputs)) {
    if ((inv[item] ?? 0) < qty) return res.status(400).json({ error: `not enough ${item}` });
  }

  await withTransaction(async (client) => {
    for (const [item, qty] of Object.entries(recipe.inputs)) await removeItem(client, player.id, item, qty);
    await client.query('INSERT INTO crafting_jobs (player_id, recipe_id, started_at) VALUES ($1, $2, $3)', [player.id, recipeId, Date.now()]);
  });

  res.json({ inventory: await getInventory(pool, player.id), craftJob: await currentCraftJob(player.id) });
});

app.post('/api/craft/collect', authMiddleware, async (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const jobR = await pool.query('SELECT * FROM crafting_jobs WHERE player_id = $1', [player.id]);
  const job = jobR.rows[0] as CraftingJobRow | undefined;
  if (!job) return res.status(400).json({ error: 'nothing is crafting' });

  const recipe = CRAFT_RECIPES[job.recipe_id];
  if (!recipe || Date.now() - job.started_at < recipe.craftTimeMs) return res.status(400).json({ error: 'not ready yet' });

  await withTransaction(async (client) => {
    await addItem(client, player.id, recipe.outputItem ?? recipe.id, recipe.outputQty);
    await client.query('DELETE FROM crafting_jobs WHERE player_id = $1', [player.id]);
  });

  res.json({ inventory: await getInventory(pool, player.id), craftJob: null });
});

// ---------- general store (only usable inside the Shop biome) ----------

app.post('/api/shop/sell', authMiddleware, async (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const { item, qty } = req.body ?? {};
  if (!SELL_PRICES[item] || typeof qty !== 'number' || qty <= 0) return res.status(400).json({ error: 'invalid item or quantity' });
  if (player.biome !== 'shop') return res.status(400).json({ error: 'the store is in the Shop — travel there first' });
  if (chebyshev(player.x, player.y, SHOP_DOOR.x, SHOP_DOOR.y) > 1) return res.status(400).json({ error: 'not near the store' });

  const price = await currentPrice(item);
  const ok = await removeItem(pool, player.id, item, qty);
  if (!ok) return res.status(400).json({ error: `not enough ${item}` });
  await addItem(pool, player.id, 'coin', price * qty);
  await recordSale(item, qty);

  res.json({ inventory: await getInventory(pool, player.id), shopPrices: await allCurrentPrices() });
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

  socket.on('identify', async (token: string) => {
    const player = await getPlayerById(pool, token);
    if (!player) return;
    playerId = player.id;
    sockets.set(playerId, socket);
  });

  socket.on('tradeRequest', async ({ targetId }: { targetId: string }) => {
    if (!playerId) return;
    const me = await getPlayerById(pool, playerId);
    const target = await getPlayerById(pool, targetId);
    if (!me || !target || me.biome !== target.biome || chebyshev(me.x, me.y, target.x, target.y) > 1) return;
    sockets.get(targetId)?.emit('tradeInvite', { fromId: playerId, fromUsername: me.username });
  });

  socket.on('tradeAccept', async ({ fromId }: { fromId: string }) => {
    if (!playerId) return;
    const sessionId = randomUUID();
    const session: TradeSession = {
      id: sessionId,
      players: [fromId, playerId],
      offers: { [fromId]: {}, [playerId]: {} },
      confirmed: { [fromId]: false, [playerId]: false },
    };
    trades.set(sessionId, session);
    const a = await getPlayerById(pool, fromId);
    const b = await getPlayerById(pool, playerId);
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

  socket.on('tradeConfirm', async ({ sessionId }: { sessionId: string }) => {
    if (!playerId) return;
    const session = trades.get(sessionId);
    if (!session || !session.players.includes(playerId)) return;
    session.confirmed[playerId] = true;

    const [a, b] = session.players;
    if (session.confirmed[a] && session.confirmed[b]) {
      const invA = await getInventory(pool, a);
      const invB = await getInventory(pool, b);
      const okA = Object.entries(session.offers[a]).every(([item, qty]) => (invA[item] ?? 0) >= qty);
      const okB = Object.entries(session.offers[b]).every(([item, qty]) => (invB[item] ?? 0) >= qty);
      if (!okA || !okB) {
        for (const pid of session.players) sockets.get(pid)?.emit('tradeFailed', { sessionId, reason: 'one side no longer has the offered goods' });
        trades.delete(sessionId);
        return;
      }
      await withTransaction(async (client) => {
        for (const [item, qty] of Object.entries(session.offers[a])) { await removeItem(client, a, item, qty); await addItem(client, b, item, qty); }
        for (const [item, qty] of Object.entries(session.offers[b])) { await removeItem(client, b, item, qty); await addItem(client, a, item, qty); }
      });
      for (const pid of session.players) sockets.get(pid)?.emit('tradeComplete', { sessionId, inventory: await getInventory(pool, pid) });
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

// ---------- startup ----------

async function main() {
  console.log('Connecting to database and running migrations...');
  await initDb();
  console.log('Database ready. Seeding and validating resource nodes...');
  for (const biome of Object.values(BIOMES)) {
    for (const n of biome.resourceNodes) await seedResourceState(n.id, n.x, n.y);
  }
  for (const [biomeId, biome] of Object.entries(BIOMES) as [BiomeId, typeof BIOMES[BiomeId]][]) {
    for (const n of biome.resourceNodes) await validateAndFixNodePosition(biomeId, n);
  }

  const PORT = Number(process.env.PORT) || 3001;
  server.listen(PORT, () => console.log(`Extreme Frontier server listening on http://localhost:${PORT}`));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
