import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const isTest = process.env.NODE_ENV === 'test';

const DB_PATH = isTest
    ? ':memory:'
    : path.join(process.cwd(), 'data', 'battles.db');

if (!isTest) {
    fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
}

export const db: Database.Database = new Database(DB_PATH);

export const initDatabase = (): void => {
    db.exec(`
        CREATE TABLE IF NOT EXISTS battles (
            id TEXT PRIMARY KEY,
            player1_name TEXT NOT NULL,
            player2_name TEXT NOT NULL,
            winner TEXT,
            forfeited INTEGER DEFAULT 0,
            started_at TEXT NOT NULL,
            finished_at TEXT NOT NULL,
            total_turns INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS battle_turns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            battle_id TEXT NOT NULL,
            turn_number INTEGER NOT NULL,
            log TEXT NOT NULL,
            FOREIGN KEY (battle_id) REFERENCES battles(id)
        );
    `);

    if (!isTest) {
        console.log('Database initialized.');
    }
};

// Auto-initialize tables so saveBattle works whenever this module is imported,
// including in the test environment where initDatabase() is never called from index.ts.
initDatabase();
