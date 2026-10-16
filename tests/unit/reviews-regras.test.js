// Testes das regras puras de reviews (public/js/reviews-regras.js).
import { describe, expect, it } from 'vitest';
import {
  destinoSeguro,
  formatarNota,
  idReview,
  mediaComunidade,
  metadadosTitulo,
  notaValida,
  recalcularEstatistica,
  tempoRelativo,
  validarReview,
} from '../../public/js/reviews-regras.js';

describe('notas', () => {
  it('aceita de 0,5 a 5 em meias estrelas', () => {
    for (const n of [0.5, 1, 2.5, 4.5, 5]) expect(notaValida(n)).toBe(true);
  });

  it.each([0, 0.25, 5.5, 3.3, '4', null, Number.NaN])('recusa %s', (n) => {
    expect(notaValida(n)).toBe(false);
  });

  it('formata no padrão brasileiro', () => {
    expect(formatarNota(4.5)).toBe('4,5');
    expect(formatarNota(5)).toBe('5');
    expect(formatarNota(4.8)).toBe('4,8');
  });
});

describe('validarReview', () => {
  const valida = { rating: 4.5, text: '', status: 'assisti', spoiler: false };

  it('aceita review só com nota', () => {
    expect(validarReview(valida)).toBeNull();
  });

  it('recusa sem nota, status desconhecido ou texto longo', () => {
    expect(validarReview({ ...valida, rating: 0 })).toMatch(/nota/);
    expect(validarReview({ ...valida, status: 'dormi' })).toMatch(/assisti/);
    expect(validarReview({ ...valida, text: 'x'.repeat(2001) })).toMatch(/2000/);
  });
});

describe('estatística do título', () => {
  it('criar, editar e excluir mantêm soma e contagem corretas', () => {
    let s = recalcularEstatistica(null, null, 4); // primeira review
    expect(s).toEqual({ ratingSum: 4, ratingCount: 1 });
    s = recalcularEstatistica(s, null, 5); // outra pessoa
    expect(s).toEqual({ ratingSum: 9, ratingCount: 2 });
    s = recalcularEstatistica(s, 4, 3.5); // primeira pessoa edita
    expect(s).toEqual({ ratingSum: 8.5, ratingCount: 2 });
    s = recalcularEstatistica(s, 5, null); // segunda exclui
    expect(s).toEqual({ ratingSum: 3.5, ratingCount: 1 });
  });

  it('média com uma casa decimal', () => {
    expect(mediaComunidade({ ratingSum: 14.5, ratingCount: 3 })).toBe(4.8);
    expect(mediaComunidade({ ratingSum: 0, ratingCount: 0 })).toBeNull();
    expect(mediaComunidade(null)).toBeNull();
  });
});

describe('helpers', () => {
  it('idReview', () => {
    expect(idReview('abc', 'movie_603')).toBe('abc_movie_603');
  });

  it('tempoRelativo', () => {
    const agora = new Date('2026-10-15T12:00:00Z').getTime();
    expect(tempoRelativo(agora - 10_000, agora)).toBe('agora');
    expect(tempoRelativo(agora - 5 * 60_000, agora)).toBe('5 min');
    expect(tempoRelativo(agora - 2 * 3_600_000, agora)).toBe('2h');
    expect(tempoRelativo(agora - 3 * 86_400_000, agora)).toBe('3d');
    expect(tempoRelativo(new Date('2024-03-12T12:00:00Z').getTime(), agora)).toMatch(/2024/);
  });

  it('metadadosTitulo copia só campos válidos', () => {
    const meta = metadadosTitulo(
      { id: 209867, name: 'Frieren', genres: [{ id: 16 }], original_language: 'ja', first_air_date: '2023-09-29', poster_path: '/abc.jpg' },
      'tv',
    );
    expect(meta).toEqual({ mediaKey: 'tv_209867', mediaType: 'tv', title: 'Frieren', tipo: 'anime', posterPath: '/abc.jpg', year: '2023' });
    expect(metadadosTitulo({ id: 1, title: 'X', poster_path: '/../hack' }, 'movie').posterPath).toBeUndefined();
  });

  it('destinoSeguro só aceita páginas do próprio app', () => {
    expect(destinoSeguro('titulo.html?id=movie_603&avaliar=1')).toBe('titulo.html?id=movie_603&avaliar=1');
    expect(destinoSeguro('perfil.html#listas')).toBe('perfil.html#listas');
    expect(destinoSeguro('https://malicioso.com')).toBeNull();
    expect(destinoSeguro('//malicioso.com/a.html')).toBeNull();
    expect(destinoSeguro('javascript:alert(1)')).toBeNull();
    expect(destinoSeguro(null)).toBeNull();
  });
});
