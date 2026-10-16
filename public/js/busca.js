// =====================================================================
// busca.js — página de busca de títulos
// ---------------------------------------------------------------------
// - Busca com debounce enquanto digita, sincronizando ?q= na URL.
// - Resultados separados por tipo via chips (Tudo/Filmes/Séries/Animes/Doramas).
// - Sem texto: mostra "Em alta na semana".
// =====================================================================

import {
  anoDe,
  buscarTitulos,
  classificarTipo,
  ROTULO_TIPO_PLURAL,
  tituloDe,
  tituloOriginalDe,
  tmdbGet,
} from './tmdb.js';
import {
  criarAvatar,
  criarCartaoPoster,
  criarEsqueletos,
  criarEstado,
  criarPoster,
  criarSelo,
  el,
  iniciarPagina,
  linkTitulo,
  mensagemErro,
} from './ui.js';

import { formatarContador } from './perfil-regras.js';

// Espera após a última tecla antes de buscar (ms)
const DEBOUNCE_MS = 350;
// Tempo máximo esperando a busca de pessoas (ms)
const TEMPO_MAX_PESSOAS_MS = 4000;
// Ordem fixa dos chips de tipo (pessoas por último, como nas referências)
const ORDEM_TIPOS = ['filme', 'serie', 'anime', 'dorama', 'pessoa'];
const ROTULOS_FILTRO = { ...ROTULO_TIPO_PLURAL, pessoa: 'Pessoas' };
// Veio do botão "+": os links levam ao título já com o editor aberto
const SUFIXO_LINK = new URLSearchParams(location.search).get('avaliar') === '1' ? '&avaliar=1' : '';

// Elementos da página
const form = document.getElementById('form-busca');
const campo = document.getElementById('campo-busca');
const filtros = document.getElementById('filtros-busca');
const contagem = document.getElementById('contagem-resultados');
const lista = document.getElementById('resultados');
const botaoMais = document.getElementById('mais-resultados');
const secaoEmAlta = document.getElementById('secao-em-alta');
const gradeEmAlta = document.getElementById('grade-em-alta');
const dicaAvaliar = document.getElementById('dica-avaliar');

// Estado da busca atual
let termoAtual = '';
let paginaAtual = 0;
let totalPaginas = 0;
// Títulos: { chave, tipo, item }  ·  Pessoas: { chave, tipo: 'pessoa', perfil }
let resultados = [];
let filtroAtual = 'tudo';
let temporizador;
// Descarta respostas que chegam fora de ordem
let geracao = 0;

// ---------- Renderização ----------

/** Linha de pessoa: avatar + nome + @ + seguidores. */
function criarLinhaPessoa(perfil) {
  const seguidores = perfil.stats?.followers ?? 0;
  return el('li', {}, [
    el('a', { classe: 'resultado resultado--pessoa', atributos: { href: `perfil.html?u=${encodeURIComponent(perfil.username)}` } }, [
      criarAvatar(perfil, 'm'),
      el('div', { classe: 'resultado__info' }, [
        el('span', { classe: 'resultado__nome', texto: perfil.displayName }),
        el('span', {
          classe: 'resultado__mono',
          texto: `@${perfil.username} · ${formatarContador(seguidores)} ${seguidores === 1 ? 'seguidor' : 'seguidores'}`,
        }),
      ]),
    ]),
  ]);
}

/** Linha de resultado: pôster + nome + selo + ano (+ título original). */
function criarLinhaResultado({ item, tipo, perfil }) {
  if (tipo === 'pessoa') return criarLinhaPessoa(perfil);
  const original = tituloOriginalDe(item);
  return el('li', {}, [
    el('a', { classe: 'resultado', atributos: { href: linkTitulo(item) + SUFIXO_LINK } }, [
      criarPoster(item),
      el('div', { classe: 'resultado__info' }, [
        el('span', { classe: 'resultado__nome', texto: tituloDe(item) }),
        el('span', { classe: 'resultado__meta' }, [criarSelo(tipo), el('span', { texto: anoDe(item) ?? 'Sem data' })]),
        original ? el('span', { classe: 'resultado__original', texto: original, atributos: { lang: item.original_language } }) : null,
      ]),
    ]),
  ]);
}

