// =====================================================================
// feed.js — página inicial
// ---------------------------------------------------------------------
// Feed de reviews com abas "Seguindo" e "Em alta" + filtros por tipo,
// e embaixo a vitrine "Em alta no catálogo" (TMDB).
// A parte de reviews usa Firebase e é carregada com import dinâmico:
// se falhar, a vitrine do catálogo continua funcionando.
// =====================================================================

import { criarCartaoReview } from './cartao-review.js';
import { semBloqueados } from './moderacao-regras.js';
import { filtrarPorTipo, mesclarPorData, ordenarEmAlta } from './social-regras.js';
import { classificarTipo, ROTULO_TIPO_PLURAL, tmdbGet } from './tmdb.js';
import { criarCartaoPoster, criarEsqueletos, criarEstado, el, iniciarPagina, mensagemErro } from './ui.js';

// Quantas reviews mostrar por vez
const POR_PAGINA = 10;

// Elementos
const $ = (id) => document.getElementById(id);
const listaFeed = $('lista-feed');
const botaoMaisFeed = $('mais-feed');
const filtros = $('filtros-feed');
const abas = $('abas-feed');
const grade = $('grade-em-alta');
const botaoMaisVitrine = $('carregar-mais');

// Estado do feed
let abaAtual = 'em-alta';
let filtroAtual = 'tudo';
let mostrando = POR_PAGINA;
let usuario = null;
let modulos = null; // { reviews, social, acoes } depois do import dinâmico
let seguidos = null; // uids que a pessoa segue
let bloqueados = new Set(); // uids bloqueados (somem do feed)
const cache = { 'em-alta': null, seguindo: null }; // itens já carregados por aba

// =====================================================================
// Feed de reviews
// =====================================================================

// Promessa única do carregamento (chamadas simultâneas esperam a mesma)
let promessaModulos = null;

/** Carrega (uma vez) os módulos que dependem do Firebase. */
function carregarModulos() {
  promessaModulos ??= (async () => {
    const [auth, reviews, social, acoes, moderacao] = await Promise.all([
      import('./auth.js'),
      import('./reviews.js'),
      import('./social.js'),
      import('./acoes-review.js'),
      import('./moderation.js'),
    ]);
    usuario = await auth.usuarioAtual();
    bloqueados = await moderacao.obterBloqueados(usuario?.uid);
    modulos = { reviews, social, acoes };
    return modulos;
  })();
  // Se falhar, permite tentar de novo depois
  promessaModulos.catch(() => {
    promessaModulos = null;
  });
  return promessaModulos;
}

/** Busca os itens da aba (com cache durante a visita). */
async function obterItens(aba) {
  if (cache[aba]) return cache[aba];
  const { reviews } = modulos;
  if (aba === 'em-alta') {
    cache[aba] = ordenarEmAlta(await reviews.listarReviewsRecentes(50));
  } else {
    const listas = await reviews.listarReviewsDeSeguidos(seguidos ?? []);
    cache[aba] = mesclarPorData(listas, 40);
  }
  return cache[aba];
}

/** Botão que leva ao login e volta para o feed. */
function criarBotaoEntrar() {
  return el('a', { classe: 'botao botao--primario', texto: 'Entrar', atributos: { href: 'perfil.html?voltar=index.html' } });
}

/** Mensagem de lista vazia conforme aba e filtro. */
function mostrarVazio() {
  let mensagem;
  let extra = null;
  if (abaAtual === 'seguindo' && !usuario) {
    mensagem = 'Entre para ver as reviews de quem você segue.';
    extra = criarBotaoEntrar();
  } else if (abaAtual === 'seguindo' && !seguidos?.length) {
    mensagem = 'Você ainda não segue ninguém. Busque pessoas pelo @ na busca ou siga quem aparece em "Em alta".';
  } else if (filtroAtual !== 'tudo') {
    mensagem = `Nenhuma review de ${ROTULO_TIPO_PLURAL[filtroAtual].toLowerCase()} por aqui ainda.`;
  } else if (abaAtual === 'seguindo') {
    mensagem = 'Quem você segue ainda não publicou reviews.';
  } else {
    mensagem = 'Ainda não há reviews. Assistiu alguma coisa? Toque no + e conta pra gente.';
  }
  const estado = criarEstado({ tipo: 'vazio', mensagem });
  if (extra) estado.append(extra);
  listaFeed.replaceChildren(el('li', {}, [estado]));
}

