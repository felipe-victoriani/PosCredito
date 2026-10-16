// =====================================================================
// titulo-comunidade.js — parte social da página do título
// ---------------------------------------------------------------------
// Nota da comunidade, botões Avaliar / Quero ver / Já vi / Favorito,
// lista de reviews e o editor de review. É carregado por titulo.js com
// import dinâmico: se o Firebase falhar, o resto da página continua.
// =====================================================================

import { criarAcoesReview } from './acoes-review.js';
import { usuarioAtual } from './auth.js';
import { criarCartaoReview } from './cartao-review.js';
import { definirNaLista, situacaoNasListas } from './lists.js';
import { semBloqueados } from './moderacao-regras.js';
import { obterBloqueados } from './moderation.js';
import {
  formatarNota,
  LIMITES_REVIEW,
  mediaComunidade,
  metadadosTitulo,
  ROTULO_LISTA,
  validarReview,
} from './reviews-regras.js';
import { excluirReview, listarReviewsDoTitulo, obterEstatisticaTitulo, obterMinhaReview, salvarReview } from './reviews.js';
import { ROTULO_TIPO } from './tmdb.js';
import { criarEstado, criarEstrela, criarEstrelas, criarPoster, el, mostrarToast, preenchimentoEstrela } from './ui.js';

const $ = (id) => document.getElementById(id);

// Botões de lista e a lista que cada um controla
const BOTOES_LISTA = { watchlist: 'botao-watchlist', watched: 'botao-watched', favorites: 'botao-favorito' };

// Estado da página
let meta;
let usuario = null;
let minhaReview = null;
let cursorReviews = null;
let notaEscolhida = null;

// ---------- Login ----------

/** Manda para a tela de entrar, voltando para cá depois. */
function irParaLogin({ avaliar = false } = {}) {
  const voltar = `titulo.html?id=${meta.mediaKey}${avaliar ? '&avaliar=1' : ''}`;
  location.href = `perfil.html?voltar=${encodeURIComponent(voltar)}`;
}

// ---------- Nota da comunidade ----------

async function carregarNota() {
  const valor = $('nota-valor');
  const texto = $('nota-texto');
  try {
    const estatistica = await obterEstatisticaTitulo(meta.mediaKey);
    const media = mediaComunidade(estatistica);
    if (media === null) {
      valor.textContent = '–';
      $('nota-estrelas').replaceChildren();
      texto.textContent = 'Ainda sem notas. Seja a primeira pessoa a avaliar.';
      return;
    }
    const total = estatistica.ratingCount;
    valor.textContent = formatarNota(media);
    $('nota-estrelas').replaceChildren(criarEstrelas(media, 20));
    texto.textContent = `Média da comunidade · ${total.toLocaleString('pt-BR')} ${total === 1 ? 'review' : 'reviews'}`;
  } catch (erro) {
    console.error('[comunidade] nota', erro);
    texto.textContent = 'Não foi possível carregar a nota agora.';
  }
}

// ---------- Lista de reviews ----------

async function carregarReviews({ continuar = false } = {}) {
  const lista = $('lista-reviews');
  const botaoMais = $('mais-reviews');
  botaoMais.hidden = true;
  if (!continuar) {
    cursorReviews = null;
    lista.replaceChildren(el('li', {}, [el('div', { classe: 'esqueleto esqueleto--review' })]));
  }
  lista.setAttribute('aria-busy', 'true');

  try {
    const { itens, cursor } = await listarReviewsDoTitulo(meta.mediaKey, 10, cursorReviews);
    if (!continuar) lista.replaceChildren();
    // Reviews de pessoas bloqueadas não aparecem
    const visiveis = semBloqueados(itens, await obterBloqueados(usuario?.uid));
    lista.append(...visiveis.map((item) => el('li', {}, [criarCartaoReview(item, { acoes: criarAcoesReview(item.review, usuario, { autor: item.autor }) })])));
    cursorReviews = cursor;
    botaoMais.hidden = !cursor;

    if (!lista.children.length) {
      lista.replaceChildren(el('li', {}, [criarEstado({ tipo: 'vazio', mensagem: 'Nenhuma review ainda. Assistiu? Conta pra gente o que achou.' })]));
    }
  } catch (erro) {
    console.error('[comunidade] reviews', erro);
    if (!continuar) {
      lista.replaceChildren(el('li', {}, [criarEstado({ tipo: 'erro', mensagem: 'Não foi possível carregar as reviews.', acao: { texto: 'Tentar de novo', onClick: () => carregarReviews() } })]));
    } else {
      botaoMais.hidden = false;
    }
  } finally {
    lista.removeAttribute('aria-busy');
  }
}

