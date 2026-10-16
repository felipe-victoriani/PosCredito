// =====================================================================
// ui.js — helpers de interface compartilhados por todas as páginas
// ---------------------------------------------------------------------
// Regra de ouro: conteúdo dinâmico SEMPRE via textContent/atributos,
// nunca innerHTML. Ícones são SVG montados com createElementNS.
// =====================================================================

import { fotoSegura, iniciais, indiceCorAvatar } from './perfil-regras.js';
import { anoDe, classificarTipo, criarMediaKey, ROTULO_TIPO, tituloDe, urlImagem } from './tmdb.js';

// ---------- Criação de elementos ----------

/**
 * Cria um elemento de forma segura.
 * @param {string} tag
 * @param {{classe?: string, texto?: string, atributos?: Record<string,string|number|boolean>}} [opcoes]
 * @param {(Node|string|null|false)[]} [filhos]
 */
export function el(tag, opcoes = {}, filhos = []) {
  const elemento = document.createElement(tag);
  if (opcoes.classe) elemento.className = opcoes.classe;
  if (opcoes.texto != null) elemento.textContent = opcoes.texto;
  for (const [nome, valor] of Object.entries(opcoes.atributos ?? {})) {
    // false/null = atributo ausente; true = atributo booleano
    if (valor === false || valor == null) continue;
    elemento.setAttribute(nome, valor === true ? '' : String(valor));
  }
  // Filhos falsy são ignorados para facilitar renderização condicional
  for (const filho of filhos) if (filho) elemento.append(filho);
  return elemento;
}

// ---------- Ícones (traçados do Lucide, licença ISC) ----------

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONES = {
  inicio: ['M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8', 'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  busca: ['M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0', 'm21 21-4.3-4.3'],
  mais: ['M5 12h14', 'M12 5v14'],
  salvar: ['m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z'],
  perfil: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
  voltar: ['m15 18-6-6 6-6'],
  compartilhar: ['M12 2v13', 'm16 6-4-4-4 4', 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8'],
  estrela: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'],
  check: ['M20 6 9 17l-5-5'],
  play: ['M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z'],
  alerta: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'M12 8v4', 'M12 16h.01'],
  filme: ['M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z', 'm6.2 5.3 3.1 3.9', 'm12.4 3.4 3.1 4', 'M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z'],
  tv: ['M4 7h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z', 'm17 2-5 5-5-5'],
  coracao: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
  globo: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20'],
  pessoas: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  sair: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
  fechar: ['M18 6 6 18', 'm6 6 12 12'],
  editar: ['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'],
};

/**
 * Cria um ícone SVG que herda a cor do texto (currentColor).
 * Sem rótulo, o ícone é decorativo (aria-hidden).
 */
export function icone(nome, { tamanho = 24, preenchido = false, rotulo = null } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(tamanho));
  svg.setAttribute('height', String(tamanho));
  svg.setAttribute('fill', preenchido ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.classList.add('icone');
  if (rotulo) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', rotulo);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  for (const d of ICONES[nome] ?? []) {
    const caminho = document.createElementNS(SVG_NS, 'path');
    caminho.setAttribute('d', d);
    svg.append(caminho);
  }
  return svg;
}

// ---------- Títulos (pôster, selo, links) ----------

/** Link interno para a página do título. */
export function linkTitulo(item, mediaType = item.media_type) {
  return `titulo.html?id=${criarMediaKey(mediaType, item.id)}`;
}

/** Selo de tipo em DM Mono (FILME, SÉRIE, ANIME, DORAMA). */
export function criarSelo(tipo) {
  return el('span', { classe: `selo selo--${tipo}`, texto: ROTULO_TIPO[tipo] ?? tipo });
}

/**
 * Pôster com lazy loading e placeholder (título escrito) quando não
 * houver capa ou a imagem falhar.
 * @param {object} item - título do TMDB
 * @param {{tamanho?: string, alt?: string, prioridade?: boolean}} [opcoes]
 *   alt vazio = decorativo (o nome já aparece em texto ao lado)
 */
export function criarPoster(item, { tamanho = 'w342', alt = '', prioridade = false } = {}) {
  const moldura = el('div', { classe: 'poster' });
  const src = urlImagem(item.poster_path, tamanho);

  // Placeholder com o nome do título, igual às referências
  const mostrarPlaceholder = () => {
    moldura.replaceChildren(el('span', { classe: 'poster__placeholder', texto: tituloDe(item), atributos: { 'aria-hidden': alt ? null : 'true' } }));
    moldura.classList.add('poster--vazio');
  };

  if (!src) {
    mostrarPlaceholder();
    return moldura;
  }

  const img = el('img', {
    atributos: {
      src,
      alt,
      width: 342,
      height: 513,
      // Imagem principal da página carrega já; o resto, sob demanda
      loading: prioridade ? 'eager' : 'lazy',
      fetchpriority: prioridade ? 'high' : null,
      decoding: 'async',
    },
  });
  img.addEventListener('error', mostrarPlaceholder, { once: true });
  moldura.append(img);
  return moldura;
}

/** Cartão de grade: pôster + nome, levando à página do título. */
export function criarCartaoPoster(item, mediaType = item.media_type) {
  const tipo = classificarTipo(item, mediaType);
  const ano = anoDe(item);
  return el('li', {}, [
    el('a', { classe: 'cartao-poster', atributos: { href: linkTitulo(item, mediaType) } }, [
      criarPoster(item),
      el('span', { classe: 'cartao-poster__nome', texto: tituloDe(item) }),
      el('span', { classe: 'cartao-poster__meta', texto: [ROTULO_TIPO[tipo], ano].filter(Boolean).join(' · ') }),
    ]),
  ]);
}

// ---------- Pessoas ----------

