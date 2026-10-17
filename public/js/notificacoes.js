// =====================================================================
// notificacoes.js — página de notificações (notificacoes.html)
// ---------------------------------------------------------------------
// Lista quem curtiu, comentou ou respondeu as reviews da pessoa. Avisos
// novos (depois da última visita) aparecem realçados; ao abrir a
// página, todos passam a contar como vistos (o sino zera).
// =====================================================================

import { usuarioAtual } from './auth.js';
import { semBloqueados } from './moderacao-regras.js';
import { obterBloqueados } from './moderation.js';
import { tempoRelativo } from './reviews-regras.js';
import { listarNotificacoes, marcarNotificacoesVistas } from './social.js';
import { descreverAviso } from './social-regras.js';
import { criarAvatar, criarEstado, el, iniciarPagina, voltarOuInicio } from './ui.js';

const lista = document.getElementById('lista-avisos');

/** Link para a review (e o comentário, se houver), ou null se a review sumiu. */
function linkDoAviso(aviso) {
  if (!aviso.review) return null;
  const comentario = aviso.commentId ? `&c=${encodeURIComponent(aviso.commentId)}` : '';
  return `review.html?id=${encodeURIComponent(aviso.reviewId)}${comentario}`;
}

/** Um aviso: avatar + "Fulano curtiu sua review de X" + trecho + tempo. */
function criarItemAviso(aviso, vistoEm) {
  const novo = aviso.createdAt > vistoEm;
  const nome = aviso.autor?.displayName ?? 'Pessoa removida';

  // Trecho do comentário (comentário apagado vira aviso discreto)
  let trecho = null;
  if (aviso.type !== 'like') trecho = el('p', { classe: 'aviso__trecho', texto: aviso.comentario ? `“${aviso.comentario.text}”` : 'Comentário apagado.' });

  const corpo = el('div', { classe: 'aviso__corpo' }, [
    el('p', { classe: 'aviso__texto' }, [
      novo ? el('span', { classe: 'visualmente-oculto', texto: 'Novo: ' }) : null,
      el('strong', { texto: nome }),
      ` ${descreverAviso(aviso.type, aviso.review?.title ?? null)}`,
    ]),
    trecho,
    el('span', { classe: 'aviso__tempo', texto: aviso.review ? tempoRelativo(aviso.createdAt) : `${tempoRelativo(aviso.createdAt)} · review apagada` }),
  ]);

  const filhos = [criarAvatar({ ...aviso.autor, uid: aviso.fromUid }, 'p'), corpo, novo ? el('span', { classe: 'aviso__ponto', atributos: { 'aria-hidden': 'true' } }) : null];
  const classe = `aviso${novo ? ' aviso--novo' : ''}`;
  const href = linkDoAviso(aviso);
  // Review apagada: sem link (não há para onde ir)
  return el('li', {}, [href ? el('a', { classe, atributos: { href } }, filhos) : el('div', { classe }, filhos)]);
}

/** Convite para entrar (a página é pessoal). */
function mostrarLogin() {
  const estado = criarEstado({ tipo: 'vazio', mensagem: 'Entre para ver quem curtiu e comentou suas reviews.' });
  estado.append(el('a', { classe: 'botao botao--primario', texto: 'Entrar', atributos: { href: 'perfil.html?voltar=notificacoes.html' } }));
  lista.replaceChildren(el('li', {}, [estado]));
}

/** Carrega e mostra os avisos; depois marca tudo como visto. */
async function carregar() {
  lista.setAttribute('aria-busy', 'true');
  lista.replaceChildren(...Array.from({ length: 4 }, () => el('li', { atributos: { 'aria-hidden': 'true' } }, [el('div', { classe: 'esqueleto esqueleto--aviso' })])));

  try {
    const usuario = await usuarioAtual();
    if (!usuario) return mostrarLogin();

    const [{ avisos, vistoEm }, bloqueados] = await Promise.all([listarNotificacoes(usuario.uid), obterBloqueados(usuario.uid)]);
    // Quem foi bloqueado depois de interagir some da lista
    const visiveis = semBloqueados(avisos, bloqueados, (aviso) => aviso.fromUid);

    if (!visiveis.length) {
      lista.replaceChildren(el('li', {}, [criarEstado({ tipo: 'vazio', mensagem: 'Nenhuma notificação ainda. Quando curtirem, comentarem ou responderem você, aparece aqui.' })]));
    } else {
      lista.replaceChildren(...visiveis.map((aviso) => criarItemAviso(aviso, vistoEm)));
    }

    // Zera o sino (falhar aqui não atrapalha a leitura)
    marcarNotificacoesVistas(usuario.uid).catch((erro) => console.error('[notificacoes] marcar vistas', erro));
  } catch (erro) {
    console.error('[notificacoes] carregar', erro);
    lista.replaceChildren(el('li', {}, [criarEstado({ tipo: 'erro', mensagem: 'Não foi possível carregar as notificações agora.', acao: { texto: 'Tentar de novo', onClick: carregar } })]));
  } finally {
    lista.removeAttribute('aria-busy');
  }
}

document.getElementById('botao-voltar').addEventListener('click', voltarOuInicio);
iniciarPagina();
carregar();
