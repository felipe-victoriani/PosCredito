// =====================================================================
// tmdb.js — cliente do proxy /api/tmdb + funções puras de catálogo
// ---------------------------------------------------------------------
// Nada aqui toca no DOM: as funções puras são testadas com Vitest.
// =====================================================================

// ---------- Constantes de catálogo ----------

// Base das imagens do TMDB e tamanhos que o app usa
const IMAGEM_BASE = 'https://image.tmdb.org/t/p/';
const TAMANHOS_IMAGEM = ['w92', 'w185', 'w342', 'w780'];

// IDs de gênero do TMDB usados na classificação
export const GENERO = {
  ANIMACAO: 16,
  DOCUMENTARIO: 99,
  NOTICIAS: 10763,
  REALITY: 10764,
  TALK_SHOW: 10767,
};

// Idiomas originais considerados "dorama" ("cn" = cantonês no TMDB)
const IDIOMAS_DORAMA = ['ko', 'zh', 'cn', 'ja'];

// Gêneros de TV que não são dorama mesmo sendo asiáticos (reality, talk show…)
const GENEROS_NAO_DORAMA = [GENERO.ANIMACAO, GENERO.DOCUMENTARIO, GENERO.NOTICIAS, GENERO.REALITY, GENERO.TALK_SHOW];

// Rótulos exibidos na interface para cada tipo
export const ROTULO_TIPO = { filme: 'Filme', serie: 'Série', anime: 'Anime', dorama: 'Dorama' };
export const ROTULO_TIPO_PLURAL = { filme: 'Filmes', serie: 'Séries', anime: 'Animes', dorama: 'Doramas' };

// ---------- Funções puras ----------

/**
 * Classifica um item do TMDB em filme, série, anime ou dorama.
 * anime  = gênero Animação (16) + idioma original "ja" (filme ou série)
 * dorama = série com idioma ko/zh/cn/ja que não seja animação/reality/doc
 * @param {object} item - resultado do TMDB (lista ou detalhes)
 * @param {'movie'|'tv'} [mediaType] - quando o item não traz media_type
 */
export function classificarTipo(item, mediaType = item?.media_type) {
  // Listas trazem genre_ids; a página de detalhes traz genres [{id,name}]
  const generos = item?.genre_ids ?? item?.genres?.map((g) => g.id) ?? [];
  const idioma = item?.original_language;

  if (generos.includes(GENERO.ANIMACAO) && idioma === 'ja') return 'anime';
  if (
    mediaType === 'tv' &&
    IDIOMAS_DORAMA.includes(idioma) &&
    !generos.some((g) => GENEROS_NAO_DORAMA.includes(g))
  ) {
    return 'dorama';
  }
  return mediaType === 'movie' ? 'filme' : 'serie';
}

/** Monta a chave interna do título: "movie_603", "tv_1396". */
export function criarMediaKey(mediaType, id) {
  return `${mediaType}_${id}`;
}

/**
 * Lê uma chave interna vinda da URL. Retorna null se for inválida,
 * para nunca montar caminho de API com entrada não validada.
 */
export function lerMediaKey(chave) {
  const partes = /^(movie|tv)_(\d{1,9})$/.exec(chave ?? '');
  return partes ? { mediaType: partes[1], id: Number(partes[2]) } : null;
}

/** URL de imagem do TMDB, ou null quando não há caminho. */
export function urlImagem(caminho, tamanho = 'w342') {
  if (!caminho || !TAMANHOS_IMAGEM.includes(tamanho)) return null;
  return `${IMAGEM_BASE}${tamanho}${caminho}`;
}

/** Título em português (filme usa "title", série usa "name"). */
export function tituloDe(item) {
  return item?.title ?? item?.name ?? 'Sem título';
}

/** Título original, só quando difere do título exibido. */
export function tituloOriginalDe(item) {
  const original = item?.original_title ?? item?.original_name;
  return original && original !== tituloDe(item) ? original : null;
}

/** Ano de lançamento (filme) ou de estreia (série), ou null. */
export function anoDe(item) {
  const data = item?.release_date || item?.first_air_date || '';
  return /^\d{4}/.test(data) ? data.slice(0, 4) : null;
}

/** Remove da busca multi tudo que não for filme ou série (ex.: pessoas). */
export function filtrarFilmesESeries(resultados = []) {
  return resultados.filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
}

