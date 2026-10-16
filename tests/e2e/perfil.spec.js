// E2E da Fase 2 sem login: convite para entrar, proteção do onboarding
// e barra de navegação completa. (O login real com Google não roda em
// teste automatizado; as regras do banco têm testes próprios.)
import { expect, test } from '@playwright/test';
import { bloquearRecursosExternos } from './dados-tmdb.js';

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