/** Desenha os itens da aba atual com o filtro aplicado. */
function renderizarFeed(itens) {
  const filtrados = filtrarPorTipo(semBloqueados(itens, bloqueados), filtroAtual);
  if (!filtrados.length) {
    botaoMaisFeed.hidden = true;
    return mostrarVazio();
  }
  const visiveis = filtrados.slice(0, mostrando);
  listaFeed.replaceChildren(
    ...visiveis.map((item) =>
      el('li', {}, [criarCartaoReview(item, { mostrarTitulo: true, acoes: modulos.acoes.criarAcoesReview(item.review, usuario, { autor: item.autor }) })]),
    ),
  );
  botaoMaisFeed.hidden = filtrados.length <= mostrando;
}

/** Carrega e mostra a aba atual. */
async function carregarFeed() {
  const aba = abaAtual;
  listaFeed.replaceChildren(el('li', {}, [el('div', { classe: 'esqueleto esqueleto--review' })]), el('li', {}, [el('div', { classe: 'esqueleto esqueleto--review' })]));
  listaFeed.setAttribute('aria-busy', 'true');
  botaoMaisFeed.hidden = true;

  try {
    await carregarModulos();
    // "Seguindo" sem login: nem consulta o banco
    if (aba === 'seguindo' && !usuario) return mostrarVazio();
    if (aba === 'seguindo' && seguidos === null) seguidos = await modulos.social.listarSeguidos(usuario.uid);

    const itens = await obterItens(aba);
    if (aba !== abaAtual) return; // trocou de aba no meio
    renderizarFeed(itens);
  } catch (erro) {
    if (aba !== abaAtual) return;
    console.error('[feed] reviews', erro);
    listaFeed.replaceChildren(
      el('li', {}, [criarEstado({ tipo: 'erro', mensagem: 'Não foi possível carregar as reviews agora.', acao: { texto: 'Tentar de novo', onClick: carregarFeed } })]),
    );
  } finally {
    if (aba === abaAtual) listaFeed.removeAttribute('aria-busy');
  }
}

/** Troca de aba (clique ou teclado). */
function selecionarAba(aba, { focar = false } = {}) {
  abaAtual = aba;
  mostrando = POR_PAGINA;
  for (const botao of abas.querySelectorAll('.abas__aba')) {
    const ativa = botao.dataset.aba === aba;
    botao.setAttribute('aria-selected', String(ativa));
    botao.tabIndex = ativa ? 0 : -1;
    if (ativa) {
      $('painel-feed').setAttribute('aria-labelledby', botao.id);
      if (focar) botao.focus();
    }
  }
  carregarFeed();
}

/**
 * Aba inicial: "Seguindo" para quem já segue alguém; senão "Em alta".
 * (Precisa dos módulos para saber quem a pessoa segue.)
 */
async function escolherAbaInicial() {
  // Esqueleto já na abertura, enquanto descobre quem a pessoa segue
  listaFeed.replaceChildren(el('li', {}, [el('div', { classe: 'esqueleto esqueleto--review' })]));
  let aba = 'em-alta';
  try {
    await carregarModulos();
    if (usuario) {
      seguidos = await modulos.social.listarSeguidos(usuario.uid);
      if (seguidos.length) aba = 'seguindo';
    }
  } catch (erro) {
    console.error('[feed] aba inicial', erro);
  }
  // Se a pessoa já tocou numa aba enquanto isso, a escolha dela vence
  if (!pessoaEscolheuAba) selecionarAba(aba);
}

// true depois do primeiro toque/teclado nas abas
let pessoaEscolheuAba = false;

// =====================================================================
// Vitrine do catálogo (TMDB)
// =====================================================================

// Como buscar cada filtro no TMDB.
// "mediaType" informa o tipo quando o endpoint não devolve media_type.
// "manter" filtra no cliente quando o TMDB não tem filtro equivalente.
const FONTES = {
  tudo: { caminho: '/trending/all/week' },
  filme: { caminho: '/trending/movie/week', mediaType: 'movie' },
  serie: { caminho: '/trending/tv/week', mediaType: 'tv', manter: 'serie' },
  anime: {
    caminho: '/discover/tv',
    mediaType: 'tv',
    params: { with_genres: '16', with_original_language: 'ja', sort_by: 'popularity.desc' },
  },
  dorama: {
    caminho: '/discover/tv',
    mediaType: 'tv',
    params: { with_original_language: 'ko', without_genres: '16,99,10763,10764,10767', sort_by: 'popularity.desc' },
  },
};

