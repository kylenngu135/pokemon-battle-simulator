'use client';
import { useState, useEffect } from 'react';
import { fetchAllPokemon } from '../lib/api';
import { PokemonListItem } from '../types/pokemon.types';

export const usePokemon = () => {
  const [pokemon, setPokemon] = useState<PokemonListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllPokemon()
      .then((data) => {
        setPokemon(data.results);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return { pokemon, loading, error };
};
