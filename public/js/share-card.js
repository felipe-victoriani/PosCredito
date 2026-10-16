// =====================================================================
// share-card.js — card de review para Stories (1080x1920, canvas → PNG)
// ---------------------------------------------------------------------
// Layout da referência 7: "@FULANO AVALIOU", capa, título, estrelas,
// trecho da review e o logo no rodapé. Compartilha com a Web Share API
// (arquivo PNG) ou, se não der, baixa a imagem.
// =====================================================================

import { urlImagem } from './tmdb.js';

// Tamanho do Stories
const LARGURA = 1080;
const ALTURA = 1920;

// Caminho da estrela (Lucide, viewBox 24) para desenhar no canvas
const CAMINHO_ESTRELA =
  'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z';

// ---------- Função pura (testada) ----------

/**
 * Quebra um texto em linhas que cabem na largura, até um máximo de linhas.
 * Se sobrar texto, a última linha termina com "…".
 * @param {string} texto
 * @param {number} larguraMax
 * @param {(s: string) => number} medir - largura de um trecho (ctx.measureText)
 * @param {number} maxLinhas
 * @returns {string[]}
 */
export function quebrarEmLinhas(texto, larguraMax, medir, maxLinhas) {
  const palavras = texto.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const linhas = [];
  let atual = '';

  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (medir(tentativa) <= larguraMax) {
      atual = tentativa;
      continue;
    }
    if (atual) linhas.push(atual);
    // Palavra sozinha maior que a linha: corta em pedaços
    let resto = palavra;
    while (medir(resto) > larguraMax && resto.length > 1) {
      let corte = resto.length - 1;
      while (corte > 1 && medir(resto.slice(0, corte)) > larguraMax) corte -= 1;
      linhas.push(resto.slice(0, corte));
      resto = resto.slice(corte);
    }
    atual = resto;
  }
  if (atual) linhas.push(atual);

  if (linhas.length <= maxLinhas) return linhas;

  // Corta e põe reticências cabendo na largura
  const cortadas = linhas.slice(0, maxLinhas);
  let ultima = `${cortadas.at(-1)}…`;
  while (medir(ultima) > larguraMax && ultima.length > 1) ultima = `${ultima.slice(0, -2).trimEnd()}…`;
  cortadas[cortadas.length - 1] = ultima;
  return cortadas;
}

// ---------- Desenho ----------

/** Lê as cores dos tokens CSS (uma fonte só para tela e card). */
function lerCores() {
  const estilo = getComputedStyle(document.documentElement);
  const cor = (nome) => estilo.getPropertyValue(nome).trim();
  return {
    fundo: cor('--cor-fundo'),
    superficie: cor('--cor-superficie-2'),
    texto: cor('--cor-texto'),
    texto2: cor('--cor-texto-2'),
    destaque: cor('--cor-destaque'),
    destaqueTexto: cor('--cor-destaque-texto'),
  };
}

