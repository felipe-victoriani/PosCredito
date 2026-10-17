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

// ---------- Notificações ----------

/**
 * Id fixo da notificação: curtir/descurtir/curtir de novo sobrescreve a
 * mesma entrada em vez de empilhar. "~" separa as partes (não aparece
 * em uid, reviewId nem id de push).
 * @param {'like'|'comment'|'reply'} tipo
 * @param {string} reviewId
 * @param {string} sufixo - uid de quem curtiu (like) ou id do comentário
 */
export function idNotificacao(tipo, reviewId, sufixo) {
  return `${tipo}~${reviewId}~${sufixo}`;
}

/** Caminho da notificação na caixa de quem recebe. */
function caminhoNotificacao(destino, tipo, reviewId, sufixo) {
  return `notifications/${destino}/${idNotificacao(tipo, reviewId, sufixo)}`;
}

/**
 * Curtir ou descurtir uma review (marca + contador). Com donoReview,
 * avisa a dona na mesma escrita (e tira o aviso ao descurtir).
 */
export function montarCurtida({ uid, reviewId, curtir, likeCountAtual = 0, donoReview = null, carimbo = null }) {
  const mapa = {
    [`likes/${reviewId}/${uid}`]: curtir ? true : null,
    [`reviews/${reviewId}/likeCount`]: Math.max(0, likeCountAtual + (curtir ? 1 : -1)),
  };
  // Curtir a própria review não gera aviso
  if (donoReview && donoReview !== uid) {
    mapa[caminhoNotificacao(donoReview, 'like', reviewId, uid)] = curtir ? { type: 'like', fromUid: uid, reviewId, createdAt: carimbo } : null;
  }
  return mapa;
}

/**
 * Novo comentário ou resposta (o id vem de push() do SDK).
 * - resposta.parentId: comentário raiz da conversa (um nível só)
 * - resposta.replyToId / replyToUid: comentário e pessoa respondidos
 * Avisos: quem foi respondido recebe "reply"; a dona da review recebe
 * "comment" (se ela mesma não foi a respondida). Ninguém avisa a si mesmo.
 */
export function montarComentario({ uid, reviewId, commentId, texto, commentCountAtual = 0, carimbo, donoReview = null, resposta = null }) {
  const comentario = { uid, text: texto, createdAt: carimbo };
  if (resposta) {
    comentario.parentId = resposta.parentId;
    comentario.replyToId = resposta.replyToId;
  }
  const mapa = {
    [`comments/${reviewId}/${commentId}`]: comentario,
    [`reviews/${reviewId}/commentCount`]: commentCountAtual + 1,
  };

  const aviso = (tipo) => ({ type: tipo, fromUid: uid, reviewId, commentId, createdAt: carimbo });
  const respondido = resposta?.replyToUid ?? null;
  if (respondido && respondido !== uid) mapa[caminhoNotificacao(respondido, 'reply', reviewId, commentId)] = aviso('reply');
  if (donoReview && donoReview !== uid && donoReview !== respondido) mapa[caminhoNotificacao(donoReview, 'comment', reviewId, commentId)] = aviso('comment');
  return mapa;
}

/**
 * Exclusão de comentário (por quem escreveu ou pela dona da review).
 * Tira junto os avisos que quem está apagando tem permissão de tirar:
 * quem escreveu tira os que gerou; a dona tira o da própria caixa.
 * @param {{quem?: string, autorComentario?: string, donoReview?: string, respondido?: string|null}} p
 */
export function montarExclusaoComentario({ reviewId, commentId, commentCountAtual = 0, quem = null, autorComentario = null, donoReview = null, respondido = null }) {
  const mapa = {
    [`comments/${reviewId}/${commentId}`]: null,
    [`reviews/${reviewId}/commentCount`]: Math.max(0, commentCountAtual - 1),
  };
  if (!quem) return mapa;

  // Os mesmos avisos que montarComentario teria criado
  const avisos = [];
  if (respondido && respondido !== autorComentario) avisos.push([respondido, 'reply']);
  if (donoReview && donoReview !== autorComentario && donoReview !== respondido) avisos.push([donoReview, 'comment']);

  for (const [destino, tipo] of avisos) {
    if (quem === autorComentario || quem === destino) mapa[caminhoNotificacao(destino, tipo, reviewId, commentId)] = null;
  }
  return mapa;
}

/**
 * Organiza os comentários em conversas de um nível: raízes em ordem
 * de data, cada uma com suas respostas embaixo. Resposta cuja raiz foi
 * apagada vira raiz (não some).
 * @param {{comentario: object}[]} itens - em qualquer ordem
 * @returns {{item: object, respostas: object[]}[]}
 */
export function agruparConversas(itens) {
  const porData = [...itens].sort((a, b) => a.comentario.createdAt - b.comentario.createdAt);
  const ids = new Set(porData.map((i) => i.comentario.id));
  const ehResposta = (item) => Boolean(item.comentario.parentId) && ids.has(item.comentario.parentId);

  // 1º: as raízes, na ordem de data
  const raizes = new Map();
  for (const item of porData) {
    if (!ehResposta(item)) raizes.set(item.comentario.id, { item, respostas: [] });
  }
  // 2º: cada resposta embaixo da sua raiz (se a "raiz" for outra
  // resposta — dado fora do padrão —, a resposta vira raiz para não sumir)
  for (const item of porData) {
    if (!ehResposta(item)) continue;
    const conversa = raizes.get(item.comentario.parentId);
    if (conversa) conversa.respostas.push(item);
    else raizes.set(item.comentario.id, { item, respostas: [] });
  }
  return [...raizes.values()];
}

