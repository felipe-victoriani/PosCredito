// =====================================================================
// lists.js — listas pessoais: Quero ver, Já vi e Favoritos
// =====================================================================

import { db, get, limitToLast, orderByChild, query, ref, serverTimestamp, update } from './firebase.js';
import { LISTAS, montarEscritaLista } from './reviews-regras.js';

/** Em quais listas o título está: { watchlist: bool, watched: bool, favorites: bool }. */
export async function situacaoNasListas(uid, mediaKey) {
  const valores = await Promise.all(LISTAS.map((lista) => get(ref(db, `lists/${uid}/${lista}/${mediaKey}`))));
  return Object.fromEntries(LISTAS.map((lista, i) => [lista, valores[i].exists()]));
}

/**
 * Adiciona ou remove o título de uma lista ("Já vi" também mexe em
 * Vistos e tira de "Quero ver").
 */
export async function definirNaLista(uid, lista, meta, adicionar) {
  const [stats, naWatchlist] = await Promise.all([
    get(ref(db, `users/${uid}/stats`)),
    get(ref(db, `lists/${uid}/watchlist/${meta.mediaKey}`)),
  ]);
  const mapa = montarEscritaLista({
    uid,
    lista,
    meta,
    adicionar,
    statsUsuario: stats.val(),
    naWatchlist: naWatchlist.exists(),
    carimbo: serverTimestamp(),
  });
  await update(ref(db), mapa);
}

/**
 * Itens de uma lista, mais recentes primeiro.
 * @returns {Promise<{mediaKey: string, title: string, tipo: string, posterPath?: string, year?: string, addedAt: number}[]>}
 */
export async function obterLista(uid, lista, limite = 60) {
  const instantaneo = await get(query(ref(db, `lists/${uid}/${lista}`), orderByChild('addedAt'), limitToLast(limite)));
  const itens = [];
  instantaneo.forEach((filho) => {
    itens.push({ mediaKey: filho.key, ...filho.val() });
  });
  return itens.reverse();
}
