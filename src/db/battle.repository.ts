import { db } from './database';
import { BattleRow, BattleTurnRow, BattleState } from '../models/battle.models';

export const saveBattle = (state: BattleState, forfeited: boolean = false): void => {
    const saveBattleStmt = db.prepare(`
        INSERT INTO battles (id, player1_name, player2_name, winner, forfeited, started_at, finished_at, total_turns)
        VALUES (@id, @player1Name, @player2Name, @winner, @forfeited, @startedAt, @finishedAt, @totalTurns)
    `);

    const saveTurnStmt = db.prepare(`
        INSERT INTO battle_turns (battle_id, turn_number, log)
        VALUES (@battleId, @turnNumber, @log)
    `);

    const saveAll = db.transaction((state: BattleState) => {
        saveBattleStmt.run({
            id: state.matchId,
            player1Name: state.player1.name,
            player2Name: state.player2.name,
            winner: state.winner,
            forfeited: forfeited ? 1 : 0,
            startedAt: state.startedAt,
            finishedAt: new Date().toISOString(),
            totalTurns: state.turn,
        });

        state.turnLogs.forEach((turnLog, index) => {
            saveTurnStmt.run({
                battleId: state.matchId,
                turnNumber: index + 1,
                log: JSON.stringify(turnLog),
            });
        });
    });

    saveAll(state);
};

export const getBattle = (battleId: string): BattleRow | undefined => {
    return db.prepare('SELECT * FROM battles WHERE id = ?').get(battleId) as BattleRow | undefined;
};

export const getBattleTurns = (battleId: string): BattleTurnRow[] => {
    return db.prepare('SELECT * FROM battle_turns WHERE battle_id = ? ORDER BY turn_number ASC').all(battleId) as BattleTurnRow[];
};

export const getAllBattles = (): BattleRow[] => {
    return db.prepare('SELECT * FROM battles ORDER BY finished_at DESC').all() as BattleRow[];
};
