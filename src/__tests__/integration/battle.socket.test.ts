import { io as ioClient, Socket } from 'socket.io-client';
import request from 'supertest';
import { app } from '../../app';

const SERVER_URL = 'http://localhost:3001';

const validTeam1 = [
  { pokemonId: 6, moves: [53, 126, 163, 82] },
  { pokemonId: 25, moves: [85, 87, 86, 57] },
  { pokemonId: 131, moves: [58, 59, 57, 47] },
  { pokemonId: 94, moves: [95, 138, 109, 94] },
  { pokemonId: 143, moves: [34, 133, 156, 89] },
  { pokemonId: 149, moves: [63, 82, 59, 126] },
];

const validTeam2 = [
  { pokemonId: 9, moves: [56, 58, 63, 110] },
  { pokemonId: 65, moves: [94, 50, 105, 86] },
  { pokemonId: 112, moves: [89, 30, 157, 126] },
  { pokemonId: 130, moves: [63, 82, 85, 59] },
  { pokemonId: 59, moves: [52, 126, 34, 99] },
  { pokemonId: 150, moves: [94, 85, 133, 105] },
];

async function startBattle(): Promise<string> {
  const res = await request(app).post('/v1/battles/start').send({
    player1: { name: 'Ash', team: validTeam1 },
    player2: { name: 'Gary', team: validTeam2 },
  });
  expect(res.status).toBe(201);
  return res.body.matchId;
}

function makeSocket(): Socket {
  return ioClient(SERVER_URL, { autoConnect: false });
}

describe('battle socket — join and ready', () => {
  let socket1: Socket;
  let socket2: Socket;

  beforeEach(() => {
    socket1 = makeSocket();
    socket2 = makeSocket();
  });

  afterEach(() => {
    socket1.disconnect();
    socket2.disconnect();
  });

  it('emits battle:ready to both players when both join', (done) => {
    startBattle().then((battleId) => {
      let readyCount = 0;
      const onReady = (data: { matchId: string; player1: any; player2: any; turn: number }) => {
        readyCount++;
        expect(data.matchId).toBe(battleId);
        expect(data.player1.name).toBe('Ash');
        expect(data.player2.name).toBe('Gary');
        expect(Array.isArray(data.player1.team)).toBe(true);
        expect(Array.isArray(data.player2.team)).toBe(true);
        expect(typeof data.turn).toBe('number');
        expect((data as any).battleState).toBeUndefined();
        if (readyCount === 2) done();
      };

      socket1.on('battle:ready', onReady);
      socket2.on('battle:ready', onReady);

      socket1.connect();
      socket2.connect();

      socket1.on('connect', () => {
        socket1.emit('battle:join', { battleId, player: 'player1' });
      });
      socket2.on('connect', () => {
        socket2.emit('battle:join', { battleId, player: 'player2' });
      });
    });
  });

  it('emits battle:error when joining a non-existent battle', (done) => {
    socket1.connect();
    socket1.on('connect', () => {
      socket1.emit('battle:join', { battleId: 'nonexistent-id', player: 'player1' });
    });
    socket1.on('battle:error', (data: { message: string }) => {
      expect(data.message).toMatch(/not found/i);
      done();
    });
  });
});

