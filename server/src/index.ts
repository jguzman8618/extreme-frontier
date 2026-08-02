import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { randomUUID } from 'crypto';
import pool, { initDb } from './db';
import { containsForbiddenWord } from './moderation';
import { PlayerRow } from './types';

const app = express();
app.use(cors());
app.use(express.json());

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const hasClientBuild = fs.existsSync(path.join(PUBLIC_DIR, 'index.html'));
if (hasClientBuild) app.use(express.static(PUBLIC_DIR));

const server = http.createServer(app);

// ---------- helpers ----------

async function getPlayerById(id: string): Promise<PlayerRow | undefined> {
  const r = await pool.query('SELECT * FROM players WHERE id = $1', [id]);
  return r.rows[0] as PlayerRow | undefined;
}

async function usernameTaken(username: string): Promise<boolean> {
  const r = await pool.query('SELECT 1 FROM players WHERE username = $1', [username]);
  return r.rows.length > 0;
}

// ---------- auth ----------

app.post('/api/login', async (req: Request, res: Response) => {
  const { username } = req.body ?? {};
  if (!username || typeof username !== 'string' || username.trim().length < 2) {
    return res.status(400).json({ error: 'username required (min 2 chars)' });
  }
  const clean = username.trim().slice(0, 20);
  if (containsForbiddenWord(clean)) return res.status(400).json({ error: 'that name is not allowed' });
  if (await usernameTaken(clean)) return res.status(409).json({ error: 'that username is already taken' });

  const id = randomUUID();
  await pool.query(
    'INSERT INTO players (id, username, created_at) VALUES ($1, $2, $3)',
    [id, clean, Date.now()]
  );
  const player = (await getPlayerById(id))!;
  res.json({ token: player.id, player });
});

async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
  const player = token ? await getPlayerById(token) : undefined;
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
      while (await usernameTaken(candidate)) candidate = `${baseName}${++n}`;
      await pool.query(
        'INSERT INTO players (id, username, discord_id, created_at) VALUES ($1, $2, $3, $4)',
        [id, candidate, me.id, Date.now()]
      );
      player = (await getPlayerById(id))!;
    }
    res.json({ token: player.id, player });
  } catch {
    res.status(502).json({ error: 'discord user lookup failed' });
  }
});

// ---------- save state ----------
// The server treats save data as an opaque JSON blob — the client owns
// what shape it takes (inventory, position, story flags, day count, etc.).

app.get('/api/save', authMiddleware, async (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const r = await pool.query('SELECT data, updated_at FROM save_data WHERE player_id = $1', [player.id]);
  if (r.rows.length === 0) return res.json({ data: null, updatedAt: null });
  res.json({ data: r.rows[0].data, updatedAt: r.rows[0].updated_at });
});

app.post('/api/save', authMiddleware, async (req: Request, res: Response) => {
  const player = (req as any).player as PlayerRow;
  const { data } = req.body ?? {};
  if (data === undefined) return res.status(400).json({ error: 'data required' });
  const updatedAt = Date.now();
  await pool.query(
    `INSERT INTO save_data (player_id, data, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT (player_id) DO UPDATE SET data = $2, updated_at = $3`,
    [player.id, JSON.stringify(data), updatedAt]
  );
  res.json({ ok: true, updatedAt });
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
  console.log('Database ready.');

  const PORT = Number(process.env.PORT) || 3001;
  server.listen(PORT, () => console.log(`Extreme Frontier server listening on http://localhost:${PORT}`));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
