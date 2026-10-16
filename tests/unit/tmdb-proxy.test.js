// Testes do proxy /api/tmdb: lista branca, validação e parâmetros forçados.
import { describe, expect, it } from 'vitest';
import { ErroValidacao, montarRequisicao } from '../../api/tmdb.js';

const CHAVE_V3 = 'abc123chavev3';

// Atalho: monta e devolve a URL já como objeto URL
const montar = (query, chave = CHAVE_V3) => new URL(montarRequisicao(query, chave).url);

describe('montarRequisicao — rotas permitidas', () => {
  it('aceita busca multi e força pt-BR, BR e sem conteúdo adulto', () => {
    const url = montar({ path: '/search/multi', query: 'frieren', page: '2' });
    expect(url.pathname).toBe('/3/search/multi');
    expect(url.searchParams.get('query')).toBe('frieren');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('language')).toBe('pt-BR');
    expect(url.searchParams.get('region')).toBe('BR');
    expect(url.searchParams.get('include_adult')).toBe('false');
    expect(url.searchParams.get('api_key')).toBe(CHAVE_V3);
  });

  it('aceita detalhes com append_to_response permitido', () => {
    const url = montar({ path: '/tv/209867', append_to_response: 'credits,videos,recommendations,similar' });
    expect(url.pathname).toBe('/3/tv/209867');
    expect(url.searchParams.get('append_to_response')).toBe('credits,videos,recommendations,similar');
  });

  it('aceita watch/providers, trending, discover e genre', () => {
    expect(() => montar({ path: '/movie/603/watch/providers' })).not.toThrow();
    expect(() => montar({ path: '/trending/all/week' })).not.toThrow();
    expect(() => montar({ path: '/genre/tv/list' })).not.toThrow();
    const url = montar({ path: '/discover/tv', with_genres: '16', with_original_language: 'ja' });
    expect(url.searchParams.get('watch_region')).toBe('BR');
  });

  it('usa header Bearer quando a chave é token v4 (JWT)', () => {
    const { url, headers } = montarRequisicao({ path: '/trending/all/week' }, 'eyJhbGciOi.token.v4');
    expect(headers.authorization).toBe('Bearer eyJhbGciOi.token.v4');
    expect(new URL(url).searchParams.has('api_key')).toBe(false);
  });

  it('o cliente não consegue sobrescrever language/region', () => {
    expect(() => montar({ path: '/search/multi', query: 'x', language: 'en-US' })).toThrow(ErroValidacao);
  });
});

describe('montarRequisicao — bloqueios', () => {
  it.each([
    ['sem path', {}],
    ['endpoint fora da lista', { path: '/account' }],
    ['path traversal', { path: '/movie/603/../../account' }],
    ['id não numérico', { path: '/movie/abc' }],
    ['busca sem query', { path: '/search/multi' }],
    ['query vazia', { path: '/search/multi', query: '   ' }],
    ['query longa demais', { path: '/search/multi', query: 'a'.repeat(101) }],
    ['página zero', { path: '/trending/all/week', page: '0' }],
    ['página acima de 500', { path: '/trending/all/week', page: '501' }],
    ['parâmetro repetido (array)', { path: '/trending/all/week', page: ['1', '2'] }],
    ['append não permitido', { path: '/movie/603', append_to_response: 'account_states' }],
    ['parâmetro desconhecido', { path: '/movie/603', api_key: 'roubada' }],
    ['sort_by fora da lista', { path: '/discover/movie', sort_by: 'revenue.desc' }],
    ['gênero com texto', { path: '/discover/movie', with_genres: '16;drop' }],
  ])('recusa: %s', (_nome, query) => {
    expect(() => montarRequisicao(query, CHAVE_V3)).toThrow(ErroValidacao);
  });
});
