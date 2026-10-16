// Testes das regras puras sociais (public/js/social-regras.js).
import { describe, expect, it } from 'vitest';
import {
  filtrarPorTipo,
  mesclarPorData,
  montarComentario,
  montarCurtida,
  montarExclusaoComentario,
  montarSeguir,
  ordenarEmAlta,
  validarComentario,
} from '../../public/js/social-regras.js';

const item = (id, createdAt, extras = {}) => ({ review: { id, createdAt, tipo: 'filme', likeCount: 0, ...extras }, autor: null });

describe('montagem das escritas', () => {
  it('seguir e deixar de seguir mexem nos dois lados e contadores', () => {
    expect(montarSeguir({ uid: 'a', alvo: 'b', seguir: true, seguindoAtual: 2, seguidoresAlvoAtual: 9 })).toEqual({
      'follows/a/b': true,
      'followers/b/a': true,
      'users/a/stats/following': 3,
      'users/b/stats/followers': 10,
    });
    expect(montarSeguir({ uid: 'a', alvo: 'b', seguir: false, seguindoAtual: 0, seguidoresAlvoAtual: 0 })).toMatchObject({
      'follows/a/b': null,
      'users/a/stats/following': 0,
    });
  });

  it('curtida e comentário', () => {
    expect(montarCurtida({ uid: 'a', reviewId: 'r', curtir: true, likeCountAtual: 4 })).toEqual({ 'likes/r/a': true, 'reviews/r/likeCount': 5 });
    expect(montarComentario({ uid: 'a', reviewId: 'r', commentId: 'c', texto: 'Oi', commentCountAtual: 1, carimbo: 123 })).toEqual({
      'comments/r/c': { uid: 'a', text: 'Oi', createdAt: 123 },
      'reviews/r/commentCount': 2,
    });
    expect(montarExclusaoComentario({ reviewId: 'r', commentId: 'c', commentCountAtual: 0 })['reviews/r/commentCount']).toBe(0);
  });

  it('valida comentário', () => {
    expect(validarComentario('  ')).toMatch(/Escreva/);
    expect(validarComentario('x'.repeat(501))).toMatch(/500/);
    expect(validarComentario('Concordo!')).toBeNull();
  });
});

describe('feed', () => {
  it('filtra por tipo', () => {
    const itens = [item('1', 1), item('2', 2, { tipo: 'anime' })];
    expect(filtrarPorTipo(itens, 'tudo')).toHaveLength(2);
    expect(filtrarPorTipo(itens, 'anime').map((i) => i.review.id)).toEqual(['2']);
  });

  it('em alta: mais curtidas primeiro, empate pela mais nova', () => {
    const itens = [item('a', 1, { likeCount: 2 }), item('b', 3, { likeCount: 2 }), item('c', 2, { likeCount: 9 })];
    expect(ordenarEmAlta(itens).map((i) => i.review.id)).toEqual(['c', 'b', 'a']);
  });

  it('seguindo: mescla por data sem repetir e respeita o limite', () => {
    const listas = [[item('a', 1), item('b', 5)], [item('c', 3), item('b', 5)]];
    expect(mesclarPorData(listas, 2).map((i) => i.review.id)).toEqual(['b', 'c']);
  });
});
