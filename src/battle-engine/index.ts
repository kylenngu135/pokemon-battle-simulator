import { activeBattles } from '../store/activeBattles';
import { BattleState, BattleEvent, SideEffect } from '../models/battle.models';
import { transition } from './battleStateMachine';

export interface DispatchResult {
    newState: BattleState;
    sideEffects: SideEffect[];
    error?: string;
}

/**
 * The single entry point for all battle state changes.
 * Pure function with no side effects — all side effects are returned to the caller.
 * The caller (socket handler) is responsible for performing the returned side effects.
 */
export const dispatch = (battleId: string, event: BattleEvent): DispatchResult => {
    const currentState = activeBattles.get(battleId);
    if (!currentState) {
        return {
            newState: {} as BattleState,
            sideEffects: [],
            error: `Battle ${battleId} not found`,
        };
    }

    const result = transition(currentState, event);

    if (!result.error) {
        activeBattles.set(battleId, result.newState);
    }

    return result;
};
