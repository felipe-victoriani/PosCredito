// =====================================================================
// perfil.js — página de perfil
// ---------------------------------------------------------------------
// perfil.html           → próprio perfil (ou tela de entrar)
// perfil.html?u=fulano  → perfil público de @fulano
// =====================================================================

import {
  atualizarPerfil,
  destinoAposLogin,
  entrarComGoogle,
  obterPerfil,
  obterPerfilPorUsername,
  sair,
  usuarioAtual,
} from './auth.js';
import { criarAcoesReview } from './acoes-review.js';
import { criarCartaoReview } from './cartao-review.js';
import { definirSeguindo, estaSeguindo } from './social.js';
import { criarSeletor, GENEROS, lerInteresses, lerSelecao, montarInteresses, TIPOS } from './interesses.js';
import { obterLista } from './lists.js';
import { formatarContador, LIMITES, normalizarUsername } from './perfil-regras.js';
import { destinoSeguro } from './reviews-regras.js';
import { listarReviewsDoUsuario } from './reviews.js';
import { criarAvatar, criarCartaoGuardado, criarEsqueletos, criarEstado, el, iniciarPagina, mostrarToast } from './ui.js';

// Elementos
const $ = (id) => document.getElementById(id);
const main = $('conteudo');
const areaLogin = $('area-login');
const areaPerfil = $('area-perfil');
const areaErro = $('area-erro');
const dialogo = $('dialogo-editar');
const formEditar = $('form-editar');

// Perfil exibido agora, se é o da própria pessoa, e quem está logado
let perfilAtual = null;
let ehProprio = false;
let usuarioLogado = null;
// Seletores do diálogo de edição (recriados a cada abertura)
let seletorTipos;
let seletorGeneros;

// Parâmetros da URL
const parametros = new URLSearchParams(location.search);
// @ pedido (já normalizado; vazio = próprio perfil)
const usernamePedido = normalizarUsername(parametros.get('u') ?? '');
// Página para voltar depois do login (só páginas do próprio app)
const voltar = destinoSeguro(parametros.get('voltar'));

// Abas do perfil: qual já foi carregada e de quem
const ABAS = ['reviews', 'favorites', 'watched', 'watchlist'];
const MENSAGENS_VAZIAS = {
  favorites: 'Nenhum favorito ainda.',
  watched: 'Nada marcado como visto ainda.',
  watchlist: 'Nada na lista Quero ver ainda.',
};
const paineisCarregados = new Set();
let uidDasAbas = null;
let cursorReviews = null;

// ---------- Renderização ----------

/** Esconde todas as áreas e mostra só a pedida. */
function mostrarArea(area) {
  for (const a of [areaLogin, areaPerfil, areaErro]) a.hidden = a !== area;
  main.removeAttribute('aria-busy');
}

function mostrarLogin() {
  document.title = 'Entrar · PósCréditos';
  $('botao-menu').hidden = true;
  mostrarArea(areaLogin);
}

function mostrarErro(mensagem, tentarDeNovo) {
  areaErro.replaceChildren(
    criarEstado({ tipo: 'erro', mensagem, acao: tentarDeNovo ? { texto: 'Tentar de novo', onClick: carregar } : undefined }),
  );
  mostrarArea(areaErro);
}

/** Preenche o cabeçalho, bio e contadores. */
function mostrarPerfil(perfil, proprio) {
  perfilAtual = perfil;
  ehProprio = proprio;
  document.title = `${perfil.displayName} (@${perfil.username}) · PósCréditos`;

  $('perfil-avatar').replaceChildren(criarAvatar(perfil, 'g'));
  $('perfil-nome').textContent = perfil.displayName;
  $('perfil-username').textContent = `@${perfil.username}`;

  const bio = $('perfil-bio');
  bio.textContent = perfil.bio ?? '';
  bio.hidden = !perfil.bio;

  const stats = perfil.stats ?? {};
  $('cont-vistos').textContent = formatarContador(stats.watched);
  $('cont-seguidores').textContent = formatarContador(stats.followers);
  $('cont-seguindo').textContent = formatarContador(stats.following);

  // Controles de dono só no próprio perfil; "Seguir" só no dos outros
  $('botao-menu').hidden = !proprio;
  $('botao-editar').hidden = !proprio;
  $('botao-seguir').hidden = proprio;
  if (!proprio) atualizarBotaoSeguir();

  mostrarArea(areaPerfil);

  // Abas: reinicia só quando muda a pessoa (editar perfil não recarrega)
  if (uidDasAbas !== perfil.uid) {
    uidDasAbas = perfil.uid;
    paineisCarregados.clear();
    // Veio pelo item "Listas" da barra: abre "Quero ver"
    selecionarAba(location.hash === '#listas' ? 'watchlist' : 'reviews');
  }
}