/**
 * Avatar redondo: foto do Google ou iniciais sobre uma cor fixa da pessoa.
 * Decorativo (alt vazio): o nome sempre aparece em texto ao lado.
 * @param {{uid?: string, displayName?: string, photoURL?: string}} perfil
 * @param {'p'|'m'|'g'} [tamanho] - 40px, 56px ou 96px
 */
export function criarAvatar(perfil, tamanho = 'm') {
  const classe = `avatar avatar--${tamanho}`;
  const foto = fotoSegura(perfil?.photoURL);

  // Sem foto (ou se ela falhar): iniciais coloridas
  const criarIniciais = () =>
    el('span', {
      classe: `${classe} avatar--cor-${indiceCorAvatar(perfil?.uid)}`,
      texto: iniciais(perfil?.displayName),
      atributos: { 'aria-hidden': 'true' },
    });

  if (!foto) return criarIniciais();

  const img = el('img', {
    classe,
    atributos: { src: foto, alt: '', width: 96, height: 96, loading: 'lazy', referrerpolicy: 'no-referrer' },
  });
  img.addEventListener('error', () => img.replaceWith(criarIniciais()), { once: true });
  return img;
}

// ---------- Estados (carregando, vazio, erro) ----------

/** Mensagem amigável a partir de um erro do catálogo (sem detalhes técnicos). */
export function mensagemErro(erro) {
  if (erro?.status === 404) return 'Não encontramos esse título.';
  if (erro?.status === 400) return 'Essa busca não é válida. Tente outro termo.';
  return 'Não foi possível carregar agora. Verifique a conexão e tente de novo.';
}

/**
 * Bloco de estado (vazio/erro) com ação opcional de "tentar de novo".
 * @param {{tipo: 'vazio'|'erro', mensagem: string, acao?: {texto: string, onClick: () => void}}} opcoes
 */
export function criarEstado({ tipo, mensagem, acao }) {
  const botao = acao ? el('button', { classe: 'botao botao--secundario', texto: acao.texto, atributos: { type: 'button' } }) : null;
  botao?.addEventListener('click', acao.onClick);
  return el('div', { classe: `estado estado--${tipo}`, atributos: { role: tipo === 'erro' ? 'alert' : null } }, [
    tipo === 'erro' ? icone('alerta', { tamanho: 28 }) : null,
    el('p', { texto: mensagem }),
    botao,
  ]);
}

/** Lista de cartões "fantasma" enquanto carrega (evita salto de layout). */
export function criarEsqueletos(quantidade, classe = 'esqueleto esqueleto--poster') {
  return Array.from({ length: quantidade }, () => el('li', { atributos: { 'aria-hidden': 'true' } }, [el('div', { classe })]));
}

// ---------- Toast (avisos rápidos) ----------

let temporizadorToast;

/** Mostra aviso curto anunciado por leitor de tela (aria-live). */
export function mostrarToast(mensagem) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = el('div', { classe: 'toast', atributos: { id: 'toast', role: 'status', 'aria-live': 'polite' } });
    document.body.append(toast);
  }
  toast.textContent = mensagem;
  toast.classList.add('toast--visivel');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => toast.classList.remove('toast--visivel'), 3200);
}

// ---------- Navegação inferior e rodapé ----------

// Itens da barra inferior (o "+" fica no meio, como nas referências)
const ITENS_NAV = [
  { id: 'inicio', texto: 'Início', href: 'index.html', icone: 'inicio' },
  { id: 'busca', texto: 'Buscar', href: 'busca.html', icone: 'busca' },
  { id: 'nova', texto: 'Nova review', href: 'busca.html?avaliar=1', icone: 'mais', destaque: true },
  { id: 'listas', texto: 'Listas', href: 'perfil.html#listas', icone: 'salvar' },
  { id: 'perfil', texto: 'Perfil', href: 'perfil.html', icone: 'perfil' },
];

/** Preenche <nav class="nav-inferior" data-ativo="..."> com os itens. */
export function montarNavegacao() {
  const nav = document.querySelector('.nav-inferior');
  if (!nav) return;
  const ativo = nav.dataset.ativo;

  const itens = ITENS_NAV.map((item) => {
    const link = el(
      'a',
      {
        classe: item.destaque ? 'nav-inferior__fab' : 'nav-inferior__item',
        atributos: {
          href: item.href,
          'aria-current': item.id === ativo ? 'page' : null,
          // No botão "+" só o ícone aparece; o nome vai para o leitor de tela
          'aria-label': item.destaque ? item.texto : null,
        },
      },
      [icone(item.icone, { tamanho: item.destaque ? 28 : 24 }), item.destaque ? null : el('span', { texto: item.texto })],
    );
    return el('li', {}, [link]);
  });

  nav.replaceChildren(el('ul', { classe: 'nav-inferior__lista' }, itens));
}

/** Preenche <footer class="rodape"> com a atribuição obrigatória do TMDB. */
export function montarRodape() {
  const rodape = document.querySelector('.rodape');
  if (!rodape) return;
  rodape.replaceChildren(
    el('a', { classe: 'rodape__tmdb', atributos: { href: 'https://www.themoviedb.org/', target: '_blank', rel: 'noopener noreferrer' } }, [
      el('img', { atributos: { src: 'img/tmdb-logo.svg', alt: 'The Movie Database (TMDB)', width: 120, height: 16, loading: 'lazy' } }),
    ]),
    el('p', { texto: 'Este produto usa a API do TMDB, mas não é endossado ou certificado pelo TMDB.' }),
    el('p', { classe: 'rodape__marca', texto: 'PósCréditos · A conversa começa quando o filme acaba.' }),
  );
}

/** Inicialização comum de toda página. */
export function iniciarPagina() {
  montarNavegacao();
  montarRodape();
}
