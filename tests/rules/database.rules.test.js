// Testes das Security Rules do Realtime Database (emulador local).
// Rodar com: npm run test:rules
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, serverTimestamp, set, update } from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  idReview,
  montarEscritaLista,
  montarEscritaReview,
  montarExclusaoReview,
} from '../../public/js/reviews-regras.js';
import {
  montarComentario,
  montarCurtida,
  montarExclusaoComentario,
  montarSeguir,
} from '../../public/js/social-regras.js';
import { idAlvo, idDenuncia, montarBloqueio, montarDenuncia } from '../../public/js/moderacao-regras.js';

let ambiente;

beforeAll(async () => {
  ambiente = await initializeTestEnvironment({
    projectId: 'demo-poscreditos',
    database: {
      rules: readFileSync('database.rules.json', 'utf8'),
      host: '127.0.0.1',
      port: 9000,
    },
  });
});

beforeEach(() => ambiente.clearDatabase());
afterAll(() => ambiente.cleanup());

// ---------- Ajudantes ----------

/** Banco visto por um usuário logado (ou anônimo se uid for null). */
const dbDe = (uid) => (uid ? ambiente.authenticatedContext(uid) : ambiente.unauthenticatedContext()).database();

/** Perfil válido mínimo. */
function perfil(username, extras = {}) {
  return {
    username,
    displayName: 'Pessoa Teste',
    bio: '',
    createdAt: serverTimestamp(),
    stats: { followers: 0, following: 0, reviews: 0, watched: 0 },
    ...extras,
  };
}

/** Escrita atômica perfil + reserva do @ (igual ao app). */
function criarPerfil(db, uid, username, extras) {
  return update(ref(db), {
    [`users/${uid}`]: perfil(username, extras),
    [`usernames/${username.replaceAll('.', ',')}`]: uid,
  });
}

// ---------- Acesso básico ----------

describe('acesso básico', () => {
  it('nega escrita sem login', async () => {
    await assertFails(criarPerfil(dbDe(null), 'alice', 'alice'));
  });

  it('nega ler a lista inteira de usuários', async () => {
    await assertFails(get(ref(dbDe('alice'), 'users')));
  });

  it('nega nós que não existem nas regras', async () => {
    await assertFails(set(ref(dbDe('alice'), 'qualquer/coisa'), 1));
  });
});

// ---------- Criação de perfil ----------

describe('criação de perfil + @', () => {
  it('cria perfil e reserva o @ juntos', async () => {
    await assertSucceeds(criarPerfil(dbDe('alice'), 'alice', 'marina.cine'));
  });

  it('@ com vários pontos funciona (todos viram vírgula na chave)', async () => {
    await assertSucceeds(criarPerfil(dbDe('alice'), 'alice', 'um.dois.tres'));
  });

  it('perfil é público para leitura (inclusive sem login)', async () => {
    await criarPerfil(dbDe('alice'), 'alice', 'alice');
    await assertSucceeds(get(ref(dbDe(null), 'users/alice')));
    await assertSucceeds(get(ref(dbDe(null), 'usernames/alice')));
  });

  it('@ já reservado não pode ser tomado por outra pessoa', async () => {
    await criarPerfil(dbDe('alice'), 'alice', 'cinefilo');
    await assertFails(criarPerfil(dbDe('bob'), 'bob', 'cinefilo'));
  });

  it('não reserva @ sem criar o perfil junto', async () => {
    await assertFails(set(ref(dbDe('alice'), 'usernames/alice'), 'alice'));
  });

  it('não cria perfil sem reservar o @', async () => {
    await assertFails(set(ref(dbDe('alice'), 'users/alice'), perfil('alice')));
  });

  it('não reserva @ em nome de outra pessoa', async () => {
    const db = dbDe('alice');
    await assertFails(update(ref(db), { 'users/bob': perfil('bob'), 'usernames/bob': 'bob' }));
  });

  it.each([
    ['curto demais', 'ab'],
    ['com maiúscula', 'Alice'],
    ['começando com ponto', '.alice'],
    ['terminando com ponto', 'alice.'],
    ['com dois pontos seguidos', 'ali..ce'],
    ['reservado', 'admin'],
  ])('recusa @ inválido: %s', async (_nome, username) => {
    await assertFails(criarPerfil(dbDe('alice'), 'alice', username));
  });

  it('recusa contadores iniciais diferentes de zero', async () => {
    await assertFails(criarPerfil(dbDe('alice'), 'alice', 'alice', { stats: { followers: 999, following: 0, reviews: 0, watched: 0 } }));
  });

  it('recusa bio acima de 160 caracteres e campos desconhecidos', async () => {
    await assertFails(criarPerfil(dbDe('alice'), 'alice', 'alice', { bio: 'x'.repeat(161) }));
    await assertFails(criarPerfil(dbDe('alice'), 'alice', 'alice', { admin: true }));
  });

  it('aceita interesses no formato esperado', async () => {
    await assertSucceeds(
      criarPerfil(dbDe('alice'), 'alice', 'alice', { interests: { tipos: { anime: true }, generos: { terror: true } } }),
    );
  });
});

