import request from 'supertest';
import { app } from '../../app';

const validStartBody = {
  player1: {
    name: 'Ash',
    team: [
      { pokemonId: 6, moves: [53, 126, 163, 82] },
      { pokemonId: 25, moves: [85, 87, 86, 57] },
      { pokemonId: 131, moves: [58, 59, 57, 47] },
      { pokemonId: 94, moves: [95, 138, 109, 94] },
      { pokemonId: 143, moves: [34, 133, 156, 89] },
      { pokemonId: 149, moves: [63, 82, 59, 126] },
    ],
  },
  player2: {
    name: 'Gary',
    team: [
      { pokemonId: 9, moves: [56, 58, 63, 110] },
      { pokemonId: 65, moves: [94, 50, 105, 86] },
      { pokemonId: 112, moves: [89, 30, 157, 126] },
      { pokemonId: 130, moves: [63, 82, 85, 59] },
      { pokemonId: 59, moves: [52, 126, 34, 99] },
      { pokemonId: 150, moves: [94, 85, 133, 105] },
    ],
  },
};

describe('POST /v1/battles/start', () => {
  it('returns 201 with a valid battle state', async () => {
    const res = await request(app).post('/v1/battles/start').send(validStartBody);
    expect(res.status).toBe(201);
    expect(res.body.matchId).toBeDefined();
    expect(res.body.player1).toBeDefined();
    expect(res.body.player2).toBeDefined();
    expect(res.body.status).toBe('active');
  });

  it('each pokemon only has the 4 submitted moves', async () => {
    const res = await request(app).post('/v1/battles/start').send(validStartBody);
    expect(res.status).toBe(201);
    res.body.player1.team.forEach((pokemon: any) => {
      expect(pokemon.moves.length).toBeLessThanOrEqual(4);
    });
    res.body.player2.team.forEach((pokemon: any) => {
      expect(pokemon.moves.length).toBeLessThanOrEqual(4);
    });
  });

  it('returns 400 when player1 is missing', async () => {
    const res = await request(app)
      .post('/v1/battles/start')
      .send({ player2: validStartBody.player2 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when player2 is missing', async () => {
    const res = await request(app)
      .post('/v1/battles/start')
      .send({ player1: validStartBody.player1 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when team has more than 6 pokemon', async () => {
    const res = await request(app)
      .post('/v1/battles/start')
      .send({
        ...validStartBody,
        player1: {
          ...validStartBody.player1,
          team: [...validStartBody.player1.team, { pokemonId: 1, moves: [33, 45, 52, 99] }],
        },
      });
    expect(res.status).toBe(400);
  });

  it('returns 400 when a pokemon has more than 4 moves', async () => {
    const res = await request(app)
      .post('/v1/battles/start')
      .send({
        ...validStartBody,
        player1: {
          ...validStartBody.player1,
          team: [
            { pokemonId: 6, moves: [53, 126, 163, 82, 99] },
            ...validStartBody.player1.team.slice(1),
          ],
        },
      });
    expect(res.status).toBe(400);
  });

  it('returns 400 when a pokemon ID does not exist in cache', async () => {
    const res = await request(app)
      .post('/v1/battles/start')
      .send({
        ...validStartBody,
        player1: {
          ...validStartBody.player1,
          team: [
            { pokemonId: 9999, moves: [53, 126, 163, 82] },
            ...validStartBody.player1.team.slice(1),
          ],
        },
      });
    expect(res.status).toBe(400);
  });

  it('returns 400 when a move does not belong to the pokemon learnset', async () => {
    // move 94 (psywave) is not in Charizard's learnset
    const res = await request(app)
      .post('/v1/battles/start')
      .send({
        ...validStartBody,
        player1: {
          ...validStartBody.player1,
          team: [
            { pokemonId: 6, moves: [94, 126, 163, 82] },
            ...validStartBody.player1.team.slice(1),
          ],
        },
      });
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/pokemon', () => {
  it('returns 200 with 151 pokemon', async () => {
    const res = await request(app).get('/v1/pokemon');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(151);
    expect(res.body.results.length).toBe(151);
  });

  it('first pokemon is bulbasaur', async () => {
    const res = await request(app).get('/v1/pokemon');
    expect(res.body.results[0].name).toBe('bulbasaur');
  });

  it('last pokemon is mew', async () => {
    const res = await request(app).get('/v1/pokemon');
    expect(res.body.results[150].name).toBe('mew');
  });
});

describe('GET /v1/pokemon/:id', () => {
  it('returns 200 with correct pokemon data for charizard', async () => {
    const res = await request(app).get('/v1/pokemon/6');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('charizard');
    expect(res.body.id).toBe(6);
    expect(res.body.types).toBeDefined();
    expect(res.body.stats).toBeDefined();
    expect(res.body.sprites).toBeDefined();
  });

  it('returns an error status for a pokemon ID that does not exist', async () => {
    const res = await request(app).get('/v1/pokemon/9999');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
