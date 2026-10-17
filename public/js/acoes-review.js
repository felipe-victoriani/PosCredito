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
import { agruparConversas, validarComentario } from './social-regras.js';
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

/**
 * Um comentário, com "Responder" e lixeira para quem pode apagar.
 * @param {{comentario: object, autor: object|null}} item
 * @param {{review: object, usuario: object|null, aoExcluir: Function, aoResponder: Function|null, respondido: object|null}} contexto
 *   respondido: autor do comentário respondido, quando é resposta a outra resposta (mostra "@fulano")
 */
function criarItemComentario({ comentario, autor }, { review, usuario, aoExcluir, aoResponder, respondido }) {
  const podeApagar = usuario && (comentario.uid === usuario.uid || review.uid === usuario.uid);
  const nome = autor?.displayName ?? 'Pessoa removida';

  const lixeira = podeApagar
    ? el('button', { classe: 'comentario__apagar', atributos: { type: 'button', 'aria-label': `Apagar comentário de ${nome}` } }, [icone('lixeira', { tamanho: 18 })])
    : null;
  lixeira?.addEventListener('click', () => aoExcluir(comentario));

  // "Responder" (só logado; resposta de raiz apagada não aceita resposta)
  const responder = aoResponder
    ? el('button', { classe: 'comentario__responder', texto: 'Responder', atributos: { type: 'button', 'aria-label': `Responder ${nome}` } })
    : null;
  responder?.addEventListener('click', () => aoResponder({ comentario, nome }));

  // Resposta a outra resposta: "@fulano" antes do texto, levando ao perfil
  const mencao = respondido?.username
    ? el('a', { classe: 'comentario__mencao', texto: `@${respondido.username}`, atributos: { href: `perfil.html?u=${encodeURIComponent(respondido.username)}` } })
    : null;

  // "⋯" (denunciar/bloquear) nos comentários de outras pessoas
  const opcoes =
    usuario && comentario.uid !== usuario.uid
      ? el('button', { classe: 'comentario__apagar', atributos: { type: 'button', 'aria-label': `Mais opções do comentário de ${nome}` } }, [icone('opcoes', { tamanho: 18 })])
      : null;
  opcoes?.addEventListener('click', () =>
    abrirModeracao({ usuario, autor: { uid: comentario.uid, username: autor?.username }, tipo: 'comment', reviewId: review.id, commentId: comentario.id }),
  );

  // id no DOM: o link de uma notificação rola até aqui
  return el('div', { classe: 'comentario', atributos: { id: `comentario-${comentario.id}`, 'data-autor': comentario.uid } }, [
    criarAvatar({ ...autor, uid: comentario.uid }, 'p'),
    el('div', { classe: 'comentario__corpo' }, [
      el('p', { classe: 'comentario__cabecalho' }, [
        autor
          ? el('a', { classe: 'comentario__nome', texto: nome, atributos: { href: `perfil.html?u=${encodeURIComponent(autor.username)}` } })
          : el('span', { classe: 'comentario__nome', texto: nome }),
        el('span', { classe: 'comentario__tempo', texto: ` · ${tempoRelativo(comentario.createdAt)}` }),
      ]),
      el('p', { classe: 'comentario__texto' }, [mencao, mencao ? ' ' : null, comentario.text]),
      responder,
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
 * Painel de comentários (conversas + campo para escrever/responder).
 * @param {{review: object, usuario: object|null, aoMudarTotal: Function, destacar?: string|null}} p
 *   destacar: id de um comentário para rolar até ele e realçar (vindo de uma notificação)
 * @returns {{painel: HTMLElement, carregar: () => Promise<void>}}
 */
function criarPainelComentarios({ review, usuario, aoMudarTotal, destacar = null }) {
  const lista = el('ul', { classe: 'comentarios__lista', atributos: { 'aria-label': 'Comentários' } });
  const painel = el('div', { classe: 'comentarios', atributos: { id: `comentarios-${review.id}` } }, [lista]);

  // Último carregamento: id → {comentario, autor} (para "@fulano" e para avisos ao apagar)
  let porId = new Map();
  // Resposta em andamento: { parentId, replyToId, replyToUid, nome } ou null
  let respondendo = null;
  // Preenchidos mais abaixo quando há login (campo de comentário)
  let definirResposta = null;

  /** Desenha uma conversa: raiz + respostas recuadas embaixo. */
  function criarConversa({ item, respostas }) {
    // Raiz que na verdade é resposta órfã (raiz apagada): sem "Responder"
    const orfa = Boolean(item.comentario.parentId);
    const contexto = (alvo) => ({
      review,
      usuario,
      aoExcluir,
      aoResponder: usuario && !orfa ? aoResponder : null,
      // Só mostra "@fulano" quando responde outra resposta (não a raiz)
      respondido: alvo.comentario.replyToId && alvo.comentario.replyToId !== alvo.comentario.parentId ? porId.get(alvo.comentario.replyToId)?.autor : null,
    });
    const raiz = criarItemComentario(item, contexto(item));
    const filhos = respostas.length
      ? el(
          'ul',
          { classe: 'comentarios__respostas', atributos: { 'aria-label': `Respostas a ${item.autor?.displayName ?? 'comentário'}` } },
          respostas.map((r) => el('li', {}, [criarItemComentario(r, contexto(r))])),
        )
      : null;
    return el('li', { classe: 'comentarios__conversa' }, [raiz, filhos]);
  }

  /** Clique em "Responder": a resposta entra na conversa da raiz. */
  function aoResponder({ comentario, nome }) {
    definirResposta?.({ parentId: comentario.parentId ?? comentario.id, replyToId: comentario.id, replyToUid: comentario.uid, nome });
  }

  /** Realça e rola até o comentário pedido (uma vez só). */
  function destacarComentario() {
    if (!destacar) return;
    const alvo = painel.querySelector(`#comentario-${CSS.escape(destacar)}`);
    destacar = null;
    if (!alvo) return;
    alvo.classList.add('comentario--destaque');
    // Rolagem suave só para quem não pediu menos movimento
    const suave = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    alvo.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'center' });
  }

  async function carregar() {
    lista.replaceChildren(el('li', { classe: 'comentarios__carregando', texto: 'Carregando comentários…' }));
    try {
      // Comentários de pessoas bloqueadas não aparecem
      const [todos, bloqueados] = await Promise.all([listarComentarios(review.id), obterBloqueadosSemFalhar(usuario)]);
      const itens = semBloqueados(todos, bloqueados, (item) => item.comentario.uid);
      porId = new Map(todos.map((item) => [item.comentario.id, item]));
      lista.replaceChildren(...agruparConversas(itens).map(criarConversa));
      if (!itens.length) lista.replaceChildren(el('li', { classe: 'comentarios__vazio', texto: 'Nenhum comentário ainda.' }));
      destacarComentario();
    } catch (erro) {
      console.error('[acoes] comentários', erro);
      lista.replaceChildren(el('li', {}, [criarEstado({ tipo: 'erro', mensagem: 'Não foi possível carregar os comentários.', acao: { texto: 'Tentar de novo', onClick: carregar } })]));
    }
  }

  async function aoExcluir(comentario) {
    try {
      await excluirComentario(review.id, comentario.id, {
        quem: usuario.uid,
        autorComentario: comentario.uid,
        donoReview: review.uid,
        respondido: comentario.replyToId ? (porId.get(comentario.replyToId)?.comentario.uid ?? null) : null,
      });
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
  const rotulo = el('label', { classe: 'visualmente-oculto', texto: 'Seu comentário', atributos: { for: idCampo } });

  // Faixa "Respondendo a Fulano ✕" acima do campo (só durante uma resposta)
  const textoResposta = el('span', { classe: 'comentarios__respondendo-texto' });
  const cancelar = el('button', { classe: 'comentarios__cancelar', atributos: { type: 'button', 'aria-label': 'Cancelar resposta' } }, [icone('fechar', { tamanho: 18 })]);
  const faixaResposta = el('div', { classe: 'comentarios__respondendo', atributos: { hidden: true } }, [textoResposta, cancelar]);

  const form = el('form', { classe: 'comentarios__form', atributos: { novalidate: true } }, [faixaResposta, rotulo, campo, enviar]);

  /** Liga/desliga o modo resposta (null = comentário normal). */
  definirResposta = (alvo) => {
    respondendo = alvo;
    faixaResposta.hidden = !alvo;
    textoResposta.textContent = alvo ? `Respondendo a ${alvo.nome}` : '';
    campo.placeholder = alvo ? `Responder a ${alvo.nome}…` : 'Escreva um comentário…';
    rotulo.textContent = alvo ? `Sua resposta a ${alvo.nome}` : 'Seu comentário';
    if (alvo) campo.focus();
  };
  cancelar.addEventListener('click', () => {
    definirResposta(null);
    campo.focus();
  });
  // Esc no campo também cancela a resposta
  campo.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && respondendo) definirResposta(null);
  });

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const texto = campo.value.trim();
    const problema = validarComentario(texto);
    erro.textContent = problema ?? '';
    if (problema) return;

    enviar.disabled = true;
    try {
      const resposta = respondendo ? { parentId: respondendo.parentId, replyToId: respondendo.replyToId, replyToUid: respondendo.replyToUid } : null;
      await comentar(usuario.uid, review.id, texto, { donoReview: review.uid, resposta });
      campo.value = '';
      definirResposta(null);
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
 * @param {{autor?: {uid?: string, username: string}|null, abrirComentarios?: boolean, destacarComentario?: string|null}} [opcoes]
 *   autor: autor da review (para o card e a moderação)
 *   abrirComentarios: já começa com os comentários abertos (página da review)
 *   destacarComentario: id do comentário a realçar (link de notificação)
 */
export function criarAcoesReview(review, usuario, { autor = null, abrirComentarios = false, destacarComentario = null } = {}) {
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
      totalCurtidas = await definirCurtida(usuario.uid, review.id, desejado, review.uid);
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
  function alternarComentarios() {
    if (!painel) {
      painel = criarPainelComentarios({
        review,
        usuario,
        destacar: destacarComentario,
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
  }
  comentarios.botao.addEventListener('click', alternarComentarios);
  if (abrirComentarios) alternarComentarios();

  return raiz;
}