/** Chips de tipo, só com os tipos que apareceram, cada um com contagem. */
function renderizarFiltros() {
  const porTipo = Object.groupBy(resultados, (r) => r.tipo);
  const tipos = ORDEM_TIPOS.filter((t) => porTipo[t]?.length);

  // Se o filtro escolhido sumiu (nova busca), volta para "Tudo"
  if (filtroAtual !== 'tudo' && !tipos.includes(filtroAtual)) filtroAtual = 'tudo';

  const criarChip = (id, texto, total) =>
    el('button', {
      classe: 'chip',
      texto: `${texto} ${total}`,
      atributos: { type: 'button', 'data-filtro': id, 'aria-pressed': String(filtroAtual === id) },
    });

  filtros.replaceChildren(
    criarChip('tudo', 'Tudo', resultados.length),
    ...tipos.map((t) => criarChip(t, ROTULOS_FILTRO[t], porTipo[t].length)),
  );
  // Só faz sentido filtrar se houver mais de um tipo
  filtros.hidden = tipos.length < 2;
}

/** Desenha a lista conforme o filtro ativo. */
function renderizarResultados() {
  const visiveis = filtroAtual === 'tudo' ? resultados : resultados.filter((r) => r.tipo === filtroAtual);
  lista.replaceChildren(...visiveis.map(criarLinhaResultado));

  const total = visiveis.length;
  contagem.textContent = total === 1 ? '1 resultado' : `${total} resultados`;
  botaoMais.hidden = paginaAtual >= totalPaginas;

  if (!resultados.length) {
    contagem.textContent = '';
    lista.replaceChildren(
      el('li', {}, [criarEstado({ tipo: 'vazio', mensagem: `Nada encontrado para "${termoAtual}". Confira a grafia ou tente o título original.` })]),
    );
  }
}

// ---------- Busca ----------

/** Executa a busca (página 1 zera a lista; páginas seguintes acrescentam). */
async function buscar(termo, pagina = 1) {
  const minhaGeracao = ++geracao;
  termoAtual = termo;
  secaoEmAlta.hidden = true;
  botaoMais.hidden = true;

  if (pagina === 1) {
    resultados = [];
    lista.replaceChildren(...criarEsqueletos(5, 'esqueleto esqueleto--linha'));
    contagem.textContent = 'Buscando…';
  }
  lista.setAttribute('aria-busy', 'true');

  // Pessoas só na primeira página, em paralelo com os títulos
  const promessaPessoas = pagina === 1 ? buscarPessoasSemFalhar(termo) : Promise.resolve([]);

  try {
    const [dados, pessoas] = await Promise.all([buscarTitulos(termo, pagina), promessaPessoas]);
    if (minhaGeracao !== geracao) return;

    // Classifica cada item uma vez só (anime/dorama dependem de gênero e idioma)
    const novos = [
      ...dados.results.map((item) => ({ chave: `${item.media_type}_${item.id}`, item, tipo: classificarTipo(item) })),
      ...pessoas.map((perfil) => ({ chave: `pessoa_${perfil.uid}`, perfil, tipo: 'pessoa' })),
    ];
    // Evita duplicados entre páginas (o TMDB às vezes repete)
    const vistos = new Set(resultados.map((r) => r.chave));
    const semRepetidos = novos.filter((r) => !vistos.has(r.chave));
    // Pessoas ficam sempre no fim da lista
    resultados = [...resultados, ...semRepetidos].sort((a, b) => (a.tipo === 'pessoa') - (b.tipo === 'pessoa'));

    paginaAtual = dados.page;
    totalPaginas = Math.min(dados.total_pages, 10);
    renderizarFiltros();
    renderizarResultados();
  } catch (erro) {
    if (minhaGeracao !== geracao) return;
    console.error('[busca] falha', erro);
    contagem.textContent = '';
    lista.replaceChildren(
      el('li', {}, [criarEstado({ tipo: 'erro', mensagem: mensagemErro(erro), acao: { texto: 'Tentar de novo', onClick: () => buscar(termo, pagina) } })]),
    );
  } finally {
    if (minhaGeracao === geracao) lista.removeAttribute('aria-busy');
  }
}

