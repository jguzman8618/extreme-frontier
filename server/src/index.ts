import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { Server } from 'socket.io';
import { randomUUID } from 'crypto';
import db from './db';
import { CROPS, MAP_SIZE, TILE_PRICE, STARTING_MONEY } from './gameData';
import { PlayerRow, TileRow, ClientTile } from './types';

const app = express();
app.use(cors());
app.use(express.json());

// In production the client is built into server/public and served
// from this same process, so the whole game is one URL/one host —
// which is what a Discord Activity needs.
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const hasClientBuild = fs.existsSync(path.join(PUBLIC_DIR, 'index.html'));
if (hasClientBuild) {
  app.use(express.static(PUBLIC_DIR));
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ---------- helpers ----------

function getPlayerById(id: string): PlayerRow | undefined {
  return db.prepare('SELECT * FROM players WHERE id = ?').get(id) as PlayerRow | undefined;
}

function getTile(x: number, y: number): TileRow | undefined {
  return db.prepare('SELECT * FROM tiles WHERE x = ? AND y = ?').get(x, y) as TileRow | undefined;
}

function tileToClient(row: TileRow | undefined, x: number, y: number): ClientTile {
  if (!row) return { x, y, ownerId: null, cropType: null, plantedAt: null, ready: false };
  const cfg = row.crop_type ? CROPS[row.crop_type] : null;
  const ready = !!(row.planted_at && cfg && Date.now() - row.planted_at >= cfg.growTimeMs);
  return {
    x,
    y,
    ownerId: row.owner_id,
    cropType: row.crop_type,
    plantedAt: row.planted_at,
    ready,
  };
}

function serializeAllTiles(): ClientTile[] {
  const rows = db.prepare('SELECT * FROM tiles').all() as TileRow[];
  const byKey: Record<string, TileRow> = {};
  for (const r of rows) byKey[`${r.x},${r.y}`] = r;

  const out: ClientTile[] = [];
  for (let x = 0; x < MAP_SIZE; x++) {
    for (let y = 0; y < MAP_SIZE; y++) {
      out.push(tileToClient(byKey[`${x},${y}`], x, y));
    }
  }
  return out;
}

function broadcastTile(x: number, y: number) {
  io.emit('tileUpdate', tileToClient(getTile(x, y), x, y));
}

function inBounds(x: number, y: number) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE;
}

// ---------- auth (dev-only stand-in for Discord OAuth) ----------
// Player id doubles as the bearer token for now. Swap this for real
// Discord OAuth + signed sessions before this goes anywhere public.

app.post('/api/login', (req: Request, res: Response) => {
  const { username } = req.body ?? {};
  if (!username || typeof username !== 'string' || username.trim().length < 2) {
    return res.status(400).json({ error: 'username required (min 2 chars)' });
  }
  const clean = username.trim().slice(0, 24);

  let player = db.prepare('SELECT * FROM players WHERE username = ?').get(clean) as PlayerRow | undefined;
  if (!player) {
    const id = randomUUID();
    db.prepare('INSERT INTO players (id, username, money, created_at) VALUES (?, ?, ?, ?)')
      .run(id, clean, STARTING_MONEY, Date.now());
    player = getPlayerById(id)!;
  }
  res.json({ token: player.id, player });
});

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
  const player = token ? getPlayerById(token) : undefined;
  if (!player) return res.status(401).json({ error: 'unauthorized' });
  (req as any).player = player as PlayerRow;
  next();
}

// ---------- Discord Activity auth ----------
// 1. Client gets a short-lived `code` from the Discord SDK.
// 2. We exchange it here for an access token (needs the client secret,
//    which must never be sent to the browser).
// 3. Client calls /api/login/discord with that access token; we look up
//    the Discord user and issue our own session token, same as dev login.

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
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
      }),
    });
    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      return res.status(502).json({ error: 'discord token exchange failed', detail });
    }
    const tokenData = await tokenRes.json();
    res.json({ access_token: tokenData.access_token });
  } catch (err) {
    res.status(502).json({ error: 'discord token exchange failed' });
  }
});

