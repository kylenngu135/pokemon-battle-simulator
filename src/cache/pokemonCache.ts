import fs from 'fs';
import path from 'path';
import { PokemonResponse } from '../models/pokemon.models';

export const pokemonCache = new Map<number, PokemonResponse>();

export const initPokemonCache = async (): Promise<void> => {
    console.log('Populating pokemon cache from local JSON...');
    // Resolved from project root via process.cwd() so the same src/data/ files work
    // in both dev (tsx src/index.ts) and production (node dist/index.js run from root).
    const dataPath = path.join(process.cwd(), 'src', 'data', 'pokemon-cache.json');
    const raw: PokemonResponse[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    for (const p of raw) {
        pokemonCache.set(p.id, p);
    }
    console.log(`Pokemon cache ready — ${pokemonCache.size} pokemon loaded.`);
};