// ---------- Edição ----------

describe('edição de perfil', () => {
  beforeEach(async () => {
    await criarPerfil(dbDe('alice'), 'alice', 'alice');
  });

  it('dono edita nome, bio e interesses', async () => {
    await assertSucceeds(update(ref(dbDe('alice'), 'users/alice'), { displayName: 'Alice', bio: 'Fico até o fim dos créditos.' }));
  });

  it('outra pessoa não edita o perfil', async () => {
    await assertFails(update(ref(dbDe('bob'), 'users/alice'), { displayName: 'Hackeado' }));
  });

  it('dono não troca o @', async () => {
    const db = dbDe('alice');
    await assertFails(update(ref(db), { 'users/alice/username': 'novo', 'usernames/novo': 'alice' }));
  });

  it('dono não infla os próprios contadores', async () => {
    await assertFails(set(ref(dbDe('alice'), 'users/alice/stats/followers'), 1000));
  });

  it('dono não altera a data de criação', async () => {
    await assertFails(set(ref(dbDe('alice'), 'users/alice/createdAt'), 0));
  });

  it('perfil não pode ser apagado', async () => {
    await assertFails(set(ref(dbDe('alice'), 'users/alice'), null));
  });
});

// =====================================================================
// Fase 3: reviews, estatística do título e listas
// =====================================================================

const META = { mediaKey: 'tv_209867', mediaType: 'tv', title: 'Frieren', tipo: 'anime', posterPath: '/abc.jpg', year: '2023' };
const REVIEW = { rating: 4.5, text: 'Lindo.', spoiler: false, status: 'assisti' };

/** Lê o estado atual como o app faz antes de montar a escrita. */
async function lerEstado(db, uid, mediaKey = META.mediaKey) {
  const valor = async (caminho) => (await get(ref(db, caminho))).val();
  return {
    existente: await valor(`reviews/${idReview(uid, mediaKey)}`),
    statsTitulo: await valor(`titleStats/${mediaKey}`),
    statsUsuario: await valor(`users/${uid}/stats`),
    jaVisto: (await valor(`lists/${uid}/watched/${mediaKey}`)) !== null,
    naWatchlist: (await valor(`lists/${uid}/watchlist/${mediaKey}`)) !== null,
  };
}

/** Publica (ou edita) uma review exatamente como o app. */
async function publicar(uid, dados = REVIEW, meta = META) {
  const db = dbDe(uid);
  const estado = await lerEstado(db, uid, meta.mediaKey);
  return update(ref(db), montarEscritaReview({ uid, meta, dados, ...estado, carimbo: serverTimestamp() }));
}

