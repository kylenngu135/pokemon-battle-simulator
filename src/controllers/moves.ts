import { Request, Response } from 'express';
import { MoveResponse } from '../models/move.models';
import { POKEAPI_BASE } from '../data/sharedLink';

export const getMoveById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const url = new URL(`${POKEAPI_BASE}/move/${id}`);
    const response = await fetch(url.toString());
    const raw = await response.json() as MoveResponse;

    const rawAny = raw as unknown as Record<string, unknown>;
    const rawFlags = rawAny.flags ?? {};
    const flags: Record<string, boolean> = {};
    if (Array.isArray(rawFlags)) {
        (rawFlags as Array<{ name: string }>).forEach((f) => { flags[f.name] = true; });
    } else if (rawFlags && typeof rawFlags === 'object') {
        Object.keys(rawFlags).forEach((k) => { flags[k] = true; });
    }

    const data: MoveResponse = {
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
    }

    res.status(200).json(data);
};
