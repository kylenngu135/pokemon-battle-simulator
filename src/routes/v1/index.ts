import { Router } from 'express';
import { pokemonRouter } from './pokemon';
import { movesRouter } from './moves';
import { battlesRouter } from './battles';

const v1Router = Router();

v1Router.use('/pokemon', pokemonRouter);
v1Router.use('/move', movesRouter);
v1Router.use('/battles', battlesRouter);

export { v1Router };
