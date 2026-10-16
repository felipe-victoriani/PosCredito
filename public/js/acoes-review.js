// =====================================================================
// acoes-review.js — barra de ações da review: curtir e comentar
// ---------------------------------------------------------------------
// Usada no feed, na página do título e no perfil. Comentários abrem
// dentro da própria review, carregados só quando a pessoa pede.
// =====================================================================

import { semBloqueados } from './moderacao-regras.js';
import { formatarContador } from './perfil-regras.js';
import { LIMITES_REVIEW, tempoRelativo } from './reviews-regras.js';
import { comentar, definirCurtida, excluirComentario, jaCurtiu, listarComentarios } from './social.js';
import { validarComentario } from './social-regras.js';
import { criarAvatar, criarEstado, el, icone, mostrarToast } from './ui.js';

/** Manda para o login e volta para a página atual depois. */
function irParaLogin() {
  const atual = `${location.pathname.split('/').pop() || 'index.html'}${location.search}`;
  location.href = `perfil.html?voltar=${encodeURIComponent(atual)}`;
}

/** Bloqueados de quem está logado (vazio sem login ou se falhar). */
async function obterBloqueadosSemFalhar(usuario) {
  if (!usuario) return new Set();
  try {
    const { obterBloqueados } = await import('./moderation.js');
    return await obterBloqueados(usuario.uid);
  } catch (erro) {
    console.error('[acoes] bloqueados', erro);
    return new Set();
  }
}

/** Botão com ícone + número (curtidas/comentários). */
function criarBotaoContador({ nomeIcone, rotulo, total }) {
  const numero = el('span', { classe: 'acao__numero', texto: formatarContador(total) });
  const botao = el('button', { classe: 'acao', atributos: { type: 'button', 'aria-label': rotulo } }, [icone(nomeIcone, { tamanho: 22 }), numero]);
  return { botao, numero };
}

// ---------- Comentários ----------

/** Um comentário, com lixeira para quem pode apagar. */
function criarItemComentario({ comentario, autor }, { review, usuario, aoExcluir }) {
  const podeApagar = usuario && (comentario.uid === usuario.uid || review.uid === usuario.uid);
  const nome = autor?.displayName ?? 'Pessoa removida';

  const lixeira = podeApagar
    ? el('button', { classe: 'comentario__apagar', atributos: { type: 'button', 'aria-label': `Apagar comentário de ${nome}` } }, [icone('lixeira', { tamanho: 18 })])
    : null;
  lixeira?.addEventListener('click', () => aoExcluir(comentario.id));

  // "⋯" (denunciar/bloquear) nos comentários de outras pessoas
  const opcoes =
    usuario && comentario.uid !== usuario.uid
      ? el('button', { classe: 'comentario__apagar', atributos: { type: 'button', 'aria-label': `Mais opções do comentário de ${nome}` } }, [icone('opcoes', { tamanho: 18 })])
      : null;
  opcoes?.addEventListener('click', () =>
    abrirModeracao({ usuario, autor: { uid: comentario.uid, username: autor?.username }, tipo: 'comment', reviewId: review.id, commentId: comentario.id }),
  );

  return el('li', { classe: 'comentario', atributos: { 'data-autor': comentario.uid } }, [
    criarAvatar({ ...autor, uid: comentario.uid }, 'p'),
    el('div', { classe: 'comentario__corpo' }, [
      el('p', { classe: 'comentario__cabecalho' }, [
        autor
          ? el('a', { classe: 'comentario__nome', texto: nome, atributos: { href: `perfil.html?u=${encodeURIComponent(autor.username)}` } })
          : el('span', { classe: 'comentario__nome', texto: nome }),
        el('span', { classe: 'comentario__tempo', texto: ` · ${tempoRelativo(comentario.createdAt)}` }),
      ]),
      el('p', { classe: 'comentario__texto', texto: comentario.text }),
    ]),
    lixeira ?? opcoes,
  ]);
}

/** Carrega o módulo de moderação só quando alguém usa (e abre o menu). */
async function abrirModeracao(dados) {
  try {
    const { abrirOpcoes } = await import('./moderation.js');
    abrirOpcoes(dados);
  } catch (erro) {
    console.error('[acoes] moderação', erro);
    mostrarToast('Não foi possível abrir as opções agora.');
  }
}

