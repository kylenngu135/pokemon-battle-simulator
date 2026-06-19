import { BattlePokemon } from '../models/battle.models';
import { moveCache } from '../cache/moveCache';
import { getTypeEffectiveness } from '../data/typeChart';
import { getStatMultiplier } from '../data/statStages';

export const calculateDamage = (
    attacker: BattlePokemon,
    defender: BattlePokemon,
    moveId: number
): { damage: number; effectiveness: number; isCrit: boolean; isStab: boolean } => {
    const move = moveCache.get(moveId);
    if (!move || !move.power) return { damage: 0, effectiveness: 1, isCrit: false, isStab: false };

    const isPhysical = move.damage_class.name === 'physical';

    const attackStat = isPhysical
        ? attacker.stats.attack * getStatMultiplier(attacker.statStages.attack)
        : attacker.stats.specialAttack * getStatMultiplier(attacker.statStages.specialAttack);

    const defenseStat = isPhysical
        ? defender.stats.defense * getStatMultiplier(defender.statStages.defense)
        : defender.stats.specialDefense * getStatMultiplier(defender.statStages.specialDefense);

    const level = 50; // standard competitive level
    const baseDamage = (((2 * level) / 5 + 2) * move.power * (attackStat / defenseStat)) / 50 + 2;

    const isStab = attacker.types.includes(move.type.name);
    const stabMultiplier = isStab ? 1.5 : 1;

    const effectiveness = getTypeEffectiveness(move.type.name, defender.types);

    const isCrit = Math.random() < 0.0625; // 1/16 base crit rate
    const critMultiplier = isCrit ? 1.5 : 1;

    const randomMultiplier = (Math.floor(Math.random() * 16) + 85) / 100;

    const damage = Math.floor(
        baseDamage * stabMultiplier * effectiveness * critMultiplier * randomMultiplier
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
