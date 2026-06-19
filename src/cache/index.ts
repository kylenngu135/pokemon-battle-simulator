import { initPokemonCache } from './pokemonCache';
import { initMoveCache } from './moveCache';

export const initCache = async (): Promise<void> => {
    await initPokemonCache();
    await initMoveCache();
};
