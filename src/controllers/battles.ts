import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { BattlePokemon, BattleState, TeamEntry } from '../models/battle.models';
import { pokemonCache } from '../cache/pokemonCache';
import { moveCache } from '../cache/moveCache';
import { activeBattles } from '../store/activeBattles';
import { determineTurnOrder, resolveMoveAction, resolveSwitchAction } from '../utils/turn.utils';
import { getActivePokemon, checkBattleOver, needsSwitch } from '../utils/battle.utils';
import { getIo } from '../sockets/ioStore';
import { getAllBattles as getAllBattlesFromDb, getBattle, getBattleTurns } from '../db/battle.repository';

const buildTeam = (team: TeamEntry[]): BattlePokemon[] =>
    team.map((entry) => {
        const pokemon = pokemonCache.get(entry.pokemonId)!;
        return {
            id: pokemon.id,
            name: pokemon.name,
            currentHp: pokemon.stats.find((s) => s.stat.name === 'hp')?.base_stat ?? 0,
            maxHp: pokemon.stats.find((s) => s.stat.name === 'hp')?.base_stat ?? 0,
            stats: {
                attack: pokemon.stats.find((s) => s.stat.name === 'attack')?.base_stat ?? 0,
                defense: pokemon.stats.find((s) => s.stat.name === 'defense')?.base_stat ?? 0,
                specialAttack: pokemon.stats.find((s) => s.stat.name === 'special-attack')?.base_stat ?? 0,
                specialDefense: pokemon.stats.find((s) => s.stat.name === 'special-defense')?.base_stat ?? 0,
                speed: pokemon.stats.find((s) => s.stat.name === 'speed')?.base_stat ?? 0,
            },
            statStages: { attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0, accuracy: 0, evasion: 0 },
            types: pokemon.types.map((t) => t.type.name),
            moves: entry.moves.map((moveId) => {
                const move = moveCache.get(moveId)!;
                return {
                    id: move.id,
                    name: move.name,
                    currentPp: move.pp,
                    maxPp: move.pp,
                    power: move.power,
                    accuracy: move.accuracy,
                    type: move.type.name,
                    damageClass: move.damage_class.name as 'physical' | 'special' | 'status',
                };
            }),
            sprites: {
                front: pokemon.sprites.front_default ?? '',
                back: pokemon.sprites.back_default ?? '',
            },
            fainted: false,
        };
    });

const validateTeam = (
    team: TeamEntry[],
    res: Response,
): boolean => {
    for (const entry of team) {
        if (!entry.pokemonId) {
            res.status(400).json({ message: 'Each team entry must have a pokemonId' });
            return false;
        }
        if (!Array.isArray(entry.moves) || entry.moves.length < 1 || entry.moves.length > 4) {
            res.status(400).json({ message: `Pokemon ${entry.pokemonId} must have between 1 and 4 moves` });
            return false;
        }
        const pokemon = pokemonCache.get(entry.pokemonId);
        if (!pokemon) {
            res.status(400).json({ message: `Pokemon with id ${entry.pokemonId} not found` });
            return false;
        }
        const learnsetIds = new Set(
            pokemon.moves.map((m) => parseInt(m.move.url.split('/').filter(Boolean).pop() ?? '0'))
        );
        for (const moveId of entry.moves) {
            if (!moveCache.has(moveId)) {
                res.status(400).json({ message: `Move with id ${moveId} not found` });
                return false;
            }
            if (!learnsetIds.has(moveId)) {
                res.status(400).json({ message: `Move ${moveId} is not in ${pokemon.name}'s learnset` });
                return false;
            }
        }
    }
    return true;
};

