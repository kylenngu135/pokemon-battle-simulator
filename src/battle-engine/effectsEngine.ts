import { BattlePokemon, BattleState, PrimaryStatus, Weather } from '../models/battle.models';
import { MoveResponse } from '../models/move.models';
import { getActivePokemon } from '../utils/battle.utils';
import { getTrapDamage, advanceTrap, TRAPPING_MOVE_NAMES } from './lockManager';

// Move IDs that set weather
const WEATHER_MOVES: Record<number, Weather> = {
    240: 'rain',       // rain-dance
    241: 'sun',        // sunny-day
    237: 'sandstorm',  // sandstorm
    258: 'hail',       // hail
};

// Move IDs that require recharge on the following turn (backup for PokeAPI flag)
const RECHARGE_MOVE_IDS = new Set([
    63,  // hyper-beam
    338, // frenzy-plant
    307, // blast-burn
    308, // hydro-cannon
    439, // rock-wrecker
    459, // roar-of-time
]);

// ── Primary status application ───────────────────────────────────────────────

export const applyPrimaryStatus = (
    pokemon: BattlePokemon,
    status: PrimaryStatus,
    log: string[]
): boolean => {
    if (pokemon.fainted) return false;
    if (pokemon.status !== null) {
        log.push(`But it failed! ${pokemon.name} is already ${pokemon.status}!`);
        return false;
    }

    // Type immunities
    if (status === 'burn' && pokemon.types.includes('fire')) {
        log.push(`${pokemon.name} can't be burned!`);
        return false;
    }
    if ((status === 'poison' || status === 'toxic') &&
        (pokemon.types.includes('poison') || pokemon.types.includes('steel'))) {
        log.push(`${pokemon.name} can't be poisoned!`);
        return false;
    }
    if (status === 'paralysis' && pokemon.types.includes('electric')) {
        log.push(`${pokemon.name} can't be paralyzed!`);
        return false;
    }
    if (status === 'freeze' && pokemon.types.includes('ice')) {
        log.push(`${pokemon.name} can't be frozen!`);
        return false;
    }

    pokemon.status = status;

    if (status === 'sleep') {
        pokemon.sleepTurnsRemaining = Math.floor(Math.random() * 3) + 1; // 1-3 turns
        log.push(`${pokemon.name} fell asleep!`);
    } else if (status === 'burn') {
        log.push(`${pokemon.name} was burned!`);
    } else if (status === 'poison') {
        log.push(`${pokemon.name} was poisoned!`);
    } else if (status === 'toxic') {
        pokemon.toxicCounter = 1;
        log.push(`${pokemon.name} was badly poisoned!`);
    } else if (status === 'paralysis') {
        log.push(`${pokemon.name} was paralyzed! It may be unable to move!`);
    } else if (status === 'freeze') {
        log.push(`${pokemon.name} was frozen solid!`);
    }

    return true;
};

// ── Volatile status application ──────────────────────────────────────────────

export const applyVolatileStatus = (
    pokemon: BattlePokemon,
    effect: 'confusion' | 'flinch' | 'seed',
    log: string[],
    seededBy?: 'player1' | 'player2'
): boolean => {
    if (pokemon.fainted) return false;

    if (effect === 'confusion') {
        if (pokemon.confused) return false;
        pokemon.confused = true;
        pokemon.confusionTurnsRemaining = Math.floor(Math.random() * 4) + 2; // 2-5 turns
        log.push(`${pokemon.name} became confused!`);
        return true;
    }

    if (effect === 'flinch') {
        pokemon.flinched = true;
        return true;
    }

    if (effect === 'seed') {
        if (pokemon.seeded) return false;
        if (pokemon.types.includes('grass')) {
            log.push(`${pokemon.name} is immune to Leech Seed!`);
            return false;
        }
        pokemon.seeded = true;
        pokemon.seededBy = seededBy ?? null;
        log.push(`${pokemon.name} was seeded!`);
        return true;
    }

    return false;
};

