import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(__dirname, '..', 'game.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    discord_id TEXT UNIQUE,
    biome TEXT NOT NULL DEFAULT 'homestead',
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    created_at INTEGER NOT NULL
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
    claimed_at INTEGER NOT NULL,
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
    planted_at INTEGER NOT NULL,
    PRIMARY KEY (biome, x, y)
  );

  CREATE TABLE IF NOT EXISTS livestock (
    biome TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    plot_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    type TEXT NOT NULL,
    last_collected_at INTEGER NOT NULL,
    PRIMARY KEY (biome, x, y)
  );

  -- Resource node ids are globally unique strings (only the Homestead
  -- biome has any right now), so this stays keyed by node_id alone.
  CREATE TABLE IF NOT EXISTS resource_state (
    node_id TEXT PRIMARY KEY,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    depleted_until INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS crafting_jobs (
    player_id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    FOREIGN KEY (player_id) REFERENCES players(id)
  );

  CREATE TABLE IF NOT EXISTS market_state (
    item TEXT PRIMARY KEY,
    sold_units REAL NOT NULL DEFAULT 0,
    last_update INTEGER NOT NULL DEFAULT 0
  );
`);

export default db;