app.post('/api/login/discord', async (req: Request, res: Response) => {
  const { access_token } = req.body ?? {};
  if (!access_token) return res.status(400).json({ error: 'access_token required' });

  try {
    const meRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!meRes.ok) return res.status(401).json({ error: 'invalid discord access token' });
    const me = await meRes.json();

    let player = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(me.id) as PlayerRow | undefined;
    if (!player) {
      const id = randomUUID();
      // Discord usernames can collide with existing dev-login usernames;
      // suffix to keep the UNIQUE constraint on username happy.
      const baseName = (me.username as string).slice(0, 20);
      let candidate = baseName;
      let n = 1;
      while (db.prepare('SELECT 1 FROM players WHERE username = ?').get(candidate)) {
        candidate = `${baseName}${++n}`;
      }
      db.prepare('INSERT INTO players (id, username, discord_id, money, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, candidate, me.id, STARTING_MONEY, Date.now());
      player = getPlayerById(id)!;
    }

    res.json({ token: player.id, player });
  } catch (err) {
    res.status(502).json({ error: 'discord user lookup failed' });
  }
});



// ---------- game state ----------

app.get('/api/state', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  res.json({
    player,
    crops: CROPS,
    mapSize: MAP_SIZE,
    tilePrice: TILE_PRICE,
    tiles: serializeAllTiles(),
  });
});

app.post('/api/tiles/:x/:y/buy', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const x = Number(req.params.x);
  const y = Number(req.params.y);
  if (!inBounds(x, y)) return res.status(400).json({ error: 'out of bounds' });

  if (getTile(x, y)) return res.status(400).json({ error: 'tile already owned' });
  if (player.money < TILE_PRICE) return res.status(400).json({ error: 'not enough money' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE players SET money = money - ? WHERE id = ?').run(TILE_PRICE, player.id);
    db.prepare('INSERT INTO tiles (x, y, owner_id) VALUES (?, ?, ?)').run(x, y, player.id);
  });
  tx();

  broadcastTile(x, y);
  res.json({ player: getPlayerById(player.id) });
});

app.post('/api/tiles/:x/:y/plant', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const x = Number(req.params.x);
  const y = Number(req.params.y);
  const { cropType } = req.body ?? {};
  const cfg = CROPS[cropType];
  if (!cfg) return res.status(400).json({ error: 'unknown crop' });
  if (!inBounds(x, y)) return res.status(400).json({ error: 'out of bounds' });

  const tile = getTile(x, y);
  if (!tile || tile.owner_id !== player.id) return res.status(403).json({ error: 'not your tile' });
  if (tile.crop_type) return res.status(400).json({ error: 'already planted' });
  if (player.money < cfg.seedCost) return res.status(400).json({ error: 'not enough money' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE players SET money = money - ? WHERE id = ?').run(cfg.seedCost, player.id);
    db.prepare('UPDATE tiles SET crop_type = ?, planted_at = ? WHERE x = ? AND y = ?')
      .run(cropType, Date.now(), x, y);
  });
  tx();

  broadcastTile(x, y);
  res.json({ player: getPlayerById(player.id) });
});

app.post('/api/tiles/:x/:y/harvest', authMiddleware, (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const x = Number(req.params.x);
  const y = Number(req.params.y);
  if (!inBounds(x, y)) return res.status(400).json({ error: 'out of bounds' });

  const tile = getTile(x, y);
  if (!tile || tile.owner_id !== player.id) return res.status(403).json({ error: 'not your tile' });
  if (!tile.crop_type || !tile.planted_at) return res.status(400).json({ error: 'nothing planted' });

  const cfg = CROPS[tile.crop_type];
  const ready = Date.now() - tile.planted_at >= cfg.growTimeMs;
  if (!ready) return res.status(400).json({ error: 'not ready yet' });

  const earnings = cfg.yieldAmount * cfg.sellPrice;
  const tx = db.transaction(() => {
    db.prepare('UPDATE players SET money = money + ? WHERE id = ?').run(earnings, player.id);
    db.prepare('UPDATE tiles SET crop_type = NULL, planted_at = NULL WHERE x = ? AND y = ?').run(x, y);
  });
  tx();

  broadcastTile(x, y);
  res.json({ player: getPlayerById(player.id), earnings });
});

io.on('connection', (socket) => {
  socket.emit('hello', { message: 'connected' });
});

// Catch-all: any non-API route serves the client's index.html so
// client-side routing (and Discord's iframe load) works. Must be
// registered after every /api route above.
if (hasClientBuild) {
  app.get('*', (req: Request, res: Response) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'not found' });
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

const PORT = Number(process.env.PORT) || 3001;
server.listen(PORT, () => console.log(`Extreme Frontier server listening on http://localhost:${PORT}`));
