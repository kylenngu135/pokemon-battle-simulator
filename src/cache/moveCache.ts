import { MoveResponse } from '../models/move.models';

const POKEAPI_BASE = process.env.POKEAPI_BASE ?? 'https://pokeapi.co/api/v2';

export const moveCache = new Map<number, MoveResponse>();

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const fetchMove = async (id: number) => {
    const response = await fetch(`${POKEAPI_BASE}/move/${id}`);
    const raw = await response.json() as MoveResponse;

    // Transform flags array to a boolean map for easy lookup.
    // PokeAPI omits the flags key entirely for Gen 1 moves, so we also
    // derive charge/recharge flags from the English short_effect text.
    const rawAny = raw as unknown as Record<string, unknown>;
    const rawFlags = rawAny.flags ?? {};
    const flags: Record<string, boolean> = {};
    if (Array.isArray(rawFlags)) {
        (rawFlags as Array<{ name: string }>).forEach((f) => { flags[f.name] = true; });
    } else if (rawFlags && typeof rawFlags === 'object') {
        Object.keys(rawFlags).forEach((k) => { flags[k] = true; });
    }

    type EffectEntry = { language: { name: string }; short_effect: string };
    const enShortEffect = (raw.effect_entries as EffectEntry[])
        ?.find((e) => e.language.name === 'en')?.short_effect ?? '';
    if (/(?:charges? for one turn|turn to charge|hits next turn)/i.test(enShortEffect)) {
        flags['charge'] = true;
    }
    if (/\brecharge\b/i.test(enShortEffect)) {
        flags['recharge'] = true;
    }

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
        flags,
    };

    moveCache.set(id, move);
};

export const initMoveCache = async (retries = 3): Promise<void> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`Populating move cache (attempt ${attempt})...`);

            const { pokemonCache } = await import('./pokemonCache');
            const moveIds = new Set<number>();

            pokemonCache.forEach((pokemon) => {
                pokemon.moves.forEach((m) => {
                    const id = parseInt(m.move.url.split('/').filter(Boolean).pop() ?? '0');
                    if (id > 0) moveIds.add(id);
                });
            });

            const ids = Array.from(moveIds);
            const BATCH_SIZE = 20;
            for (let i = 0; i < ids.length; i += BATCH_SIZE) {
                await Promise.all(ids.slice(i, i + BATCH_SIZE).map(fetchMove));
            }

            console.log(`Move cache ready — ${moveCache.size} moves loaded.`);
            return;
        } catch (err) {
            if (attempt === retries) throw err;
            console.warn(`Move cache fetch failed (attempt ${attempt}), retrying in 5s...`);
            await delay(5000);
        }
    }
};
