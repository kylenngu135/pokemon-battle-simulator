import { Router } from 'express';
import { getAllPokemon, getPokemonById } from '../../controllers/pokemon';
// import { /* middleware functions go here */ } from '../../middleware/pokemon';

const pokemonRouter = Router();

pokemonRouter.get('/', getAllPokemon);
pokemonRouter.get('/:id', getPokemonById);

export { pokemonRouter };