// ---------- Botões (Avaliar e listas) ----------

/** Texto do botão principal conforme a pessoa já avaliou ou não. */
function atualizarBotaoAvaliar() {
  $('texto-avaliar').textContent = minhaReview ? `Sua nota ${formatarNota(minhaReview.rating)}` : 'Avaliar';
}

function marcarLista(lista, ativo) {
  const botao = $(BOTOES_LISTA[lista]);
  botao.setAttribute('aria-pressed', String(ativo));
}

/** Liga/desliga o título numa lista, com resposta visual imediata. */
async function alternarLista(lista) {
  if (!usuario) return irParaLogin();
  const botao = $(BOTOES_LISTA[lista]);
  const adicionar = botao.getAttribute('aria-pressed') !== 'true';
  const watchlistAntes = $(BOTOES_LISTA.watchlist).getAttribute('aria-pressed') === 'true';

  // Otimista: muda já e desfaz se falhar
  marcarLista(lista, adicionar);
  if (lista === 'watched' && adicionar) marcarLista('watchlist', false);
  botao.disabled = true;

  try {
    await definirNaLista(usuario.uid, lista, meta, adicionar);
    mostrarToast(adicionar ? `Adicionado em ${ROTULO_LISTA[lista]}.` : `Removido de ${ROTULO_LISTA[lista]}.`);
  } catch (erro) {
    console.error('[comunidade] lista', lista, erro);
    marcarLista(lista, !adicionar);
    marcarLista('watchlist', watchlistAntes);
    mostrarToast('Não foi possível salvar agora. Tente de novo.');
  } finally {
    botao.disabled = false;
  }
}

/** Lê a review e as listas da pessoa para este título. */
async function carregarSituacaoPessoal() {
  if (!usuario) return;
  try {
    const [review, listas] = await Promise.all([obterMinhaReview(usuario.uid, meta.mediaKey), situacaoNasListas(usuario.uid, meta.mediaKey)]);
    minhaReview = review;
    atualizarBotaoAvaliar();
    for (const [lista, ativo] of Object.entries(listas)) marcarLista(lista, ativo);
  } catch (erro) {
    console.error('[comunidade] situação pessoal', erro);
  }
}

// ---------- Editor de review ----------

/** Monta as 5 estrelas com 10 opções de nota (meia em meia). */
function montarSeletorNota() {
  const container = $('estrelas-editor');
  const estrelas = [];

  for (let n = 1; n <= 5; n += 1) {
    const estrela = el('span', { classe: 'estrela-input' }, [criarEstrela('vazia', 44)]);
    // Metade esquerda = n - 0,5; metade direita = n
    for (const valor of [n - 0.5, n]) {
      const id = `nota-${valor * 2}`;
      const rotulo = `${formatarNota(valor)} ${valor === 1 ? 'estrela' : 'estrelas'}`;
      estrela.append(
        el('input', { classe: 'visualmente-oculto', atributos: { type: 'radio', name: 'nota', id, value: String(valor), 'aria-label': rotulo } }),
        el('label', { classe: `estrela-input__metade estrela-input__metade--${valor === n ? 'dir' : 'esq'}`, atributos: { for: id, 'aria-hidden': 'true' } }),
      );
    }
    estrelas.push(estrela);
  }
  container.replaceChildren(...estrelas);

  // Ao escolher: pinta as estrelas e mostra o número
  container.addEventListener('change', (evento) => definirNota(Number(evento.target.value)));
}

/** Aplica uma nota no editor (ou null para limpar). */
function definirNota(nota) {
  notaEscolhida = nota;
  const estrelas = $('estrelas-editor').querySelectorAll('.estrela-input > .estrela');
  estrelas.forEach((estrela, i) => {
    estrela.className = `estrela estrela--${nota ? preenchimentoEstrela(nota, i + 1) : 'vazia'}`;
  });
  $('nota-escolhida').textContent = nota ? formatarNota(nota) : 'Sem nota';
  for (const radio of document.querySelectorAll('input[name="nota"]')) radio.checked = nota !== null && Number(radio.value) === nota;
}

function atualizarContadorTexto() {
  $('contador-review').textContent = `${$('texto-review').value.length} / ${LIMITES_REVIEW.TEXTO_MAX}`;
}