let paginaVitrine = 0;
let geracaoVitrine = 0;

/** Embrulha um bloco de estado num <li> ocupando a grade toda. */
function itemDeEstado(conteudo) {
  return el('li', { classe: 'grade-posters__estado' }, [conteudo]);
}

/** Carrega a próxima página da vitrine e acrescenta na grade. */
async function carregarVitrine() {
  const minhaGeracao = geracaoVitrine;
  const fonte = FONTES[filtroAtual];
  botaoMaisVitrine.hidden = true;

  if (paginaVitrine === 0) grade.replaceChildren(...criarEsqueletos(6, 'esqueleto esqueleto--cartao'));
  grade.setAttribute('aria-busy', 'true');

  try {
    const dados = await tmdbGet(fonte.caminho, { ...fonte.params, page: paginaVitrine + 1 });
    if (minhaGeracao !== geracaoVitrine) return; // trocou de filtro no meio

    // Remove pessoas (trending/all) e aplica filtro de tipo no cliente se preciso
    const itens = (dados.results ?? [])
      .filter((item) => (item.media_type ?? fonte.mediaType) !== 'person')
      .filter((item) => !fonte.manter || classificarTipo(item, fonte.mediaType) === fonte.manter);

    if (paginaVitrine === 0) grade.replaceChildren();
    grade.append(...itens.map((item) => criarCartaoPoster(item, item.media_type ?? fonte.mediaType)));

    paginaVitrine = dados.page ?? paginaVitrine + 1;
    botaoMaisVitrine.hidden = paginaVitrine >= Math.min(dados.total_pages ?? 1, 20);

    if (!grade.children.length) grade.replaceChildren(itemDeEstado(criarEstado({ tipo: 'vazio', mensagem: 'Nada em alta por aqui agora.' })));
  } catch (erro) {
    if (minhaGeracao !== geracaoVitrine) return;
    console.error('[feed] vitrine', erro);
    if (paginaVitrine === 0) {
      grade.replaceChildren(itemDeEstado(criarEstado({ tipo: 'erro', mensagem: mensagemErro(erro), acao: { texto: 'Tentar de novo', onClick: carregarVitrine } })));
    } else {
      botaoMaisVitrine.hidden = false;
    }
  } finally {
    if (minhaGeracao === geracaoVitrine) grade.removeAttribute('aria-busy');
  }
}

// =====================================================================
// Eventos e início
// =====================================================================

/** Troca o filtro de tipo: refaz o feed (do cache) e a vitrine. */
function trocarFiltro(novo) {
  if (novo === filtroAtual || !FONTES[novo]) return;
  filtroAtual = novo;
  mostrando = POR_PAGINA;
  for (const chip of filtros.querySelectorAll('.chip')) chip.setAttribute('aria-pressed', String(chip.dataset.filtro === novo));

  // Feed: se a aba já está carregada, só refiltra
  if (cache[abaAtual]) renderizarFeed(cache[abaAtual]);

  paginaVitrine = 0;
  geracaoVitrine += 1;
  carregarVitrine();
}

filtros.addEventListener('click', (evento) => {
  const chip = evento.target.closest('.chip');
  if (chip) trocarFiltro(chip.dataset.filtro);
});

abas.addEventListener('click', (evento) => {
  const botao = evento.target.closest('.abas__aba');
  if (!botao) return;
  pessoaEscolheuAba = true;
  // Tocar na aba já ativa antes do primeiro carregamento também carrega
  if (botao.dataset.aba !== abaAtual || !listaFeed.querySelector('.review, .estado')) selecionarAba(botao.dataset.aba);
});

// Setas trocam entre as duas abas (padrão ARIA)
abas.addEventListener('keydown', (evento) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(evento.key)) return;
  evento.preventDefault();
  pessoaEscolheuAba = true;
  selecionarAba(abaAtual === 'seguindo' ? 'em-alta' : 'seguindo', { focar: true });
});

botaoMaisFeed.addEventListener('click', () => {
  mostrando += POR_PAGINA;
  renderizarFeed(cache[abaAtual] ?? []);
});
botaoMaisVitrine.addEventListener('click', carregarVitrine);

iniciarPagina();
carregarVitrine();
escolherAbaInicial();
