import { Server, Socket } from 'socket.io';
import { activeBattles } from '../store/activeBattles';
import { PendingAction } from '../models/battle.models';
import { determineTurnOrder, resolveMoveAction, resolveSwitchAction } from '../utils/turn.utils';
import { checkBattleOver, needsSwitch, getActivePokemon } from '../utils/battle.utils';
import { validateBattle } from './battle.middleware';
import { saveBattle } from '../db/battle.repository';

interface JoinPayload {
    battleId: string;
    player: 'player1' | 'player2';
}

interface ActionPayload {
    battleId: string;
    player: 'player1' | 'player2';
    action: PendingAction;
}

interface ForfeitPayload {
    battleId: string;
    player: 'player1' | 'player2';
}

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
                state[player].socketId = socket.id;
                const bothJoined = !!state.player1.socketId && !!state.player2.socketId;
                if (bothJoined) {
                    const mapTeam = (team: import('../models/battle.models').BattlePokemon[]) =>
                        team.map((p) => ({
                            id: p.id,
                            name: p.name,
                            currentHp: p.currentHp,
                            maxHp: p.maxHp,
                            types: p.types,
                            moves: p.moves,
                            sprites: p.sprites,
                            fainted: p.fainted,
                        }));
                    io.to(battleId).emit('battle:ready', {
                        matchId: state.matchId,
                        player1: {
                            name: state.player1.name,
                            team: mapTeam(state.player1.team),
                            activePokemonIndex: state.player1.activePokemonIndex,
                        },
                        player2: {
                            name: state.player2.name,
                            team: mapTeam(state.player2.team),
                            activePokemonIndex: state.player2.activePokemonIndex,
                        },
                        turn: state.turn,
                    });
                }
            } catch (err) {
                socket.emit('battle:error', { message: err instanceof Error ? err.message : 'Unknown error' });
            }
        });

        socket.on('battle:action', ({ battleId, player, action }: ActionPayload) => {
            validateBattle(socket, battleId, player, (state) => {
                try {
                    // ── Case 1: faint-forced switch ──────────────────────────────────────────
                    // A pokemon died last turn; only the affected player(s) need to send in a
                    // replacement. This is NOT a turn — it resolves immediately and independently
                    // of the opponent.
                    if (state.awaitingFaintSwitch[player]) {
                        if (action.type !== 'switch' || action.switchToIndex === undefined) {
                            socket.emit('battle:error', { message: 'You must switch in a replacement for your fainted pokemon' });
                            return;
                        }
                        const target = state[player].team[action.switchToIndex];
                        if (!target || target.fainted) {
                            socket.emit('battle:error', { message: 'Cannot switch to that pokemon — it is fainted or does not exist' });
                            return;
                        }

                        const faintSwitchLog: string[] = [];
                        resolveSwitchAction(state, player, action.switchToIndex, faintSwitchLog);
                        state.log.push(...faintSwitchLog);
                        state.awaitingFaintSwitch[player] = false;

                        io.to(battleId).emit('battle:turnResult', {
                            turnLog: faintSwitchLog,
                            player1NeedsSwitch: state.awaitingFaintSwitch.player1,
                            player2NeedsSwitch: state.awaitingFaintSwitch.player2,
                            battleOver: false,
                            winner: null,
                        });
                        return;
                    }

                    // Block regular turn actions while the opponent still owes a faint switch.
                    if (state.awaitingFaintSwitch.player1 || state.awaitingFaintSwitch.player2) {
                        socket.emit('battle:error', { message: 'Waiting for a faint switch to be resolved' });
                        return;
                    }

                    // ── Case 2: normal turn action (attack or voluntary switch) ──────────────
                    if (action.type === 'attack' && action.moveId === undefined) {
                        socket.emit('battle:error', { message: 'Attack action requires moveId' });
                        return;
                    }
                    if (action.type === 'switch' && action.switchToIndex === undefined) {
                        socket.emit('battle:error', { message: 'Switch action requires switchToIndex' });
                        return;
                    }
                    if (action.type === 'attack' && action.moveId !== undefined) {
                        const activePokemon = getActivePokemon(state, player);
                        const hasMove = activePokemon.moves.some((m) => m.id === action.moveId);
                        if (!hasMove) {
                            socket.emit('battle:error', {
                                message: `${activePokemon.name} does not know move ${action.moveId}`,
                            });
                            return;
                        }
                    }

                    state.pendingActions[player] = action;

                    const p1Action = state.pendingActions.player1;
                    const p2Action = state.pendingActions.player2;
                    if (!p1Action || !p2Action) return;

                    const turnLog: string[] = [];
                    const turnOrder = determineTurnOrder(state, p1Action, p2Action);

                    let battleOver = false;
                    for (const { player: currentPlayer, action: currentAction } of turnOrder) {
                        const opponent: 'player1' | 'player2' = currentPlayer === 'player1' ? 'player2' : 'player1';

                        if (currentAction.type === 'attack' && currentAction.moveId !== undefined) {
                            const attacker = getActivePokemon(state, currentPlayer);
                            const defender = getActivePokemon(state, opponent);
                            resolveMoveAction(attacker, defender, currentAction.moveId, turnLog);
                        } else if (currentAction.type === 'switch' && currentAction.switchToIndex !== undefined) {
                            resolveSwitchAction(state, currentPlayer, currentAction.switchToIndex, turnLog);
                        }

                        if (checkBattleOver(state)) {
                            battleOver = true;
                            break;
                        }
                    }

                    state.pendingActions = {};
                    state.turn += 1;
                    state.log.push(...turnLog);
                    state.turnLogs.push(turnLog);

                    const player1NeedsSwitch = needsSwitch(state, 'player1');
                    const player2NeedsSwitch = needsSwitch(state, 'player2');

                    if (player1NeedsSwitch) state.awaitingFaintSwitch.player1 = true;
                    if (player2NeedsSwitch) state.awaitingFaintSwitch.player2 = true;

                    io.to(battleId).emit('battle:turnResult', {
                        turnLog,
                        player1NeedsSwitch,
                        player2NeedsSwitch,
                        battleOver,
                        winner: state.winner,
                    });

                    if (player1NeedsSwitch) {
                        io.to(battleId).emit('battle:switchRequired', { player: 'player1' });
                    }
                    if (player2NeedsSwitch) {
                        io.to(battleId).emit('battle:switchRequired', { player: 'player2' });
                    }

                    if (battleOver) {
                        saveBattle(state);
                        io.to(battleId).emit('battle:over', { winner: state.winner });
                        activeBattles.delete(battleId);
                    }
                } catch (err) {
                    socket.emit('battle:error', { message: err instanceof Error ? err.message : 'Unknown error' });
                }
            });
        });

        socket.on('battle:forfeit', ({ battleId, player }: ForfeitPayload) => {
            validateBattle(socket, battleId, player, (state) => {
                try {
                    state.status = 'finished';
                    const opponent: 'player1' | 'player2' = player === 'player1' ? 'player2' : 'player1';
                    state.winner = state[opponent].name;

                    saveBattle(state, true);
                    io.to(battleId).emit('battle:over', { winner: state.winner, forfeited: true, forfeitedBy: player });
                    activeBattles.delete(battleId);
                } catch (err) {
                    socket.emit('battle:error', { message: err instanceof Error ? err.message : 'Unknown error' });
                }
            });
        });

        socket.on('disconnect', () => {
            try {
                for (const [battleId, state] of activeBattles) {
                    let disconnectedPlayer: 'player1' | 'player2' | null = null;

                    if (state.player1.socketId === socket.id) {
                        disconnectedPlayer = 'player1';
                    } else if (state.player2.socketId === socket.id) {
                        disconnectedPlayer = 'player2';
                    }

                    if (!disconnectedPlayer) continue;

                    state.status = 'finished';
                    const opponent: 'player1' | 'player2' = disconnectedPlayer === 'player1' ? 'player2' : 'player1';
                    state.winner = state[opponent].name;

                    io.to(battleId).emit('battle:opponentDisconnected', { disconnectedPlayer });
                    io.to(battleId).emit('battle:over', { winner: state.winner });
                    activeBattles.delete(battleId);
                    break;
                }
            } catch (err) {
                console.error('Error handling disconnect:', err);
            }
        });
    });
};
