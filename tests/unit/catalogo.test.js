// Testes das funções puras de catálogo (public/js/tmdb.js).
import { describe, expect, it } from 'vitest';
import {
  anoDe,
  classificarTipo,
  consolidarProvedores,
  criarMediaKey,
  escolherTrailer,
  filtrarFilmesESeries,
  formatarDuracao,
  lerMediaKey,
  tituloOriginalDe,
  urlImagem,
} from '../../public/js/tmdb.js';

describe('classificarTipo', () => {
  it('anime: animação + japonês (série ou filme)', () => {
    expect(classificarTipo({ media_type: 'tv', genre_ids: [16, 10759], original_language: 'ja' })).toBe('anime');
    expect(classificarTipo({ media_type: 'movie', genre_ids: [16], original_language: 'ja' })).toBe('anime');
  });

  it('animação não japonesa continua filme/série', () => {
    expect(classificarTipo({ media_type: 'movie', genre_ids: [16], original_language: 'en' })).toBe('filme');
    expect(classificarTipo({ media_type: 'tv', genre_ids: [16], original_language: 'ko' })).toBe('serie');
  });

  it('dorama: série coreana, chinesa ou japonesa sem animação', () => {
    expect(classificarTipo({ media_type: 'tv', genre_ids: [18], original_language: 'ko' })).toBe('dorama');
    expect(classificarTipo({ media_type: 'tv', genre_ids: [10749], original_language: 'zh' })).toBe('dorama');
    expect(classificarTipo({ media_type: 'tv', genre_ids: [18], original_language: 'ja' })).toBe('dorama');
  });

  it('reality e talk show asiáticos não são dorama', () => {
    expect(classificarTipo({ media_type: 'tv', genre_ids: [10764], original_language: 'ko' })).toBe('serie');
    expect(classificarTipo({ media_type: 'tv', genre_ids: [10767], original_language: 'ja' })).toBe('serie');
  });

  it('filme coreano é filme (dorama é só série)', () => {
    expect(classificarTipo({ media_type: 'movie', genre_ids: [18], original_language: 'ko' })).toBe('filme');
  });

  it('aceita o formato de detalhes (genres) com mediaType explícito', () => {
    expect(classificarTipo({ genres: [{ id: 16, name: 'Animação' }], original_language: 'ja' }, 'tv')).toBe('anime');
  });
});

describe('mediaKey', () => {
  it('cria e lê chaves válidas', () => {
    expect(criarMediaKey('movie', 603)).toBe('movie_603');
    expect(lerMediaKey('tv_1396')).toEqual({ mediaType: 'tv', id: 1396 });
  });

  it.each([null, '', 'person_1', 'movie_', 'movie_12a', 'tv_1/../x', 'movie_1234567890'])('recusa %s', (chave) => {
    expect(lerMediaKey(chave)).toBeNull();
  });
});

describe('helpers de exibição', () => {
  it('urlImagem monta a URL ou devolve null', () => {
    expect(urlImagem('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w342/abc.jpg');
    expect(urlImagem('/abc.jpg', 'w780')).toBe('https://image.tmdb.org/t/p/w780/abc.jpg');
    expect(urlImagem(null)).toBeNull();
    expect(urlImagem('/abc.jpg', 'original')).toBeNull();
  });

  it('anoDe lê filme e série', () => {
    expect(anoDe({ release_date: '2024-02-28' })).toBe('2024');
    expect(anoDe({ first_air_date: '2023-09-29' })).toBe('2023');
    expect(anoDe({ release_date: '' })).toBeNull();
  });

  it('tituloOriginalDe só aparece quando difere', () => {
    expect(tituloOriginalDe({ name: 'Frieren', original_name: '葬送のフリーレン' })).toBe('葬送のフリーレン');
    expect(tituloOriginalDe({ title: 'Duna', original_title: 'Duna' })).toBeNull();
  });

  it('formatarDuracao', () => {
    expect(formatarDuracao(166)).toBe('2h 46min');
    expect(formatarDuracao(120)).toBe('2h');
    expect(formatarDuracao(45)).toBe('45min');
    expect(formatarDuracao(0)).toBeNull();
  });

  it('filtrarFilmesESeries remove pessoas', () => {
    const lista = [{ media_type: 'movie' }, { media_type: 'person' }, { media_type: 'tv' }];
    expect(filtrarFilmesESeries(lista)).toHaveLength(2);
  });
});

describe('consolidarProvedores', () => {
  it('junta categorias do mesmo serviço e ordena assinatura primeiro', () => {
    const br = {
      link: 'https://www.themoviedb.org/movie/693134/watch?locale=BR',
      rent: [{ provider_id: 2, provider_name: 'Apple TV', logo_path: '/a.jpg', display_priority: 4 }],
      buy: [{ provider_id: 2, provider_name: 'Apple TV', logo_path: '/a.jpg', display_priority: 4 }],
      flatrate: [
        { provider_id: 1899, provider_name: 'Max', logo_path: '/m.jpg', display_priority: 8 },
        { provider_id: 8, provider_name: 'Netflix', logo_path: '/n.jpg', display_priority: 1 },
      ],
    };
    expect(consolidarProvedores(br)).toEqual([
      { id: 8, nome: 'Netflix', logo: '/n.jpg', categorias: ['Assinatura'] },
      { id: 1899, nome: 'Max', logo: '/m.jpg', categorias: ['Assinatura'] },
      { id: 2, nome: 'Apple TV', logo: '/a.jpg', categorias: ['Aluguel', 'Compra'] },
    ]);
  });

  it('sem dados do Brasil devolve lista vazia', () => {
    expect(consolidarProvedores(undefined)).toEqual([]);
    expect(consolidarProvedores({ link: 'x' })).toEqual([]);
  });
});

describe('escolherTrailer', () => {
  it('prefere trailer em português', () => {
    const videos = [
      { site: 'YouTube', type: 'Trailer', key: 'ingles00001', iso_639_1: 'en', official: true },
      { site: 'YouTube', type: 'Trailer', key: 'portugues01', iso_639_1: 'pt', official: false },
    ];
    expect(escolherTrailer(videos)).toBe('portugues01');
  });

  it('ignora vídeos fora do YouTube, bastidores e chaves inválidas', () => {
    const videos = [
      { site: 'Vimeo', type: 'Trailer', key: 'vimeo000001' },
      { site: 'YouTube', type: 'Behind the Scenes', key: 'bastidores1' },
      { site: 'YouTube', type: 'Trailer', key: '"><script>' },
    ];
    expect(escolherTrailer(videos)).toBeNull();
  });
});
