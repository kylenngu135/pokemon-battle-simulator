import {
    BattleState,
    BattleEvent,
    BattlePokemon,
    BattlePlayer,
    BattleReadyPokemon,
    BattleReadyPayload,
    TurnResultPayload,
    TurnEvent,
    PrimaryStatus,
    SideEffect,
} from '../models/battle.models';
import { determineTurnOrder, resolveSwitchAction } from '../utils/turn.utils';
import { checkBattleOver, needsSwitch, getActivePokemon } from '../utils/battle.utils';
import {
    checkRecharging, checkParalysis, checkSleep, checkFreeze, checkConfusion,
    thawIfFrozenByFire, processEndOfTurn,
} from './effectsEngine';
import { moveCache } from '../cache/moveCache';
import { executeMoveEffect, applyPostMoveEffects } from './movePipeline';
import {
    isLocked,
    getLockedAction,
    syncLockStateAfterMove,
} from './lockManager';

export interface ReducerResult {
    newState: BattleState;
    sideEffects: SideEffect[];
    error?: string;
}

const deepCopy = <T>(obj: T): T => JSON.parse(JSON.stringify(obj)) as T;

const mapTeam = (team: BattlePokemon[]): BattleReadyPokemon[] =>
    team.map((p) => ({
        id: p.id,
        name: p.name,
        currentHp: p.currentHp,
        maxHp: p.maxHp,
        types: p.types,
        currentTypes: p.currentTypes,
        moves: p.moves,
        sprites: p.sprites,
        fainted: p.fainted,
        status: p.status,
        sleepTurnsRemaining: p.sleepTurnsRemaining,
        toxicCounter: p.toxicCounter,
        recharging: p.recharging,
        confused: p.confused,
        flinched: p.flinched,
        seeded: p.seeded,
        reflect: p.reflect,
        lightScreen: p.lightScreen,
        reflectTurnsRemaining: p.reflectTurnsRemaining,
        lightScreenTurnsRemaining: p.lightScreenTurnsRemaining,
        charging: p.charging,
        chargingMoveId: p.chargingMoveId,
        invulnerableState: p.invulnerableState,
        biding: p.biding,
        raging: p.raging,
        substituteHp: p.substituteHp,
        disabledMoveId: p.disabledMoveId,
        disabledTurnsRemaining: p.disabledTurnsRemaining,
        protecting: p.protecting,
        mistActive: p.mistActive,
        mistTurnsRemaining: p.mistTurnsRemaining,
        lockedMove: p.lockedMove,
        lockType: p.lockType,
        lockTurnsRemaining: p.lockTurnsRemaining,
        lockTotalTurns: p.lockTotalTurns,
        rampageTurns: p.rampageTurns,
        rolloutConsecutiveTurns: p.rolloutConsecutiveTurns,
        rolloutBasePower: p.rolloutBasePower,
        defenseCurlUsed: p.defenseCurlUsed,
        furyCutterConsecutiveTurns: p.furyCutterConsecutiveTurns,
        trappedByMove: p.trappedByMove,
        trappedByPlayer: p.trappedByPlayer,
        trappedTurnsRemaining: p.trappedTurnsRemaining,
        ingrainActive: p.ingrainActive,
        aquaRingActive: p.aquaRingActive,
        roostUsedThisTurn: p.roostUsedThisTurn,
        statStages: { ...p.statStages },
    }));

const buildPlayerState = (player: BattlePlayer) => ({
    name: player.name,
    team: mapTeam(player.team),
    activePokemonIndex: player.activePokemonIndex,
});

const buildReadyPayload = (state: BattleState): BattleReadyPayload => ({
    matchId: state.matchId,
    player1: buildPlayerState(state.player1),
    player2: buildPlayerState(state.player2),
    turn: state.turn,
});

// ── Turn event helpers ────────────────────────────────────────────────────────

interface MoveEventCtx {
    attackerName: string;
    defenderName: string;
    attackerPlayer: 'player1' | 'player2';
    defenderPlayer: 'player1' | 'player2';
    attackerMaxHp: number;
    defenderMaxHp: number;
    postAttackerHp: number;
    postDefenderHp: number;
}

/**
 * Classify a single log entry from executeMoveEffect into a TurnEvent.
 * runAttHp / runDefHp track the running HP through the log sequence for heal events.
 */
