import { Database } from "bun:sqlite";
import { config } from "../config";
import { logger } from "../utils/logger";

let dbInstance: Database | null = null;

export function getDatabase(): Database {
  if (!dbInstance) {
    try {
      dbInstance = new Database(config.bot.databasePath, { create: true });
      
      // High-performance SQLite settings
      dbInstance.run("PRAGMA journal_mode = WAL;");
      dbInstance.run("PRAGMA foreign_keys = ON;");
      dbInstance.run("PRAGMA synchronous = NORMAL;");

      initTables(dbInstance);
      logger.success(`SQLite database initialized at: ${config.bot.databasePath}`, "Database");
    } catch (err) {
      logger.error("Failed to initialize SQLite database", "Database", err);
      throw err;
    }
  }
  return dbInstance;
}

function initTables(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      uri TEXT NOT NULL,
      duration INTEGER NOT NULL,
      thumbnail TEXT,
      position INTEGER NOT NULL,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
  `);
}