/**
 * Painel de comentários (lista + campo para escrever).
 * @returns {{painel: HTMLElement, carregar: () => Promise<void>}}
 */
function criarPainelComentarios({ review, usuario, aoMudarTotal }) {
  const lista = el('ul', { classe: 'comentarios__lista', atributos: { 'aria-label': 'Comentários' } });
  const painel = el('div', { classe: 'comentarios', atributos: { id: `comentarios-${review.id}` } }, [lista]);

  async function carregar() {
    lista.replaceChildren(el('li', { classe: 'comentarios__carregando', texto: 'Carregando comentários…' }));
    try {
      // Comentários de pessoas bloqueadas não aparecem
      const [todos, bloqueados] = await Promise.all([listarComentarios(review.id), obterBloqueadosSemFalhar(usuario)]);
      const itens = semBloqueados(todos, bloqueados, (item) => item.comentario.uid);
      lista.replaceChildren(...itens.map((item) => criarItemComentario(item, { review, usuario, aoExcluir })));
      if (!itens.length) lista.replaceChildren(el('li', { classe: 'comentarios__vazio', texto: 'Nenhum comentário ainda.' }));
    } catch (erro) {
      console.error('[acoes] comentários', erro);
      lista.replaceChildren(el('li', {}, [criarEstado({ tipo: 'erro', mensagem: 'Não foi possível carregar os comentários.', acao: { texto: 'Tentar de novo', onClick: carregar } })]));
    }
  }

  async function aoExcluir(commentId) {
    try {
      await excluirComentario(review.id, commentId);
      aoMudarTotal(-1);
      mostrarToast('Comentário apagado.');
      carregar();
    } catch (erro) {
      console.error('[acoes] apagar comentário', erro);
      mostrarToast('Não foi possível apagar agora.');
    }
  }

  // Sem login: convite em vez do campo
  if (!usuario) {
    const link = el('button', { classe: 'botao-texto', texto: 'Entre para comentar', atributos: { type: 'button' } });
    link.addEventListener('click', irParaLogin);
    painel.append(link);
    return { painel, carregar };
  }

  // Campo de comentário
  const idCampo = `campo-comentario-${review.id}`;
  const campo = el('textarea', {
    classe: 'campo__texto comentarios__campo',
    atributos: { id: idCampo, rows: 2, maxlength: LIMITES_REVIEW.COMENTARIO_MAX, placeholder: 'Escreva um comentário…' },
  });
  const erro = el('p', { classe: 'erro-form', atributos: { role: 'alert' } });
  const enviar = el('button', { classe: 'botao botao--primario comentarios__enviar', atributos: { type: 'submit' } }, [icone('enviar', { tamanho: 20 }), el('span', { texto: 'Enviar' })]);
  const form = el('form', { classe: 'comentarios__form', atributos: { novalidate: true } }, [
    el('label', { classe: 'visualmente-oculto', texto: 'Seu comentário', atributos: { for: idCampo } }),
    campo,
    enviar,
  ]);

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const texto = campo.value.trim();
    const problema = validarComentario(texto);
    erro.textContent = problema ?? '';
    if (problema) return;

    enviar.disabled = true;
    try {
      await comentar(usuario.uid, review.id, texto);
      campo.value = '';
      aoMudarTotal(1);
      await carregar();
    } catch (falha) {
      console.error('[acoes] comentar', falha);
      erro.textContent = 'Não foi possível enviar agora. Tente de novo.';
    } finally {
      enviar.disabled = false;
    }
  });

  painel.append(form, erro);
  return { painel, carregar };
}

// ---------- Barra de ações ----------

/** Botão só com ícone (compartilhar, mais opções). */
function criarBotaoIcone(nomeIcone, rotulo) {
  return el('button', { classe: 'acao', atributos: { type: 'button', 'aria-label': rotulo } }, [icone(nomeIcone, { tamanho: 22 })]);
}

/** Gera o card de Stories e compartilha (ou baixa). */
async function compartilharComoImagem(review, autor, botao) {
  botao.disabled = true;
  mostrarToast('Gerando imagem…');
  try {
    const { compartilharCard } = await import('./share-card.js');
    const resultado = await compartilharCard({ review, autor });
    if (resultado === 'baixado') mostrarToast('Imagem salva. Agora é só postar nos Stories.');
  } catch (erro) {
    console.error('[acoes] card', erro);
    mostrarToast('Não foi possível gerar a imagem agora.');
  } finally {
    botao.disabled = false;
  }
}