export const startBattle = async (req: Request, res: Response): Promise<void> => {
    const { player1, player2 } = req.body;

    if (!player1 || !player2) {
        res.status(400).json({ message: 'Both players are required' });
        return;
    }

    if (!player1.team || !Array.isArray(player2.team)) {
        res.status(400).json({ message: 'Both players must have a team' });
        return;
    }

    const isWaiting = player2.name === 'WAITING';

    if (player1.team.length < 1 || player1.team.length > 6) {
        res.status(400).json({ message: 'Teams must have between 1 and 6 pokemon' });
        return;
    }

    if (!isWaiting && (player2.team.length < 1 || player2.team.length > 6)) {
        res.status(400).json({ message: 'Teams must have between 1 and 6 pokemon' });
        return;
    }

    if (!validateTeam(player1.team as TeamEntry[], res)) return;
    if (!isWaiting && !validateTeam(player2.team as TeamEntry[], res)) return;

    const matchId = randomUUID();

    try {
        const battleState: BattleState = {
            matchId,
            player1: {
                name: player1.name,
                team: buildTeam(player1.team as TeamEntry[]),
                activePokemonIndex: 0,
            },
            player2: {
                name: player2.name,
                team: isWaiting ? [] : buildTeam(player2.team as TeamEntry[]),
                activePokemonIndex: 0,
            },
            turn: 1,
            currentTurn: 'player1',
            status: 'active',
            winner: null,
            log: [],
            turnLogs: [],
            pendingActions: {},
            awaitingFaintSwitch: { player1: false, player2: false },
            startedAt: new Date().toISOString(),
        };

        activeBattles.set(matchId, battleState);
        res.status(201).json(battleState);
    } catch (error: unknown) {
        res.status(500).json({ message: error instanceof Error ? error.message : 'Internal server error' });
    }
};

export const submitBattleAction = async (req: Request<{ battleId: string }>, res: Response): Promise<void> => {
    const { battleId } = req.params;
    const { player, action } = req.body;
    // action shape: { type: 'attack' | 'switch', moveId?: number, switchToIndex?: number }

    // validate battle exists
    const state = activeBattles.get(battleId);
    if (!state) {
        res.status(404).json({ message: `Battle ${battleId} not found` });
        return;
    }

    if (state.status === 'finished') {
        res.status(400).json({ message: 'Battle is already finished' });
        return;
    }

    if (player !== 'player1' && player !== 'player2') {
        res.status(400).json({ message: 'Invalid player' });
        return;
    }

    // validate action
    if (action.type === 'attack' && !action.moveId) {
        res.status(400).json({ message: 'moveId is required for attack action' });
        return;
    }
    if (action.type === 'switch' && action.switchToIndex === undefined) {
        res.status(400).json({ message: 'switchToIndex is required for switch action' });
        return;
    }

    // store the incoming action
    state.pendingActions[player as 'player1' | 'player2'] = action;

    // if only one player has submitted, wait for the other
    if (!state.pendingActions.player1 || !state.pendingActions.player2) {
        res.status(200).json({ message: 'Action received, waiting for opponent' });
        return;
    }

    // both actions received — resolve the turn
    const turnLog: string[] = [];
    const p1Action = state.pendingActions.player1;
    const p2Action = state.pendingActions.player2;

    // determine turn order
    const turnOrder = determineTurnOrder(state, p1Action, p2Action);

    // resolve each action in order
    for (const { player: actingPlayer, action: actingAction } of turnOrder) {
        const opponent = actingPlayer === 'player1' ? 'player2' : 'player1';
        const attacker = getActivePokemon(state, actingPlayer);
        const defender = getActivePokemon(state, opponent);

        if (actingAction.type === 'switch' && actingAction.switchToIndex !== undefined) {
            resolveSwitchAction(state, actingPlayer, actingAction.switchToIndex, turnLog);
        } else if (actingAction.type === 'attack' && actingAction.moveId) {
            resolveMoveAction(attacker, defender, actingAction.moveId, turnLog);
        }

        // check if battle ended after each action
        if (checkBattleOver(state)) break;
    }

    // clear pending actions for next turn
    state.pendingActions = {};
    state.turn += 1;

    // determine post turn flags
    const p1NeedsSwitch = needsSwitch(state, 'player1');
    const p2NeedsSwitch = needsSwitch(state, 'player2');
    const battleOver = (state.status as BattleState['status']) === 'finished';

    // build response payload
    const payload = {
        battleState: state,
        turnLog,
        player1NeedsSwitch: p1NeedsSwitch,
        player2NeedsSwitch: p2NeedsSwitch,
        battleOver,
        winner: state.winner,
    };

    // emit to both players via websocket
    getIo().to(battleId).emit('battle:turnResult', payload);

    if (p1NeedsSwitch) getIo().to(battleId).emit('battle:switchRequired', { player: 'player1' });
    if (p2NeedsSwitch) getIo().to(battleId).emit('battle:switchRequired', { player: 'player2' });
    if (battleOver) {
        getIo().to(battleId).emit('battle:over', { winner: state.winner });
        activeBattles.delete(battleId); // clean up finished battle
    }

    res.status(200).json(payload);
};

