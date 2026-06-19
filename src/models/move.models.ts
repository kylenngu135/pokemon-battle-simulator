import { NamedResource } from './shared.models';

export interface MoveEffectEntry {
    effect: string;
    short_effect: string;
    language: NamedResource;
}

export interface MoveMeta {
    ailment: NamedResource;
    category: NamedResource;
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
}

export interface MoveStatChange {
    change: number;
    stat: NamedResource;
}

export interface MoveResponse {
    id: number;
    name: string;
    accuracy: number | null;
    effect_chance: number | null;
    pp: number;
    priority: number;
    power: number | null;
    damage_class: NamedResource;  // "physical" | "special" | "status"
    type: NamedResource;
    effect_entries: MoveEffectEntry[];
    meta: MoveMeta;
    stat_changes: MoveStatChange[];
    target: NamedResource;
}
