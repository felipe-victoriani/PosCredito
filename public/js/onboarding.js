// =====================================================================
// onboarding.js — criação do perfil em 3 passos
// ---------------------------------------------------------------------
// 1. @ único + nome   2. tipos e gêneros   3. bio + prévia
// Só grava no fim, numa escrita atômica (perfil + reserva do @).
// =====================================================================

import { criarPerfil, ehPermissaoNegada, obterPerfil, usernameDisponivel, usuarioAtual } from './auth.js';
import { criarSeletor, GENEROS, lerSelecao, montarInteresses, TIPOS } from './interesses.js';
import { LIMITES, normalizarUsername, validarUsername } from './perfil-regras.js';
import { criarAvatar } from './ui.js';

// Espera após a última tecla antes de checar se o @ está livre (ms)
const DEBOUNCE_MS = 400;
const TOTAL_PASSOS = 3;

// Elementos
const $ = (id) => document.getElementById(id);
const main = $('conteudo');
const form = $('form-onboarding');
const campoUsername = $('campo-username');
const campoNome = $('campo-nome');
const campoBio = $('campo-bio');
const statusUsername = $('status-username');
const botaoAvancar = $('avancar');
const botaoVoltar = $('voltar-passo');
const botaoPular = $('pular');
const erroForm = $('erro-onboarding');

// Estado
let usuario = null;
let passoAtual = 1;
let salvando = false;
let temporizador;
// Situação do @: vazio | invalido | verificando | disponivel | ocupado | erro
let situacaoUsername = 'vazio';
// Promessa da última checagem (o "Continuar" espera por ela)
let checagemPendente = Promise.resolve();

// Seletores do passo 2 (criados no início)
const seletorTipos = criarSeletor({ itens: TIPOS, rotulo: 'Tipos de conteúdo', variante: 'cartao' });
const seletorGeneros = criarSeletor({ itens: GENEROS, rotulo: 'Gêneros favoritos', variante: 'chip' });
$('seletor-tipos').replaceWith(seletorTipos);
$('seletor-generos').replaceWith(seletorGeneros);

// ---------- @ de usuário ----------

/** Mostra a situação do @ embaixo do campo. */
function mostrarSituacao(situacao, mensagem) {
  situacaoUsername = situacao;
  statusUsername.textContent = mensagem ?? '';
  statusUsername.dataset.situacao = situacao;
  campoUsername.setAttribute('aria-invalid', String(['invalido', 'ocupado'].includes(situacao)));
}

/** Confere no banco se o @ está livre (resposta antiga é descartada). */
async function checarDisponibilidade(username) {
  mostrarSituacao('verificando', 'Verificando…');
  try {
    const livre = await usernameDisponivel(username);
    // A pessoa digitou outra coisa enquanto checava: ignora
    if (normalizarUsername(campoUsername.value) !== username) return;
    if (livre) mostrarSituacao('disponivel', `@${username} está disponível.`);
    else mostrarSituacao('ocupado', `@${username} já está em uso. Tente outro.`);
  } catch (erro) {
    console.error('[onboarding] checar @', erro);
    mostrarSituacao('erro', 'Não foi possível verificar agora. Tente de novo.');
  }
}

/** A cada tecla: normaliza, valida o formato e agenda a checagem. */
function aoDigitarUsername() {
  clearTimeout(temporizador);
  const normalizado = normalizarUsername(campoUsername.value);
  // Reescreve só se mudou (evita pular o cursor sem necessidade)
  if (campoUsername.value !== normalizado) campoUsername.value = normalizado;

  if (!normalizado) return mostrarSituacao('vazio', '');
  const erro = validarUsername(normalizado);
  if (erro) return mostrarSituacao('invalido', erro);

  mostrarSituacao('verificando', 'Verificando…');
  checagemPendente = new Promise((resolver) => {
    temporizador = setTimeout(() => checarDisponibilidade(normalizado).finally(resolver), DEBOUNCE_MS);
  });
}

// ---------- Passos ----------

/** Mostra o passo pedido, atualiza progresso, botões e foco. */
function irParaPasso(numero) {
  passoAtual = numero;
  erroForm.textContent = '';

  for (const secao of form.querySelectorAll('.passo')) secao.hidden = Number(secao.dataset.passo) !== numero;

  // Barrinhas de progresso: preenchidas até o passo atual
  document.querySelectorAll('.progresso__passo').forEach((item, i) => {
    item.classList.toggle('progresso__passo--feito', i < numero);
    if (i === numero - 1) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });

  botaoVoltar.hidden = numero === 1;
  botaoPular.hidden = numero === 1; // o @ é obrigatório
  botaoAvancar.textContent = numero === TOTAL_PASSOS ? 'Concluir' : 'Continuar';

  if (numero === 3) atualizarPrevia();

  // Leva o foco ao título do passo (leitor de tela anuncia a troca)
  $(`titulo-passo-${numero}`).focus();
  window.scrollTo({ top: 0 });
}