/**
 * Frase do aviso (sem o nome de quem fez, que vem em negrito antes).
 * @param {'like'|'comment'|'reply'} tipo
 * @param {string|null} titulo - título da review (null se ela foi apagada)
 */
export function descreverAviso(tipo, titulo) {
  const sobre = titulo ? ` de ${titulo}` : '';
  if (tipo === 'like') return `curtiu sua review${sobre}.`;
  if (tipo === 'reply') return titulo ? `respondeu seu comentário em ${titulo}:` : 'respondeu seu comentário:';
  return `comentou na sua review${sobre}:`;
}

/** Texto do contador do sino ("9+" a partir do limite). */
export function rotuloContador(total, limite = 10) {
  return total >= limite ? `${limite - 1}+` : String(total);
}

/** Quantos avisos chegaram depois da última visita à página de avisos. */
export function contarNaoLidas(notificacoes, vistoEm) {
  return notificacoes.filter((n) => n.createdAt > (vistoEm ?? 0)).length;
}

/** Valida o texto de um comentário. @returns {string|null} erro ou null */
export function validarComentario(texto) {
  const limpo = (texto ?? '').trim();
  if (!limpo) return 'Escreva alguma coisa antes de enviar.';
  if (limpo.length > LIMITES_REVIEW.COMENTARIO_MAX) return `O comentário pode ter até ${LIMITES_REVIEW.COMENTARIO_MAX} caracteres.`;
  return null;
}

// ---------- Sugestões de pessoas ----------

// Pesos da ordem das sugestões (maior = aparece antes)
// (um gênero em comum vale mais que ter publicado há pouco; seguidores
// só desempatam, com teto para não virar ranking de popularidade)
const PESO = { SEGUE_VOCE: 100, GENERO: 6, TIPO: 4, ATIVO: 5, SEGUIDOR: 0.1, MAX_SEGUIDORES: 50 };

/** Ids presentes nos dois mapas de interesses ({terror: true}). */
function emComum(meus, deles) {
  return Object.keys(deles ?? {}).filter((id) => meus?.[id]);
}

/** Junta até 2 nomes: "Terror", "Terror e Anime". */
function juntarNomes(ids, rotulos) {
  return ids
    .slice(0, 2)
    .map((id) => rotulos[id] ?? id)
    .join(' e ');
}

/**
 * Escolhe e ordena quem sugerir para seguir.
 * Fora: a própria pessoa, quem ela já segue e quem ela bloqueou.
 * @param {{
 *   perfis: object[], meuUid: string|null, seguidos: Set<string>, bloqueados: Set<string>,
 *   meusSeguidores: Set<string>, meusInteresses: object|null, ativos: Set<string>,
 *   rotulos: Record<string,string>
 * }} p - rotulos: id do interesse → nome ("terror" → "Terror")
 * @returns {{perfil: object, motivo: string}[]}
 */
export function sugerirPessoas({ perfis, meuUid, seguidos, bloqueados, meusSeguidores, meusInteresses, ativos, rotulos }) {
  const vistos = new Set();
  const sugestoes = [];

  for (const perfil of perfis) {
    if (!perfil?.uid || vistos.has(perfil.uid)) continue;
    vistos.add(perfil.uid);
    if (perfil.uid === meuUid || seguidos.has(perfil.uid) || bloqueados.has(perfil.uid)) continue;

    const segueVoce = meusSeguidores.has(perfil.uid);
    const generos = emComum(meusInteresses?.generos, perfil.interests?.generos);
    const tipos = emComum(meusInteresses?.tipos, perfil.interests?.tipos);
    const ativo = ativos.has(perfil.uid);
    const seguidores = perfil.stats?.followers ?? 0;

    const pontos =
      (segueVoce ? PESO.SEGUE_VOCE : 0) +
      generos.length * PESO.GENERO +
      tipos.length * PESO.TIPO +
      (ativo ? PESO.ATIVO : 0) +
      Math.min(seguidores, PESO.MAX_SEGUIDORES) * PESO.SEGUIDOR;

    // O motivo mais forte vira a frase embaixo do nome
    let motivo;
    if (segueVoce) motivo = 'Segue você';
    else if (generos.length || tipos.length) motivo = `Também curte ${juntarNomes([...generos, ...tipos], rotulos)}`;
    else if (ativo) motivo = 'Publicou há pouco';
    else if (seguidores) motivo = `${seguidores} ${seguidores === 1 ? 'seguidor' : 'seguidores'}`;
    else motivo = 'Novo por aqui';

    sugestoes.push({ perfil, motivo, pontos, seguidores });
  }

  return sugestoes
    .sort((a, b) => b.pontos - a.pontos || b.seguidores - a.seguidores || a.perfil.displayName.localeCompare(b.perfil.displayName, 'pt-BR'))
    .map(({ perfil, motivo }) => ({ perfil, motivo }));
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
