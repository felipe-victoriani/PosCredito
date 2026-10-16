// Respostas falsas do TMDB usadas nos testes E2E.
// Ficam fixas para os testes não dependerem de rede nem da chave.

export const BUSCA_FRIEREN = {
  page: 1,
  total_pages: 1,
  results: [
    {
      id: 209867,
      media_type: 'tv',
      name: 'Frieren e a Jornada para o Além',
      original_name: '葬送のフリーレン',
      original_language: 'ja',
      genre_ids: [16, 10759, 10765],
      first_air_date: '2023-09-29',
      poster_path: null,
    },
    {
      id: 999001,
      media_type: 'movie',
      title: 'Frieren: Especial de Natal',
      original_title: 'Frieren: Especial de Natal',
      original_language: 'en',
      genre_ids: [18],
      release_date: '2024-12-24',
      poster_path: null,
    },
    { id: 5, media_type: 'person', name: 'Pessoa que deve sumir' },
  ],
};

export const DETALHES_FRIEREN = {
  id: 209867,
  name: 'Frieren e a Jornada para o Além',
  original_name: '葬送のフリーレン',
  original_language: 'ja',
  first_air_date: '2023-09-29',
  number_of_seasons: 1,
  number_of_episodes: 28,
  genres: [{ id: 16, name: 'Animação' }, { id: 10765, name: 'Sci-Fi & Fantasy' }],
  overview: 'A maga elfa Frieren e seus companheiros derrotaram o Rei Demônio. Agora ela parte em uma nova jornada.',
  poster_path: null,
  backdrop_path: null,
  credits: { cast: [{ id: 1, name: 'Atsumi Tanezaki', character: 'Frieren (voz)', profile_path: null }] },
  videos: { results: [] },
  similar: { results: [] },
};

export const PROVEDORES_FRIEREN = {
  id: 209867,
  results: {
    BR: {
      link: 'https://www.themoviedb.org/tv/209867/watch?locale=BR',
      flatrate: [{ provider_id: 283, provider_name: 'Crunchyroll', logo_path: null, display_priority: 1 }],
    },
  },
};

export const EM_ALTA = {
  page: 1,
  total_pages: 1,
  results: [
    { id: 693134, media_type: 'movie', title: 'Duna: Parte Dois', release_date: '2024-02-28', genre_ids: [878], original_language: 'en', poster_path: null },
    { id: 209867, media_type: 'tv', name: 'Frieren e a Jornada para o Além', first_air_date: '2023-09-29', genre_ids: [16], original_language: 'ja', poster_path: null },
  ],
};

/**
 * Bloqueia imagens do TMDB e Google Fonts: deixa os testes offline e
 * evita que a navegação fique presa esperando rede externa lenta.
 * Por padrão bloqueia também o SDK do Firebase (a busca de pessoas
 * falha rápido e devolve lista vazia, como deve).
 */
export async function bloquearRecursosExternos(page, { permitirFirebase = false } = {}) {
  await page.route(/^https:\/\/(image\.tmdb\.org|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (rota) => rota.abort());
  if (!permitirFirebase) await page.route('https://www.gstatic.com/firebasejs/**', (rota) => rota.abort());
}

/**
 * Intercepta /api/tmdb na página e responde conforme o "path" pedido.
 * Imagens externas são bloqueadas para os testes ficarem offline.
 */
export async function simularTmdb(page, { semProvedores = false, permitirFirebase = false } = {}) {
  await bloquearRecursosExternos(page, { permitirFirebase });
  await page.route('**/api/tmdb?**', (rota) => {
    const caminho = new URL(rota.request().url()).searchParams.get('path');
    const respostas = {
      '/search/multi': BUSCA_FRIEREN,
      '/tv/209867': DETALHES_FRIEREN,
      '/tv/209867/watch/providers': semProvedores ? { id: 209867, results: {} } : PROVEDORES_FRIEREN,
      '/trending/all/week': EM_ALTA,
    };
    const corpo = respostas[caminho];
    return corpo
      ? rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) })
      : rota.fulfill({ status: 404, contentType: 'application/json', body: '{"erro":"Não encontrado"}' });
  });
}