/** Valida o passo 1 antes de seguir. Retorna true se pode avançar. */
async function validarPasso1() {
  const username = normalizarUsername(campoUsername.value);
  const erroFormato = validarUsername(username);
  if (erroFormato) {
    mostrarSituacao('invalido', erroFormato);
    campoUsername.focus();
    return false;
  }
  // Ainda checando: espera o resultado
  if (situacaoUsername === 'verificando') await checagemPendente;
  if (situacaoUsername === 'erro') await checarDisponibilidade(username);
  if (situacaoUsername !== 'disponivel') {
    campoUsername.focus();
    return false;
  }
  if (!campoNome.value.trim()) {
    erroForm.textContent = 'Conta pra gente como você quer ser chamado.';
    campoNome.focus();
    return false;
  }
  return true;
}

/** Prévia do perfil no passo 3. */
function atualizarPrevia() {
  const nome = campoNome.value.trim();
  $('previa-avatar').replaceChildren(criarAvatar({ uid: usuario.uid, displayName: nome, photoURL: usuario.photoURL }, 'm'));
  $('previa-nome').textContent = nome;
  $('previa-username').textContent = `@${normalizarUsername(campoUsername.value)}`;
}

// ---------- Salvar ----------

async function salvar() {
  if (salvando) return;
  salvando = true;
  botaoAvancar.disabled = true;
  botaoAvancar.textContent = 'Salvando…';

  const username = normalizarUsername(campoUsername.value);
  try {
    await criarPerfil(usuario, {
      username,
      displayName: campoNome.value.trim().slice(0, LIMITES.NOME_MAX),
      bio: campoBio.value.trim().slice(0, LIMITES.BIO_MAX),
      interests: montarInteresses(lerSelecao(seletorTipos), lerSelecao(seletorGeneros)),
    });
    location.replace('perfil.html');
  } catch (erro) {
    console.error('[onboarding] salvar perfil', erro);
    salvando = false;
    botaoAvancar.disabled = false;
    botaoAvancar.textContent = 'Concluir';

    // Recusa das regras aqui quase sempre = alguém pegou o @ antes
    if (ehPermissaoNegada(erro)) {
      irParaPasso(1);
      mostrarSituacao('ocupado', `@${username} acabou de ser escolhido por outra pessoa. Tente outro.`);
      campoUsername.focus();
    } else {
      erroForm.textContent = 'Não foi possível salvar agora. Verifique a conexão e tente de novo.';
    }
  }
}

// ---------- Eventos ----------

campoUsername.addEventListener('input', aoDigitarUsername);
campoBio.addEventListener('input', () => {
  $('contador-bio').textContent = `${campoBio.value.length} / ${LIMITES.BIO_MAX}`;
});

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (passoAtual === 1 && !(await validarPasso1())) return;
  if (passoAtual < TOTAL_PASSOS) return irParaPasso(passoAtual + 1);
  salvar();
});

botaoVoltar.addEventListener('click', () => irParaPasso(Math.max(1, passoAtual - 1)));
// "Pular" deixa interesses/bio em branco e segue
botaoPular.addEventListener('click', () => (passoAtual < TOTAL_PASSOS ? irParaPasso(passoAtual + 1) : salvar()));

// ---------- Início ----------

async function iniciar() {
  usuario = await usuarioAtual();
  // Sem login: volta para a tela de entrar
  if (!usuario) return location.replace('perfil.html');

  try {
    // Já tem perfil: não refaz o cadastro
    if (await obterPerfil(usuario.uid)) return location.replace('perfil.html');
  } catch (erro) {
    console.error('[onboarding] ler perfil', erro);
    erroForm.textContent = 'Não foi possível carregar agora. Recarregue a página.';
    return;
  }

  // Sugestões a partir da conta Google
  campoNome.value = (usuario.displayName ?? '').slice(0, LIMITES.NOME_MAX);
  const sugestao = normalizarUsername((usuario.displayName ?? '').replace(/\s+/g, '.')).slice(0, LIMITES.USERNAME_MAX);
  if (sugestao) {
    campoUsername.value = sugestao;
    aoDigitarUsername();
  }

  main.removeAttribute('aria-busy');
  irParaPasso(1);
}

iniciar();
