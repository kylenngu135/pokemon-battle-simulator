import { Router } from 'express';
import { startBattle, submitBattleAction, forfeitBattle, getAllBattlesHandler, getBattleHistory, getBattleTurnHistory, joinBattle } from '../../controllers/battles';

const battlesRouter = Router();

battlesRouter.post('/start', startBattle);
battlesRouter.post('/:battleId/join', joinBattle);
battlesRouter.post('/:battleId/action', submitBattleAction);
battlesRouter.post('/:battleId/forfeit', forfeitBattle);
battlesRouter.get('/', getAllBattlesHandler);
battlesRouter.get('/:battleId', getBattleHistory);
battlesRouter.get('/:battleId/turns', getBattleTurnHistory);

export { battlesRouter };