/** Converte minutos em "2h 46min". */
export function formatarDuracao(minutos) {
  if (!minutos || minutos <= 0) return null;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h ${m}min` : `${h}h`;
}

// Ordem de exibição das formas de assistir (assinatura primeiro)
const CATEGORIAS_PROVEDOR = [
  ['flatrate', 'Assinatura'],
  ['free', 'Grátis'],
  ['ads', 'Grátis com anúncios'],
  ['rent', 'Aluguel'],
  ['buy', 'Compra'],
];

/**
 * Junta os provedores de results.BR em uma lista sem repetição.
 * Um mesmo serviço em "aluguel" e "compra" vira um item só com as
 * duas categorias. A ordem segue a categoria mais acessível e,
 * dentro dela, a prioridade do próprio TMDB/JustWatch.
 * @param {object|undefined} dadosBR - resposta.results.BR
 * @returns {{id:number, nome:string, logo:string|null, categorias:string[]}[]}
 */
export function consolidarProvedores(dadosBR) {
  if (!dadosBR) return [];
  const porId = new Map();

  CATEGORIAS_PROVEDOR.forEach(([chave, rotulo], ordemCategoria) => {
    const lista = [...(dadosBR[chave] ?? [])].sort((a, b) => a.display_priority - b.display_priority);
    for (const p of lista) {
      const existente = porId.get(p.provider_id);
      if (existente) {
        if (!existente.categorias.includes(rotulo)) existente.categorias.push(rotulo);
        continue;
      }
      porId.set(p.provider_id, {
        id: p.provider_id,
        nome: p.provider_name,
        logo: p.logo_path ?? null,
        categorias: [rotulo],
        ordem: ordemCategoria * 1000 + (p.display_priority ?? 999),
      });
    }
  });

  // Ordena e remove o campo auxiliar de ordenação
  return [...porId.values()].sort((a, b) => a.ordem - b.ordem).map(({ ordem, ...resto }) => resto);
}

/**
 * Escolhe o melhor trailer do YouTube: português > oficial > inglês.
 * Retorna só a chave do vídeo (validada), ou null.
 */
export function escolherTrailer(videos = []) {
  const candidatos = videos.filter(
    (v) => v.site === 'YouTube' && ['Trailer', 'Teaser'].includes(v.type) && /^[\w-]{11}$/.test(v.key ?? ''),
  );
  const pontuar = (v) =>
    (v.iso_639_1 === 'pt' ? 100 : v.iso_639_1 === 'en' ? 10 : 0) +
    (v.type === 'Trailer' ? 5 : 0) +
    (v.official ? 3 : 0);
  candidatos.sort((a, b) => pontuar(b) - pontuar(a));
  return candidatos[0]?.key ?? null;
}

// ---------- Cliente HTTP do proxy ----------

// Erro com status HTTP, para a UI escolher a mensagem certa
export class ErroCatalogo extends Error {
  constructor(status) {
    super(`Falha no catálogo (${status})`);
    this.status = status;
  }
}

// Cache em memória por URL (dura enquanto a página estiver aberta)
const cacheMemoria = new Map();

/**
 * GET no proxy /api/tmdb. Requisições iguais reaproveitam a mesma promessa.
 * @param {string} caminho - ex.: "/movie/603"
 * @param {Record<string, string|number>} [params]
 */
export function tmdbGet(caminho, params = {}) {
  const busca = new URLSearchParams({ path: caminho });
  for (const [nome, valor] of Object.entries(params)) busca.set(nome, String(valor));
  const url = `/api/tmdb?${busca}`;

  if (cacheMemoria.has(url)) return cacheMemoria.get(url);

  const promessa = (async () => {
    const resposta = await fetch(url, { headers: { accept: 'application/json' } });
    if (!resposta.ok) throw new ErroCatalogo(resposta.status);
    return resposta.json();
  })();

  // Falhou? Tira do cache para permitir nova tentativa
  cacheMemoria.set(url, promessa);
  promessa.catch(() => cacheMemoria.delete(url));
  return promessa;
}

// ---------- Atalhos usados pelas páginas ----------

/** Busca filmes e séries (página 1..n). */
export async function buscarTitulos(texto, pagina = 1) {
  const dados = await tmdbGet('/search/multi', { query: texto, page: pagina });
  return { ...dados, results: filtrarFilmesESeries(dados.results) };
}

/** Detalhes completos com elenco, vídeos e semelhantes. */
export function buscarDetalhes(mediaType, id) {
  return tmdbGet(`/${mediaType}/${id}`, {
    append_to_response: 'credits,videos,similar',
    include_video_language: 'pt,en,null',
  });
}

/** Onde assistir no Brasil (só results.BR). */
export async function buscarProvedores(mediaType, id) {
  const dados = await tmdbGet(`/${mediaType}/${id}/watch/providers`);
  return dados.results?.BR ?? null;
}