describe('reviews', () => {
  beforeEach(async () => {
    await criarPerfil(dbDe('alice'), 'alice', 'alice');
    await criarPerfil(dbDe('bob'), 'bob', 'bob');
  });

  it('publica review e atualiza média, índices, contador e "Já vi"', async () => {
    await assertSucceeds(publicar('alice'));
    const db = dbDe('alice');
    expect((await get(ref(db, 'titleStats/tv_209867'))).val()).toEqual({ ratingSum: 4.5, ratingCount: 1 });
    expect((await get(ref(db, 'users/alice/stats/reviews'))).val()).toBe(1);
    expect((await get(ref(db, 'users/alice/stats/watched'))).val()).toBe(1);
    expect((await get(ref(db, 'lists/alice/watched/tv_209867'))).exists()).toBe(true);
  });

  it('duas pessoas avaliando somam na média', async () => {
    await publicar('alice');
    await assertSucceeds(publicar('bob', { ...REVIEW, rating: 3 }));
    expect((await get(ref(dbDe('bob'), 'titleStats/tv_209867'))).val()).toEqual({ ratingSum: 7.5, ratingCount: 2 });
  });

  it('editar ajusta a média pela diferença da nota', async () => {
    await publicar('alice');
    await assertSucceeds(publicar('alice', { ...REVIEW, rating: 2, spoiler: true }));
    expect((await get(ref(dbDe('alice'), 'titleStats/tv_209867'))).val()).toEqual({ ratingSum: 2, ratingCount: 1 });
  });

  it('excluir remove tudo e desconta a nota', async () => {
    await publicar('alice');
    await publicar('bob', { ...REVIEW, rating: 3 });
    const db = dbDe('alice');
    const estado = await lerEstado(db, 'alice');
    await assertSucceeds(update(ref(db), montarExclusaoReview({ uid: 'alice', ...estado })));
    expect((await get(ref(db, 'titleStats/tv_209867'))).val()).toEqual({ ratingSum: 3, ratingCount: 1 });
    expect((await get(ref(db, `reviews/${idReview('alice', 'tv_209867')}`))).exists()).toBe(false);
  });

  it('não exclui review sem descontar a nota do título', async () => {
    await publicar('alice');
    const id = idReview('alice', 'tv_209867');
    await assertFails(update(ref(dbDe('alice')), { [`reviews/${id}`]: null, [`titleReviews/tv_209867/${id}`]: null, [`userReviews/alice/${id}`]: null }));
  });

  it('não grava review sem atualizar a estatística do título', async () => {
    const db = dbDe('alice');
    const mapa = montarEscritaReview({ uid: 'alice', meta: META, dados: REVIEW, ...(await lerEstado(db, 'alice')), carimbo: serverTimestamp() });
    delete mapa['titleStats/tv_209867'];
    await assertFails(update(ref(db), mapa));
  });

  it('não infla a média do título', async () => {
    await publicar('alice');
    await assertFails(set(ref(dbDe('bob'), 'titleStats/tv_209867'), { ratingSum: 500, ratingCount: 100 }));
  });

  it('não apaga a estatística do título', async () => {
    await publicar('alice');
    await assertFails(set(ref(dbDe('bob'), 'titleStats/tv_209867'), null));
  });

  it('outra pessoa não edita nem exclui a review', async () => {
    await publicar('alice');
    const id = idReview('alice', 'tv_209867');
    await assertFails(set(ref(dbDe('bob'), `reviews/${id}/text`), 'Editado pelo Bob'));
    await assertFails(set(ref(dbDe('bob'), `reviews/${id}`), null));
  });

  it('não cria review com id de outra pessoa', async () => {
    const db = dbDe('bob');
    const mapa = montarEscritaReview({ uid: 'alice', meta: META, dados: REVIEW, ...(await lerEstado(db, 'alice')), carimbo: serverTimestamp() });
    await assertFails(update(ref(db), mapa));
  });

  it.each([
    ['nota zero', { rating: 0 }],
    ['nota acima de 5', { rating: 5.5 }],
    ['nota quebrada', { rating: 3.3 }],
    ['texto acima de 2000', { text: 'x'.repeat(2001) }],
    ['status inválido', { status: 'dormi' }],
    ['spoiler não booleano', { spoiler: 'sim' }],
  ])('recusa review com %s', async (_nome, troca) => {
    await assertFails(publicar('alice', { ...REVIEW, ...troca }));
  });

  it('não infla curtidas nem comentários', async () => {
    await publicar('alice');
    await assertFails(set(ref(dbDe('alice'), `reviews/${idReview('alice', 'tv_209867')}/likeCount`), 999));
  });

  it('review é pública para leitura', async () => {
    await publicar('alice');
    await assertSucceeds(get(ref(dbDe(null), `reviews/${idReview('alice', 'tv_209867')}`)));
    await assertSucceeds(get(ref(dbDe(null), 'titleReviews/tv_209867')));
    await assertSucceeds(get(ref(dbDe(null), 'titleStats/tv_209867')));
  });
});

describe('listas', () => {
  beforeEach(async () => {
    await criarPerfil(dbDe('alice'), 'alice', 'alice');
  });

  /** Adiciona/remove como o app. */
  async function lista(uid, nome, adicionar) {
    const db = dbDe(uid);
    const estado = await lerEstado(db, uid);
    const mapa = montarEscritaLista({
      uid,
      lista: nome,
      meta: META,
      adicionar,
      statsUsuario: estado.statsUsuario,
      naWatchlist: estado.naWatchlist,
      carimbo: serverTimestamp(),
    });
    return update(ref(db), mapa);
  }

  it('adiciona e remove de Quero ver e Favoritos', async () => {
    await assertSucceeds(lista('alice', 'watchlist', true));
    await assertSucceeds(lista('alice', 'favorites', true));
    await assertSucceeds(lista('alice', 'watchlist', false));
  });

  it('"Já vi" conta em Vistos e tira de Quero ver', async () => {
    await lista('alice', 'watchlist', true);
    await assertSucceeds(lista('alice', 'watched', true));
    const db = dbDe('alice');
    expect((await get(ref(db, 'users/alice/stats/watched'))).val()).toBe(1);
    expect((await get(ref(db, 'lists/alice/watchlist/tv_209867'))).exists()).toBe(false);
    await assertSucceeds(lista('alice', 'watched', false));
    expect((await get(ref(db, 'users/alice/stats/watched'))).val()).toBe(0);
  });

  it('listas são públicas, mas só a dona escreve', async () => {
    await lista('alice', 'favorites', true);
    await assertSucceeds(get(ref(dbDe(null), 'lists/alice/favorites')));
    await assertFails(set(ref(dbDe('bob'), 'lists/alice/favorites/movie_1'), { addedAt: serverTimestamp(), title: 'X', tipo: 'filme' }));
  });

  it('recusa lista desconhecida e campos extras', async () => {
    const db = dbDe('alice');
    await assertFails(set(ref(db, 'lists/alice/odiados/movie_1'), { addedAt: serverTimestamp(), title: 'X', tipo: 'filme' }));
    await assertFails(set(ref(db, 'lists/alice/favorites/movie_1'), { addedAt: serverTimestamp(), title: 'X', tipo: 'filme', hack: 1 }));
  });

  it('contador Vistos só anda de 1 em 1', async () => {
    await assertFails(set(ref(dbDe('alice'), 'users/alice/stats/watched'), 50));
  });
});

