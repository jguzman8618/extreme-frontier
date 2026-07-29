import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(__dirname, '..', 'game.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    discord_id TEXT UNIQUE,
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

  CREATE TABLE IF NOT EXISTS plot_owners (
    plot_id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    farm_name TEXT,
    claimed_at INTEGER NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES players(id)
  );

  CREATE TABLE IF NOT EXISTS buildings (
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    plot_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    type TEXT NOT NULL,
    PRIMARY KEY (x, y)
  );

  CREATE TABLE IF NOT EXISTS crops (
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    owner_id TEXT NOT NULL,
    crop_type TEXT NOT NULL,
    planted_at INTEGER NOT NULL,
    PRIMARY KEY (x, y)
  );

  CREATE TABLE IF NOT EXISTS resource_state (
    node_id TEXT PRIMARY KEY,
    depleted_until INTEGER NOT NULL DEFAULT 0
  );
`);

export default db;