describe('battle socket — turn resolution', () => {
  let socket1: Socket;
  let socket2: Socket;

  beforeEach(() => {
    socket1 = makeSocket();
    socket2 = makeSocket();
  });

  afterEach(() => {
    socket1.disconnect();
    socket2.disconnect();
  });

  it('resolves a turn and emits battle:turnResult after both players act', (done) => {
    startBattle().then((battleId) => {
      let readyCount = 0;

      const onReady = () => {
        readyCount++;
        if (readyCount < 2) return;

        // player1 uses flamethrower (53, in Charizard's [53,126,163,82])
        // player2 uses hydro-pump (56, in Blastoise's [56,58,63,110])
        socket1.emit('battle:action', {
          battleId,
          player: 'player1',
          action: { type: 'attack', moveId: 53 },
        });
        socket2.emit('battle:action', {
          battleId,
          player: 'player2',
          action: { type: 'attack', moveId: 56 },
        });
      };

      let resultCount = 0;
      const onResult = (data: { turnLog: string[]; player1NeedsSwitch: boolean; player2NeedsSwitch: boolean; battleOver: boolean; winner: string | null }) => {
        expect(Array.isArray(data.turnLog)).toBe(true);
        expect(typeof data.player1NeedsSwitch).toBe('boolean');
        expect(typeof data.player2NeedsSwitch).toBe('boolean');
        expect(typeof data.battleOver).toBe('boolean');
        expect((data as any).battleState).toBeUndefined();
        resultCount++;
        if (resultCount === 2) done();
      };

      socket1.on('battle:ready', onReady);
      socket2.on('battle:ready', onReady);
      socket1.on('battle:turnResult', onResult);
      socket2.on('battle:turnResult', onResult);

      socket1.connect();
      socket2.connect();
      socket1.on('connect', () => socket1.emit('battle:join', { battleId, player: 'player1' }));
      socket2.on('connect', () => socket2.emit('battle:join', { battleId, player: 'player2' }));
    });
  });

  it('does not resolve turn until both players submit actions', (done) => {
    startBattle().then((battleId) => {
      let readyCount = 0;

      const onReady = () => {
        readyCount++;
        if (readyCount < 2) return;

        // Only player1 submits
        socket1.emit('battle:action', {
          battleId,
          player: 'player1',
          action: { type: 'attack', moveId: 53 },
        });

        // Wait 500ms; if battle:turnResult fires before player2 acts it's a bug
        let resolved = false;
        socket1.on('battle:turnResult', () => { resolved = true; });
        socket2.on('battle:turnResult', () => { resolved = true; });

        setTimeout(() => {
          expect(resolved).toBe(false);
          done();
        }, 500);
      };

      socket1.on('battle:ready', onReady);
      socket2.on('battle:ready', onReady);

      socket1.connect();
      socket2.connect();
      socket1.on('connect', () => socket1.emit('battle:join', { battleId, player: 'player1' }));
      socket2.on('connect', () => socket2.emit('battle:join', { battleId, player: 'player2' }));
    });
  });

  it('emits battle:error when player uses a move their pokemon does not know', (done) => {
    startBattle().then((battleId) => {
      let readyCount = 0;

      const onReady = () => {
        readyCount++;
        if (readyCount < 2) return;

        // move 999 does not exist in any team
        socket1.emit('battle:action', {
          battleId,
          player: 'player1',
          action: { type: 'attack', moveId: 999 },
        });
      };

      socket1.on('battle:ready', onReady);
      socket2.on('battle:ready', onReady);

      socket1.on('battle:error', (data: { message: string }) => {
        expect(data.message).toMatch(/does not know move/i);
        done();
      });

      socket1.connect();
      socket2.connect();
      socket1.on('connect', () => socket1.emit('battle:join', { battleId, player: 'player1' }));
      socket2.on('connect', () => socket2.emit('battle:join', { battleId, player: 'player2' }));
    });
  });
});

describe('battle socket — forfeit', () => {
  let socket1: Socket;
  let socket2: Socket;

  beforeEach(() => {
    socket1 = makeSocket();
    socket2 = makeSocket();
  });

  afterEach(() => {
    socket1.disconnect();
    socket2.disconnect();
  });

  it('emits battle:over to both players when player1 forfeits', (done) => {
    startBattle().then((battleId) => {
      let readyCount = 0;
      let battleOverReceived = false;

      const onReady = () => {
        readyCount++;
        if (readyCount < 2) return;
        socket1.emit('battle:forfeit', { battleId, player: 'player1' });
      };

      const onBattleOver = (data: { winner: string | null; forfeited?: boolean; forfeitedBy?: string }) => {
        if (battleOverReceived) return;
        battleOverReceived = true;
        expect(data.winner).toBe('Gary');
        expect(data.forfeited).toBe(true);
        expect(data.forfeitedBy).toBe('player1');
        expect((data as any).battleState).toBeUndefined();
        done();
      };

      socket1.on('battle:ready', onReady);
      socket2.on('battle:ready', onReady);
      socket1.on('battle:over', onBattleOver);
      socket2.on('battle:over', onBattleOver);

      socket1.connect();
      socket2.connect();
      socket1.on('connect', () => socket1.emit('battle:join', { battleId, player: 'player1' }));
      socket2.on('connect', () => socket2.emit('battle:join', { battleId, player: 'player2' }));
    });
  });
});

describe('battle socket — disconnect', () => {
  let socket1: Socket;
  let socket2: Socket;

  beforeEach(() => {
    socket1 = makeSocket();
    socket2 = makeSocket();
  });

  afterEach(() => {
    socket1.disconnect();
    socket2.disconnect();
  });

  it('emits battle:opponentDisconnected and battle:over when a player disconnects', (done) => {
    startBattle().then((battleId) => {
      let readyCount = 0;

      const onReady = () => {
        readyCount++;
        if (readyCount < 2) return;
        socket1.disconnect();
      };

      socket2.on('battle:opponentDisconnected', () => {
        // expected — just confirm battle:over also fires
      });
      socket2.on('battle:over', (data: { winner: string }) => {
        expect(data.winner).toBe('Gary');
        done();
      });

      socket1.on('battle:ready', onReady);
      socket2.on('battle:ready', onReady);

      socket1.connect();
      socket2.connect();
      socket1.on('connect', () => socket1.emit('battle:join', { battleId, player: 'player1' }));
      socket2.on('connect', () => socket2.emit('battle:join', { battleId, player: 'player2' }));
    });
  });
});