/** Carrega a capa com CORS liberado (o TMDB permite) ou devolve null. */
function carregarImagem(src) {
  return new Promise((resolver) => {
    if (!src) return resolver(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolver(img);
    img.onerror = () => resolver(null);
    img.src = src;
  });
}

/** Retângulo de cantos arredondados (como caminho de recorte/preenchimento). */
function caminhoArredondado(ctx, x, y, largura, altura, raio) {
  ctx.beginPath();
  ctx.roundRect(x, y, largura, altura, raio);
}

/** Texto centralizado, linha por linha. Devolve o y depois da última linha. */
function escreverCentralizado(ctx, linhas, y, alturaLinha) {
  for (const linha of linhas) {
    ctx.fillText(linha, LARGURA / 2, y);
    y += alturaLinha;
  }
  return y;
}

/** Cinco estrelas centralizadas, com meia estrela quando precisar. */
function desenharEstrelas(ctx, nota, y, tamanho, cores) {
  const espaco = tamanho * 0.25;
  const total = 5 * tamanho + 4 * espaco;
  const escala = tamanho / 24;
  const caminho = new Path2D(CAMINHO_ESTRELA);
  let x = (LARGURA - total) / 2;

  for (let n = 1; n <= 5; n += 1) {
    const preenchimento = nota >= n ? 1 : nota >= n - 0.5 ? 0.5 : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(escala, escala);
    // Fundo cinza
    ctx.fillStyle = cores.superficie;
    ctx.fill(caminho);
    // Parte amarela (inteira ou metade)
    if (preenchimento > 0) {
      ctx.beginPath();
      ctx.rect(0, 0, 24 * preenchimento, 24);
      ctx.clip();
      ctx.fillStyle = cores.destaque;
      ctx.fill(caminho);
    }
    ctx.restore();
    x += tamanho + espaco;
  }
}

/** Logo (círculo com reticências) + "PÓS·CRÉDITOS" centralizados. */
function desenharLogo(ctx, y, cores) {
  const diametro = 96;
  const gap = 28;
  ctx.font = '800 52px "Bricolage Grotesque", sans-serif';
  ctx.letterSpacing = '4px';
  const larguraNome = ctx.measureText('PÓS·CRÉDITOS').width;
  const inicio = (LARGURA - (diametro + gap + larguraNome)) / 2;

  // Símbolo: mesmas proporções do logo.svg (viewBox 96)
  ctx.fillStyle = cores.destaque;
  ctx.beginPath();
  ctx.arc(inicio + diametro / 2, y, diametro / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = cores.destaqueTexto;
  for (const [cx, cy] of [[28, 62], [48, 48], [68, 34]]) {
    ctx.beginPath();
    ctx.arc(inicio + cx, y - diametro / 2 + cy, 7.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nome: "PÓS" e "CRÉDITOS" em branco, ponto do meio em amarelo
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let x = inicio + diametro + gap;
  for (const [parte, cor] of [['PÓS', cores.texto], ['·', cores.destaque], ['CRÉDITOS', cores.texto]]) {
    ctx.fillStyle = cor;
    ctx.fillText(parte, x, y + 2);
    x += ctx.measureText(parte).width;
  }
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
}

/**
 * Gera o PNG do card.
 * @param {{review: object, autor: {username: string}}} dados
 * @returns {Promise<Blob>}
 */
export async function gerarCardReview({ review, autor }) {
  // Fontes precisam estar carregadas antes de desenhar
  await Promise.all([
    document.fonts.load('800 72px "Bricolage Grotesque"'),
    document.fonts.load('400 44px "Bricolage Grotesque"'),
    document.fonts.load('500 34px "DM Mono"'),
  ]);

  const cores = lerCores();
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';

  // Fundo
  ctx.fillStyle = cores.fundo;
  ctx.fillRect(0, 0, LARGURA, ALTURA);

  // "@FULANO AVALIOU"
  ctx.font = '500 34px "DM Mono", monospace';
  ctx.letterSpacing = '6px';
  ctx.fillStyle = cores.texto2;
  ctx.fillText(`@${autor.username} avaliou`.toUpperCase(), LARGURA / 2, 170);
  ctx.letterSpacing = '0px';

  // Capa (ou bloco com o nome, se não houver/carregar)
  const capa = { largura: 510, altura: 765, x: (LARGURA - 510) / 2, y: 240 };
  const imagem = await carregarImagem(urlImagem(review.posterPath, 'w780'));
  ctx.save();
  caminhoArredondado(ctx, capa.x, capa.y, capa.largura, capa.altura, 40);
  ctx.clip();
  if (imagem) {
    ctx.drawImage(imagem, capa.x, capa.y, capa.largura, capa.altura);
  } else {
    ctx.fillStyle = cores.superficie;
    ctx.fillRect(capa.x, capa.y, capa.largura, capa.altura);
  }
  ctx.restore();

  // Título (até 2 linhas)
  ctx.font = '800 72px "Bricolage Grotesque", sans-serif';
  ctx.fillStyle = cores.texto;
  const medirTitulo = (s) => ctx.measureText(s).width;
  let y = escreverCentralizado(ctx, quebrarEmLinhas(review.title, 920, medirTitulo, 2), capa.y + capa.altura + 120, 84);

  // Estrelas
  desenharEstrelas(ctx, review.rating, y - 20, 76, cores);
  y += 150;

  // Trecho da review (spoiler nunca vai para o card)
  ctx.font = '400 46px "Bricolage Grotesque", sans-serif';
  if (review.text && !review.spoiler) {
    ctx.fillStyle = cores.texto;
    const medir = (s) => ctx.measureText(s).width;
    const linhas = quebrarEmLinhas(`“${review.text}”`, 900, medir, 4);
    // Garante o fecha-aspas mesmo quando cortou com reticências
    if (!linhas.at(-1).endsWith('”')) linhas[linhas.length - 1] = `${linhas.at(-1)}”`;
    escreverCentralizado(ctx, linhas, y, 66);
  } else if (review.spoiler) {
    ctx.fillStyle = cores.texto2;
    ctx.fillText('Review com spoiler: leia no PósCréditos.', LARGURA / 2, y);
  }

  // Rodapé: logo + slogan
  desenharLogo(ctx, 1715, cores);
  ctx.font = '400 38px "Bricolage Grotesque", sans-serif';
  ctx.fillStyle = cores.texto2;
  ctx.fillText('A conversa começa quando o filme acaba.', LARGURA / 2, 1815);

  return new Promise((resolver, rejeitar) => {
    canvas.toBlob((blob) => (blob ? resolver(blob) : rejeitar(new Error('Falha ao gerar a imagem'))), 'image/png');
  });
}

/**
 * Gera e compartilha o card. Sem suporte a arquivos na Web Share API
 * (desktop, alguns navegadores), baixa o PNG.
 * @returns {Promise<'compartilhado'|'baixado'|'cancelado'>}
 */
export async function compartilharCard({ review, autor }) {
  const blob = await gerarCardReview({ review, autor });
  const nome = `poscreditos-${review.mediaKey}.png`;
  const arquivo = new File([blob], nome, { type: 'image/png' });

  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: `${review.title} no PósCréditos` });
      return 'compartilhado';
    } catch (erro) {
      if (erro?.name === 'AbortError') return 'cancelado';
      console.warn('[card] share falhou, baixando', erro);
    }
  }

  // Alternativa: download
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'baixado';
}
