// =====================================================================
// social.js — pessoas: busca por @, seguir, curtir e comentar
// ---------------------------------------------------------------------
// Toda escrita é um update multi-path montado em social-regras.js; as
// Security Rules conferem que marca e contador mudam juntos.
// =====================================================================

import { obterPerfil } from './auth.js';
import { db, endAt, get, limitToFirst, limitToLast, orderByChild, orderByKey, push, query, ref, serverTimestamp, startAt, update } from './firebase.js';
import { chaveUsername, normalizarUsername } from './perfil-regras.js';
import { comTentativas, obterAutor } from './reviews.js';
import { montarComentario, montarCurtida, montarExclusaoComentario, montarSeguir } from './social-regras.js';

// Prefixo mínimo para buscar pessoas (evita listar todo mundo com "a")
const PREFIXO_MIN = 2;
// Quantas pessoas seguidas o feed "Seguindo" consulta
const MAX_SEGUIDOS_NO_FEED = 50;

/** Valor de um caminho (ou null). */
async function ler(caminho) {
  return (await get(ref(db, caminho))).val();
}

// ---------- Busca de pessoas ----------

/**
 * Busca pessoas pelo começo do @ ("mari" acha @marina.cine).
 * Lê só a lista de @ (pública) e depois os perfis encontrados.
 * @returns {Promise<object[]>} perfis públicos
 */
export async function buscarPessoas(termo, limite = 5) {
  const prefixo = chaveUsername(normalizarUsername(termo));
  if (prefixo.length < PREFIXO_MIN) return [];

  // Ordena pelas chaves e pega o intervalo que começa com o prefixo
  const consulta = query(ref(db, 'usernames'), orderByKey(), startAt(prefixo), endAt(`${prefixo}`), limitToFirst(limite));
  const instantaneo = await get(consulta);

  const uids = [];
  instantaneo.forEach((filho) => {
    uids.push(filho.val());
  });

  const perfis = await Promise.all(uids.map(obterPerfil));
  return perfis.filter(Boolean);
}

// ---------- Seguir ----------

/** true se uid segue alvo. */
export async function estaSeguindo(uid, alvo) {
  return (await ler(`follows/${uid}/${alvo}`)) === true;
}

/** Segue (sim = true) ou deixa de seguir (sim = false). */
export function definirSeguindo(uid, alvo, sim) {
  return comTentativas(async () => {
    const [seguindoAtual, seguidoresAlvoAtual] = await Promise.all([
      ler(`users/${uid}/stats/following`),
      ler(`users/${alvo}/stats/followers`),
    ]);
    await update(ref(db), montarSeguir({ uid, alvo, seguir: sim, seguindoAtual, seguidoresAlvoAtual }));
  });
}

/** Chaves (uids) de follows/{uid} ou followers/{uid}, até o limite. */
async function listarUids(no, uid, limite) {
  const instantaneo = await get(query(ref(db, `${no}/${uid}`), orderByKey(), limitToFirst(limite)));
  const uids = [];
  instantaneo.forEach((filho) => {
    uids.push(filho.key);
  });
  return uids;
}

/** uids que a pessoa segue (até o limite do feed). */
export function listarSeguidos(uid) {
  return listarUids('follows', uid, MAX_SEGUIDOS_NO_FEED);
}

/**
 * Perfis da lista "Seguindo" ou "Seguidores" de alguém.
 * @param {'seguindo'|'seguidores'} tipo
 * @returns {Promise<object[]>} perfis públicos (quem apagou a conta some)
 */
export async function listarPessoasDaRede(uid, tipo, limite = 100) {
  const uids = await listarUids(tipo === 'seguindo' ? 'follows' : 'followers', uid, limite);
  const perfis = await Promise.all(uids.map(obterPerfil));
  return perfis.filter(Boolean).sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
}

// ---------- Curtidas ----------

/** true se a pessoa já curtiu a review. */
export async function jaCurtiu(uid, reviewId) {
  return (await ler(`likes/${reviewId}/${uid}`)) === true;
}

/**
 * Curte ou descurte. Devolve o novo total de curtidas.
 * @returns {Promise<number>}
 */
export function definirCurtida(uid, reviewId, curtir) {
  return comTentativas(async () => {
    const likeCountAtual = (await ler(`reviews/${reviewId}/likeCount`)) ?? 0;
    const mapa = montarCurtida({ uid, reviewId, curtir, likeCountAtual });
    await update(ref(db), mapa);
    return mapa[`reviews/${reviewId}/likeCount`];
  });
}

// ---------- Comentários ----------

/** Comentários de uma review (mais antigos primeiro, como conversa). */
export async function listarComentarios(reviewId, limite = 50) {
  const instantaneo = await get(query(ref(db, `comments/${reviewId}`), orderByChild('createdAt'), limitToLast(limite)));
  const comentarios = [];
  instantaneo.forEach((filho) => {
    comentarios.push({ id: filho.key, ...filho.val() });
  });
  return Promise.all(comentarios.map(async (c) => ({ comentario: c, autor: await obterAutor(c.uid) })));
}

/** Publica um comentário. */
export function comentar(uid, reviewId, texto) {
  // O id é gerado uma vez só: numa nova tentativa, o mesmo comentário
  const commentId = push(ref(db, `comments/${reviewId}`)).key;
  return comTentativas(async () => {
    const commentCountAtual = (await ler(`reviews/${reviewId}/commentCount`)) ?? 0;
    await update(ref(db), montarComentario({ uid, reviewId, commentId, texto, commentCountAtual, carimbo: serverTimestamp() }));
  });
}

/** Exclui um comentário (quem escreveu ou a dona da review). */
export function excluirComentario(reviewId, commentId) {
  return comTentativas(async () => {
    const commentCountAtual = (await ler(`reviews/${reviewId}/commentCount`)) ?? 0;
    await update(ref(db), montarExclusaoComentario({ reviewId, commentId, commentCountAtual }));
  });
}
