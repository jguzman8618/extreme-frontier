import { Pool, types } from 'pg';

// Postgres returns BIGINT (used for all Date.now()-style timestamp columns)
// as strings by default, since it can exceed JS's safe integer range. Our
// timestamps never come close to that range, so parse them as numbers
// globally — this must happen before any queries run.
types.setTypeParser(20, (val: string) => parseInt(val, 10));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. The server needs a Postgres connection string (e.g. from Neon) in the DATABASE_URL environment variable.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error:', err);
});

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      discord_id TEXT UNIQUE,
      created_at BIGINT NOT NULL
    );

    -- Single-player save state, stored as one JSON blob per player.
    -- Keeps the server dumb about what the game actually tracks (position,
    -- inventory, story flags, day count, etc.) — the client owns that shape.
    CREATE TABLE IF NOT EXISTS save_data (
      player_id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at BIGINT NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players(id)
    );
  `);
}

export default pool;
