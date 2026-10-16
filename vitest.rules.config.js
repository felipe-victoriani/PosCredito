// Configuração do Vitest para os testes das Security Rules.
// Rodar com: npm run test:rules (sobe o emulador do Realtime Database).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.js'],
    environment: 'node',
    // Testes de regras compartilham o mesmo banco do emulador: rodar em série
    fileParallelism: false,
    testTimeout: 15000,
  },
});
