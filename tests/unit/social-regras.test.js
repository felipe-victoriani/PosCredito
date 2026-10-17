// Testes das regras puras sociais (public/js/social-regras.js).
import { describe, expect, it } from 'vitest';
import {
  agruparConversas,
  contarNaoLidas,
  descreverAviso,
  filtrarPorTipo,
  idNotificacao,
  mesclarPorData,
  montarComentario,
  montarCurtida,
  montarExclusaoComentario,
  montarSeguir,
  ordenarEmAlta,
  rotuloContador,
  sugerirPessoas,
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

  it('curtida avisa a dona (e tira o aviso ao descurtir), mas não a si mesma', () => {
    expect(montarCurtida({ uid: 'a', reviewId: 'r', curtir: true, donoReview: 'd', carimbo: 1 })['notifications/d/like~r~a']).toEqual({
      type: 'like',
      fromUid: 'a',
      reviewId: 'r',
      createdAt: 1,
    });
    expect(montarCurtida({ uid: 'a', reviewId: 'r', curtir: false, likeCountAtual: 1, donoReview: 'd' })['notifications/d/like~r~a']).toBeNull();
    expect(Object.keys(montarCurtida({ uid: 'd', reviewId: 'r', curtir: true, donoReview: 'd' }))).toHaveLength(2);
  });

  it('comentário avisa a dona; resposta avisa quem foi respondido', () => {
    expect(montarComentario({ uid: 'a', reviewId: 'r', commentId: 'c', texto: 'Oi', carimbo: 1, donoReview: 'd' })).toHaveProperty('notifications/d/comment~r~c');
    const resposta = montarComentario({
      uid: 'a',
      reviewId: 'r',
      commentId: 'c2',
      texto: 'Oi',
      carimbo: 1,
      donoReview: 'd',
      resposta: { parentId: 'c', replyToId: 'c', replyToUid: 'b' },
    });
    expect(resposta['comments/r/c2']).toMatchObject({ parentId: 'c', replyToId: 'c' });
    expect(resposta).toHaveProperty('notifications/b/reply~r~c2');
    expect(resposta).toHaveProperty('notifications/d/comment~r~c2');
  });

  it('dona respondida recebe só um aviso; responder a si mesma não avisa', () => {
    const paraDona = montarComentario({ uid: 'a', reviewId: 'r', commentId: 'c2', texto: 'Oi', donoReview: 'd', resposta: { parentId: 'c', replyToId: 'c', replyToUid: 'd' } });
    expect(Object.keys(paraDona).filter((k) => k.startsWith('notifications/'))).toEqual(['notifications/d/reply~r~c2']);
    const propria = montarComentario({ uid: 'a', reviewId: 'r', commentId: 'c2', texto: 'Oi', donoReview: 'a', resposta: { parentId: 'c', replyToId: 'c', replyToUid: 'a' } });
    expect(Object.keys(propria).some((k) => k.startsWith('notifications/'))).toBe(false);
  });

  it('exclusão tira só os avisos que quem apaga pode tirar', () => {
    const base = { reviewId: 'r', commentId: 'c', autorComentario: 'a', donoReview: 'd', respondido: 'b' };
    // Quem escreveu: tira os dois avisos que gerou
    expect(montarExclusaoComentario({ ...base, quem: 'a' })).toMatchObject({ 'notifications/b/reply~r~c': null, 'notifications/d/comment~r~c': null });
    // A dona: só o da própria caixa
    const pelaDona = montarExclusaoComentario({ ...base, quem: 'd' });
    expect(pelaDona).toHaveProperty('notifications/d/comment~r~c', null);
    expect(pelaDona).not.toHaveProperty('notifications/b/reply~r~c');
  });

  it('valida comentário', () => {
    expect(validarComentario('  ')).toMatch(/Escreva/);
    expect(validarComentario('x'.repeat(501))).toMatch(/500/);
    expect(validarComentario('Concordo!')).toBeNull();
  });
});

