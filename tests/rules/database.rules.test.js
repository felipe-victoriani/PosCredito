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
