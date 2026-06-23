import fs from 'fs';
import path from 'path';
import { MoveResponse } from '../models/move.models';

export const moveCache = new Map<number, MoveResponse>();

export const initMoveCache = async (): Promise<void> => {
    console.log('Populating move cache from local JSON...');
    // Resolved from project root via process.cwd() so the same src/data/ files work
    // in both dev (tsx src/index.ts) and production (node dist/index.js run from root).
    const dataPath = path.join(process.cwd(), 'src', 'data', 'move-cache.json');
    const raw: MoveResponse[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    for (const m of raw) {
        moveCache.set(m.id, m);
    }
    console.log(`Move cache ready — ${moveCache.size} moves loaded.`);
};