describe('conversas e avisos', () => {
  const c = (id, createdAt, parentId) => ({ comentario: { id, createdAt, parentId } });

  it('agrupa respostas embaixo da raiz, em ordem de data', () => {
    const conversas = agruparConversas([c('r2', 4, 'a'), c('b', 2), c('a', 1), c('r1', 3, 'a')]);
    expect(conversas.map((cv) => [cv.item.comentario.id, cv.respostas.map((r) => r.comentario.id)])).toEqual([
      ['a', ['r1', 'r2']],
      ['b', []],
    ]);
  });

  it('resposta com raiz apagada vira raiz', () => {
    expect(agruparConversas([c('r1', 3, 'sumiu')]).map((cv) => cv.item.comentario.id)).toEqual(['r1']);
  });

  it('conta avisos depois da última visita', () => {
    const avisos = [{ createdAt: 5 }, { createdAt: 10 }, { createdAt: 20 }];
    expect(contarNaoLidas(avisos, 10)).toBe(1);
    expect(contarNaoLidas(avisos, null)).toBe(3);
  });

  it('descreve cada tipo de aviso (com e sem título)', () => {
    expect(descreverAviso('like', 'Frieren')).toBe('curtiu sua review de Frieren.');
    expect(descreverAviso('comment', 'Frieren')).toBe('comentou na sua review de Frieren:');
    expect(descreverAviso('reply', null)).toBe('respondeu seu comentário:');
  });

  it('contador do sino vira "9+" no limite', () => {
    expect(rotuloContador(3)).toBe('3');
    expect(rotuloContador(10)).toBe('9+');
  });

  it('id do aviso é fixo por tipo, review e autor/comentário', () => {
    expect(idNotificacao('like', 'u_movie_1', 'x')).toBe('like~u_movie_1~x');
  });
});

describe('sugestões de pessoas', () => {
  const p = (uid, extras = {}) => ({ uid, displayName: uid, username: uid, stats: { followers: 0 }, ...extras });
  const base = {
    meuUid: 'eu',
    seguidos: new Set(['seguido']),
    bloqueados: new Set(['chato']),
    meusSeguidores: new Set(),
    meusInteresses: { generos: { terror: true, drama: true }, tipos: { anime: true } },
    ativos: new Set(),
    rotulos: { terror: 'Terror', drama: 'Drama', anime: 'Animes' },
  };

  it('tira a própria pessoa, quem ela segue, bloqueados e repetidos', () => {
    const perfis = [p('eu'), p('seguido'), p('chato'), p('ana'), p('ana')];
    expect(sugerirPessoas({ ...base, perfis }).map((s) => s.perfil.uid)).toEqual(['ana']);
  });

  it('ordem: segue você > gostos em comum > ativo > mais seguidos', () => {
    const perfis = [
      p('popular', { stats: { followers: 40 } }),
      p('ativo'),
      p('gosto', { interests: { generos: { terror: true } } }),
      p('fa'),
    ];
    const resultado = sugerirPessoas({ ...base, perfis, meusSeguidores: new Set(['fa']), ativos: new Set(['ativo']) });
    expect(resultado.map((s) => s.perfil.uid)).toEqual(['fa', 'gosto', 'ativo', 'popular']);
    expect(resultado.map((s) => s.motivo)).toEqual(['Segue você', 'Também curte Terror', 'Publicou há pouco', '40 seguidores']);
  });

  it('motivo junta até dois interesses em comum', () => {
    const perfis = [p('ana', { interests: { generos: { terror: true, drama: true }, tipos: { anime: true } } })];
    expect(sugerirPessoas({ ...base, perfis })[0].motivo).toBe('Também curte Terror e Drama');
  });

  it('sem login: ninguém excluído além de bloqueio vazio; ordena por seguidores', () => {
    const perfis = [p('a'), p('b', { stats: { followers: 3 } })];
    const resultado = sugerirPessoas({ ...base, perfis, meuUid: null, seguidos: new Set(), bloqueados: new Set(), meusInteresses: null });
    expect(resultado.map((s) => [s.perfil.uid, s.motivo])).toEqual([
      ['b', '3 seguidores'],
      ['a', 'Novo por aqui'],
    ]);
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
