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

// Note: important that timestamp-ish columns (created_at, planted_at,
// started_at, etc.) are BIGINT, not INTEGER — they store Date.now()
// millisecond values, which exceed Postgres's 32-bit INTEGER range.
export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      discord_id TEXT UNIQUE,
      biome TEXT NOT NULL DEFAULT 'homestead',
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory (
      player_id TEXT NOT NULL,
      item TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (player_id, item),
      FOREIGN KEY (player_id) REFERENCES players(id)
    );

    -- plot_id is globally unique across all biomes (each biome's plots use
    -- their own id prefix), so this stays a simple single-column key.
    CREATE TABLE IF NOT EXISTS plot_owners (
      plot_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      farm_name TEXT,
      claimed_at BIGINT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES players(id)
    );

    -- x,y alone is no longer globally unique now that multiple biomes exist
    -- side by side — every per-tile table is keyed by (biome, x, y).
    CREATE TABLE IF NOT EXISTS buildings (
      biome TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      plot_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      type TEXT NOT NULL,
      PRIMARY KEY (biome, x, y)
    );

    CREATE TABLE IF NOT EXISTS crops (
      biome TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      owner_id TEXT NOT NULL,
      crop_type TEXT NOT NULL,
      planted_at BIGINT NOT NULL,
      PRIMARY KEY (biome, x, y)
    );

    CREATE TABLE IF NOT EXISTS livestock (
      biome TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      plot_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      type TEXT NOT NULL,
      last_collected_at BIGINT NOT NULL,
      PRIMARY KEY (biome, x, y)
    );

    -- Resource node ids are globally unique strings across all biomes,
    -- so this stays keyed by node_id alone.
    CREATE TABLE IF NOT EXISTS resource_state (
      node_id TEXT PRIMARY KEY,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      depleted_until BIGINT NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS crafting_jobs (
      player_id TEXT PRIMARY KEY,
      recipe_id TEXT NOT NULL,
      started_at BIGINT NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players(id)
    );

    CREATE TABLE IF NOT EXISTS market_state (
      item TEXT PRIMARY KEY,
      sold_units DOUBLE PRECISION NOT NULL DEFAULT 0,
      last_update BIGINT NOT NULL DEFAULT 0
    );
  `);
}

export default pool;
