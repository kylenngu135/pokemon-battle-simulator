/*
 * CURRENT ARCHITECTURE ANALYSIS
 *
 * Patterns in use:
 *   - Event-driven via Socket.IO (socket.on handlers for battle:action, battle:join, etc.)
 *   - In-memory store (activeBattles Map)
 *   - Utility functions that mutate BattleState in-place (checkBattleOver, resolveSwitchAction)
 *   - Middleware for basic validation (battle.middleware.ts)
 *
 * Where state is currently mutated directly:
 *   - battle.socket.ts: state[player].socketId = socket.id on join
 *   - battle.socket.ts: state.pendingActions[player] = action
 *   - battle.socket.ts: state.pendingActions = {}, state.turn++, state.log.push(...) after turn
 *   - battle.socket.ts: state.awaitingFaintSwitch[player] = true/false on faint/switch
 *   - battle.socket.ts: state.status = 'finished', state.winner = ... on forfeit/disconnect
 *   - battle.utils.ts: state.status = 'finished', state.winner = ... inside checkBattleOver
 *   - turn.utils.ts: p.activePokemonIndex = switchToIndex inside resolveSwitchAction
 *   - turn.utils.ts: defender.currentHp, defender.fainted inside resolveMoveAction
 *
 * Where validation logic is scattered:
 *   - battle.middleware.ts: battle exists, status not finished, valid player, socketId match
 *   - battle.socket.ts (inline): awaitingFaintSwitch check, action type, move validity
 *
 * Where transition logic is implicit:
 *   - active → faint-switch mode: checked by reading awaitingFaintSwitch flag
 *   - faint-switch mode → active: when awaitingFaintSwitch both false
 *   - active → finished: checkBattleOver or forfeit handler
 *   - No formal 'waiting' state — all battles start as 'active'
 *   - No formal 'resolving' state — turn resolution is synchronous and inline
 *
 * Main pain points:
 *   - No validation that transitions are valid (e.g., action while resolving)
 *   - checkBattleOver has a state-mutation side effect baked into a query function
 *   - Faint-switch logic mixed with normal turn logic in the same battle:action handler
 *   - Hard to unit-test state transitions without a live socket server
 */

import { BattleState, BattleEvent, BattleStatus } from '../models/battle.models';
import { battleReducer, ReducerResult } from './battleReducer';

// Each status maps to the set of events that are valid transitions out of it.
const VALID_TRANSITIONS: Record<BattleStatus, Set<BattleEvent['type']>> = {
    // waiting: lobby created, player2 has not joined via socket yet
    waiting: new Set<BattleEvent['type']>(['PLAYER_JOINED']),
    // active: both players connected, waiting for both to submit actions
    active: new Set<BattleEvent['type']>(['PLAYER_JOINED', 'ACTION_SUBMITTED', 'FORFEIT', 'PLAYER_DISCONNECTED']),
    // resolving: transient internal state during synchronous turn processing (never stored in activeBattles)
    resolving: new Set<BattleEvent['type']>([]),
    // switching: one or both players need to switch in a replacement after a faint
    switching: new Set<BattleEvent['type']>(['SWITCH_SUBMITTED', 'FORFEIT', 'PLAYER_DISCONNECTED']),
    // finished: battle is over, winner determined
    finished: new Set<BattleEvent['type']>([]),
};

export const transition = (state: BattleState, event: BattleEvent): ReducerResult => {
    const validForStatus = VALID_TRANSITIONS[state.status];
    if (!validForStatus.has(event.type)) {
        console.warn(`[BattleStateMachine] Invalid transition: ${event.type} in state ${state.status}`);
        return {
            newState: state,
            sideEffects: [],
            error: `Cannot perform ${event.type} while battle is in ${state.status} state`,
        };
    }
    return battleReducer(state, event);
};
