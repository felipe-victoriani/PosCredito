// =====================================================================
// social.js — pessoas: busca por @, seguir, curtir e comentar
// ---------------------------------------------------------------------
// Toda escrita é um update multi-path montado em social-regras.js; as
// Security Rules conferem que marca e contador mudam juntos.
// =====================================================================

import { obterPerfil } from './auth.js';
import { db, endAt, get, limitToFirst, limitToLast, onValue, orderByChild, orderByKey, push, query, ref, serverTimestamp, set, startAt, update } from './firebase.js';
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

// ---------- Sugestões de pessoas ----------

// Quantos @ ler da lista pública para montar as sugestões
const MAX_CANDIDATOS = 100;

/**
 * Matéria-prima das sugestões: perfis candidatos + quem a pessoa já
 * segue + quem a segue. Candidatos = quem segue a pessoa, autores de
 * reviews recentes (uidsExtras) e uma amostra da lista de @.
 * @param {string|null} uid - pessoa logada (null = visitante)
 * @param {string[]} uidsExtras
 */
export async function carregarCandidatos(uid, uidsExtras = []) {
  const [amostra, seguidos, seguidores] = await Promise.all([
    get(query(ref(db, 'usernames'), orderByKey(), limitToFirst(MAX_CANDIDATOS))).then((instantaneo) => {
      const uids = [];
      instantaneo.forEach((filho) => {
        uids.push(filho.val());
      });
      return uids;
    }),
    // Toda a lista de quem a pessoa segue (para não sugerir de novo)
    uid ? listarUids('follows', uid, 1000) : [],
    uid ? listarUids('followers', uid, MAX_CANDIDATOS) : [],
  ]);

  const jaSegue = new Set(seguidos);
  // Só busca perfis de quem pode virar sugestão (economiza leituras)
  const uids = [...new Set([...seguidores, ...uidsExtras, ...amostra])].filter((u) => u !== uid && !jaSegue.has(u));
  const perfis = (await Promise.all(uids.map((u) => obterAutor(u)))).filter(Boolean);

  return { perfis, seguidos: jaSegue, meusSeguidores: new Set(seguidores) };
}

// ---------- Curtidas ----------

/** true se a pessoa já curtiu a review. */
export async function jaCurtiu(uid, reviewId) {
  return (await ler(`likes/${reviewId}/${uid}`)) === true;
}

/**
 * Curte ou descurte (avisando a dona da review). Devolve o novo total.
 * @param {string} donoReview - uid de quem escreveu a review
 * @returns {Promise<number>}
 */
export function definirCurtida(uid, reviewId, curtir, donoReview) {
  return comTentativas(async () => {
    const likeCountAtual = (await ler(`reviews/${reviewId}/likeCount`)) ?? 0;
    const mapa = montarCurtida({ uid, reviewId, curtir, likeCountAtual, donoReview, carimbo: serverTimestamp() });
    await update(ref(db), mapa);
    return mapa[`reviews/${reviewId}/likeCount`];
  });
}

// ---------- Comentários ----------

/** Comentários de uma review (mais antigos primeiro, como conversa). */
export async function listarComentarios(reviewId, limite = 100) {
  const instantaneo = await get(query(ref(db, `comments/${reviewId}`), orderByChild('createdAt'), limitToLast(limite)));
  const comentarios = [];
  instantaneo.forEach((filho) => {
    comentarios.push({ id: filho.key, ...filho.val() });
  });
  return Promise.all(comentarios.map(async (c) => ({ comentario: c, autor: await obterAutor(c.uid) })));
}

/**
 * Publica um comentário (ou resposta), avisando quem deve ser avisado.
 * @param {{donoReview: string, resposta?: {parentId: string, replyToId: string, replyToUid: string}|null}} contexto
 */
export function comentar(uid, reviewId, texto, { donoReview, resposta = null }) {
  // O id é gerado uma vez só: numa nova tentativa, o mesmo comentário
  const commentId = push(ref(db, `comments/${reviewId}`)).key;
  return comTentativas(async () => {
    const commentCountAtual = (await ler(`reviews/${reviewId}/commentCount`)) ?? 0;
    await update(ref(db), montarComentario({ uid, reviewId, commentId, texto, commentCountAtual, carimbo: serverTimestamp(), donoReview, resposta }));
  });
}

/**
 * Exclui um comentário (quem escreveu ou a dona da review), tirando
 * junto os avisos que a pessoa pode tirar.
 * @param {{quem: string, autorComentario: string, donoReview: string, respondido?: string|null}} contexto
 */
export function excluirComentario(reviewId, commentId, contexto) {
  return comTentativas(async () => {
    const commentCountAtual = (await ler(`reviews/${reviewId}/commentCount`)) ?? 0;
    await update(ref(db), montarExclusaoComentario({ reviewId, commentId, commentCountAtual, ...contexto }));
  });
}

// ---------- Notificações ----------

/** Quando a pessoa abriu os avisos pela última vez (0 se nunca). */
async function lerVistoEm(uid) {
  return (await ler(`notificationsSeen/${uid}`)) ?? 0;
}

/**
 * Avisos mais recentes da pessoa (mais novos primeiro), já com quem
 * gerou, a review e o comentário. Review/comentário apagados vêm null.
 * @returns {Promise<{avisos: object[], vistoEm: number}>}
 */
export async function listarNotificacoes(uid, limite = 50) {
  const [instantaneo, vistoEm] = await Promise.all([
    get(query(ref(db, `notifications/${uid}`), orderByChild('createdAt'), limitToLast(limite))),
    lerVistoEm(uid),
  ]);
  const brutos = [];
  instantaneo.forEach((filho) => {
    brutos.push({ id: filho.key, ...filho.val() });
  });

  // Várias notificações costumam apontar para a mesma review: lê uma vez só
  const reviews = new Map();
  const lerReview = (id) => {
    if (!reviews.has(id)) reviews.set(id, ler(`reviews/${id}`).catch(() => null));
    return reviews.get(id);
  };

  const avisos = await Promise.all(
    brutos.reverse().map(async (n) => ({
      ...n,
      autor: await obterAutor(n.fromUid),
      review: await lerReview(n.reviewId),
      comentario: n.commentId ? await ler(`comments/${n.reviewId}/${n.commentId}`).catch(() => null) : null,
    })),
  );
  return { avisos, vistoEm };
}

/** Marca todos os avisos como vistos (agora, pela hora do servidor). */
export function marcarNotificacoesVistas(uid) {
  return set(ref(db, `notificationsSeen/${uid}`), serverTimestamp());
}

/**
 * Observa quantos avisos novos existem (para o sino), em tempo real.
 * Conta no máximo `limite` (o sino mostra "9+").
 * @param {(total: number) => void} callback
 * @returns {Promise<() => void>} função para parar de observar
 */
export async function observarNaoLidas(uid, callback, limite = 10) {
  const vistoEm = await lerVistoEm(uid);
  const consulta = query(ref(db, `notifications/${uid}`), orderByChild('createdAt'), startAt(vistoEm + 1), limitToLast(limite));
  return onValue(
    consulta,
    (instantaneo) => callback(instantaneo.size),
    (erro) => console.error('[social] contador de avisos', erro),
  );
}
