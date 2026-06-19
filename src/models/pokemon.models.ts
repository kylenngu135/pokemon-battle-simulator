import { NamedResource } from './shared.models';

export interface PokemonListResponse {
    count: number;
    results: NamedResource[];
}

export interface PokemonSprites {
    front_default: string | null;
    back_default: string | null;
    front_shiny: string | null;
    back_shiny: string | null;
}

export interface PokemonType {
    slot: number;
    type: NamedResource;
}

export interface PokemonStat {
    base_stat: number;
    effort: number;
    stat: NamedResource;
}

export interface PokemonMoveVersion {
    move_learn_method: NamedResource;
    version_group: NamedResource;
    level_learned_at: number;
}

export interface PokemonMoveDetail {
    id: number;
    name: string;
    url: string;
    pp: number;
    power: number | null;
    accuracy: number | null;
    type: NamedResource;
    damage_class: NamedResource;
}

export interface PokemonMove {
    move: PokemonMoveDetail;
    version_group_details: PokemonMoveVersion[];
}

export interface PokemonResponse {
    id: number;
    name: string;
    base_experience: number;
    height: number;
    weight: number;
    sprites: PokemonSprites;
    types: PokemonType[];
    stats: PokemonStat[];
    moves: PokemonMove[];
}

export interface Pokemon {
    id: number;
    name: string;
    base_experience: number;
    height: number;
    weight: number;
    sprites: PokemonSprites;
    types: PokemonType[];
    stats: PokemonStat[];
    moves: PokemonMove[];
}
