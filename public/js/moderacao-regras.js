// =====================================================================
// moderacao-regras.js — regras puras de denúncia e bloqueio
// ---------------------------------------------------------------------
// Sem Firebase e sem DOM (testadas com Vitest e usadas nos testes das
// Security Rules).
// =====================================================================

// Motivos de denúncia (ids iguais aos aceitos pelas Security Rules)
export const MOTIVOS = [
  { id: 'spoiler', rotulo: 'Spoiler sem aviso' },
  { id: 'ofensivo', rotulo: 'Ofensivo ou discurso de ódio' },
  { id: 'assedio', rotulo: 'Assédio ou ataque pessoal' },
  { id: 'spam', rotulo: 'Spam ou propaganda' },
  { id: 'outro', rotulo: 'Outro motivo' },
];

// Detalhes opcionais da denúncia
export const DETALHES_MAX = 300;

/**
 * Identificador do alvo. Comentário vira "reviewId~commentId" porque
 * chaves do banco não aceitam "/".
 */
export function idAlvo(tipo, reviewId, commentId = null) {
  return tipo === 'comment' ? `${reviewId}~${commentId}` : reviewId;
}

/** Id da denúncia: uma por pessoa por alvo (denunciar de novo não duplica). */
export function idDenuncia(uid, tipo, alvo) {
  return `${uid}_${tipo}_${alvo}`;
}

/**
 * Denúncia pronta para update(ref(db), mapa).
 * @param {{uid: string, tipo: 'review'|'comment', alvo: string, motivo: string, detalhes?: string, carimbo: unknown}} p
 */
export function montarDenuncia({ uid, tipo, alvo, motivo, detalhes = '', carimbo }) {
  const denuncia = { reporterUid: uid, targetType: tipo, targetId: alvo, reason: motivo, createdAt: carimbo };
  const texto = detalhes.trim().slice(0, DETALHES_MAX);
  if (texto) denuncia.details = texto;
  return { [`reports/${idDenuncia(uid, tipo, alvo)}`]: denuncia };
}

/** Bloquear (ou desbloquear) alguém. */
export function montarBloqueio({ uid, alvo, bloquear }) {
  return { [`blocks/${uid}/${alvo}`]: bloquear ? true : null };
}

/** Tira das listas o que foi escrito por pessoas bloqueadas. */
export function semBloqueados(itens, bloqueados, autorDe = (item) => item.review?.uid) {
  if (!bloqueados?.size) return itens;
  return itens.filter((item) => !bloqueados.has(autorDe(item)));
}