// ── Weather ──────────────────────────────────────────────────────────────────

export const applyWeather = (state: BattleState, weather: Weather, log: string[]): void => {
    state.weather = weather;
    state.weatherTurnsRemaining = 5;
    const labels: Record<Weather, string> = {
        sun: 'The sunlight turned harsh!',
        rain: 'It started to rain!',
        sandstorm: 'A sandstorm kicked up!',
        hail: 'It started to hail!',
        none: '',
    };
    if (labels[weather]) log.push(labels[weather]);
};

// ── End-of-turn processing ───────────────────────────────────────────────────

export const processEndOfTurn = (state: BattleState, log: string[]): void => {
    const players: Array<'player1' | 'player2'> = ['player1', 'player2'];

    // 1. Weather damage
    for (const pl of players) {
        const pokemon = getActivePokemon(state, pl);
        if (pokemon.fainted) continue;

        if (state.weather === 'sandstorm') {
            const immune = pokemon.types.some((t) => ['rock', 'ground', 'steel'].includes(t));
            if (!immune) {
                const dmg = Math.max(1, Math.floor(pokemon.maxHp / 16));
                pokemon.currentHp = Math.max(0, pokemon.currentHp - dmg);
                log.push(`${pokemon.name} is buffeted by the sandstorm!`);
            }
        } else if (state.weather === 'hail') {
            const immune = pokemon.types.includes('ice');
            if (!immune) {
                const dmg = Math.max(1, Math.floor(pokemon.maxHp / 16));
                pokemon.currentHp = Math.max(0, pokemon.currentHp - dmg);
                log.push(`${pokemon.name} is pelted by hail!`);
            }
        }
    }

    // 2. Leech Seed drain
    for (const pl of players) {
        const pokemon = getActivePokemon(state, pl);
        if (pokemon.fainted || !pokemon.seeded || !pokemon.seededBy) continue;

        const drain = Math.max(1, Math.floor(pokemon.maxHp / 8));
        // Substitute absorbs leech seed drain
        if (pokemon.substituteHp > 0) {
            pokemon.substituteHp = Math.max(0, pokemon.substituteHp - drain);
            log.push(`${pokemon.name}'s substitute was drained by Leech Seed!`);
            if (pokemon.substituteHp === 0) log.push(`${pokemon.name}'s substitute broke!`);
        } else {
            pokemon.currentHp = Math.max(0, pokemon.currentHp - drain);
            log.push(`${pokemon.name}'s HP was drained by Leech Seed!`);
        }

        // Heal the seeder's active pokemon
        const seederPokemon = getActivePokemon(state, pokemon.seededBy);
        if (!seederPokemon.fainted) {
            seederPokemon.currentHp = Math.min(seederPokemon.maxHp, seederPokemon.currentHp + drain);
        }
    }

    // 3. Burn damage
    for (const pl of players) {
        const pokemon = getActivePokemon(state, pl);
        if (pokemon.fainted || pokemon.status !== 'burn') continue;
        const dmg = Math.max(1, Math.floor(pokemon.maxHp / 16));
        pokemon.currentHp = Math.max(0, pokemon.currentHp - dmg);
        log.push(`${pokemon.name} is hurt by its burn!`);
    }

    // 4. Poison damage
    for (const pl of players) {
        const pokemon = getActivePokemon(state, pl);
        if (pokemon.fainted || pokemon.status !== 'poison') continue;
        const dmg = Math.max(1, Math.floor(pokemon.maxHp / 8));
        pokemon.currentHp = Math.max(0, pokemon.currentHp - dmg);
        log.push(`${pokemon.name} is hurt by poison!`);
    }

    // 5. Toxic damage
    for (const pl of players) {
        const pokemon = getActivePokemon(state, pl);
        if (pokemon.fainted || pokemon.status !== 'toxic') continue;
        const dmg = Math.max(1, Math.floor((pokemon.maxHp * pokemon.toxicCounter) / 16));
        pokemon.currentHp = Math.max(0, pokemon.currentHp - dmg);
        log.push(`${pokemon.name} is badly hurt by poison! (${pokemon.toxicCounter}/16 max HP)`);
        pokemon.toxicCounter += 1;
    }

    // 6. Check faints after all end-of-turn damage
    for (const pl of players) {
        const pokemon = getActivePokemon(state, pl);
        if (!pokemon.fainted && pokemon.currentHp <= 0) {
            pokemon.fainted = true;
            log.push(`${pokemon.name} fainted!`);
        }
    }

    // 7. Decrement weather
    if (state.weather !== 'none' && state.weatherTurnsRemaining > 0) {
        state.weatherTurnsRemaining -= 1;
        if (state.weatherTurnsRemaining === 0) {
            const labels: Record<Weather, string> = {
                sun: 'The harsh sunlight faded!',
                rain: 'The rain stopped!',
                sandstorm: 'The sandstorm subsided!',
                hail: 'The hail stopped!',
                none: '',
            };
            log.push(labels[state.weather]);
            state.weather = 'none';
        }
    }

    // 8. Decrement sleep turns
    for (const pl of players) {
        const pokemon = getActivePokemon(state, pl);
        if (pokemon.fainted || pokemon.status !== 'sleep') continue;
        if (pokemon.sleepTurnsRemaining > 0) {
            pokemon.sleepTurnsRemaining -= 1;
            if (pokemon.sleepTurnsRemaining === 0) {
                pokemon.status = null;
                log.push(`${pokemon.name} woke up!`);
            }
        }
    }

    // 9. Decrement confusion turns
    for (const pl of players) {
        const pokemon = getActivePokemon(state, pl);
        if (pokemon.fainted || !pokemon.confused) continue;
        if (pokemon.confusionTurnsRemaining > 0) {
            pokemon.confusionTurnsRemaining -= 1;
            if (pokemon.confusionTurnsRemaining === 0) {
                pokemon.confused = false;
                log.push(`${pokemon.name} snapped out of confusion!`);
            }
        }
    }

    // Clear per-turn flinch at end of turn
    for (const pl of players) {
        const pokemon = getActivePokemon(state, pl);
        pokemon.flinched = false;
    }

    // 10. Trapping move damage + advance trap timer
    for (const pl of players) {
        const pokemon = getActivePokemon(state, pl);
        if (pokemon.fainted || !pokemon.trappedByMove) continue;
        const trapDmg = getTrapDamage(pokemon);
        if (trapDmg > 0) {
            const moveName = TRAPPING_MOVE_NAMES[pokemon.trappedByMove] ?? 'trap';
            pokemon.currentHp = Math.max(0, pokemon.currentHp - trapDmg);
            log.push(`${pokemon.name} is hurt by ${moveName}!`);
            if (pokemon.currentHp <= 0) {
                pokemon.fainted = true;
                log.push(`${pokemon.name} fainted!`);
            }
        }
        advanceTrap(pokemon, log);
    }

    // 11. Ingrain healing
    for (const pl of players) {
        const pokemon = getActivePokemon(state, pl);
        if (pokemon.fainted || !pokemon.ingrainActive) continue;
        const heal = Math.max(1, Math.floor(pokemon.maxHp / 16));
        pokemon.currentHp = Math.min(pokemon.maxHp, pokemon.currentHp + heal);
        log.push(`${pokemon.name} absorbed nutrients through its roots!`);
    }

    // 12. Aqua Ring healing
    for (const pl of players) {
        const pokemon = getActivePokemon(state, pl);
        if (pokemon.fainted || !pokemon.aquaRingActive) continue;
        const heal = Math.max(1, Math.floor(pokemon.maxHp / 16));
        pokemon.currentHp = Math.min(pokemon.maxHp, pokemon.currentHp + heal);
        log.push(`${pokemon.name} is healed by its Aqua Ring!`);
    }

    // 13. Wish resolution
    for (const pl of players) {
        const wishActiveKey = pl === 'player1' ? 'player1WishActive' : 'player2WishActive';
        const wishTurnsKey = pl === 'player1' ? 'player1WishTurnsRemaining' : 'player2WishTurnsRemaining';
        const wishHpKey = pl === 'player1' ? 'player1WishHp' : 'player2WishHp';
        if (!state[wishActiveKey]) continue;
        state[wishTurnsKey] -= 1;
        if (state[wishTurnsKey] <= 0) {
            const activeP = getActivePokemon(state, pl);
            if (!activeP.fainted) {
                const heal = Math.min(state[wishHpKey], activeP.maxHp - activeP.currentHp);
                activeP.currentHp = Math.min(activeP.maxHp, activeP.currentHp + heal);
                log.push(`${activeP.name}'s wish came true!`);
            }
            state[wishActiveKey] = false;
            state[wishTurnsKey] = 0;
            state[wishHpKey] = 0;
        }
    }
};

