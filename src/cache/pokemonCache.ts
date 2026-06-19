import { PokemonResponse, PokemonListResponse } from '../models/pokemon.models';
import { POKEAPI_BASE } from '../data/sharedLink';

export const pokemonCache = new Map<number, PokemonResponse>();

export const initPokemonCache = async (): Promise<void> => {
    console.log('Populating pokemon cache...');

    const listResponse = await fetch(`${POKEAPI_BASE}/pokemon?limit=151&offset=0`);
    const listData = await listResponse.json() as PokemonListResponse;

    await Promise.all(
        listData.results.map(async (_, index: number) => {
            const id = index + 1;
            const response = await fetch(`${POKEAPI_BASE}/pokemon/${id}`);
            const raw = await response.json() as PokemonResponse;

            const pokemon: PokemonResponse = {
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

            pokemonCache.set(id, pokemon);
        })
    );

    console.log(`Pokemon cache ready — ${pokemonCache.size} pokemon loaded.`);
};