export const forfeitBattle = async (req: Request<{ battleId: string }>, res: Response): Promise<void> => {
    const { battleId } = req.params;
    const { player } = req.body;

    const state = activeBattles.get(battleId);

    if (!state) {
        res.status(404).json({ message: `Battle ${battleId} not found` });
        return;
    }

    if (state.status === 'finished') {
        res.status(400).json({ message: 'Battle is already finished' });
        return;
    }

    if (player !== 'player1' && player !== 'player2') {
        res.status(400).json({ message: 'Invalid player' });
        return;
    }

    const winner = player === 'player1' ? state.player2.name : state.player1.name;

    state.status = 'finished';
    state.winner = winner;

    getIo().to(battleId).emit('battle:over', { winner, forfeited: true, forfeitedBy: player });

    activeBattles.delete(battleId);

    res.status(200).json({ message: `${player} forfeited`, winner });
};

export const getAllBattlesHandler = async (_req: Request, res: Response): Promise<void> => {
    const battles = getAllBattlesFromDb();
    res.status(200).json(battles);
};

export const getBattleHistory = async (req: Request<{ battleId: string }>, res: Response): Promise<void> => {
    const { battleId } = req.params;
    const battle = getBattle(battleId);
    if (!battle) {
        res.status(404).json({ message: `Battle ${battleId} not found` });
        return;
    }
    res.status(200).json(battle);
};

export const getBattleTurnHistory = async (req: Request<{ battleId: string }>, res: Response): Promise<void> => {
    const { battleId } = req.params;
    const battle = getBattle(battleId);
    if (!battle) {
        res.status(404).json({ message: `Battle ${battleId} not found` });
        return;
    }
    const turns = getBattleTurns(battleId);
    res.status(200).json(
        turns.map((t) => ({
            ...t,
            log: JSON.parse(t.log),
        }))
    );
};

export const joinBattle = async (req: Request<{ battleId: string }>, res: Response): Promise<void> => {
    const { battleId } = req.params;
    const { player2 } = req.body;

    if (!player2 || !player2.name || !Array.isArray(player2.team)) {
        res.status(400).json({ message: 'player2 with name and team is required' });
        return;
    }

    const state = activeBattles.get(battleId);
    if (!state) {
        res.status(404).json({ message: `Battle ${battleId} not found` });
        return;
    }

    if (state.player2.name !== 'WAITING') {
        res.status(400).json({ message: 'Player 2 has already joined this battle' });
        return;
    }

    if (player2.team.length < 1 || player2.team.length > 6) {
        res.status(400).json({ message: 'Teams must have between 1 and 6 pokemon' });
        return;
    }

    if (!validateTeam(player2.team as TeamEntry[], res)) return;

    state.player2 = {
        name: player2.name,
        team: buildTeam(player2.team as TeamEntry[]),
        activePokemonIndex: 0,
    };

    res.status(200).json(state);
};
