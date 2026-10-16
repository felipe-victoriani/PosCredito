// Testes das Security Rules do Realtime Database (emulador local).
// Rodar com: npm run test:rules
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, serverTimestamp, set, update } from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

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