/**
 * Busca pessoas por @. O Firebase só é carregado aqui (import dinâmico),
 * então quem só busca títulos não baixa o SDK. Falha vira lista vazia:
 * a busca de títulos continua funcionando.
 */
async function buscarPessoasSemFalhar(termo) {
  // Sem conexão com o banco o get() pode esperar indefinidamente:
  // desiste depois de alguns segundos para não segurar os títulos
  let temporizadorLimite;
  const limite = new Promise((_, rejeitar) => {
    temporizadorLimite = setTimeout(() => rejeitar(new Error('busca de pessoas: tempo esgotado')), TEMPO_MAX_PESSOAS_MS);
  });
  try {
    // O limite cobre também o download do SDK (CDN lento)
    const busca = import('./social.js').then(({ buscarPessoas }) => buscarPessoas(termo));
    return await Promise.race([busca, limite]);
  } catch (erro) {
    console.error('[busca] pessoas', erro);
    return [];
  } finally {
    clearTimeout(temporizadorLimite);
  }
}

/** Volta ao estado inicial (campo vazio): mostra "Em alta". */
function limparBusca() {
  geracao += 1;
  termoAtual = '';
  resultados = [];
  lista.replaceChildren();
  filtros.hidden = true;
  contagem.textContent = '';
  botaoMais.hidden = true;
  secaoEmAlta.hidden = false;
}

/** Mantém ?q= na URL para o botão voltar e para compartilhar a busca. */
function atualizarUrl(termo) {
  const url = new URL(location.href);
  if (termo) url.searchParams.set('q', termo);
  else url.searchParams.delete('q');
  history.replaceState(null, '', url);
}

/** Reage ao texto do campo (com ou sem debounce). */
function aoMudarTexto({ imediato = false } = {}) {
  clearTimeout(temporizador);
  const termo = campo.value.trim();
  atualizarUrl(termo);

  if (!termo) return limparBusca();
  if (termo === termoAtual && resultados.length) return;

  if (imediato) buscar(termo);
  else temporizador = setTimeout(() => buscar(termo), DEBOUNCE_MS);
}

// ---------- "Em alta na semana" (estado vazio) ----------

async function carregarEmAlta() {
  gradeEmAlta.replaceChildren(...criarEsqueletos(8, 'esqueleto esqueleto--cartao'));
  try {
    const dados = await tmdbGet('/trending/all/week');
    const itens = (dados.results ?? []).filter((i) => i.media_type === 'movie' || i.media_type === 'tv').slice(0, 12);
    gradeEmAlta.replaceChildren(...itens.map((item) => criarCartaoPoster(item, item.media_type, SUFIXO_LINK)));
  } catch (erro) {
    console.error('[busca] falha em alta', erro);
    // Não é essencial: some com a seção em vez de mostrar erro
    secaoEmAlta.hidden = true;
  }
}

// ---------- Eventos ----------

campo.addEventListener('input', () => aoMudarTexto());
// Enter busca na hora (e fecha o teclado no celular)
form.addEventListener('submit', (evento) => {
  evento.preventDefault();
  aoMudarTexto({ imediato: true });
  campo.blur();
});
filtros.addEventListener('click', (evento) => {
  const chip = evento.target.closest('.chip');
  if (!chip) return;
  filtroAtual = chip.dataset.filtro;
  for (const c of filtros.querySelectorAll('.chip')) c.setAttribute('aria-pressed', String(c === chip));
  renderizarResultados();
});
botaoMais.addEventListener('click', () => buscar(termoAtual, paginaAtual + 1));

// ---------- Início ----------

iniciarPagina();

const parametros = new URLSearchParams(location.search);
// Veio do botão "+": dica de que é para escolher o título a avaliar
dicaAvaliar.hidden = parametros.get('avaliar') !== '1';

const termoInicial = (parametros.get('q') ?? '').slice(0, 100);
if (termoInicial) {
  campo.value = termoInicial;
  buscar(termoInicial);
} else {
  secaoEmAlta.hidden = false;
}
// Carrega a vitrine de qualquer jeito (fica pronta se o campo for limpo)
carregarEmAlta();
// Foco no campo só quando a busca está vazia (evita abrir teclado à toa)
if (!termoInicial) campo.focus();
