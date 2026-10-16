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
import { criarSeletor, GENEROS, lerInteresses, lerSelecao, montarInteresses, TIPOS } from './interesses.js';
import { formatarContador, LIMITES, normalizarUsername } from './perfil-regras.js';
import { criarAvatar, criarEstado, iniciarPagina, mostrarToast } from './ui.js';

// Elementos
const $ = (id) => document.getElementById(id);
const main = $('conteudo');
const areaLogin = $('area-login');
const areaPerfil = $('area-perfil');
const areaErro = $('area-erro');
const dialogo = $('dialogo-editar');
const formEditar = $('form-editar');

// Perfil exibido agora e se é o da própria pessoa
let perfilAtual = null;
let ehProprio = false;
// Seletores do diálogo de edição (recriados a cada abertura)
let seletorTipos;
let seletorGeneros;

// @ pedido na URL (já normalizado; vazio = próprio perfil)
const usernamePedido = normalizarUsername(new URLSearchParams(location.search).get('u') ?? '');

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

  // Controles de dono só no próprio perfil
  $('botao-menu').hidden = !proprio;
  $('botao-editar').hidden = !proprio;

  mostrarArea(areaPerfil);
  // Veio pelo item "Listas" da barra: rola até a seção
  if (location.hash === '#listas') $('listas').scrollIntoView();
}

// ---------- Carregamento ----------

async function carregar() {
  main.setAttribute('aria-busy', 'true');
  try {
    const usuario = await usuarioAtual();

    // Perfil de outra pessoa (ou o próprio acessado pelo @)
    if (usernamePedido) {
      const perfil = await obterPerfilPorUsername(usernamePedido);
      if (!perfil) return mostrarErro(`Não encontramos @${usernamePedido}.`);
      return mostrarPerfil(perfil, usuario?.uid === perfil.uid);
    }

    // Próprio perfil: sem login mostra o convite; sem perfil vai ao onboarding
    if (!usuario) return mostrarLogin();
    const perfil = await obterPerfil(usuario.uid);
    if (!perfil) return location.replace('onboarding.html');
    mostrarPerfil(perfil, true);
  } catch (erro) {
    console.error('[perfil] carregar', erro);
    mostrarErro('Não foi possível carregar o perfil agora.', true);
  }
}

// ---------- Login / sair ----------

async function aoEntrar() {
  const botao = $('botao-google');
  botao.disabled = true;
  try {
    const usuario = await entrarComGoogle();
    if (!usuario) return; // cancelou ou foi para o redirecionamento
    const destino = await destinoAposLogin(usuario.uid);
    if (destino === 'perfil.html') carregar();
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

// Destaque correto na barra inferior antes de montá-la
const nav = document.querySelector('.nav-inferior');
nav.dataset.ativo = usernamePedido ? '' : location.hash === '#listas' ? 'listas' : 'perfil';

iniciarPagina();
carregar();