/** Abre o editor, preenchido se a pessoa já avaliou. */
function abrirEditor() {
  if (!usuario) return irParaLogin({ avaliar: true });

  $('titulo-editor').textContent = minhaReview ? 'Editar review' : 'Nova review';
  $('publicar-review').textContent = minhaReview ? 'Salvar' : 'Publicar';
  $('excluir-review').hidden = !minhaReview;
  $('erro-review').textContent = '';

  definirNota(minhaReview?.rating ?? null);
  const status = minhaReview?.status ?? 'assisti';
  document.querySelector(`input[name="status"][value="${status}"]`).checked = true;
  $('texto-review').value = minhaReview?.text ?? '';
  $('spoiler-review').checked = minhaReview?.spoiler ?? false;
  atualizarContadorTexto();

  $('dialogo-review').showModal();
}

/** Recarrega tudo que depende da review da pessoa. */
async function atualizarDepoisDeSalvar() {
  await carregarSituacaoPessoal();
  carregarNota();
  carregarReviews();
}

async function publicar(evento) {
  evento.preventDefault();
  const dados = {
    rating: notaEscolhida,
    status: document.querySelector('input[name="status"]:checked')?.value,
    text: $('texto-review').value.trim(),
    spoiler: $('spoiler-review').checked,
  };

  const erro = validarReview(dados);
  if (erro) {
    $('erro-review').textContent = erro;
    return;
  }

  const botao = $('publicar-review');
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Salvando…';
  try {
    await salvarReview(usuario.uid, meta, dados);
    const eraNova = !minhaReview;
    $('dialogo-review').close();
    mostrarToast(eraNova ? 'Review publicada.' : 'Review atualizada.');
    await atualizarDepoisDeSalvar();
  } catch (erroSalvar) {
    console.error('[comunidade] salvar review', erroSalvar);
    $('erro-review').textContent = 'Não foi possível salvar agora. Verifique a conexão e tente de novo.';
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}

async function confirmarExclusao() {
  const botao = $('confirmar-exclusao');
  botao.disabled = true;
  try {
    await excluirReview(usuario.uid, meta.mediaKey);
    $('dialogo-confirmar').close();
    $('dialogo-review').close();
    mostrarToast('Review excluída.');
    await atualizarDepoisDeSalvar();
  } catch (erro) {
    console.error('[comunidade] excluir review', erro);
    $('dialogo-confirmar').close();
    $('erro-review').textContent = 'Não foi possível excluir agora. Tente de novo.';
  } finally {
    botao.disabled = false;
  }
}

/** Cabeçalho do editor: pôster + nome + "Anime · 2023". */
function preencherCabecalhoEditor(detalhes) {
  $('editor-poster').replaceChildren(criarPoster(detalhes, { tamanho: 'w185' }));
  $('editor-nome').textContent = meta.title;
  $('editor-meta').textContent = [ROTULO_TIPO[meta.tipo], meta.year].filter(Boolean).join(' · ');
}

// ---------- Início ----------

/**
 * Liga a parte social da página.
 * @param {{detalhes: object, mediaType: 'movie'|'tv'}} contexto
 */
export async function iniciarComunidade({ detalhes, mediaType }) {
  meta = metadadosTitulo(detalhes, mediaType);
  preencherCabecalhoEditor(detalhes);
  montarSeletorNota();

  // Eventos
  $('botao-avaliar').addEventListener('click', abrirEditor);
  for (const lista of Object.keys(BOTOES_LISTA)) $(BOTOES_LISTA[lista]).addEventListener('click', () => alternarLista(lista));
  $('mais-reviews').addEventListener('click', () => carregarReviews({ continuar: true }));
  $('form-review').addEventListener('submit', publicar);
  $('fechar-review').addEventListener('click', () => $('dialogo-review').close());
  $('texto-review').addEventListener('input', atualizarContadorTexto);
  $('excluir-review').addEventListener('click', () => $('dialogo-confirmar').showModal());
  $('cancelar-exclusao').addEventListener('click', () => $('dialogo-confirmar').close());
  $('confirmar-exclusao').addEventListener('click', confirmarExclusao);

  // A nota é pública: começa já
  carregarNota();

  // Sessão (restaurada localmente, sem rede): libera os botões.
  // As reviews esperam por ela para saber se a pessoa curtiu cada uma.
  usuario = await usuarioAtual();
  carregarReviews();
  for (const id of ['botao-avaliar', ...Object.values(BOTOES_LISTA)]) $(id).disabled = false;
  await carregarSituacaoPessoal();

  // Veio do "+" ou do login pedindo para avaliar: abre o editor.
  // Sem login não redireciona sozinho (evita loop com o botão voltar);
  // a pessoa toca em "Avaliar" e aí vai para o login.
  if (usuario && new URLSearchParams(location.search).get('avaliar') === '1') abrirEditor();
}
