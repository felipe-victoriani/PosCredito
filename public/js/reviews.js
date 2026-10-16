// =====================================================================
// reviews.js — ler, publicar, editar e excluir reviews
// ---------------------------------------------------------------------
// Toda escrita é um update multi-path montado em reviews-regras.js.
// Se outra pessoa mexer na média do título ao mesmo tempo, as regras
// recusam (dado desatualizado) e tentamos de novo com o valor novo.
// =====================================================================

import { obterPerfil } from './auth.js';
import { db, endAt, get, limitToLast, orderByChild, orderByValue, query, ref, serverTimestamp, update } from './firebase.js';
import { idReview, montarEscritaReview, montarExclusaoReview } from './reviews-regras.js';

// Tentativas quando a escrita é recusada por concorrência na média
const MAX_TENTATIVAS = 3;

// Cache de autores durante a visita (evita reler o mesmo perfil)
const cacheAutores = new Map();

/** Valor de um caminho (ou null). */
async function ler(caminho) {
  return (await get(ref(db, caminho))).val();
}

/** Estado atual necessário para montar a escrita. */
async function lerEstado(uid, mediaKey) {
  const [existente, statsTitulo, statsUsuario, visto, naWatchlist] = await Promise.all([
    ler(`reviews/${idReview(uid, mediaKey)}`),
    ler(`titleStats/${mediaKey}`),
    ler(`users/${uid}/stats`),
    ler(`lists/${uid}/watched/${mediaKey}`),
    ler(`lists/${uid}/watchlist/${mediaKey}`),
  ]);
  return { existente, statsTitulo, statsUsuario, jaVisto: visto !== null, naWatchlist: naWatchlist !== null };
}

/**
 * Repete a operação se a recusa foi por dado desatualizado (outra pessoa
 * mexeu no mesmo contador ao mesmo tempo). Usado também por social.js.
 */
export async function comTentativas(operacao) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa += 1) {
    try {
      return await operacao();
    } catch (erro) {
      ultimoErro = erro;
      console.warn(`[reviews] tentativa ${tentativa} recusada`, erro?.code ?? erro?.message);
    }
  }
  throw ultimoErro;
}

// ---------- Escrita ----------

/**
 * Publica ou edita a review da pessoa para o título.
 * @param {string} uid
 * @param {object} meta - metadadosTitulo(detalhes, mediaType)
 * @param {{rating:number, text:string, spoiler:boolean, status:string}} dados
 */
export function salvarReview(uid, meta, dados) {
  return comTentativas(async () => {
    const estado = await lerEstado(uid, meta.mediaKey);
    const mapa = montarEscritaReview({ uid, meta, dados, ...estado, carimbo: serverTimestamp() });
    await update(ref(db), mapa);
  });
}

/** Exclui a review da pessoa para o título. */
export function excluirReview(uid, mediaKey) {
  return comTentativas(async () => {
    const estado = await lerEstado(uid, mediaKey);
    if (!estado.existente) return; // já não existe
    await update(ref(db), montarExclusaoReview({ uid, ...estado }));
  });
}

// ---------- Leitura ----------

/** Review da pessoa para o título (ou null). */
export async function obterMinhaReview(uid, mediaKey) {
  const review = await ler(`reviews/${idReview(uid, mediaKey)}`);
  return review ? { id: idReview(uid, mediaKey), ...review } : null;
}

/** Soma/contagem das notas do título (ou null). */
export function obterEstatisticaTitulo(mediaKey) {
  return ler(`titleStats/${mediaKey}`);
}

/** Perfil do autor, com cache (também usado nos comentários). */
export async function obterAutor(uid) {
  if (!cacheAutores.has(uid)) cacheAutores.set(uid, obterPerfil(uid).catch(() => null));
  return cacheAutores.get(uid);
}

/**
 * Página de reviews a partir de um índice (titleReviews/x ou userReviews/x),
 * mais recentes primeiro. Para a próxima página, passe o "cursor" devolvido.
 * @returns {Promise<{itens: {review: object, autor: object|null}[], cursor: {valor:number, chave:string}|null}>}
 */
async function listarPorIndice(caminhoIndice, limite, cursor) {
  // Pede 1 a mais para saber se ainda há outra página
  const restricoes = [orderByValue()];
  if (cursor) restricoes.push(endAt(cursor.valor, cursor.chave));
  restricoes.push(limitToLast(limite + 1 + (cursor ? 1 : 0)));

  const instantaneo = await get(query(ref(db, caminhoIndice), ...restricoes));
  const entradas = [];
  instantaneo.forEach((filho) => {
    entradas.push({ chave: filho.key, valor: filho.val() });
  });

  // Mais recentes primeiro; tira o item do cursor (já exibido)
  entradas.reverse();
  if (cursor && entradas[0]?.chave === cursor.chave) entradas.shift();

  const temMais = entradas.length > limite;
  const pagina = entradas.slice(0, limite);

  // Busca as reviews e seus autores em paralelo
  const itens = await Promise.all(
    pagina.map(async ({ chave }) => {
      const review = await ler(`reviews/${chave}`);
      if (!review) return null; // índice órfão: ignora
      return { review: { id: chave, ...review }, autor: await obterAutor(review.uid) };
    }),
  );

  const ultimo = pagina.at(-1);
  return { itens: itens.filter(Boolean), cursor: temMais && ultimo ? { valor: ultimo.valor, chave: ultimo.chave } : null };
}

/** Reviews de um título. */
export function listarReviewsDoTitulo(mediaKey, limite = 10, cursor = null) {
  return listarPorIndice(`titleReviews/${mediaKey}`, limite, cursor);
}

/** Reviews de uma pessoa. */
export function listarReviewsDoUsuario(uid, limite = 10, cursor = null) {
  return listarPorIndice(`userReviews/${uid}`, limite, cursor);
}

// ---------- Feed ----------

/** Junta cada review ao perfil do autor. */
function comAutores(reviews) {
  return Promise.all(reviews.map(async (review) => ({ review, autor: await obterAutor(review.uid) })));
}

/** As reviews mais recentes da comunidade (base do "Em alta"). */
export async function listarReviewsRecentes(limite = 50) {
  const instantaneo = await get(query(ref(db, 'reviews'), orderByChild('createdAt'), limitToLast(limite)));
  const reviews = [];
  instantaneo.forEach((filho) => {
    reviews.push({ id: filho.key, ...filho.val() });
  });
  return comAutores(reviews.reverse());
}

/**
 * Reviews recentes de quem a pessoa segue (base do "Seguindo").
 * Lê as últimas de cada pessoa seguida e junta por data.
 * @returns {Promise<{review: object, autor: object|null}[][]>} uma lista por pessoa
 */
export async function listarReviewsDeSeguidos(uidsSeguidos, porPessoa = 5) {
  return Promise.all(uidsSeguidos.map(async (uid) => (await listarReviewsDoUsuario(uid, porPessoa)).itens));
}
