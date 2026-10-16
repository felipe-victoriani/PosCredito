// E2E da Fase 2 sem login: convite para entrar, proteção do onboarding
// e barra de navegação completa. (O login real com Google não roda em
// teste automatizado; as regras do banco têm testes próprios.)
import { expect, test } from '@playwright/test';
import { bloquearRecursosExternos, simularTmdb } from './dados-tmdb.js';

test.describe('Perfil sem login', () => {
  test('mostra convite para entrar com Google', async ({ page }) => {
    await bloquearRecursosExternos(page, { permitirFirebase: true });
    await page.goto('/perfil.html');
    await expect(page.getByRole('heading', { name: 'Entre no PósCréditos' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeEnabled();
    // Controles de dono escondidos
    await expect(page.getByRole('button', { name: 'Opções da conta' })).toBeHidden();
  });

  test('onboarding sem login volta para a tela de entrar', async ({ page }) => {
    await bloquearRecursosExternos(page, { permitirFirebase: true });
    await page.goto('/onboarding.html');
    await expect(page).toHaveURL(/perfil\.html$/, { timeout: 20_000 });
  });

  test('"Avaliar" sem login leva ao login guardando a volta', async ({ page }) => {
    await simularTmdb(page, { permitirFirebase: true });
    // Banco bloqueado: o teste nunca lê nem grava no Firebase de verdade
    await page.routeWebSocket(/firebaseio\.com/, (ws) => ws.close());
    await page.route(/firebaseio\.com/, (rota) => rota.abort());

    await page.goto('/titulo.html?id=tv_209867');
    const avaliar = page.getByRole('button', { name: 'Avaliar' });
    await expect(avaliar).toBeEnabled({ timeout: 20_000 });
    await avaliar.click();
    await expect(page).toHaveURL(/perfil\.html\?voltar=titulo\.html%3Fid%3Dtv_209867%26avaliar%3D1/);
    await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible({ timeout: 20_000 });
  });

  test('barra inferior tem Início, Buscar, Nova review, Listas e Perfil', async ({ page }) => {
    await bloquearRecursosExternos(page);
    await page.goto('/busca.html');
    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    for (const nome of ['Início', 'Buscar', 'Nova review', 'Listas', 'Perfil']) {
      await expect(nav.getByRole('link', { name: nome })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: 'Buscar' })).toHaveAttribute('aria-current', 'page');
  });
});