// =====================================================================
// Fase 4: seguir, curtir, comentar e feed
// =====================================================================

/** Valor de um caminho, lido com regras ligadas (tudo aqui é público). */
const valor = async (caminho) => (await get(ref(dbDe('leitor'), caminho))).val();

/** Seguir/deixar de seguir exatamente como o app. */
async function seguir(uid, alvo, sim = true) {
  const mapa = montarSeguir({
    uid,
    alvo,
    seguir: sim,
    seguindoAtual: await valor(`users/${uid}/stats/following`),
    seguidoresAlvoAtual: await valor(`users/${alvo}/stats/followers`),
  });
  return update(ref(dbDe(uid)), mapa);
}

/** Curtir/descurtir como o app (com o aviso para a dona da review). */
async function curtir(uid, reviewId, sim = true) {
  const mapa = montarCurtida({
    uid,
    reviewId,
    curtir: sim,
    likeCountAtual: await valor(`reviews/${reviewId}/likeCount`),
    donoReview: await valor(`reviews/${reviewId}/uid`),
    carimbo: serverTimestamp(),
  });
  return update(ref(dbDe(uid)), mapa);
}

/**
 * Comentar como o app. Com respondeA (id de um comentário), vira
 * resposta na conversa daquele comentário.
 */
async function comentar(uid, reviewId, commentId, texto = 'Concordo!', respondeA = null) {
  let resposta = null;
  if (respondeA) {
    const alvo = await valor(`comments/${reviewId}/${respondeA}`);
    resposta = { parentId: alvo.parentId ?? respondeA, replyToId: respondeA, replyToUid: alvo.uid };
  }
  const mapa = montarComentario({
    uid,
    reviewId,
    commentId,
    texto,
    commentCountAtual: await valor(`reviews/${reviewId}/commentCount`),
    carimbo: serverTimestamp(),
    donoReview: await valor(`reviews/${reviewId}/uid`),
    resposta,
  });
  return update(ref(dbDe(uid)), mapa);
}

/** Excluir comentário como o app (por quem pedir), tirando os avisos permitidos. */
async function excluirComentario(quem, reviewId, commentId) {
  const comentario = await valor(`comments/${reviewId}/${commentId}`);
  const respondido = comentario?.replyToId ? (await valor(`comments/${reviewId}/${comentario.replyToId}/uid`)) : null;
  const mapa = montarExclusaoComentario({
    reviewId,
    commentId,
    commentCountAtual: await valor(`reviews/${reviewId}/commentCount`),
    quem,
    autorComentario: comentario?.uid,
    donoReview: await valor(`reviews/${reviewId}/uid`),
    respondido,
  });
  return update(ref(dbDe(quem)), mapa);
}

describe('seguir', () => {
  beforeEach(async () => {
    await criarPerfil(dbDe('alice'), 'alice', 'alice');
    await criarPerfil(dbDe('bob'), 'bob', 'bob');
  });

  it('seguir e deixar de seguir mantêm os contadores certos', async () => {
    await assertSucceeds(seguir('alice', 'bob'));
    expect(await valor('users/alice/stats/following')).toBe(1);
    expect(await valor('users/bob/stats/followers')).toBe(1);
    await assertSucceeds(seguir('alice', 'bob', false));
    expect(await valor('users/alice/stats/following')).toBe(0);
    expect(await valor('users/bob/stats/followers')).toBe(0);
  });

  it('não segue a si mesmo nem perfil inexistente', async () => {
    await assertFails(seguir('alice', 'alice'));
    await assertFails(seguir('alice', 'fantasma'));
  });

  it('não segue duas vezes (contador não dobra)', async () => {
    await seguir('alice', 'bob');
    await assertFails(seguir('alice', 'bob'));
  });

  it('não infla seguidores de outra pessoa sem seguir de verdade', async () => {
    await assertFails(set(ref(dbDe('alice'), 'users/bob/stats/followers'), 1));
    await assertFails(set(ref(dbDe('alice'), 'users/bob/stats/followers'), 1000));
  });

  it('não grava follow sem o espelho em followers/', async () => {
    const mapa = montarSeguir({ uid: 'alice', alvo: 'bob', seguir: true });
    delete mapa['followers/bob/alice'];
    await assertFails(update(ref(dbDe('alice')), mapa));
  });

  it('não faz alguém seguir outra pessoa no lugar dela', async () => {
    const mapa = montarSeguir({ uid: 'bob', alvo: 'alice', seguir: true });
    await assertFails(update(ref(dbDe('alice')), mapa));
  });

  it('quem segue quem é público', async () => {
    await seguir('alice', 'bob');
    await assertSucceeds(get(ref(dbDe(null), 'follows/alice')));
    await assertSucceeds(get(ref(dbDe(null), 'followers/bob')));
  });
});

