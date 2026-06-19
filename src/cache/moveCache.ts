// moveCache.ts
import { MoveResponse } from '../models/move.models';

const POKEAPI_BASE = process.env.POKEAPI_BASE ?? 'https://pokeapi.co/api/v2';

export const moveCache = new Map<number, MoveResponse>();

export const initMoveCache = async (): Promise<void> => {
    console.log('Populating move cache...');

    // collect all unique move IDs from the pokemon cache
    const { pokemonCache } = await import('./pokemonCache');
    const moveIds = new Set<number>();

    pokemonCache.forEach((pokemon) => {
        pokemon.moves.forEach((m) => {
            const id = parseInt(m.move.url.split('/').filter(Boolean).pop() ?? '0');
            if (id > 0) moveIds.add(id);
        });
    });

    await Promise.all(
        Array.from(moveIds).map(async (id) => {
            const response = await fetch(`${POKEAPI_BASE}/move/${id}`);
            const raw = await response.json() as MoveResponse;

            const move: MoveResponse = {
                id: raw.id,
                name: raw.name,
                accuracy: raw.accuracy,
                effect_chance: raw.effect_chance,
                pp: raw.pp,
                priority: raw.priority,
                power: raw.power,
                damage_class: raw.damage_class,
                type: raw.type,
                effect_entries: raw.effect_entries,
                meta: raw.meta,
                stat_changes: raw.stat_changes,
                target: raw.target,
            };

            moveCache.set(id, move);
        })
    );

    console.log(`Move cache ready — ${moveCache.size} moves loaded.`);
};