// ---------- Seguir ----------

/** Pinta o botão: "Seguir" (amarelo) ou "Seguindo" (contorno). */
function pintarSeguir(seguindo) {
  const botao = $('botao-seguir');
  botao.setAttribute('aria-pressed', String(seguindo));
  botao.textContent = seguindo ? 'Seguindo' : 'Seguir';
  botao.classList.toggle('botao--primario', !seguindo);
  botao.classList.toggle('botao--secundario', seguindo);
}

/** Descobre se a pessoa logada já segue o perfil aberto. */
async function atualizarBotaoSeguir() {
  pintarSeguir(false);
  if (!usuarioLogado) return;
  try {
    pintarSeguir(await estaSeguindo(usuarioLogado.uid, perfilAtual.uid));
  } catch (erro) {
    console.error('[perfil] está seguindo?', erro);
  }
}

/** Segue/deixa de seguir, com o contador mudando na hora. */
async function alternarSeguir() {
  if (!usuarioLogado) {
    location.href = `perfil.html?voltar=${encodeURIComponent(`perfil.html?u=${perfilAtual.username}`)}`;
    return;
  }
  const botao = $('botao-seguir');
  const seguir = botao.getAttribute('aria-pressed') !== 'true';
  const contador = $('cont-seguidores');
  const antes = perfilAtual.stats?.followers ?? 0;
  const depois = Math.max(0, antes + (seguir ? 1 : -1));

  pintarSeguir(seguir);
  contador.textContent = formatarContador(depois);
  botao.disabled = true;
  try {
    await definirSeguindo(usuarioLogado.uid, perfilAtual.uid, seguir);
    perfilAtual = { ...perfilAtual, stats: { ...perfilAtual.stats, followers: depois } };
  } catch (erro) {
    console.error('[perfil] seguir', erro);
    pintarSeguir(!seguir);
    contador.textContent = formatarContador(antes);
    mostrarToast('Não foi possível agora. Tente de novo.');
  } finally {
    botao.disabled = false;
  }
}

// ---------- Abas ----------

/** Mostra a aba pedida e carrega o conteúdo na primeira vez. */
function selecionarAba(nome, { focar = false } = {}) {
  for (const aba of document.querySelectorAll('.abas__aba')) {
    const ativa = aba.dataset.painel === nome;
    aba.setAttribute('aria-selected', String(ativa));
    aba.tabIndex = ativa ? 0 : -1;
    $(`painel-${aba.dataset.painel}`).hidden = !ativa;
    if (ativa && focar) aba.focus();
  }
  if (paineisCarregados.has(nome)) return;
  paineisCarregados.add(nome);
  if (nome === 'reviews') carregarReviews();
  else carregarLista(nome);
}

/** Setas, Home e End trocam de aba (padrão ARIA). */
function aoTeclarNasAbas(evento) {
  const atual = ABAS.indexOf(document.activeElement?.dataset?.painel);
  if (atual < 0) return;
  const destinos = { ArrowRight: atual + 1, ArrowLeft: atual - 1, Home: 0, End: ABAS.length - 1 };
  if (!(evento.key in destinos)) return;
  evento.preventDefault();
  const proximo = (destinos[evento.key] + ABAS.length) % ABAS.length;
  selecionarAba(ABAS[proximo], { focar: true });
}