// ── Secondary effects after a move lands ─────────────────────────────────────

export const applySecondaryEffects = (
    move: MoveResponse,
    attacker: BattlePokemon,
    attackerPlayer: 'player1' | 'player2',
    defender: BattlePokemon,
    state: BattleState,
    log: string[]
): void => {
    // Weather moves (status moves that change weather)
    const weatherType = WEATHER_MOVES[move.id];
    if (weatherType) {
        applyWeather(state, weatherType, log);
        return;
    }

    // Confuse Ray / pure confusion status move (ailment only, no damage)
    // Thunder Wave / Hypnosis / Toxic / etc. — status move ailments
    const ailmentName = move.meta?.ailment?.name ?? 'none';
    const ailmentChance = move.meta?.ailment_chance ?? 0;
    const flinchChance = move.meta?.flinch_chance ?? 0;

    // Leech Seed
    if (ailmentName === 'leech-seed') {
        if (ailmentChance >= 100 || Math.random() * 100 < ailmentChance) {
            applyVolatileStatus(defender, 'seed', log, attackerPlayer);
        }
        return;
    }

    // Reflect / Light Screen (status moves — handled separately)
    if (move.id === 115) { // reflect
        attacker.reflect = true;
        log.push(`${attacker.name} is protected by Reflect!`);
        return;
    }
    if (move.id === 113) { // light-screen
        attacker.lightScreen = true;
        log.push(`${attacker.name} is protected by Light Screen!`);
        return;
    }

    // Flinch
    if (flinchChance > 0 && Math.random() * 100 < flinchChance) {
        applyVolatileStatus(defender, 'flinch', log);
    }

    // Ailment (status condition).
    // For status moves (damage_class === 'status'), the ailment is always 100% if it hits.
    const isStatusMove = move.damage_class.name === 'status';
    if (ailmentName !== 'none' && ailmentName !== '' && (ailmentChance > 0 || isStatusMove)) {
        if (isStatusMove || ailmentChance >= 100 || Math.random() * 100 < ailmentChance) {
            if (ailmentName === 'confusion') {
                applyVolatileStatus(defender, 'confusion', log);
            } else if (ailmentName === 'tri-attack') {
                // Randomly pick burn, freeze, or paralysis
                const effects: PrimaryStatus[] = ['burn', 'freeze', 'paralysis'];
                const chosen = effects[Math.floor(Math.random() * 3)];
                applyPrimaryStatus(defender, chosen, log);
            } else if (ailmentName === 'burn') {
                applyPrimaryStatus(defender, 'burn', log);
            } else if (ailmentName === 'freeze') {
                applyPrimaryStatus(defender, 'freeze', log);
            } else if (ailmentName === 'paralysis') {
                applyPrimaryStatus(defender, 'paralysis', log);
            } else if (ailmentName === 'poison') {
                applyPrimaryStatus(defender, 'poison', log);
            } else if (ailmentName === 'bad-poison') {
                applyPrimaryStatus(defender, 'toxic', log);
            } else if (ailmentName === 'sleep') {
                applyPrimaryStatus(defender, 'sleep', log);
            }
        }
    }

    // Stat changes from status moves that target the defender (not already handled in turn.utils)
    // For status moves, stat_changes were already applied in resolveMoveAction.
    // For damaging moves, secondary stat changes were already applied in resolveMoveAction.
    // Nothing extra needed here.
};

