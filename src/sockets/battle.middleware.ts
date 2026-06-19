import { Socket } from 'socket.io';
import { activeBattles } from '../store/activeBattles';
import { BattleState } from '../models/battle.models';

export const validateBattle = (
    socket: Socket,
    battleId: string,
    player: string,
    next: (state: BattleState) => void
): void => {
    if (!battleId) {
        socket.emit('battle:error', { message: 'battleId is required' });
        return;
    }

    const state = activeBattles.get(battleId);
    if (!state) {
        socket.emit('battle:error', { message: `Battle ${battleId} not found` });
        return;
    }

    if (state.status === 'finished') {
        socket.emit('battle:error', { message: 'Battle is already finished' });
        return;
    }

    if (player !== 'player1' && player !== 'player2') {
        socket.emit('battle:error', { message: 'Invalid player — must be player1 or player2' });
        return;
    }

    if (state[player].socketId !== socket.id) {
        socket.emit('battle:error', { message: 'Socket does not match player' });
        return;
    }

    next(state);
};
