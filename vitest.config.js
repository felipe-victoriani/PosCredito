// Configuração do Vitest para testes unitários (funções puras).
// Os testes de regras do Firebase têm config própria (vitest.rules.config.js)
// porque precisam do emulador rodando.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