// ── Recharge ──────────────────────────────────────────────────────────────────

export const applyRechargeIfNeeded = (move: MoveResponse, pokemon: BattlePokemon): void => {
    const needsRecharge =
        RECHARGE_MOVE_IDS.has(move.id) ||
        move.meta?.category?.name === 'damage+recharge';
    if (needsRecharge) {
        pokemon.recharging = true;
    }
};

export const checkRecharging = (pokemon: BattlePokemon, log: string[]): boolean => {
    if (pokemon.recharging) {
        pokemon.recharging = false;
        log.push(`${pokemon.name} must recharge!`);
        return true;
    }
    return false;
};

// ── Per-turn status checks ────────────────────────────────────────────────────

export const checkParalysis = (pokemon: BattlePokemon, log: string[]): boolean => {
    if (pokemon.status !== 'paralysis') return false;
    if (Math.random() < 0.25) {
        log.push(`${pokemon.name} is fully paralyzed! It can't move!`);
        return true;
    }
    return false;
};

// Returns true if pokemon is still asleep (action blocked)
export const checkSleep = (pokemon: BattlePokemon, log: string[]): boolean => {
    if (pokemon.status !== 'sleep') return false;
    if (pokemon.sleepTurnsRemaining > 0) {
        log.push(`${pokemon.name} is fast asleep!`);
        return true;
    }
    // Wakes up (processEndOfTurn handles the actual wake-up message)
    return false;
};