describe('curtidas', () => {
  const RID = idReview('alice', 'tv_209867');

  beforeEach(async () => {
    await criarPerfil(dbDe('alice'), 'alice', 'alice');
    await criarPerfil(dbDe('bob'), 'bob', 'bob');
    await publicar('alice');
  });

  it('curtir e descurtir mexem no likeCount', async () => {
    await assertSucceeds(curtir('bob', RID));
    expect(await valor(`reviews/${RID}/likeCount`)).toBe(1);
    await assertSucceeds(curtir('bob', RID, false));
    expect(await valor(`reviews/${RID}/likeCount`)).toBe(0);
  });

  it('a dona também pode curtir a própria review', async () => {
    await assertSucceeds(curtir('alice', RID));
  });

  it('não curte duas vezes', async () => {
    await curtir('bob', RID);
    await assertFails(curtir('bob', RID));
  });

  it('não infla likeCount sem curtir', async () => {
    await assertFails(set(ref(dbDe('bob'), `reviews/${RID}/likeCount`), 1));
  });

  it('não curte no lugar de outra pessoa', async () => {
    const mapa = montarCurtida({ uid: 'alice', reviewId: RID, curtir: true, likeCountAtual: 0 });
    await assertFails(update(ref(dbDe('bob')), mapa));
  });

  it('não curte review inexistente', async () => {
    await assertFails(update(ref(dbDe('bob')), { 'likes/nada_movie_1/bob': true }));
  });

  it('curtir não deixa mexer no texto da review', async () => {
    await assertFails(update(ref(dbDe('bob')), { ...montarCurtida({ uid: 'bob', reviewId: RID, curtir: true }), [`reviews/${RID}/text`]: 'Hackeado' }));
  });

  it('a dona ainda edita a review depois de receber curtidas', async () => {
    await curtir('bob', RID);
    await assertSucceeds(publicar('alice', { ...REVIEW, rating: 3 }));
    expect(await valor(`reviews/${RID}/likeCount`)).toBe(1);
  });
});

describe('comentários', () => {
  const RID = idReview('alice', 'tv_209867');

  beforeEach(async () => {
    await criarPerfil(dbDe('alice'), 'alice', 'alice');
    await criarPerfil(dbDe('bob'), 'bob', 'bob');
    await criarPerfil(dbDe('carol'), 'carol', 'carol');
    await publicar('alice');
  });

  it('comenta e soma no commentCount', async () => {
    await assertSucceeds(comentar('bob', RID, 'c1'));
    expect(await valor(`reviews/${RID}/commentCount`)).toBe(1);
    await assertSucceeds(get(ref(dbDe(null), `comments/${RID}`)));
  });

  it('não comenta sem somar o contador', async () => {
    await assertFails(set(ref(dbDe('bob'), `comments/${RID}/c1`), { uid: 'bob', text: 'Oi', createdAt: serverTimestamp() }));
  });

  it('recusa comentário vazio, longo demais ou em nome de outra pessoa', async () => {
    await assertFails(comentar('bob', RID, 'c1', ''));
    await assertFails(comentar('bob', RID, 'c2', 'x'.repeat(501)));
    const falso = montarComentario({ uid: 'carol', reviewId: RID, commentId: 'c3', texto: 'Oi', carimbo: serverTimestamp() });
    await assertFails(update(ref(dbDe('bob')), falso));
  });

  it('quem escreveu e a dona da review podem apagar; terceiros não', async () => {
    await comentar('bob', RID, 'c1');
    await comentar('bob', RID, 'c2');
    await assertFails(excluirComentario('carol', RID, 'c1'));
    await assertSucceeds(excluirComentario('bob', RID, 'c1'));
    await assertSucceeds(excluirComentario('alice', RID, 'c2'));
    expect(await valor(`reviews/${RID}/commentCount`)).toBe(0);
  });

  it('comentário não pode ser editado', async () => {
    await comentar('bob', RID, 'c1');
    await assertFails(set(ref(dbDe('bob'), `comments/${RID}/c1/text`), 'Editado'));
  });
});

