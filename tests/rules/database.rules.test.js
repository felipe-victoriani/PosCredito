// Testes das Security Rules do Realtime Database (emulador local).
// Fase 1: o banco está fechado. As fases seguintes abrem nós específicos
// e ganham testes próprios aqui (perfil, username, reviews…).
import { readFileSync } from 'node:fs';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, set } from 'firebase/database';
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

describe('Realtime Database — acesso básico', () => {
  it('nega escrita sem login', async () => {
    const db = ambiente.unauthenticatedContext().database();
    await assertFails(set(ref(db, 'users/qualquer'), { displayName: 'Invasor' }));
  });

  it('nega leitura sem login', async () => {
    const db = ambiente.unauthenticatedContext().database();
    await assertFails(get(ref(db, 'users')));
  });

  it('usuário logado não escreve no perfil de outra pessoa', async () => {
    const db = ambiente.authenticatedContext('alice').database();
    await assertFails(set(ref(db, 'users/bob/displayName'), 'Alice fingindo ser Bob'));
  });

  it('usuário logado não lê dados privados de outra pessoa', async () => {
    const db = ambiente.authenticatedContext('alice').database();
    await assertFails(get(ref(db, 'blocks/bob')));
  });
});
