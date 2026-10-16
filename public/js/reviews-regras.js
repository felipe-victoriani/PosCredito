// =====================================================================
// reviews-regras.js — regras puras de reviews e listas (sem Firebase/DOM)
// ---------------------------------------------------------------------
// Espelham database.rules.json: aqui para responder rápido na tela,
// lá para proteger de verdade.
// =====================================================================

import { anoDe, classificarTipo, criarMediaKey, tituloDe } from './tmdb.js';

// Limites (iguais aos das Security Rules)
export const LIMITES_REVIEW = { TEXTO_MAX: 2000, COMENTARIO_MAX: 500 };

// Status possíveis e como aparecem na tela
export const STATUS = ['assisti', 'reassisti', 'abandonei'];
export const ROTULO_STATUS = { assisti: 'Assisti', reassisti: 'Reassisti', abandonei: 'Abandonei' };

// Listas pessoais e seus nomes na tela
export const LISTAS = ['watchlist', 'watched', 'favorites'];
export const ROTULO_LISTA = { watchlist: 'Quero ver', watched: 'Já vi', favorites: 'Favoritos' };

/** Id da review: uma por pessoa por título ("uid_movie_603"). */
export function idReview(uid, mediaKey) {
  return `${uid}_${mediaKey}`;
}

/** Nota válida: de 0,5 a 5, em passos de meia estrela. */
export function notaValida(nota) {
  return typeof nota === 'number' && nota >= 0.5 && nota <= 5 && Number.isInteger(nota * 2);
}

/**
 * Valida o que a pessoa preencheu no editor.
 * @returns {string|null} mensagem de erro ou null
 */
export function validarReview({ rating, text = '', status, spoiler }) {
  if (!notaValida(rating)) return 'Toque nas estrelas para dar uma nota.';
  if (!STATUS.includes(status)) return 'Conta como foi: assisti, reassisti ou abandonei.';
  if (typeof text !== 'string' || text.length > LIMITES_REVIEW.TEXTO_MAX) {
    return `A review pode ter até ${LIMITES_REVIEW.TEXTO_MAX} caracteres.`;
  }
  if (typeof spoiler !== 'boolean') return 'Marque se a review contém spoiler.';
  return null;
}

/**
 * Nova soma/contagem de notas do título depois de criar, editar ou
 * excluir uma review. notaAntiga/notaNova = null quando não existe.
 */
export function recalcularEstatistica(atual, notaAntiga, notaNova) {
  const soma = atual?.ratingSum ?? 0;
  const contagem = atual?.ratingCount ?? 0;
  return {
    ratingSum: soma - (notaAntiga ?? 0) + (notaNova ?? 0),
    ratingCount: contagem - (notaAntiga == null ? 0 : 1) + (notaNova == null ? 0 : 1),
  };
}

/** Média da comunidade com 1 casa (ou null sem notas). */
export function mediaComunidade(estatistica) {
  const contagem = estatistica?.ratingCount ?? 0;
  if (contagem <= 0) return null;
  return Math.round((estatistica.ratingSum / contagem) * 10) / 10;
}

