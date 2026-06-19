import { Request, Response } from 'express';
import { PokemonListResponse, PokemonResponse } from '../models/pokemon.models';
import { POKEAPI_BASE } from '../data/sharedLink';

export const getAllPokemon = async (_req: Request, res: Response): Promise<void> => {
    const url = new URL(`${POKEAPI_BASE}/pokemon?limit=151&offset=0`);
    const response = await fetch(url.toString());
    const raw = await response.json() as PokemonListResponse;
    const data: PokemonListResponse = {
        count: raw.results.length,
        results: raw.results,
    };


    res.status(200).json(data);
};

export const getPokemonById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const url = new URL(`${POKEAPI_BASE}/pokemon/${id}`);
    const response = await fetch(url.toString());
    const raw = await response.json() as PokemonResponse;

    const data: PokemonResponse = {
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
        moves: raw.moves,
    };
    res.status(200).json(data);
};
