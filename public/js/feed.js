// =====================================================================
// feed.js — página inicial
// ---------------------------------------------------------------------
// Fase 1: vitrine "Em alta" do TMDB, filtrável por tipo.
// Fase 4: ganha as abas "Seguindo" / "Em alta" com reviews da comunidade.
// =====================================================================

import { classificarTipo, tmdbGet } from './tmdb.js';
import { criarCartaoPoster, criarEsqueletos, criarEstado, el, iniciarPagina, mensagemErro } from './ui.js';

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

// Elementos da página
const grade = document.getElementById('grade-em-alta');
const botaoMais = document.getElementById('carregar-mais');
const filtros = document.getElementById('filtros-em-alta');

// Estado atual da vitrine
let filtroAtual = 'tudo';
let paginaAtual = 0;
let totalPaginas = 1;
// Contador para descartar respostas antigas ao trocar de filtro rápido
let geracao = 0;

/** Carrega a próxima página do filtro atual e acrescenta na grade. */
async function carregarPagina() {
  const minhaGeracao = geracao;
  const fonte = FONTES[filtroAtual];
  botaoMais.hidden = true;

  // Na primeira página mostra esqueletos no lugar dos pôsteres
  if (paginaAtual === 0) grade.replaceChildren(...criarEsqueletos(12, 'esqueleto esqueleto--cartao'));
  grade.setAttribute('aria-busy', 'true');

  try {
    const dados = await tmdbGet(fonte.caminho, { ...fonte.params, page: paginaAtual + 1 });
    if (minhaGeracao !== geracao) return; // usuário trocou de filtro no meio

    // Remove pessoas (trending/all) e aplica filtro de tipo no cliente se preciso
    const itens = (dados.results ?? [])
      .filter((item) => (item.media_type ?? fonte.mediaType) !== 'person')
      .filter((item) => !fonte.manter || classificarTipo(item, fonte.mediaType) === fonte.manter);

    if (paginaAtual === 0) grade.replaceChildren();
    grade.append(...itens.map((item) => criarCartaoPoster(item, item.media_type ?? fonte.mediaType)));

    paginaAtual = dados.page ?? paginaAtual + 1;
    totalPaginas = Math.min(dados.total_pages ?? 1, 20);
    botaoMais.hidden = paginaAtual >= totalPaginas;

    if (!grade.children.length) {
      grade.replaceChildren(itemDeEstado(criarEstado({ tipo: 'vazio', mensagem: 'Nada em alta por aqui agora.' })));
    }
  } catch (erro) {
    if (minhaGeracao !== geracao) return;
    console.error('[feed] falha ao carregar em alta', erro);
    // Só substitui a grade se ainda não havia nada carregado
    if (paginaAtual === 0) {
      grade.replaceChildren(itemDeEstado(criarEstado({ tipo: 'erro', mensagem: mensagemErro(erro), acao: { texto: 'Tentar de novo', onClick: carregarPagina } })));
    } else {
      botaoMais.hidden = false;
    }
  } finally {
    if (minhaGeracao === geracao) grade.removeAttribute('aria-busy');
  }
}

/** Embrulha um bloco de estado num <li> ocupando a grade toda. */
function itemDeEstado(conteudo) {
  return el('li', { classe: 'grade-posters__estado' }, [conteudo]);
}

/** Troca o filtro ativo (chips Tudo/Filmes/Séries/Animes/Doramas). */
function trocarFiltro(novo) {
  if (novo === filtroAtual || !FONTES[novo]) return;
  filtroAtual = novo;
  paginaAtual = 0;
  geracao += 1;
  for (const chip of filtros.querySelectorAll('.chip')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.filtro === novo));
  }
  carregarPagina();
}

// ---------- Eventos ----------

filtros.addEventListener('click', (evento) => {
  const chip = evento.target.closest('.chip');
  if (chip) trocarFiltro(chip.dataset.filtro);
});
botaoMais.addEventListener('click', carregarPagina);

// ---------- Início ----------

iniciarPagina();
carregarPagina();