/** Nota no formato brasileiro: 4.5 → "4,5"; 5 → "5". */
export function formatarNota(nota) {
  return nota.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/** "agora", "5 min", "2h", "3d", "12 de mar." ou "12 de mar. de 2024". */
export function tempoRelativo(timestamp, agora = Date.now()) {
  const segundos = Math.max(0, Math.floor((agora - timestamp) / 1000));
  if (segundos < 60) return 'agora';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return `${dias}d`;

  const data = new Date(timestamp);
  const mesmoAno = data.getFullYear() === new Date(agora).getFullYear();
  return data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', ...(mesmoAno ? {} : { year: 'numeric' }) });
}

/**
 * Dados do título copiados para a review e para as listas, para o perfil
 * e o feed não precisarem chamar o TMDB a cada item.
 */
export function metadadosTitulo(detalhes, mediaType) {
  const meta = {
    mediaKey: criarMediaKey(mediaType, detalhes.id),
    mediaType,
    title: tituloDe(detalhes).slice(0, 200),
    tipo: classificarTipo(detalhes, mediaType),
  };
  // Campos opcionais só entram se forem válidos (o banco recusa o resto)
  if (/^\/[A-Za-z0-9_.-]{1,63}$/.test(detalhes.poster_path ?? '')) meta.posterPath = detalhes.poster_path;
  const ano = anoDe(detalhes);
  if (ano) meta.year = ano;
  return meta;
}

// ---------- Montagem das escritas multi-path ----------
// Funções puras: recebem o estado atual (lido antes) e devolvem o mapa
// { caminho: valor } para update(ref(db), mapa). "carimbo" é o
// serverTimestamp() do SDK em uso (o app e os testes passam o seu).

/** Item de lista a partir dos metadados do título. */
export function itemDeLista(meta, carimbo) {
  const item = { addedAt: carimbo, title: meta.title, tipo: meta.tipo };
  if (meta.posterPath) item.posterPath = meta.posterPath;
  if (meta.year) item.year = meta.year;
  return item;
}

/**
 * Criar ou editar a review. Ao criar: índices + contador de reviews.
 * Se não abandonou e ainda não estava em "Já vi": entra em "Já vi"
 * (e sai de "Quero ver").
 * @param {{uid: string, meta: object, dados: {rating:number, text:string, spoiler:boolean, status:string},
 *   existente: object|null, statsTitulo: object|null, statsUsuario: object,
 *   jaVisto: boolean, naWatchlist: boolean, carimbo: unknown}} p
 */
export function montarEscritaReview({ uid, meta, dados, existente, statsTitulo, statsUsuario, jaVisto, naWatchlist, carimbo }) {
  const id = idReview(uid, meta.mediaKey);
  const review = {
    uid,
    mediaKey: meta.mediaKey,
    mediaType: meta.mediaType,
    title: meta.title,
    tipo: meta.tipo,
    rating: dados.rating,
    status: dados.status,
    spoiler: dados.spoiler,
    text: dados.text,
    createdAt: existente ? existente.createdAt : carimbo,
    updatedAt: carimbo,
    likeCount: existente?.likeCount ?? 0,
    commentCount: existente?.commentCount ?? 0,
  };
  if (meta.posterPath) review.posterPath = meta.posterPath;
  if (meta.year) review.year = meta.year;

  const mapa = {
    [`reviews/${id}`]: review,
    [`titleStats/${meta.mediaKey}`]: recalcularEstatistica(statsTitulo, existente?.rating ?? null, dados.rating),
  };

  // Primeira review deste título: índices + contador do perfil
  if (!existente) {
    mapa[`titleReviews/${meta.mediaKey}/${id}`] = carimbo;
    mapa[`userReviews/${uid}/${id}`] = carimbo;
    mapa[`users/${uid}/stats/reviews`] = (statsUsuario?.reviews ?? 0) + 1;
  }

  // Assistiu (ou reassistiu): marca como visto automaticamente
  if (dados.status !== 'abandonei' && !jaVisto) {
    mapa[`lists/${uid}/watched/${meta.mediaKey}`] = itemDeLista(meta, carimbo);
    mapa[`users/${uid}/stats/watched`] = (statsUsuario?.watched ?? 0) + 1;
    if (naWatchlist) mapa[`lists/${uid}/watchlist/${meta.mediaKey}`] = null;
  }
  return mapa;
}

/** Excluir a review: remove índices e desconta a nota do título. */
export function montarExclusaoReview({ uid, existente, statsTitulo, statsUsuario }) {
  const id = idReview(uid, existente.mediaKey);
  return {
    [`reviews/${id}`]: null,
    [`titleReviews/${existente.mediaKey}/${id}`]: null,
    [`userReviews/${uid}/${id}`]: null,
    [`titleStats/${existente.mediaKey}`]: recalcularEstatistica(statsTitulo, existente.rating, null),
    [`users/${uid}/stats/reviews`]: Math.max(0, (statsUsuario?.reviews ?? 0) - 1),
  };
}

/**
 * Adicionar/remover um título de uma lista. "Já vi" mexe no contador
 * "Vistos" e, ao adicionar, tira o título de "Quero ver".
 */
export function montarEscritaLista({ uid, lista, meta, adicionar, statsUsuario, naWatchlist, carimbo }) {
  const mapa = { [`lists/${uid}/${lista}/${meta.mediaKey}`]: adicionar ? itemDeLista(meta, carimbo) : null };
  if (lista === 'watched') {
    const vistos = statsUsuario?.watched ?? 0;
    mapa[`users/${uid}/stats/watched`] = adicionar ? vistos + 1 : Math.max(0, vistos - 1);
    if (adicionar && naWatchlist) mapa[`lists/${uid}/watchlist/${meta.mediaKey}`] = null;
  }
  return mapa;
}

/**
 * Destino seguro depois do login (evita redirecionar para outro site).
 * Aceita só páginas do próprio app, ex.: "titulo.html?id=movie_603&avaliar=1".
 */
export function destinoSeguro(valor) {
  return /^[a-z]+\.html(\?[A-Za-z0-9_=&%.-]*)?(#[a-z]+)?$/.test(valor ?? '') ? valor : null;
}
