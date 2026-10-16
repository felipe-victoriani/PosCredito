// =====================================================================
// social-regras.js — regras puras de seguir, curtir, comentar e feed
// ---------------------------------------------------------------------
// Sem Firebase e sem DOM: montam os mapas { caminho: valor } para
// update(ref(db), mapa). O app e os testes das Security Rules usam
// exatamente estas funções.
// =====================================================================

import { LIMITES_REVIEW } from './reviews-regras.js';

/**
 * Seguir ou deixar de seguir. Atualiza os dois lados e os dois contadores.
 * @param {{uid: string, alvo: string, seguir: boolean, seguindoAtual: number, seguidoresAlvoAtual: number}} p
 */
export function montarSeguir({ uid, alvo, seguir, seguindoAtual = 0, seguidoresAlvoAtual = 0 }) {
  const passo = seguir ? 1 : -1;
  return {
    [`follows/${uid}/${alvo}`]: seguir ? true : null,
    [`followers/${alvo}/${uid}`]: seguir ? true : null,
    [`users/${uid}/stats/following`]: Math.max(0, seguindoAtual + passo),
    [`users/${alvo}/stats/followers`]: Math.max(0, seguidoresAlvoAtual + passo),
  };
}

/** Curtir ou descurtir uma review (marca + contador). */
export function montarCurtida({ uid, reviewId, curtir, likeCountAtual = 0 }) {
  return {
    [`likes/${reviewId}/${uid}`]: curtir ? true : null,
    [`reviews/${reviewId}/likeCount`]: Math.max(0, likeCountAtual + (curtir ? 1 : -1)),
  };
}

/** Novo comentário (o id vem de push() do SDK). */
export function montarComentario({ uid, reviewId, commentId, texto, commentCountAtual = 0, carimbo }) {
  return {
    [`comments/${reviewId}/${commentId}`]: { uid, text: texto, createdAt: carimbo },
    [`reviews/${reviewId}/commentCount`]: commentCountAtual + 1,
  };
}

/** Exclusão de comentário (por quem escreveu ou pela dona da review). */
export function montarExclusaoComentario({ reviewId, commentId, commentCountAtual = 0 }) {
  return {
    [`comments/${reviewId}/${commentId}`]: null,
    [`reviews/${reviewId}/commentCount`]: Math.max(0, commentCountAtual - 1),
  };
}

/** Valida o texto de um comentário. @returns {string|null} erro ou null */
export function validarComentario(texto) {
  const limpo = (texto ?? '').trim();
  if (!limpo) return 'Escreva alguma coisa antes de enviar.';
  if (limpo.length > LIMITES_REVIEW.COMENTARIO_MAX) return `O comentário pode ter até ${LIMITES_REVIEW.COMENTARIO_MAX} caracteres.`;
  return null;
}

// ---------- Feed ----------

/** Filtro de tipo do feed ("tudo" passa tudo). */
export function filtrarPorTipo(itens, tipo) {
  return tipo === 'tudo' ? itens : itens.filter(({ review }) => review.tipo === tipo);
}

/**
 * "Em alta": entre as reviews recentes, mais curtidas primeiro;
 * empate decide pela mais nova.
 */
export function ordenarEmAlta(itens) {
  return [...itens].sort(
    (a, b) => (b.review.likeCount ?? 0) - (a.review.likeCount ?? 0) || b.review.createdAt - a.review.createdAt,
  );
}

/** "Seguindo": junta listas de várias pessoas, mais novas primeiro, sem repetir. */
export function mesclarPorData(listas, limite) {
  const vistos = new Set();
  return listas
    .flat()
    .filter(({ review }) => (vistos.has(review.id) ? false : vistos.add(review.id)))
    .sort((a, b) => b.review.createdAt - a.review.createdAt)
    .slice(0, limite);
}
