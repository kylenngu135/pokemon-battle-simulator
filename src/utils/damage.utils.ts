import { BattlePokemon, Weather } from '../models/battle.models';
import { moveCache } from '../cache/moveCache';
import { getTypeEffectiveness } from '../data/typeChart';
import { getStatMultiplier } from '../data/statStages';

export const calculateDamage = (
    attacker: BattlePokemon,
    defender: BattlePokemon,
    moveId: number,
    weather: Weather = 'none',
    overridePower?: number,
): { damage: number; effectiveness: number; isCrit: boolean; isStab: boolean } => {
    const move = moveCache.get(moveId);
    if (!move || (!move.power && overridePower === undefined)) return { damage: 0, effectiveness: 1, isCrit: false, isStab: false };
    const effectivePower = overridePower ?? move.power ?? 0;

    const isPhysical = move.damage_class.name === 'physical';
    const moveType = move.type.name;

    // Burn halves physical Attack (applied to the stat, not as a multiplier here)
    const burnMod = isPhysical && attacker.status === 'burn' ? 0.5 : 1;

    const rawAttack = isPhysical ? attacker.stats.attack : attacker.stats.specialAttack;
    const attackStage = isPhysical ? attacker.statStages.attack : attacker.statStages.specialAttack;
    const attackStat = rawAttack * getStatMultiplier(attackStage) * burnMod;

    const defenseStat = isPhysical
        ? defender.stats.defense * getStatMultiplier(defender.statStages.defense)
        : defender.stats.specialDefense * getStatMultiplier(defender.statStages.specialDefense);

    const level = 50;
    const baseDamage = (((2 * level) / 5 + 2) * effectivePower * (attackStat / defenseStat)) / 50 + 2;

    const isStab = attacker.types.includes(moveType);
    const stabMultiplier = isStab ? 1.5 : 1;

    const effectiveness = getTypeEffectiveness(moveType, defender.types);

    // Weather modifier
    let weatherMod = 1;
    if (weather === 'sun') {
        if (moveType === 'fire') weatherMod = 1.5;
        else if (moveType === 'water') weatherMod = 0.5;
    } else if (weather === 'rain') {
        if (moveType === 'water') weatherMod = 1.5;
        else if (moveType === 'fire') weatherMod = 0.5;
    }

    // Reflect / Light Screen
    const reflectMod = isPhysical && defender.reflect ? 0.5 : 1;
    const lightScreenMod = !isPhysical && defender.lightScreen ? 0.5 : 1;

    const isCrit = Math.random() < 0.0625;
    const critMultiplier = isCrit ? 1.5 : 1;

    const randomMultiplier = (Math.floor(Math.random() * 16) + 85) / 100;

    const damage = Math.floor(
        baseDamage *
        stabMultiplier *
        effectiveness *
        weatherMod *
        reflectMod *
        lightScreenMod *
        critMultiplier *
        randomMultiplier
    );

    return { damage, effectiveness, isCrit, isStab };
};

export const checkAccuracy = (moveId: number, attacker: BattlePokemon, defender: BattlePokemon): boolean => {
    const move = moveCache.get(moveId);
    if (!move || move.accuracy === null) return true; // moves with null accuracy always hit

    const accuracyStage = attacker.statStages.accuracy - defender.statStages.evasion;
    const accuracyMultiplier = getStatMultiplier(accuracyStage);
    return Math.random() < (move.accuracy / 100) * accuracyMultiplier;
};
