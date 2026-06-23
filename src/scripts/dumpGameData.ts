import fs from 'fs';
import path from 'path';

const POKEAPI_BASE = 'https://pokeapi.co/api/v2';
const GEN1_VERSION_GROUPS = new Set(['red-blue', 'yellow']);
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 300;
const OUTPUT_DIR = path.join(process.cwd(), 'src', 'data');

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface RawPokemon {
    id: number;
    name: string;
    base_experience: number;
    height: number;
    weight: number;
    sprites: {
        front_default: string | null;
        back_default: string | null;
        front_shiny: string | null;
        back_shiny: string | null;
    };
    types: Array<{ slot: number; type: { name: string; url: string } }>;
    stats: Array<{ base_stat: number; effort: number; stat: { name: string; url: string } }>;
    moves: Array<{
        move: { name: string; url: string };
        version_group_details: Array<{ version_group: { name: string } }>;
    }>;
}

interface RawMove {
    id: number;
    name: string;
    accuracy: number | null;
    effect_chance: number | null;
    pp: number;
    priority: number;
    power: number | null;
    damage_class: { name: string; url: string };
    type: { name: string; url: string };
    effect_entries: Array<{
        effect: string;
        short_effect: string;
        language: { name: string; url: string };
    }>;
    meta: {
        ailment: { name: string; url: string };
        category: { name: string; url: string };
        min_hits: number | null;
        max_hits: number | null;
        min_turns: number | null;
        max_turns: number | null;
        drain: number;
        healing: number;
        crit_rate: number;
        ailment_chance: number;
        flinch_chance: number;
        stat_chance: number;
    };
    stat_changes: Array<{ change: number; stat: { name: string; url: string } }>;
    target: { name: string; url: string };
    flags: unknown;
}

const fetchPokemon = async (id: number): Promise<object> => {
    const response = await fetch(`${POKEAPI_BASE}/pokemon/${id}`);
    if (!response.ok) throw new Error(`Failed to fetch pokemon ${id}: ${response.status}`);
    const raw = await response.json() as RawPokemon;

    const gen1Moves = raw.moves
        .filter((m) =>
            m.version_group_details.some((v) => GEN1_VERSION_GROUPS.has(v.version_group.name))
        )
        .map((m) => ({
            move: { name: m.move.name, url: m.move.url },
            version_group_details: m.version_group_details,
        }));

    return {
        id: raw.id,
        name: raw.name,
        base_experience: raw.base_experience,
        height: raw.height,
        weight: raw.weight,
        sprites: {
            front_default: raw.sprites.front_default,
            back_default: raw.sprites.back_default,
            front_shiny: raw.sprites.front_shiny,
            back_shiny: raw.sprites.back_shiny,
        },
        types: raw.types,
        stats: raw.stats,
        moves: gen1Moves,
    };
};

const fetchMove = async (id: number): Promise<object> => {
    const response = await fetch(`${POKEAPI_BASE}/move/${id}`);
    if (!response.ok) throw new Error(`Failed to fetch move ${id}: ${response.status}`);
    const raw = await response.json() as RawMove;

    // Transform flags array to boolean map — same logic as the runtime moveCache.
    // PokeAPI returns flags as an array of { name } objects; some Gen 1 moves omit
    // the key entirely, so we also derive charge/recharge from the English short_effect.
    const rawFlags = raw.flags ?? {};
    const flags: Record<string, boolean> = {};
    if (Array.isArray(rawFlags)) {
        (rawFlags as Array<{ name: string }>).forEach((f) => { flags[f.name] = true; });
    } else if (rawFlags && typeof rawFlags === 'object') {
        Object.keys(rawFlags as Record<string, unknown>).forEach((k) => { flags[k] = true; });
    }

    const enShortEffect = raw.effect_entries
        ?.find((e) => e.language.name === 'en')?.short_effect ?? '';
    if (/(?:charges? for one turn|turn to charge|hits next turn)/i.test(enShortEffect)) {
        flags['charge'] = true;
    }
    if (/\brecharge\b/i.test(enShortEffect)) {
        flags['recharge'] = true;
    }

    return {
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
};

const dumpGameData = async (): Promise<void> => {
    console.log('Starting Gen 1 game data dump...\n');

    const listResponse = await fetch(`${POKEAPI_BASE}/pokemon?limit=151&offset=0`);
    if (!listResponse.ok) throw new Error('Failed to fetch pokemon list');
    const listData = await listResponse.json() as { results: Array<{ name: string; url: string }> };
    const total = listData.results.length;

    const pokemonData: object[] = [];
    const moveIds = new Set<number>();

    for (let i = 0; i < total; i += BATCH_SIZE) {
        const batchIds = Array.from({ length: Math.min(BATCH_SIZE, total - i) }, (_, j) => i + j + 1);
        const results = await Promise.all(batchIds.map(fetchPokemon));

        for (const pokemon of results) {
            pokemonData.push(pokemon);
            const p = pokemon as { moves: Array<{ move: { url: string } }> };
            for (const m of p.moves) {
                const id = parseInt(m.move.url.split('/').filter(Boolean).pop() ?? '0');
                if (id > 0) moveIds.add(id);
            }
        }

        console.log(`Fetched ${Math.min(i + BATCH_SIZE, total)}/${total} pokemon`);
        if (i + BATCH_SIZE < total) await delay(BATCH_DELAY_MS);
    }

    const ids = Array.from(moveIds).sort((a, b) => a - b);
    console.log(`\nFetching ${ids.length} unique Gen 1 moves...`);

    const moveData: object[] = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(fetchMove));
        moveData.push(...results);

        console.log(`Fetched ${Math.min(i + BATCH_SIZE, ids.length)}/${ids.length} moves`);
        if (i + BATCH_SIZE < ids.length) await delay(BATCH_DELAY_MS);
    }

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    fs.writeFileSync(path.join(OUTPUT_DIR, 'pokemon-cache.json'), JSON.stringify(pokemonData, null, 2));
    fs.writeFileSync(path.join(OUTPUT_DIR, 'move-cache.json'), JSON.stringify(moveData, null, 2));

    console.log(`\nDone!`);
    console.log(`  pokemon-cache.json: ${pokemonData.length} entries`);
    console.log(`  move-cache.json: ${moveData.length} entries`);
    console.log(`  Output: ${OUTPUT_DIR}`);
};

dumpGameData().catch((err) => {
    console.error('Dump failed:', err);
    process.exit(1);
});
