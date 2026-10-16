// Configuração do Playwright: E2E em Chromium, Firefox e WebKit,
// emulando celular (o app é mobile-first).
import { defineConfig, devices } from '@playwright/test';

const PORTA = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // Metade dos núcleos: o Firefox fica instável com muitos workers em paralelo
  workers: '50%',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORTA}`,
    locale: 'pt-BR',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Pixel 7'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 412, height: 915 } } },
    { name: 'webkit', use: { ...devices['iPhone 15'] } },
  ],
  // Sobe o servidor estático antes dos testes
  webServer: {
    command: 'node tests/servidor-estatico.mjs',
    url: `http://127.0.0.1:${PORTA}/index.html`,
    reuseExistingServer: !process.env.CI,
    env: { PORTA: String(PORTA) },
  },
});
