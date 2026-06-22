import { Server, Socket } from 'socket.io';
import { activeBattles } from '../store/activeBattles';
import { SideEffect } from '../models/battle.models';
import { validateBattle } from './battle.middleware';
import { saveBattle } from '../db/battle.repository';
import { dispatch } from '../battle-engine';

interface JoinPayload {
    battleId: string;
    player: 'player1' | 'player2';
}

interface ActionPayload {
    battleId: string;
    player: 'player1' | 'player2';
    action: { type: 'attack' | 'switch'; moveId?: number; switchToIndex?: number };
}

interface ForfeitPayload {
    battleId: string;
    player: 'player1' | 'player2';
}

const applyEffect = (io: Server, battleId: string, effect: SideEffect): void => {
    switch (effect.type) {
        case 'EMIT_BATTLE_READY':
            io.to(battleId).emit('battle:ready', effect.payload);
            break;
        case 'EMIT_TURN_RESULT':
            io.to(battleId).emit('battle:turnResult', effect.payload);
            break;
        case 'EMIT_SWITCH_REQUIRED': {
            const switchState = activeBattles.get(battleId);
            const switchSocketId = switchState?.[effect.player].socketId;
            if (switchSocketId) io.to(switchSocketId).emit('battle:switchRequired', { player: effect.player });
            break;
        }
        case 'EMIT_WAITING_FOR_OPPONENT_SWITCH': {
            const waitState = activeBattles.get(battleId);
            const waitSocketId = waitState?.[effect.player].socketId;
            if (waitSocketId) io.to(waitSocketId).emit('battle:waitingForOpponentSwitch', {});
            break;
        }
        case 'EMIT_BATTLE_OVER':
            io.to(battleId).emit('battle:over', effect.payload);
            break;
        case 'EMIT_OPPONENT_DISCONNECTED':
            io.to(battleId).emit('battle:opponentDisconnected', { disconnectedPlayer: effect.disconnectedPlayer });
            break;
        case 'SAVE_BATTLE': {
            const state = activeBattles.get(battleId);
            if (state) saveBattle(state, effect.forfeited);
            break;
        }
        case 'DELETE_BATTLE':
            activeBattles.delete(battleId);
            break;
        case 'AUTO_RESOLVE_RECHARGE': {
            // Both active pokemon are recharging — neither player will submit input.
            // Dispatch a synthetic ACTION_SUBMITTED using the pre-injected player1 action.
            const rcState = activeBattles.get(battleId);
            if (rcState?.pendingActions.player1 && rcState?.pendingActions.player2) {
                const rcResult = dispatch(battleId, {
                    type: 'ACTION_SUBMITTED',
                    player: 'player1',
                    action: rcState.pendingActions.player1,
                });
                for (const eff of rcResult.sideEffects) {
                    applyEffect(io, battleId, eff);
                }
            }
            break;
        }
    }
};

export const registerBattleSocketHandlers = (io: Server): void => {
    io.on('connection', (socket: Socket) => {
        socket.on('battle:join', ({ battleId, player }: JoinPayload) => {
            try {
                if (!battleId) {
                    socket.emit('battle:error', { message: 'battleId is required' });
                    return;
                }
                const state = activeBattles.get(battleId);
                if (!state) {
                    socket.emit('battle:error', { message: `Battle ${battleId} not found` });
                    return;
                }
                if (player !== 'player1' && player !== 'player2') {
                    socket.emit('battle:error', { message: 'Invalid player — must be player1 or player2' });
                    return;
                }

                socket.join(battleId);

                const result = dispatch(battleId, { type: 'PLAYER_JOINED', player, socketId: socket.id });
                if (result.error) {
                    socket.emit('battle:error', { message: result.error });
                    return;
                }
                for (const effect of result.sideEffects) {
                    applyEffect(io, battleId, effect);
                }
            } catch (err) {
                socket.emit('battle:error', { message: err instanceof Error ? err.message : 'Unknown error' });
            }
        });

        socket.on('battle:action', ({ battleId, player, action }: ActionPayload) => {
            validateBattle(socket, battleId, player, (state) => {
                try {
                    // Route to the correct event based on battle status
                    if (state.status === 'switching' && state.switchesRequired.includes(player)) {
                        // Forced faint-switch: must submit a switch action
                        if (action.type !== 'switch' || action.switchToIndex === undefined) {
                            socket.emit('battle:error', {
                                message: 'You must switch in a replacement for your fainted pokemon',
                            });
                            return;
                        }
                        const result = dispatch(battleId, {
                            type: 'SWITCH_SUBMITTED',
                            player,
                            switchToIndex: action.switchToIndex,
                        });
                        if (result.error) {
                            socket.emit('battle:error', { message: result.error });
                            return;
                        }
                        for (const effect of result.sideEffects) {
                            applyEffect(io, battleId, effect);
                        }
                    } else {
                        // Normal turn action (attack or voluntary switch)
                        const result = dispatch(battleId, { type: 'ACTION_SUBMITTED', player, action });
                        if (result.error) {
                            socket.emit('battle:error', { message: result.error });
                            return;
                        }
                        for (const effect of result.sideEffects) {
                            applyEffect(io, battleId, effect);
                        }
                    }
                } catch (err) {
                    socket.emit('battle:error', { message: err instanceof Error ? err.message : 'Unknown error' });
                }
            });
        });

        socket.on('battle:forfeit', ({ battleId, player }: ForfeitPayload) => {
            validateBattle(socket, battleId, player, () => {
                try {
                    const result = dispatch(battleId, { type: 'FORFEIT', player });
                    if (result.error) {
                        socket.emit('battle:error', { message: result.error });
                        return;
                    }
                    for (const effect of result.sideEffects) {
                        applyEffect(io, battleId, effect);
                    }
                } catch (err) {
                    socket.emit('battle:error', { message: err instanceof Error ? err.message : 'Unknown error' });
                }
            });
        });

        socket.on('disconnect', () => {
            try {
                for (const [battleId, state] of activeBattles) {
                    if (state.player1.socketId === socket.id || state.player2.socketId === socket.id) {
                        const result = dispatch(battleId, { type: 'PLAYER_DISCONNECTED', socketId: socket.id });
                        if (!result.error) {
                            for (const effect of result.sideEffects) {
                                applyEffect(io, battleId, effect);
                            }
                        }
                        break;
                    }
                }
            } catch (err) {
                console.error('Error handling disconnect:', err);
            }
        });
    });
};