// Returns true if pokemon is frozen and NOT thawed this turn (action blocked)
export const checkFreeze = (pokemon: BattlePokemon, log: string[]): boolean => {
    if (pokemon.status !== 'freeze') return false;
    if (Math.random() < 0.20) {
        pokemon.status = null;
        log.push(`${pokemon.name} thawed out!`);
        return false; // thawed — can act
    }
    log.push(`${pokemon.name} is frozen solid!`);
    return true; // still frozen
};

// Returns true if pokemon hurt itself in confusion (action blocked)
export const checkConfusion = (pokemon: BattlePokemon, log: string[]): boolean => {
    if (!pokemon.confused) return false;
    log.push(`${pokemon.name} is confused!`);
    if (Math.random() < 0.33) {
        // Self-inflicted confusion damage: typeless physical 40 power using own Attack/Defense
        const rawAtk = pokemon.stats.attack;
        const rawDef = pokemon.stats.defense;
        const level = 50;
        const damage = Math.max(1, Math.floor(
            ((((2 * level) / 5 + 2) * 40 * (rawAtk / rawDef)) / 50 + 2)
        ));
        pokemon.currentHp = Math.max(0, pokemon.currentHp - damage);
        log.push(`It hurt itself in its confusion! (${damage} damage)`);
        if (pokemon.currentHp <= 0) {
            pokemon.fainted = true;
            log.push(`${pokemon.name} fainted!`);
        }
        return true;
    }
    return false;
};

// Thaw defender if hit by a Fire-type move while frozen
export const thawIfFrozenByFire = (
    defender: BattlePokemon,
    moveType: string,
    log: string[]
): void => {
    if (defender.status === 'freeze' && moveType === 'fire') {
        defender.status = null;
        log.push(`${defender.name} thawed out!`);
    }
};
