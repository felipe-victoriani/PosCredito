// E2E do fluxo principal da Fase 1: buscar um título e abrir a página
// dele com "onde assistir" no Brasil e as atribuições obrigatórias.
import { expect, test } from '@playwright/test';
import { bloquearRecursosExternos, simularTmdb } from './dados-tmdb.js';

test.describe('Busca → página do título', () => {
  test('busca, filtra por tipo e abre o título com onde assistir', async ({ page }) => {
    await simularTmdb(page);
    await page.goto('/busca.html');

    // Digita e espera os resultados (pessoas não aparecem)
    await page.getByLabel('Buscar títulos e pessoas').fill('frieren');
    const resultados = page.getByRole('list', { name: 'Resultados da busca' });
    await expect(resultados.getByRole('link')).toHaveCount(2);
    await expect(resultados).not.toContainText('Pessoa que deve sumir');
    await expect(page).toHaveURL(/q=frieren/);

    // Anime classificado e filtro por tipo funcionando
    await page.getByRole('button', { name: 'Animes 1' }).click();
    await expect(resultados.getByRole('link')).toHaveCount(1);
    await expect(resultados).toContainText('Anime');

    // Abre a página do título
    await resultados.getByRole('link', { name: /Frieren e a Jornada/ }).click();
    await expect(page).toHaveURL(/titulo\.html\?id=tv_209867/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Frieren e a Jornada para o Além');
    await expect(page.getByText('2023 · 28 ep.')).toBeVisible();

    // Onde assistir + crédito JustWatch + atribuição TMDB
    const ondeAssistir = page.getByRole('region', { name: 'Onde assistir' });
    await expect(ondeAssistir).toContainText('Crunchyroll');
    await expect(ondeAssistir).toContainText('Assinatura');
    await expect(ondeAssistir.getByRole('link', { name: 'JustWatch' })).toBeVisible();
    await expect(page.getByText('Este produto usa a API do TMDB, mas não é endossado ou certificado pelo TMDB.')).toBeVisible();
  });

  test('título sem streaming no Brasil mostra aviso', async ({ page }) => {
    await simularTmdb(page, { semProvedores: true });
    await page.goto('/titulo.html?id=tv_209867');
    await expect(page.getByText('Ainda não está disponível em streaming, aluguel ou compra no Brasil.')).toBeVisible();
  });

  test('link inválido mostra erro sem chamar a API', async ({ page }) => {
    let chamadas = 0;
    await bloquearRecursosExternos(page);
    await page.route('**/api/tmdb?**', (rota) => {
      chamadas += 1;
      return rota.abort();
    });
    await page.goto('/titulo.html?id=../../account');
    await expect(page.getByRole('alert')).toContainText('Link de título inválido.');
    expect(chamadas).toBe(0);
  });

  test('home mostra em alta e leva ao título', async ({ page }) => {
    await simularTmdb(page);
    await page.goto('/index.html');
    const grade = page.getByRole('list', { name: 'Títulos em alta' });
    await expect(grade.getByRole('link')).toHaveCount(2);
    await grade.getByRole('link', { name: /Frieren/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Frieren e a Jornada para o Além');
  });
});
