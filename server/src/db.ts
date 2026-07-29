import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(__dirname, '..', 'game.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    discord_id TEXT UNIQUE,
    money INTEGER NOT NULL DEFAULT 100,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tiles (
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    owner_id TEXT,
    crop_type TEXT,
    planted_at INTEGER,
    PRIMARY KEY (x, y),
    FOREIGN KEY (owner_id) REFERENCES players(id)
  );
`);

export default db;