describe('respostas a comentários', () => {
  const RID = idReview('alice', 'tv_209867');

  beforeEach(async () => {
    await criarPerfil(dbDe('alice'), 'alice', 'alice');
    await criarPerfil(dbDe('bob'), 'bob', 'bob');
    await criarPerfil(dbDe('carol'), 'carol', 'carol');
    await publicar('alice');
    await comentar('bob', RID, 'c1');
  });

  /** Resposta montada à mão (para testar dados fora do padrão). */
  const respostaManual = async (uid, commentId, parentId, replyToId) =>
    update(
      ref(dbDe(uid)),
      montarComentario({ uid, reviewId: RID, commentId, texto: 'Oi', commentCountAtual: await valor(`reviews/${RID}/commentCount`), carimbo: serverTimestamp(), resposta: { parentId, replyToId } }),
    );

  it('responde um comentário e responde a resposta (mesma conversa)', async () => {
    await assertSucceeds(comentar('carol', RID, 'r1', 'Discordo', 'c1'));
    await assertSucceeds(comentar('bob', RID, 'r2', 'Por quê?', 'r1'));
    expect(await valor(`comments/${RID}/r2`)).toMatchObject({ parentId: 'c1', replyToId: 'r1' });
    expect(await valor(`reviews/${RID}/commentCount`)).toBe(3);
  });

  it('recusa raiz inexistente ou que já é resposta (só um nível)', async () => {
    await comentar('carol', RID, 'r1', 'Discordo', 'c1');
    await assertFails(respostaManual('carol', 'x1', 'nada', 'nada'));
    await assertFails(respostaManual('carol', 'x2', 'r1', 'r1'));
  });

  it('recusa responder comentário de outra conversa', async () => {
    await comentar('carol', RID, 'c2');
    await comentar('carol', RID, 'r1', 'Oi', 'c2');
    await assertFails(respostaManual('bob', 'x1', 'c1', 'r1'));
  });

  it('recusa parentId sem replyToId e vice-versa', async () => {
    const base = { uid: 'carol', text: 'Oi', createdAt: serverTimestamp() };
    const contador = { [`reviews/${RID}/commentCount`]: 2 };
    await assertFails(update(ref(dbDe('carol')), { [`comments/${RID}/x1`]: { ...base, parentId: 'c1' }, ...contador }));
    await assertFails(update(ref(dbDe('carol')), { [`comments/${RID}/x2`]: { ...base, replyToId: 'c1' }, ...contador }));
  });

  it('resposta continua de pé depois que a raiz é apagada', async () => {
    await comentar('carol', RID, 'r1', 'Discordo', 'c1');
    await assertSucceeds(excluirComentario('bob', RID, 'c1'));
    expect(await valor(`comments/${RID}/r1`)).not.toBeNull();
  });
});

// =====================================================================
// Notificações
// =====================================================================

