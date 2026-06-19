import axios from 'axios';
import { Pokemon, Move } from '../types/pokemon.types';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

export const fetchAllPokemon = async () => {
  const res = await api.get('/v1/pokemon');
  return res.data;
};

export const fetchPokemonById = async (id: number): Promise<Pokemon> => {
  const res = await api.get(`/v1/pokemon/${id}`);
  return res.data;
};

export const fetchMoveById = async (id: number): Promise<Move> => {
  const res = await api.get(`/v1/move/${id}`);
  return res.data;
};

export const startBattle = async (payload: {
  player1: { name: string; team: { pokemonId: number; moves: number[] }[] };
  player2: { name: string; team: { pokemonId: number; moves: number[] }[] };
}) => {
  const res = await api.post('/v1/battles/start', payload);
  return res.data;
};

export const joinBattle = async (
  battleId: string,
  payload: { player2: { name: string; team: { pokemonId: number; moves: number[] }[] } }
) => {
  const res = await api.post(`/v1/battles/${battleId}/join`, payload);
  return res.data;
};
