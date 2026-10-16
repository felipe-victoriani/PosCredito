// E2E da Fase 5: página de regras, manifest e service worker.
import { expect, test } from '@playwright/test';
import { bloquearRecursosExternos } from './dados-tmdb.js';

test.describe('Regras da comunidade', () => {
  test('abre pelo rodapé e explica denúncia e bloqueio', async ({ page }) => {
    await bloquearRecursosExternos(page);
    await page.goto('/busca.html');
    await page.getByRole('link', { name: 'Regras da comunidade' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Regras da comunidade');
    await expect(page.getByRole('heading', { name: 'Denunciar e bloquear' })).toBeVisible();
  });
});

test.describe('PWA', () => {
  test.use({ serviceWorkers: 'allow' });

  test('manifest válido e service worker ativo com o app em cache', async ({ page, browserName }) => {
    // O WebKit do Playwright não roda service worker em http://127.0.0.1
    test.skip(browserName === 'webkit', 'service worker indisponível no WebKit de teste');
    await bloquearRecursosExternos(page);

    // Manifest: campos essenciais para instalar
    const manifest = await (await page.request.get('/manifest.json')).json();
    expect(manifest).toMatchObject({ name: 'PósCréditos', display: 'standalone', start_url: '/index.html', lang: 'pt-BR' });
    expect(manifest.icons.map((i) => i.purpose)).toContain('maskable');

    await page.goto('/regras.html');
    const versao = await page.evaluate(async () => {
      const registro = await navigator.serviceWorker.ready;
      // Espera a instalação guardar os arquivos
      const nomes = await caches.keys();
      return { ativo: Boolean(registro.active), caches: nomes };
    });
    expect(versao.ativo).toBe(true);
    expect(versao.caches.some((n) => /^poscreditos-v\d+$/.test(n))).toBe(true);

    // Todos os arquivos do STATIC_ASSETS precisam existir (senão o install falha)
    const emCache = await page.evaluate(async () => {
      const nome = (await caches.keys()).find((n) => n.startsWith('poscreditos-v'));
      return (await (await caches.open(nome)).keys()).length;
    });
    expect(emCache).toBeGreaterThan(30);
  });
});