describe('notificações', () => {
  const RID = idReview('alice', 'tv_209867');

  beforeEach(async () => {
    await criarPerfil(dbDe('alice'), 'alice', 'alice');
    await criarPerfil(dbDe('bob'), 'bob', 'bob');
    await criarPerfil(dbDe('carol'), 'carol', 'carol');
    await publicar('alice');
  });

  /** Caixa de avisos lida pela própria dona. */
  const caixa = async (uid) => (await get(ref(dbDe(uid), `notifications/${uid}`))).val() ?? {};

  it('curtir avisa a dona; descurtir tira o aviso; curtir de novo não duplica', async () => {
    await assertSucceeds(curtir('bob', RID));
    expect(await caixa('alice')).toEqual({ [`like~${RID}~bob`]: expect.objectContaining({ type: 'like', fromUid: 'bob', reviewId: RID }) });
    await assertSucceeds(curtir('bob', RID, false));
    expect(await caixa('alice')).toEqual({});
    await curtir('bob', RID);
    expect(Object.keys(await caixa('alice'))).toHaveLength(1);
  });

  it('curtir a própria review não gera aviso', async () => {
    await assertSucceeds(curtir('alice', RID));
    expect(await caixa('alice')).toEqual({});
  });

  it('comentar avisa a dona; apagar o comentário tira o aviso', async () => {
    await assertSucceeds(comentar('bob', RID, 'c1'));
    expect(Object.keys(await caixa('alice'))).toEqual([`comment~${RID}~c1`]);
    await assertSucceeds(excluirComentario('bob', RID, 'c1'));
    expect(await caixa('alice')).toEqual({});
  });

  it('resposta avisa quem foi respondido e a dona (uma vez cada)', async () => {
    await comentar('bob', RID, 'c1');
    await assertSucceeds(comentar('carol', RID, 'r1', 'Discordo', 'c1'));
    expect(Object.keys(await caixa('bob'))).toEqual([`reply~${RID}~r1`]);
    expect(Object.keys(await caixa('alice')).sort()).toEqual([`comment~${RID}~c1`, `comment~${RID}~r1`]);
  });

  it('dona respondida recebe só "reply"; ninguém avisa a si mesmo', async () => {
    await comentar('alice', RID, 'c1');
    await comentar('bob', RID, 'r1', 'Boa', 'c1');
    expect(Object.keys(await caixa('alice'))).toEqual([`reply~${RID}~r1`]);
    await comentar('alice', RID, 'r2', 'Valeu', 'r1');
    expect(Object.keys(await caixa('bob'))).toEqual([`reply~${RID}~r2`]);
    expect(Object.keys(await caixa('alice'))).toEqual([`reply~${RID}~r1`]);
  });

  it('dona apaga comentário de outra pessoa e o aviso dela some junto', async () => {
    await comentar('bob', RID, 'c1');
    await assertSucceeds(excluirComentario('alice', RID, 'c1'));
    expect(await caixa('alice')).toEqual({});
  });

  it('descurtir funciona mesmo se a dona já apagou o aviso', async () => {
    await curtir('bob', RID);
    await assertSucceeds(set(ref(dbDe('alice'), `notifications/alice/like~${RID}~bob`), null));
    await assertSucceeds(curtir('bob', RID, false));
  });

  it('só a dona lê a caixa de avisos', async () => {
    await curtir('bob', RID);
    await assertSucceeds(get(ref(dbDe('alice'), 'notifications/alice')));
    await assertFails(get(ref(dbDe('bob'), 'notifications/alice')));
    await assertFails(get(ref(dbDe(null), 'notifications/alice')));
  });

  it('não cria aviso falso (sem curtida/comentário de verdade)', async () => {
    const aviso = { type: 'like', fromUid: 'bob', reviewId: RID, createdAt: serverTimestamp() };
    await assertFails(set(ref(dbDe('bob'), `notifications/alice/like~${RID}~bob`), aviso));
    await comentar('carol', RID, 'c1');
    const falso = { type: 'comment', fromUid: 'bob', reviewId: RID, commentId: 'c1', createdAt: serverTimestamp() };
    await assertFails(set(ref(dbDe('bob'), `notifications/alice/comment~${RID}~c1`), falso));
  });

  it('não manda aviso para quem não é a dona / respondida', async () => {
    await assertFails(update(ref(dbDe('bob')), { ...montarCurtida({ uid: 'bob', reviewId: RID, curtir: true, likeCountAtual: 0 }), [`notifications/carol/like~${RID}~bob`]: { type: 'like', fromUid: 'bob', reviewId: RID, createdAt: serverTimestamp() } }));
  });

  it('não grava aviso em nome de outra pessoa nem com campo extra', async () => {
    const mapa = montarCurtida({ uid: 'bob', reviewId: RID, curtir: true, likeCountAtual: 0, donoReview: 'alice', carimbo: serverTimestamp() });
    const chave = `notifications/alice/like~${RID}~bob`;
    await assertFails(update(ref(dbDe('bob')), { ...mapa, [chave]: { ...mapa[chave], fromUid: 'carol' } }));
    await assertFails(update(ref(dbDe('bob')), { ...mapa, [chave]: { ...mapa[chave], hack: 1 } }));
  });

  it('terceiro não apaga aviso alheio', async () => {
    await curtir('bob', RID);
    await assertFails(set(ref(dbDe('carol'), `notifications/alice/like~${RID}~bob`), null));
  });

  it('bloqueado não comenta nem responde quem bloqueou (o aviso é recusado)', async () => {
    await criarPerfil(dbDe('dani'), 'dani', 'dani');
    await comentar('carol', RID, 'c1');
    await update(ref(dbDe('carol')), montarBloqueio({ uid: 'carol', alvo: 'dani', bloquear: true }));
    await assertFails(comentar('dani', RID, 'r1', 'Oi', 'c1'));
    await assertSucceeds(comentar('dani', RID, 'c2'));
  });

  it('marca de "visto" só pela dona e com a hora do servidor', async () => {
    await assertSucceeds(set(ref(dbDe('alice'), 'notificationsSeen/alice'), serverTimestamp()));
    await assertFails(set(ref(dbDe('alice'), 'notificationsSeen/alice'), 0));
    await assertFails(set(ref(dbDe('bob'), 'notificationsSeen/alice'), serverTimestamp()));
    await assertFails(get(ref(dbDe('bob'), 'notificationsSeen/alice')));
  });
});