/** Reviews da pessoa, com o título de cada uma. */
async function carregarReviews({ continuar = false } = {}) {
  const lista = $('lista-reviews-perfil');
  const botaoMais = $('mais-reviews-perfil');
  const uid = uidDasAbas;
  botaoMais.hidden = true;
  if (!continuar) {
    cursorReviews = null;
    lista.replaceChildren(el('li', {}, [el('div', { classe: 'esqueleto esqueleto--review' })]));
  }

  try {
    const { itens, cursor } = await listarReviewsDoUsuario(uid, 10, cursorReviews);
    if (uid !== uidDasAbas) return; // trocou de perfil no meio
    if (!continuar) lista.replaceChildren();
    lista.append(
      ...itens.map((item) =>
        el('li', {}, [criarCartaoReview(item, { mostrarTitulo: true, mostrarAutor: false, acoes: criarAcoesReview(item.review, usuarioLogado) })]),
      ),
    );
    cursorReviews = cursor;
    botaoMais.hidden = !cursor;

    if (!lista.children.length) {
      const mensagem = ehProprio ? 'Você ainda não avaliou nada. Toque no + para começar.' : 'Nenhuma review ainda.';
      lista.replaceChildren(el('li', {}, [criarEstado({ tipo: 'vazio', mensagem })]));
    }
  } catch (erro) {
    console.error('[perfil] reviews', erro);
    paineisCarregados.delete('reviews');
    lista.replaceChildren(el('li', {}, [criarEstado({ tipo: 'erro', mensagem: 'Não foi possível carregar as reviews.', acao: { texto: 'Tentar de novo', onClick: () => carregarReviews() } })]));
  }
}

/** Grade de pôsteres de uma lista (Favoritos, Já vi, Quero ver). */
async function carregarLista(nome) {
  const grade = $(`grade-${nome}`);
  const uid = uidDasAbas;
  grade.replaceChildren(...criarEsqueletos(6, 'esqueleto esqueleto--cartao'));
  try {
    const itens = await obterLista(uid, nome);
    if (uid !== uidDasAbas) return;
    grade.replaceChildren(...itens.map(criarCartaoGuardado));
    if (!itens.length) grade.replaceChildren(el('li', { classe: 'grade-posters__estado' }, [criarEstado({ tipo: 'vazio', mensagem: MENSAGENS_VAZIAS[nome] })]));
  } catch (erro) {
    console.error('[perfil] lista', nome, erro);
    paineisCarregados.delete(nome);
    grade.replaceChildren(el('li', { classe: 'grade-posters__estado' }, [criarEstado({ tipo: 'erro', mensagem: 'Não foi possível carregar a lista.', acao: { texto: 'Tentar de novo', onClick: () => carregarLista(nome) } })]));
  }
}

// ---------- Carregamento ----------

async function carregar() {
  main.setAttribute('aria-busy', 'true');
  try {
    const usuario = await usuarioAtual();
    usuarioLogado = usuario;

    // Perfil de outra pessoa (ou o próprio acessado pelo @)
    if (usernamePedido) {
      const perfil = await obterPerfilPorUsername(usernamePedido);
      if (!perfil) return mostrarErro(`Não encontramos @${usernamePedido}.`);
      return mostrarPerfil(perfil, usuario?.uid === perfil.uid);
    }

    // Próprio perfil: sem login mostra o convite; sem perfil vai ao onboarding
    if (!usuario) return mostrarLogin();
    const perfil = await obterPerfil(usuario.uid);
    if (!perfil) return location.replace(comVoltar('onboarding.html'));
    // Já logado e veio de outra página pedindo login: volta para lá
    if (voltar) return location.replace(voltar);
    mostrarPerfil(perfil, true);
  } catch (erro) {
    console.error('[perfil] carregar', erro);
    mostrarErro('Não foi possível carregar o perfil agora.', true);
  }
}

// ---------- Login / sair ----------

/** Repassa o destino de volta adiante (ex.: para o onboarding). */
function comVoltar(pagina) {
  return voltar ? `${pagina}?voltar=${encodeURIComponent(voltar)}` : pagina;
}

async function aoEntrar() {
  const botao = $('botao-google');
  botao.disabled = true;
  try {
    const usuario = await entrarComGoogle();
    if (!usuario) return; // cancelou ou foi para o redirecionamento
    const destino = await destinoAposLogin(usuario.uid, voltar ?? 'perfil.html');
    if (destino === 'perfil.html') carregar();
    else if (destino === 'onboarding.html') location.href = comVoltar(destino);
    else location.href = destino;
  } catch (erro) {
    console.error('[perfil] login', erro?.code, erro);
    mostrarToast('Não foi possível entrar agora. Tente de novo.');
  } finally {
    botao.disabled = false;
  }
}

