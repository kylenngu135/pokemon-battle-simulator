import { Router } from 'express';
import { getMoveById } from '../../controllers/moves';
// import { /* middleware functions go here */ } from '../../middleware/moves';

const movesRouter = Router();

movesRouter.get('/:id', getMoveById);

export { movesRouter };