// =====================================================================
// Fase 5: denúncias e bloqueios
// =====================================================================

describe('denúncias', () => {
  const RID = idReview('alice', 'tv_209867');

  beforeEach(async () => {
    await criarPerfil(dbDe('alice'), 'alice', 'alice');
    await criarPerfil(dbDe('bob'), 'bob', 'bob');
    await publicar('alice');
  });

  /** Denuncia como o app. */
  const denunciar = (uid, tipo, alvo, motivo = 'spam', extras = {}) =>
    update(ref(dbDe(uid)), montarDenuncia({ uid, tipo, alvo, motivo, carimbo: serverTimestamp(), ...extras }));

  it('denuncia review e comentário', async () => {
    await assertSucceeds(denunciar('bob', 'review', RID, 'spoiler', { detalhes: 'Falou o final sem aviso.' }));
    await assertSucceeds(denunciar('bob', 'comment', idAlvo('comment', RID, '-Nabc'), 'ofensivo'));
  });

  it('ninguém lê denúncias pelo app (só escrita)', async () => {
    await denunciar('bob', 'review', RID);
    await assertFails(get(ref(dbDe('bob'), `reports/${idDenuncia('bob', 'review', RID)}`)));
    await assertFails(get(ref(dbDe('alice'), 'reports')));
  });

  it('não denuncia duas vezes o mesmo alvo nem apaga a denúncia', async () => {
    await denunciar('bob', 'review', RID);
    await assertFails(denunciar('bob', 'review', RID, 'outro'));
    await assertFails(set(ref(dbDe('bob'), `reports/${idDenuncia('bob', 'review', RID)}`), null));
  });

  it('recusa sem login, em nome de outra pessoa, motivo inválido ou review inexistente', async () => {
    await assertFails(update(ref(dbDe(null)), montarDenuncia({ uid: 'x', tipo: 'review', alvo: RID, motivo: 'spam', carimbo: serverTimestamp() })));
    await assertFails(update(ref(dbDe('bob')), montarDenuncia({ uid: 'alice', tipo: 'review', alvo: RID, motivo: 'spam', carimbo: serverTimestamp() })));
    await assertFails(denunciar('bob', 'review', RID, 'chato'));
    await assertFails(denunciar('bob', 'review', 'nada_movie_1'));
  });
});

describe('bloqueios', () => {
  const RID = idReview('alice', 'tv_209867');

  beforeEach(async () => {
    await criarPerfil(dbDe('alice'), 'alice', 'alice');
    await criarPerfil(dbDe('bob'), 'bob', 'bob');
    await publicar('alice');
  });

  const bloquear = (uid, alvo, sim = true) => update(ref(dbDe(uid)), montarBloqueio({ uid, alvo, bloquear: sim }));

  it('bloqueia e desbloqueia; lista é privada', async () => {
    await assertSucceeds(bloquear('alice', 'bob'));
    await assertSucceeds(get(ref(dbDe('alice'), 'blocks/alice')));
    await assertFails(get(ref(dbDe('bob'), 'blocks/alice')));
    await assertSucceeds(bloquear('alice', 'bob', false));
  });

  it('não bloqueia a si mesma nem em nome de outra pessoa', async () => {
    await assertFails(bloquear('alice', 'alice'));
    await assertFails(update(ref(dbDe('bob')), montarBloqueio({ uid: 'alice', alvo: 'carol', bloquear: true })));
  });

  it('quem foi bloqueado não curte, não comenta e não segue', async () => {
    await bloquear('alice', 'bob');
    await assertFails(curtir('bob', RID));
    await assertFails(comentar('bob', RID, 'c1'));
    await assertFails(seguir('bob', 'alice'));
  });

  it('depois de desbloquear volta a poder interagir', async () => {
    await bloquear('alice', 'bob');
    await bloquear('alice', 'bob', false);
    await assertSucceeds(curtir('bob', RID));
    await assertSucceeds(seguir('bob', 'alice'));
  });

  it('bloqueado ainda consegue desfazer o que já tinha (descurtir, deixar de seguir)', async () => {
    await curtir('bob', RID);
    await seguir('bob', 'alice');
    await bloquear('alice', 'bob');
    await assertSucceeds(curtir('bob', RID, false));
    await assertSucceeds(seguir('bob', 'alice', false));
  });
});

describe('feed', () => {
  it('lista pública das reviews mais recentes', async () => {
    await criarPerfil(dbDe('alice'), 'alice', 'alice');
    await publicar('alice');
    const { query, orderByChild, limitToLast } = await import('firebase/database');
    await assertSucceeds(get(query(ref(dbDe(null), 'reviews'), orderByChild('createdAt'), limitToLast(20))));
  });
});