/**
 * Barra com curtir, comentar, compartilhar e "⋯" para uma review.
 * @param {object} review - precisa de id, uid, likeCount, commentCount
 * @param {object|null} usuario - pessoa logada (ou null)
 * @param {{autor?: {uid?: string, username: string}|null}} [opcoes] - autor da review (para o card e a moderação)
 */
export function criarAcoesReview(review, usuario, { autor = null } = {}) {
  let curtido = false;
  let totalCurtidas = review.likeCount ?? 0;
  let totalComentarios = review.commentCount ?? 0;

  const curtir = criarBotaoContador({ nomeIcone: 'coracao', rotulo: 'Curtir', total: totalCurtidas });
  const comentarios = criarBotaoContador({ nomeIcone: 'comentario', rotulo: 'Comentários', total: totalComentarios });
  curtir.botao.setAttribute('aria-pressed', 'false');
  comentarios.botao.setAttribute('aria-expanded', 'false');
  comentarios.botao.setAttribute('aria-controls', `comentarios-${review.id}`);

  // Compartilhar como imagem (precisa do @ de quem escreveu)
  const compartilhar = autor?.username ? criarBotaoIcone('compartilhar', 'Compartilhar review como imagem') : null;
  compartilhar?.addEventListener('click', () => compartilharComoImagem(review, autor, compartilhar));

  // "⋯": denunciar/bloquear (não aparece na própria review)
  const ehPropria = usuario?.uid === review.uid;
  const opcoes = ehPropria ? null : criarBotaoIcone('opcoes', 'Mais opções');
  opcoes?.classList.add('acao--fim');
  opcoes?.addEventListener('click', () => {
    if (!usuario) return irParaLogin();
    abrirModeracao({ usuario, autor: { uid: review.uid, username: autor?.username }, tipo: 'review', reviewId: review.id });
  });

  const barra = el('div', { classe: 'acoes-review' }, [curtir.botao, comentarios.botao, compartilhar, opcoes]);
  const raiz = el('div', { classe: 'acoes-review__raiz' }, [barra]);

  /** Desenha o estado de curtida. */
  function pintarCurtida() {
    curtir.botao.setAttribute('aria-pressed', String(curtido));
    curtir.botao.classList.toggle('acao--ativa', curtido);
    curtir.numero.textContent = formatarContador(totalCurtidas);
  }

  // Descobre se a pessoa já curtiu (sem travar a renderização)
  if (usuario) {
    jaCurtiu(usuario.uid, review.id)
      .then((sim) => {
        curtido = sim;
        pintarCurtida();
      })
      .catch((erro) => console.error('[acoes] já curtiu?', erro));
  }

  // Curtir: muda na hora e desfaz se falhar
  curtir.botao.addEventListener('click', async () => {
    if (!usuario) return irParaLogin();
    const desejado = !curtido;
    curtido = desejado;
    totalCurtidas = Math.max(0, totalCurtidas + (desejado ? 1 : -1));
    pintarCurtida();
    curtir.botao.disabled = true;
    try {
      totalCurtidas = await definirCurtida(usuario.uid, review.id, desejado);
      pintarCurtida();
    } catch (erro) {
      console.error('[acoes] curtir', erro);
      curtido = !desejado;
      totalCurtidas = Math.max(0, totalCurtidas + (desejado ? -1 : 1));
      pintarCurtida();
      mostrarToast('Não foi possível curtir agora.');
    } finally {
      curtir.botao.disabled = false;
    }
  });

  // Comentários: cria o painel na primeira abertura
  let painel = null;
  comentarios.botao.addEventListener('click', () => {
    if (!painel) {
      painel = criarPainelComentarios({
        review,
        usuario,
        aoMudarTotal: (passo) => {
          totalComentarios = Math.max(0, totalComentarios + passo);
          comentarios.numero.textContent = formatarContador(totalComentarios);
        },
      });
      raiz.append(painel.painel);
      painel.carregar();
    } else {
      painel.painel.hidden = !painel.painel.hidden;
    }
    comentarios.botao.setAttribute('aria-expanded', String(!painel.painel.hidden));
  });

  return raiz;
}