async function aoSair() {
  $('menu-conta').hidePopover();
  try {
    await sair();
    location.href = 'index.html';
  } catch (erro) {
    console.error('[perfil] sair', erro);
    mostrarToast('Não foi possível sair agora.');
  }
}

// ---------- Edição ----------

function atualizarContadorBio() {
  $('contador-editar-bio').textContent = `${$('editar-bio').value.length} / ${LIMITES.BIO_MAX}`;
}

function abrirEdicao() {
  if (!ehProprio || !perfilAtual) return;
  $('menu-conta').hidePopover();

  $('editar-nome').value = perfilAtual.displayName;
  $('editar-bio').value = perfilAtual.bio ?? '';
  atualizarContadorBio();
  $('erro-editar').textContent = '';

  // Seletores já marcados com os interesses atuais
  const { tipos, generos } = lerInteresses(perfilAtual.interests);
  seletorTipos = criarSeletor({ itens: TIPOS, selecionados: tipos, rotulo: 'Tipos de conteúdo', variante: 'cartao' });
  seletorGeneros = criarSeletor({ itens: GENEROS, selecionados: generos, rotulo: 'Gêneros favoritos', variante: 'chip' });
  seletorTipos.id = 'editar-tipos';
  seletorGeneros.id = 'editar-generos';
  $('editar-tipos').replaceWith(seletorTipos);
  $('editar-generos').replaceWith(seletorGeneros);

  dialogo.showModal();
}

async function salvarEdicao(evento) {
  evento.preventDefault();
  const nome = $('editar-nome').value.trim();
  if (!nome) {
    $('erro-editar').textContent = 'O nome não pode ficar vazio.';
    $('editar-nome').focus();
    return;
  }

  const dados = {
    displayName: nome.slice(0, LIMITES.NOME_MAX),
    bio: $('editar-bio').value.trim().slice(0, LIMITES.BIO_MAX),
    interests: montarInteresses(lerSelecao(seletorTipos), lerSelecao(seletorGeneros)),
  };

  const botao = $('salvar-editar');
  botao.disabled = true;
  try {
    await atualizarPerfil(perfilAtual.uid, dados);
    mostrarPerfil({ ...perfilAtual, ...dados }, true);
    dialogo.close();
    mostrarToast('Perfil atualizado.');
  } catch (erro) {
    console.error('[perfil] salvar edição', erro);
    $('erro-editar').textContent = 'Não foi possível salvar agora. Tente de novo.';
  } finally {
    botao.disabled = false;
  }
}

// ---------- Eventos e início ----------

$('botao-google').addEventListener('click', aoEntrar);
$('menu-sair').addEventListener('click', aoSair);
$('menu-editar').addEventListener('click', abrirEdicao);
$('botao-editar').addEventListener('click', abrirEdicao);
$('editar-bio').addEventListener('input', atualizarContadorBio);
$('fechar-editar').addEventListener('click', () => dialogo.close());
$('cancelar-editar').addEventListener('click', () => dialogo.close());
formEditar.addEventListener('submit', salvarEdicao);
$('abas-perfil').addEventListener('click', (evento) => {
  const aba = evento.target.closest('.abas__aba');
  if (aba) selecionarAba(aba.dataset.painel);
});
$('abas-perfil').addEventListener('keydown', aoTeclarNasAbas);
$('mais-reviews-perfil').addEventListener('click', () => carregarReviews({ continuar: true }));
$('botao-seguir').addEventListener('click', alternarSeguir);
// Tocar em "Listas" na barra estando já no perfil só muda o #: abre "Quero ver"
window.addEventListener('hashchange', () => {
  if (location.hash === '#listas' && uidDasAbas) selecionarAba('watchlist');
});

// Destaque correto na barra inferior antes de montá-la
const nav = document.querySelector('.nav-inferior');
nav.dataset.ativo = usernamePedido ? '' : location.hash === '#listas' ? 'listas' : 'perfil';

iniciarPagina();
carregar();