const classifyMoveEntry = (
    entry: string,
    ctx: MoveEventCtx,
    runAttHp: number,
    runDefHp: number,
): TurnEvent => {
    const { attackerName, defenderName, attackerPlayer, defenderPlayer,
        attackerMaxHp, defenderMaxHp, postDefenderHp } = ctx;

    const targetOf = (name: string): 'player1' | 'player2' | undefined =>
        name === attackerName ? attackerPlayer : name === defenderName ? defenderPlayer : undefined;

    // Faint (check before other patterns)
    if (entry.endsWith(' fainted!')) {
        const name = entry.slice(0, -' fainted!'.length);
        return { type: 'faint', message: entry, target: targetOf(name), pokemonName: name, newHp: 0 };
    }

    // Damage with HP: "X took N damage! (M/Max HP remaining)" — also handles Counter's combined entry
    const dmgM = entry.match(/(.+?) took (\d+) damage! \((\d+)\/(\d+) HP remaining\)/);
    if (dmgM) {
        // Handle "Used Move! Name took damage!" combined entries — grab last segment of dmgM[1]
        const name = dmgM[1].includes('! ') ? dmgM[1].split('! ').pop()! : dmgM[1];
        const dmg = parseInt(dmgM[2]);
        const newHp = parseInt(dmgM[3]);
        const maxHp = parseInt(dmgM[4]);
        return { type: 'damage', message: entry, target: targetOf(name), pokemonName: name, hpChange: -dmg, newHp, maxHp };
    }

    // Recoil — "X is hit by recoil! (N/Max HP remaining)"
    const recoilM = entry.match(/^(.+?) is hit by recoil! \((\d+)\/(\d+) HP remaining\)$/);
    if (recoilM) {
        const name = recoilM[1];
        const tgt = targetOf(name);
        return { type: 'recoil', message: entry, target: tgt, pokemonName: name, newHp: parseInt(recoilM[2]), maxHp: parseInt(recoilM[3]) };
    }

    // Crash damage — "X kept going and crashed! (N/Max HP remaining)"
    const crashM = entry.match(/^(.+?) kept going and crashed! \((\d+)\/(\d+) HP remaining\)$/);
    if (crashM) {
        const name = crashM[1];
        const tgt = targetOf(name);
        return { type: 'recoil', message: entry, target: tgt, pokemonName: name, newHp: parseInt(crashM[2]), maxHp: parseInt(crashM[3]) };
    }

    // HP cost (Mind Blown, Steel Beam) — "X paid a hefty price! (N/Max HP remaining)"
    const costM = entry.match(/^(.+?) paid a hefty price! \((\d+)\/(\d+) HP remaining\)$/);
    if (costM) {
        const name = costM[1];
        const tgt = targetOf(name);
        return { type: 'recoil', message: entry, target: tgt, pokemonName: name, newHp: parseInt(costM[2]), maxHp: parseInt(costM[3]) };
    }

    // Heal "X restored N HP!"
    const healM = entry.match(/^(.+?) restored (\d+) HP!$/);
    if (healM) {
        const name = healM[1];
        const heal = parseInt(healM[2]);
        const tgt = targetOf(name);
        const curHp = tgt === attackerPlayer ? runAttHp : runDefHp;
        const maxH = tgt === attackerPlayer ? attackerMaxHp : defenderMaxHp;
        return { type: 'heal', message: entry, target: tgt, pokemonName: name, hpChange: heal, newHp: Math.min(maxH, curHp + heal), maxHp: maxH };
    }

    // Miss
    if (entry.includes("'s attack missed!")) {
        return { type: 'miss', message: entry, target: attackerPlayer, pokemonName: attackerName };
    }

    // Immune
    if (entry.startsWith("It doesn't affect ")) {
        return { type: 'immune', message: entry, target: defenderPlayer };
    }

    // Fail
    if (entry === 'But it failed!' || entry === 'But nothing happened!' || entry.endsWith('is disabled!')) {
        return { type: 'fail', message: entry };
    }

    // Move use "[Name] used [Move]!"
    if (/ used /.test(entry) && entry.endsWith('!')) {
        const m = entry.match(/^(.+?) used (.+?)!$/);
        if (m) {
            return { type: 'move_use', message: entry, pokemonName: m[1], moveName: m[2], target: targetOf(m[1]) };
        }
    }

    // Charging animations
    const chargingPhrases = ['flew up high!', 'burrowed its way under the ground!', 'hid underwater!',
        'vanished instantly!', 'took in sunlight!', 'tucked in its head!', 'is glowing!',
        'made a whirlwind!', 'is charging up!'];
    if (chargingPhrases.some((p) => entry.includes(p))) {
        return { type: 'charging', message: entry, target: attackerPlayer, pokemonName: attackerName };
    }

    // Status apply
    if (entry.includes(' fell asleep!') || entry.includes('went to sleep')) {
        const name = entry.includes(' fell asleep!') ? entry.replace(' fell asleep!', '') : entry.split(' went to')[0];
        return { type: 'status_apply', message: entry, target: targetOf(name), pokemonName: name, status: 'sleep' };
    }
    if (entry.includes(' was burned!')) {
        const name = entry.replace(' was burned!', '');
        return { type: 'status_apply', message: entry, target: targetOf(name), pokemonName: name, status: 'burn' };
    }
    if (entry.includes(' was badly poisoned!')) {
        const name = entry.replace(' was badly poisoned!', '');
        return { type: 'status_apply', message: entry, target: targetOf(name), pokemonName: name, status: 'toxic' };
    }
    if (entry.includes(' was poisoned!')) {
        const name = entry.replace(' was poisoned!', '');
        return { type: 'status_apply', message: entry, target: targetOf(name), pokemonName: name, status: 'poison' };
    }
    if (entry.includes(' was paralyzed!')) {
        const name = entry.split(' was paralyzed!')[0];
        return { type: 'status_apply', message: entry, target: targetOf(name), pokemonName: name, status: 'paralysis' };
    }
    if (entry.includes(' was frozen solid!')) {
        const name = entry.replace(' was frozen solid!', '');
        return { type: 'status_apply', message: entry, target: targetOf(name), pokemonName: name, status: 'freeze' };
    }

    // Status clear
    if (entry.includes(' thawed out!')) {
        const name = entry.replace(' thawed out!', '');
        return { type: 'status_clear', message: entry, target: targetOf(name), pokemonName: name, status: 'freeze' };
    }
    if (entry.includes(' woke up!')) {
        const name = entry.replace(' woke up!', '');
        return { type: 'status_clear', message: entry, target: targetOf(name), pokemonName: name, status: 'sleep' };
    }
    // Rest status cure: "[Name]'s burn was cured!"
    const cureM = entry.match(/^(.+?)'s (.+?) was cured!$/);
    if (cureM) {
        return { type: 'status_clear', message: entry, target: targetOf(cureM[1]), pokemonName: cureM[1], status: cureM[2] as PrimaryStatus };
    }

    // Weather change
    const weatherApply: Record<string, import('../models/battle.models').Weather> = {
        'The sunlight turned harsh!': 'sun',
        'It started to rain!': 'rain',
        'A sandstorm kicked up!': 'sandstorm',
        'It started to hail!': 'hail',
        'The harsh sunlight faded!': 'none',
        'The rain stopped!': 'none',
        'The sandstorm subsided!': 'none',
        'The hail stopped!': 'none',
    };
    if (weatherApply[entry] !== undefined) {
        return { type: 'weather_change', message: entry, weather: weatherApply[entry] };
    }

    // Field effects (applied)
    if (entry.includes(' is protected by Reflect!')) {
        const name = entry.split(' is protected by Reflect!')[0];
        return { type: 'field_effect', message: entry, target: targetOf(name), pokemonName: name, fieldEffect: 'reflect', fieldTurnsRemaining: 5 };
    }
    if (entry.includes(' is protected by Light Screen!')) {
        const name = entry.split(' is protected by Light Screen!')[0];
        return { type: 'field_effect', message: entry, target: targetOf(name), pokemonName: name, fieldEffect: 'light-screen', fieldTurnsRemaining: 5 };
    }
    if (entry.includes(' is protected by the mist!')) {
        const name = entry.split(' is protected by the mist!')[0];
        return { type: 'field_effect', message: entry, target: targetOf(name), pokemonName: name, fieldEffect: 'mist', fieldTurnsRemaining: 5 };
    }

    void runDefHp; void postDefenderHp; void defenderMaxHp;
    return { type: 'message', message: entry };
};

/**
 * Classify an end-of-turn log entry, using running HP and pre-EOT snapshots for HP values.
 */
const classifyEotEntry = (
    entry: string,
    p1Name: string,
    p2Name: string,
    runHp: Record<'player1' | 'player2', number>,
    maxHp: Record<'player1' | 'player2', number>,
    preToxicCounter: Record<'player1' | 'player2', number>,
): TurnEvent => {
    const playerOf = (name: string): 'player1' | 'player2' | undefined =>
        name === p1Name ? 'player1' : name === p2Name ? 'player2' : undefined;

    // Faint
    if (entry.endsWith(' fainted!')) {
        const name = entry.slice(0, -' fainted!'.length);
        const pl = playerOf(name);
        return { type: 'faint', message: entry, target: pl, pokemonName: name, newHp: 0 };
    }

    // Weather damage
    if (entry.includes('is buffeted by the sandstorm!') || entry.includes('is pelted by hail!')) {
        const name = entry.split(' is ')[0];
        const pl = playerOf(name);
        if (pl) {
            const dmg = Math.max(1, Math.floor(maxHp[pl] / 16));
            return { type: 'weather_damage', message: entry, target: pl, pokemonName: name, hpChange: -dmg, newHp: Math.max(0, runHp[pl] - dmg), maxHp: maxHp[pl] };
        }
    }

    // Leech seed drain
    if (entry.includes("'s HP was drained by Leech Seed!")) {
        const name = entry.split("'s HP was drained")[0];
        const pl = playerOf(name);
        if (pl) {
            const dmg = Math.max(1, Math.floor(maxHp[pl] / 8));
            return { type: 'damage', message: entry, target: pl, pokemonName: name, hpChange: -dmg, newHp: Math.max(0, runHp[pl] - dmg), maxHp: maxHp[pl] };
        }
    }

    // Burn damage
    if (entry.includes(' is hurt by its burn!')) {
        const name = entry.split(' is hurt by its burn!')[0];
        const pl = playerOf(name);
        if (pl) {
            const dmg = Math.max(1, Math.floor(maxHp[pl] / 16));
            return { type: 'damage', message: entry, target: pl, pokemonName: name, hpChange: -dmg, newHp: Math.max(0, runHp[pl] - dmg), maxHp: maxHp[pl] };
        }
    }

    // Poison damage
    if (entry.includes(' is hurt by poison!')) {
        const name = entry.split(' is hurt by poison!')[0];
        const pl = playerOf(name);
        if (pl) {
            const dmg = Math.max(1, Math.floor(maxHp[pl] / 8));
            return { type: 'damage', message: entry, target: pl, pokemonName: name, hpChange: -dmg, newHp: Math.max(0, runHp[pl] - dmg), maxHp: maxHp[pl] };
        }
    }

    // Toxic damage
    if (entry.includes(' is badly hurt by poison!')) {
        const name = entry.split(' is badly hurt by poison!')[0];
        const pl = playerOf(name);
        if (pl) {
            const counter = preToxicCounter[pl];
            const dmg = Math.max(1, Math.floor((maxHp[pl] * counter) / 16));
            return { type: 'damage', message: entry, target: pl, pokemonName: name, hpChange: -dmg, newHp: Math.max(0, runHp[pl] - dmg), maxHp: maxHp[pl] };
        }
    }

    // Trap damage
    if (entry.includes(' is hurt by ') && !entry.includes('burn') && !entry.includes('poison')) {
        const name = entry.split(' is hurt by ')[0];
        const pl = playerOf(name);
        if (pl) {
            const dmg = Math.max(1, Math.floor(maxHp[pl] / 8));
            return { type: 'damage', message: entry, target: pl, pokemonName: name, hpChange: -dmg, newHp: Math.max(0, runHp[pl] - dmg), maxHp: maxHp[pl] };
        }
    }

    // Ingrain heal
    if (entry.includes('absorbed nutrients')) {
        const name = entry.split(' absorbed')[0];
        const pl = playerOf(name);
        if (pl) {
            const heal = Math.max(1, Math.floor(maxHp[pl] / 16));
            return { type: 'heal', message: entry, target: pl, pokemonName: name, hpChange: heal, newHp: Math.min(maxHp[pl], runHp[pl] + heal), maxHp: maxHp[pl] };
        }
    }

    // Aqua Ring heal
    if (entry.includes(' is healed by its Aqua Ring!')) {
        const name = entry.split(' is healed by')[0];
        const pl = playerOf(name);
        if (pl) {
            const heal = Math.max(1, Math.floor(maxHp[pl] / 16));
            return { type: 'heal', message: entry, target: pl, pokemonName: name, hpChange: heal, newHp: Math.min(maxHp[pl], runHp[pl] + heal), maxHp: maxHp[pl] };
        }
    }

    // Wish heal
    if (entry.includes("'s wish came true!")) {
        const name = entry.split("'s wish came true!")[0];
        const pl = playerOf(name);
        return { type: 'heal', message: entry, target: pl, pokemonName: name };
    }

    // Status clear (wake up, confusion end)
    if (entry.includes(' woke up!')) {
        const name = entry.replace(' woke up!', '');
        return { type: 'status_clear', message: entry, target: playerOf(name), pokemonName: name, status: 'sleep' };
    }
    if (entry.includes(' snapped out of confusion!')) {
        const name = entry.replace(' snapped out of confusion!', '');
        return { type: 'message', message: entry, target: playerOf(name), pokemonName: name };
    }

    // Weather change (end)
    const weatherEnd: Record<string, import('../models/battle.models').Weather> = {
        'The harsh sunlight faded!': 'none',
        'The rain stopped!': 'none',
        'The sandstorm subsided!': 'none',
        'The hail stopped!': 'none',
    };
    if (weatherEnd[entry] !== undefined) {
        return { type: 'weather_change', message: entry, weather: weatherEnd[entry] };
    }

    void preToxicCounter;
    return { type: 'message', message: entry };
};

export const battleReducer = (state: BattleState, event: BattleEvent): ReducerResult => {
    switch (event.type) {
        case 'PLAYER_JOINED': {
            const { player, socketId } = event;
            const newState = deepCopy(state);
            newState[player].socketId = socketId;
            const sideEffects: SideEffect[] = [];

            const bothJoined = !!newState.player1.socketId && !!newState.player2.socketId;
            if (bothJoined) {
                if (newState.status === 'waiting') {
                    newState.status = 'active';
                }
                sideEffects.push({ type: 'EMIT_BATTLE_READY', payload: buildReadyPayload(newState) });
            }

            return { newState, sideEffects };
        }

        case 'ACTION_SUBMITTED': {
            const { player, action } = event;
            const newState = deepCopy(state);
            const sideEffects: SideEffect[] = [];

            const submittingPokemon = getActivePokemon(newState, player);

            // If submitting player's pokemon is locked, override with the locked action
            if (isLocked(submittingPokemon) && !submittingPokemon.fainted) {
                newState.pendingActions[player] = getLockedAction(submittingPokemon);
            } else {
                // Validate action shape
                if (action.type === 'attack' && action.moveId === undefined) {
                    return { newState: state, sideEffects, error: 'Attack action requires moveId' };
                }
                if (action.type === 'switch' && action.switchToIndex === undefined) {
                    return { newState: state, sideEffects, error: 'Switch action requires switchToIndex' };
                }
                // Block voluntary switch when trapped or ingrained
                if (action.type === 'switch') {
                    if (submittingPokemon.trappedByMove !== null) {
                        return { newState: state, sideEffects, error: `${submittingPokemon.name} is trapped and cannot switch out!` };
                    }
                    if (submittingPokemon.ingrainActive) {
                        return { newState: state, sideEffects, error: `${submittingPokemon.name} is rooted and cannot switch out!` };
                    }
                }
                if (action.type === 'attack' && action.moveId !== undefined) {
                    const hasMove = submittingPokemon.moves.some((m) => m.id === action.moveId);
                    if (!hasMove) {
                        return {
                            newState: state,
                            sideEffects,
                            error: `${submittingPokemon.name} does not know move ${action.moveId}`,
                        };
                    }
                }
                newState.pendingActions[player] = action;
            }

            // Auto-inject for opponent if locked or recharging
            const rechargeOpponent: 'player1' | 'player2' = player === 'player1' ? 'player2' : 'player1';
            if (!newState.pendingActions[rechargeOpponent]) {
                const opponentPokemon = getActivePokemon(newState, rechargeOpponent);
                if (!opponentPokemon.fainted) {
                    if (isLocked(opponentPokemon)) {
                        newState.pendingActions[rechargeOpponent] = getLockedAction(opponentPokemon);
                    } else if (opponentPokemon.recharging) {
                        const placeholderMoveId = opponentPokemon.moves[0]?.id;
                        if (placeholderMoveId !== undefined) {
                            newState.pendingActions[rechargeOpponent] = { type: 'attack', moveId: placeholderMoveId };
                        }
                    }
                }
            }

            const p1Action = newState.pendingActions.player1;
            const p2Action = newState.pendingActions.player2;
            if (!p1Action || !p2Action) {
                // Only one player has submitted — wait for the other
                return { newState, sideEffects };
            }

            // Both players submitted → resolve the turn
            newState.status = 'resolving';
            const turnLog: string[] = [];
            const turnEvents: TurnEvent[] = [];

            // Turn start marker
            const tsEntry = `--- Turn ${newState.turn} ---`;
            turnLog.push(tsEntry);
            turnEvents.push({ type: 'turn_start', message: tsEntry });

            // Reset per-turn trackers
            const resetPerTurn = (p: BattlePokemon) => { p.lastPhysicalDamageTaken = 0; };
            getActivePokemon(newState, 'player1');
            getActivePokemon(newState, 'player2');
            newState.player1.team.forEach(resetPerTurn);
            newState.player2.team.forEach(resetPerTurn);

            const turnOrder = determineTurnOrder(newState, p1Action, p2Action);
            const firstActingPlayer = turnOrder[0]?.player ?? 'player1';

            let battleOver = false;
            for (let actionIdx = 0; actionIdx < turnOrder.length; actionIdx++) {
                const { player: currentPlayer, action: currentAction } = turnOrder[actionIdx];
                const opponent: 'player1' | 'player2' = currentPlayer === 'player1' ? 'player2' : 'player1';

                // 1. Skip if acting pokemon already fainted
                const actingPokemon = getActivePokemon(newState, currentPlayer);
                if (actingPokemon.fainted) continue;

                if (currentAction.type === 'attack' && currentAction.moveId !== undefined) {
                    const defender = getActivePokemon(newState, opponent);
                    if (defender.fainted) continue;

                    // Check if this pokemon is raging — force Rage move
                    const effectiveMoveId = actingPokemon.raging ? 99 : currentAction.moveId;
                    const moveData = moveCache.get(effectiveMoveId);

                    // Per-turn pre-move status checks
                    if (actingPokemon.charging) {
                        // Charging pokemon auto-fires on their turn — no status check blocks them
                    } else if (actingPokemon.biding) {
                        // Biding pokemon continue biding
                    } else {
                        // Recharge check
                        let sc0 = turnLog.length;
                        if (checkRecharging(actingPokemon, turnLog)) {
                            for (let li = sc0; li < turnLog.length; li++) {
                                turnEvents.push({ type: 'recharge', message: turnLog[li], target: currentPlayer, pokemonName: actingPokemon.name });
                            }
                            continue;
                        }
                        // Paralysis check
                        sc0 = turnLog.length;
                        if (checkParalysis(actingPokemon, turnLog)) {
                            for (let li = sc0; li < turnLog.length; li++) {
                                turnEvents.push({ type: 'message', message: turnLog[li], target: currentPlayer, pokemonName: actingPokemon.name });
                            }
                            continue;
                        }
                        // Sleep check
                        sc0 = turnLog.length;
                        if (checkSleep(actingPokemon, turnLog)) {
                            for (let li = sc0; li < turnLog.length; li++) {
                                turnEvents.push({ type: 'message', message: turnLog[li], target: currentPlayer, pokemonName: actingPokemon.name });
                            }
                            continue;
                        }
                        // Freeze check
                        sc0 = turnLog.length;
                        const stillFrozen = checkFreeze(actingPokemon, turnLog);
                        for (let li = sc0; li < turnLog.length; li++) {
                            const fe = turnLog[li];
                            if (fe.includes('thawed out')) {
                                turnEvents.push({ type: 'status_clear', message: fe, target: currentPlayer, pokemonName: actingPokemon.name, status: 'freeze' });
                            } else {
                                turnEvents.push({ type: 'message', message: fe, target: currentPlayer, pokemonName: actingPokemon.name });
                            }
                        }
                        if (stillFrozen) continue;
                        // Confusion check
                        sc0 = turnLog.length;
                        const confHpBefore = actingPokemon.currentHp;
                        const confBlocked = checkConfusion(actingPokemon, turnLog);
                        for (let li = sc0; li < turnLog.length; li++) {
                            const ce = turnLog[li];
                            const confDmgM = ce.match(/\((\d+) damage\)$/);
                            if (confDmgM) {
                                const confDmg = parseInt(confDmgM[1]);
                                turnEvents.push({ type: 'damage', message: ce, target: currentPlayer, pokemonName: actingPokemon.name, hpChange: -confDmg, newHp: Math.max(0, confHpBefore - confDmg), maxHp: actingPokemon.maxHp });
                            } else if (ce.includes(' fainted!')) {
                                turnEvents.push({ type: 'faint', message: ce, target: currentPlayer, pokemonName: actingPokemon.name, newHp: 0 });
                            } else {
                                turnEvents.push({ type: 'message', message: ce, target: currentPlayer, pokemonName: actingPokemon.name });
                            }
                        }
                        if (confBlocked) continue;

                        // Flinch check
                        if (actingPokemon.flinched) {
                            const fle = `${actingPokemon.name} flinched and couldn't move!`;
                            turnLog.push(fle);
                            turnEvents.push({ type: 'message', message: fle, target: currentPlayer, pokemonName: actingPokemon.name });
                            continue;
                        }

                        // Disable check
                        if (actingPokemon.disabledMoveId === effectiveMoveId) {
                            const disabledMoveName = moveData?.name ?? 'that move';
                            const die = `${actingPokemon.name}'s ${disabledMoveName} is disabled!`;
                            turnLog.push(die);
                            turnEvents.push({ type: 'fail', message: die, target: currentPlayer, pokemonName: actingPokemon.name });
                            continue;
                        }
                    }

                    // Thaw defender if hit by Fire move while frozen
                    if (moveData) {
                        const thawPre = turnLog.length;
                        thawIfFrozenByFire(defender, moveData.type.name, turnLog);
                        for (let li = thawPre; li < turnLog.length; li++) {
                            turnEvents.push({ type: 'status_clear', message: turnLog[li], target: opponent, pokemonName: defender.name, status: 'freeze' });
                        }
                    }

                    if (!moveData) {
                        const nme = `Move not found!`;
                        turnLog.push(nme);
                        turnEvents.push({ type: 'fail', message: nme });
                        continue;
                    }

                    const isFirstAction = actionIdx === 0;
                    const attackerMovedFirst = isFirstAction;

                    // Snapshot HP before move
                    const preAttHp = actingPokemon.currentHp;
                    const preDefHp = defender.currentHp;

                    const result = executeMoveEffect(
                        moveData, actingPokemon, defender,
                        currentPlayer, opponent, newState,
                        true, attackerMovedFirst
                    );

                    // Snapshot HP after move (for recoil/heal event newHp)
                    const postAttHp = actingPokemon.currentHp;
                    const postDefHp = defender.currentHp;

                    // Build events from result.log, maintaining running HP for heal computation
                    const moveCtx: MoveEventCtx = {
                        attackerName: actingPokemon.name,
                        defenderName: defender.name,
                        attackerPlayer: currentPlayer,
                        defenderPlayer: opponent,
                        attackerMaxHp: actingPokemon.maxHp,
                        defenderMaxHp: defender.maxHp,
                        postAttackerHp: postAttHp,
                        postDefenderHp: postDefHp,
                    };
                    let runAttHp = preAttHp;
                    let runDefHp = preDefHp;
                    for (const rle of result.log) {
                        turnLog.push(rle);
                        const ev = classifyMoveEntry(rle, moveCtx, runAttHp, runDefHp);
                        turnEvents.push(ev);
                        // Advance running HP for heal events
                        if ((ev.type === 'heal' || ev.type === 'damage' || ev.type === 'recoil') && ev.newHp !== undefined) {
                            if (ev.target === currentPlayer) runAttHp = ev.newHp;
                            else if (ev.target === opponent) runDefHp = ev.newHp;
                        }
                    }

                    // Sync multi-turn lock state based on outcome
                    const lockPre = turnLog.length;
                    syncLockStateAfterMove(effectiveMoveId, actingPokemon, result.hit, turnLog);
                    for (let li = lockPre; li < turnLog.length; li++) {
                        turnEvents.push({ type: 'message', message: turnLog[li], target: currentPlayer, pokemonName: actingPokemon.name });
                    }

                    if (result.hit) {
                        applyPostMoveEffects(moveData, actingPokemon);
                        // Track physical damage for Counter
                        if (moveData.damage_class.name === 'physical') {
                            const dmgEntry = result.log.find((l) => l.includes(' took ') && l.includes(' damage!'));
                            if (dmgEntry) {
                                const match = dmgEntry.match(/took (\d+) damage/);
                                if (match) {
                                    defender.lastPhysicalDamageTaken += parseInt(match[1], 10);
                                }
                            }
                        }
                    }

                    if (getActivePokemon(newState, opponent).fainted) {
                        if (checkBattleOver(newState)) battleOver = true;
                        break;
                    }
                    // Check if attacker fainted (e.g. self-destruct, recoil)
                    if (actingPokemon.fainted) {
                        if (checkBattleOver(newState)) battleOver = true;
                        break;
                    }
                } else if (currentAction.type === 'switch' && currentAction.switchToIndex !== undefined) {
                    const swPre = turnLog.length;
                    resolveSwitchAction(newState, currentPlayer, currentAction.switchToIndex, turnLog);
                    const newActive = newState[currentPlayer].team[newState[currentPlayer].activePokemonIndex];
                    for (let li = swPre; li < turnLog.length; li++) {
                        turnEvents.push({
                            type: 'switch',
                            message: turnLog[li],
                            target: currentPlayer,
                            newHp: newActive.currentHp,
                            maxHp: newActive.maxHp,
                        });
                    }
                    if (checkBattleOver(newState)) {
                        battleOver = true;
                        break;
                    }
                }
            }

            // End-of-turn effects (weather damage, leech seed, burn, poison, etc.)
            if (!battleOver) {
                const p1EotAct = getActivePokemon(newState, 'player1');
                const p2EotAct = getActivePokemon(newState, 'player2');
                const eotRunHp: Record<'player1' | 'player2', number> = {
                    player1: p1EotAct.fainted ? 0 : p1EotAct.currentHp,
                    player2: p2EotAct.fainted ? 0 : p2EotAct.currentHp,
                };
                const eotMaxHp: Record<'player1' | 'player2', number> = {
                    player1: p1EotAct.maxHp,
                    player2: p2EotAct.maxHp,
                };
                const preToxic: Record<'player1' | 'player2', number> = {
                    player1: p1EotAct.toxicCounter,
                    player2: p2EotAct.toxicCounter,
                };
                const eotLogPre = turnLog.length;
                processEndOfTurn(newState, turnLog);
                for (let li = eotLogPre; li < turnLog.length; li++) {
                    const eev = classifyEotEntry(turnLog[li], p1EotAct.name, p2EotAct.name, eotRunHp, eotMaxHp, preToxic);
                    if (eev.target && eev.newHp !== undefined) eotRunHp[eev.target] = eev.newHp;
                    turnEvents.push(eev);
                }
                // Re-check if anyone fainted from end-of-turn damage
                if (checkBattleOver(newState)) battleOver = true;
            }

            // Restore Roost Flying type and advance rampage/rollout lock if needed
            for (const pl of ['player1', 'player2'] as const) {
                const p = getActivePokemon(newState, pl);
                if (p.roostUsedThisTurn) {
                    p.roostUsedThisTurn = false;
                    p.currentTypes = [...p.types];
                }
            }

            // Decrement disable, protect, reflect, light screen, mist counters
            for (const pl of ['player1', 'player2'] as const) {
                const p = getActivePokemon(newState, pl);
                if (p.disabledTurnsRemaining > 0) {
                    p.disabledTurnsRemaining -= 1;
                    if (p.disabledTurnsRemaining === 0) {
                        const moveName = p.disabledMoveId ? moveCache.get(p.disabledMoveId)?.name ?? 'the move' : 'the move';
                        const disE = `${p.name}'s ${moveName} is no longer disabled!`;
                        turnLog.push(disE);
                        turnEvents.push({ type: 'message', message: disE, target: pl });
                        p.disabledMoveId = null;
                    }
                }
                p.protecting = false;
                if (!p.protecting) p.protectConsecutiveTurns = Math.max(0, p.protectConsecutiveTurns - 1);
                if (p.reflectTurnsRemaining > 0) {
                    p.reflectTurnsRemaining -= 1;
                    if (p.reflectTurnsRemaining === 0) {
                        p.reflect = false;
                        const refE = `${p.name}'s Reflect wore off!`;
                        turnLog.push(refE);
                        turnEvents.push({ type: 'field_effect', message: refE, target: pl, fieldEffect: 'reflect', fieldTurnsRemaining: 0 });
                    }
                }
                if (p.lightScreenTurnsRemaining > 0) {
                    p.lightScreenTurnsRemaining -= 1;
                    if (p.lightScreenTurnsRemaining === 0) {
                        p.lightScreen = false;
                        const lsE = `${p.name}'s Light Screen wore off!`;
                        turnLog.push(lsE);
                        turnEvents.push({ type: 'field_effect', message: lsE, target: pl, fieldEffect: 'light-screen', fieldTurnsRemaining: 0 });
                    }
                }
                if (p.mistTurnsRemaining > 0) {
                    p.mistTurnsRemaining -= 1;
                    if (p.mistTurnsRemaining === 0) {
                        p.mistActive = false;
                        const mistE = `${p.name}'s Mist wore off!`;
                        turnLog.push(mistE);
                        turnEvents.push({ type: 'field_effect', message: mistE, target: pl, fieldEffect: 'mist', fieldTurnsRemaining: 0 });
                    }
                }
            }

            // Turn end marker
            const teEntry = `--- End of Turn ${newState.turn} ---`;
            turnLog.push(teEntry);
            turnEvents.push({ type: 'turn_end', message: teEntry });

            void firstActingPlayer;

            newState.pendingActions = {};
            newState.turn += 1;
            newState.log.push(...turnLog);
            newState.turnLogs.push(turnLog);

            const p1NeedsSwitch = needsSwitch(newState, 'player1');
            const p2NeedsSwitch = needsSwitch(newState, 'player2');

            const p1State = buildPlayerState(newState.player1);
            const p2State = buildPlayerState(newState.player2);

            if (battleOver) {
                newState.status = 'finished';
                const turnResultPayload: TurnResultPayload = {
                    turnLog,
                    turnEvents,
                    player1NeedsSwitch: false,
                    player2NeedsSwitch: false,
                    battleOver: true,
                    winner: newState.winner,
                    weather: newState.weather,
                    weatherTurnsRemaining: newState.weatherTurnsRemaining,
                    player1State: p1State,
                    player2State: p2State,
                    player1WishActive: newState.player1WishActive,
                    player1WishTurnsRemaining: newState.player1WishTurnsRemaining,
                    player2WishActive: newState.player2WishActive,
                    player2WishTurnsRemaining: newState.player2WishTurnsRemaining,
                };
                sideEffects.push({ type: 'EMIT_TURN_RESULT', payload: turnResultPayload });
                sideEffects.push({ type: 'SAVE_BATTLE', forfeited: false });
                sideEffects.push({ type: 'EMIT_BATTLE_OVER', payload: { winner: newState.winner } });
                sideEffects.push({ type: 'DELETE_BATTLE' });
            } else if (p1NeedsSwitch || p2NeedsSwitch) {
                newState.status = 'switching';
                if (p1NeedsSwitch) {
                    newState.awaitingFaintSwitch.player1 = true;
                    newState.switchesRequired.push('player1');
                }
                if (p2NeedsSwitch) {
                    newState.awaitingFaintSwitch.player2 = true;
                    newState.switchesRequired.push('player2');
                }
                const turnResultPayload: TurnResultPayload = {
                    turnLog,
                    turnEvents,
                    player1NeedsSwitch: p1NeedsSwitch,
                    player2NeedsSwitch: p2NeedsSwitch,
                    battleOver: false,
                    winner: null,
                    weather: newState.weather,
                    weatherTurnsRemaining: newState.weatherTurnsRemaining,
                    player1State: p1State,
                    player2State: p2State,
                    player1WishActive: newState.player1WishActive,
                    player1WishTurnsRemaining: newState.player1WishTurnsRemaining,
                    player2WishActive: newState.player2WishActive,
                    player2WishTurnsRemaining: newState.player2WishTurnsRemaining,
                };
                sideEffects.push({ type: 'EMIT_TURN_RESULT', payload: turnResultPayload });
                if (p1NeedsSwitch) sideEffects.push({ type: 'EMIT_SWITCH_REQUIRED', player: 'player1' });
                if (p2NeedsSwitch) sideEffects.push({ type: 'EMIT_SWITCH_REQUIRED', player: 'player2' });
            } else {
                newState.status = 'active';

                // Pre-inject actions for pokemon locked into multi-turn moves or recharging.
                const p1ActiveNow = getActivePokemon(newState, 'player1');
                const p2ActiveNow = getActivePokemon(newState, 'player2');
                const p1MustRecharge = p1ActiveNow.recharging && !p1ActiveNow.fainted;
                const p2MustRecharge = p2ActiveNow.recharging && !p2ActiveNow.fainted;
                const p1Locked = isLocked(p1ActiveNow) && !p1ActiveNow.fainted;
                const p2Locked = isLocked(p2ActiveNow) && !p2ActiveNow.fainted;
                if (p1Locked) {
                    newState.pendingActions.player1 = getLockedAction(p1ActiveNow);
                } else if (p1MustRecharge) {
                    const mid = p1ActiveNow.moves[0]?.id;
                    if (mid !== undefined) newState.pendingActions.player1 = { type: 'attack', moveId: mid };
                }
                if (p2Locked) {
                    newState.pendingActions.player2 = getLockedAction(p2ActiveNow);
                } else if (p2MustRecharge) {
                    const mid = p2ActiveNow.moves[0]?.id;
                    if (mid !== undefined) newState.pendingActions.player2 = { type: 'attack', moveId: mid };
                }

                const turnResultPayload: TurnResultPayload = {
                    turnLog,
                    turnEvents,
                    player1NeedsSwitch: false,
                    player2NeedsSwitch: false,
                    battleOver: false,
                    winner: null,
                    weather: newState.weather,
                    weatherTurnsRemaining: newState.weatherTurnsRemaining,
                    player1State: p1State,
                    player2State: p2State,
                    player1WishActive: newState.player1WishActive,
                    player1WishTurnsRemaining: newState.player1WishTurnsRemaining,
                    player2WishActive: newState.player2WishActive,
                    player2WishTurnsRemaining: newState.player2WishTurnsRemaining,
                };
                sideEffects.push({ type: 'EMIT_TURN_RESULT', payload: turnResultPayload });

                // If both players' actions are auto-injected, trigger auto-resolve
                if ((p1MustRecharge || p1Locked) && (p2MustRecharge || p2Locked)) {
                    sideEffects.push({ type: 'AUTO_RESOLVE_RECHARGE' });
                }
            }

            return { newState, sideEffects };
        }

        case 'SWITCH_SUBMITTED': {
            const { player, switchToIndex } = event;
            const newState = deepCopy(state);
            const sideEffects: SideEffect[] = [];

            const target = newState[player].team[switchToIndex];
            if (!target || target.fainted) {
                return {
                    newState: state,
                    sideEffects,
                    error: 'Cannot switch to that pokemon — it is fainted or does not exist',
                };
            }

            const switchLog: string[] = [];
            resolveSwitchAction(newState, player, switchToIndex, switchLog);
            const newSwitchActive = newState[player].team[newState[player].activePokemonIndex];
            const switchEvents: TurnEvent[] = switchLog.map((msg) => ({
                type: 'switch' as const,
                message: msg,
                target: player as 'player1' | 'player2',
                newHp: newSwitchActive.currentHp,
                maxHp: newSwitchActive.maxHp,
            }));
            newState.pendingSwitchLog.push(...switchLog);
            newState.pendingSwitchEvents.push(...switchEvents);
            newState.awaitingFaintSwitch[player] = false;
            newState.switchesSubmitted.push(player);
            newState.switchesRequired = newState.switchesRequired.filter((p) => p !== player);

            if (newState.switchesRequired.length > 0) {
                // Other player still needs to switch — tell submitting player to wait
                sideEffects.push({ type: 'EMIT_WAITING_FOR_OPPONENT_SWITCH', player });
            } else {
                // All required switches done — emit combined result
                const combinedLog = [...newState.pendingSwitchLog];
                const combinedSwitchEvents = [...newState.pendingSwitchEvents];
                newState.log.push(...combinedLog);
                newState.pendingSwitchLog = [];
                newState.pendingSwitchEvents = [];
                newState.switchesSubmitted = [];

                const p1State = buildPlayerState(newState.player1);
                const p2State = buildPlayerState(newState.player2);

                const turnResultPayload: TurnResultPayload = {
                    turnLog: combinedLog,
                    turnEvents: combinedSwitchEvents,
                    player1NeedsSwitch: false,
                    player2NeedsSwitch: false,
                    battleOver: false,
                    winner: null,
                    player1State: p1State,
                    player2State: p2State,
                };
                sideEffects.push({ type: 'EMIT_TURN_RESULT', payload: turnResultPayload });

                if (checkBattleOver(newState)) {
                    newState.status = 'finished';
                    sideEffects.push({ type: 'SAVE_BATTLE', forfeited: false });
                    sideEffects.push({ type: 'EMIT_BATTLE_OVER', payload: { winner: newState.winner } });
                    sideEffects.push({ type: 'DELETE_BATTLE' });
                } else {
                    newState.status = 'active';
                }
            }

            return { newState, sideEffects };
        }

        case 'FORFEIT': {
            const { player } = event;
            const newState = deepCopy(state);
            const opponent: 'player1' | 'player2' = player === 'player1' ? 'player2' : 'player1';
            newState.status = 'finished';
            newState.winner = newState[opponent].name;

            return {
                newState,
                sideEffects: [
                    { type: 'SAVE_BATTLE', forfeited: true },
                    {
                        type: 'EMIT_BATTLE_OVER',
                        payload: { winner: newState.winner, forfeited: true, forfeitedBy: player },
                    },
                    { type: 'DELETE_BATTLE' },
                ],
            };
        }

        case 'PLAYER_DISCONNECTED': {
            const { socketId } = event;
            const newState = deepCopy(state);

            let disconnectedPlayer: 'player1' | 'player2' | null = null;
            if (newState.player1.socketId === socketId) disconnectedPlayer = 'player1';
            else if (newState.player2.socketId === socketId) disconnectedPlayer = 'player2';

            if (!disconnectedPlayer) {
                return { newState: state, sideEffects: [] };
            }

            const opponent: 'player1' | 'player2' = disconnectedPlayer === 'player1' ? 'player2' : 'player1';
            newState.status = 'finished';
            newState.winner = newState[opponent].name;

            return {
                newState,
                sideEffects: [
                    { type: 'EMIT_OPPONENT_DISCONNECTED', disconnectedPlayer },
                    { type: 'EMIT_BATTLE_OVER', payload: { winner: newState.winner } },
                    { type: 'DELETE_BATTLE' },
                ],
            };
        }

        default: {
            const _exhaustive: never = event;
            return { newState: state, sideEffects: [] };
        }
    }
};
