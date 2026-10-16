// =====================================================================
// gerar-icones.mjs — gera os PNGs do PWA e a imagem de Open Graph
// a partir do logo SVG, usando o Chromium do Playwright.
// Uso: npm run icones   (rodar de novo sempre que o logo mudar)
// =====================================================================
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const SVG_LOGO = await readFile('public/icons/logo.svg', 'utf8');

// Versão "maskable": troca o círculo por um quadrado amarelo cheio
// (Android/iOS recortam no formato deles; as reticências ficam na zona segura)
const SVG_MASKABLE = SVG_LOGO.replace(/<circle id="fundo"[^>]*\/>/, '<rect width="96" height="96" fill="#F5B700"/>');
if (SVG_MASKABLE === SVG_LOGO) throw new Error('Fundo do logo (id="fundo") não encontrado em logo.svg');

// Ícones quadrados: [arquivo, tamanho, svg]
const ICONES = [
  ['public/icons/icon-192.png', 192, SVG_LOGO],
  ['public/icons/icon-512.png', 512, SVG_LOGO],
  ['public/icons/icon-maskable-512.png', 512, SVG_MASKABLE],
  // iOS aplica os próprios cantos: usa a versão sem arredondamento
  ['public/icons/apple-touch-icon.png', 180, SVG_MASKABLE],
];

// Página de Open Graph 1200x630 (logo + slogan com as fontes da marca)
const HTML_OG = `<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&display=swap">
<style>
  body{margin:0;width:1200px;height:630px;background:#0E0E12;display:flex;flex-direction:column;justify-content:center;padding:0 120px;box-sizing:border-box;font-family:"Bricolage Grotesque",sans-serif}
  .marca{display:flex;align-items:center;gap:36px}
  .marca svg{width:150px;height:150px}
  .nome{font-size:84px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#F4F1EA}
  .nome span{color:#F5B700;margin:0 0.05em}
  .slogan{margin-top:40px;font-size:48px;color:#A8A49C}
</style></head><body>
<div class="marca">${SVG_LOGO}<div class="nome">Pós<span>·</span>Créditos</div></div>
<div class="slogan">A conversa começa quando o filme acaba.</div>
</body></html>`;

const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage();

  // Cada ícone: SVG ocupando a viewport inteira, fundo transparente
  for (const [arquivo, tamanho, svg] of ICONES) {
    await pagina.setViewportSize({ width: tamanho, height: tamanho });
    await pagina.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${tamanho}px;height:${tamanho}px}</style>${svg}`,
    );
    await pagina.screenshot({ path: arquivo, omitBackground: true });
    console.log(`ok  ${arquivo}`);
  }

  // Imagem de compartilhamento (espera a fonte carregar)
  await pagina.setViewportSize({ width: 1200, height: 630 });
  await pagina.setContent(HTML_OG, { waitUntil: 'networkidle' });
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.screenshot({ path: 'public/img/og-image.png' });
  console.log('ok  public/img/og-image.png');
} finally {
  await navegador.close();
}
