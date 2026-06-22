import { BattleState, BattlePokemon } from '../models/battle.models';
import { moveCache } from '../cache/moveCache';

export const checkBattleOver = (state: BattleState): boolean => {
    const p1Lost = state.player1.team.every((p) => p.fainted);
    const p2Lost = state.player2.team.every((p) => p.fainted);

    if (p1Lost || p2Lost) {
        state.status = 'finished';
        state.winner = p1Lost ? state.player2.name : state.player1.name;
        return true;
    }
    return false;
};

export const needsSwitch = (state: BattleState, player: 'player1' | 'player2'): boolean => {
    const active = getActivePokemon(state, player);
    const hasRemaining = state[player].team.some((p) => !p.fainted);
    return active.fainted && hasRemaining;
};

export const getActivePokemon = (state: BattleState, player: 'player1' | 'player2'): BattlePokemon => {
    const p = state[player];
    return p.team[p.activePokemonIndex];
};

export const applyStatChanges = (
    pokemon: BattlePokemon,
    statChanges: { stat: { name: string }; change: number }[],
    log: string[]
): void => {
    statChanges.forEach(({ stat, change }) => {
        const statName = stat.name as keyof typeof pokemon.statStages;
        if (statName in pokemon.statStages) {
            const prev = pokemon.statStages[statName];
            if (change > 0 && prev >= 6) {
                log.push(`${pokemon.name}'s ${statName} won't go any higher!`);
                return;
            }
            if (change < 0 && prev <= -6) {
                log.push(`${pokemon.name}'s ${statName} won't go any lower!`);
                return;
            }
            pokemon.statStages[statName] = Math.max(-6, Math.min(6, prev + change));
            const direction = change > 0 ? 'rose' : 'fell';
            const magnitude = Math.abs(change) >= 2 ? ' sharply' : '';
            log.push(`${pokemon.name}'s ${statName}${magnitude} ${direction}!`);
        }
    });
};
