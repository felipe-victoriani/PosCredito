// =====================================================================
// review.js — uma review sozinha (review.html?id={reviewId}&c={commentId})
// ---------------------------------------------------------------------
// Destino dos links de notificação: abre a review já com os
// comentários abertos e, se vier "c", realça aquele comentário.
// =====================================================================

import { criarAcoesReview } from './acoes-review.js';
import { usuarioAtual } from './auth.js';
import { criarCartaoReview } from './cartao-review.js';
import { obterBloqueados } from './moderation.js';
import { obterReviewComAutor } from './reviews.js';
import { criarEstado, el, iniciarPagina, voltarOuInicio } from './ui.js';

// Ids aceitos na URL (uid_tipo_numero e ids de push do Firebase)
const ID_VALIDO = /^[A-Za-z0-9_-]{1,200}$/;

const conteudo = document.getElementById('conteudo');
const alvo = document.getElementById('review');

/** Lê e confere os parâmetros da URL (valor estranho vira null). */
function lerParametros() {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const comentario = params.get('c');
  return {
    reviewId: id && ID_VALIDO.test(id) ? id : null,
    commentId: comentario && ID_VALIDO.test(comentario) ? comentario : null,
  };
}

/** Bloco de estado no lugar da review. */
function mostrarEstado(opcoes) {
  alvo.replaceChildren(criarEstado(opcoes));
}

async function carregar() {
  const { reviewId, commentId } = lerParametros();
  if (!reviewId) return mostrarEstado({ tipo: 'vazio', mensagem: 'Link de review inválido.' });

  conteudo.setAttribute('aria-busy', 'true');
  alvo.replaceChildren(el('div', { classe: 'esqueleto esqueleto--review' }));
  try {
    const [dados, usuario] = await Promise.all([obterReviewComAutor(reviewId), usuarioAtual()]);
    if (!dados) return mostrarEstado({ tipo: 'vazio', mensagem: 'Essa review não existe mais.' });

    // Review de alguém que a pessoa bloqueou não aparece
    const bloqueados = await obterBloqueados(usuario?.uid);
    if (bloqueados.has(dados.review.uid)) return mostrarEstado({ tipo: 'vazio', mensagem: 'Você bloqueou quem escreveu esta review.' });

    const { review, autor } = dados;
    document.title = `Review de ${autor?.displayName ?? 'Pessoa removida'} sobre ${review.title} · PósCréditos`;

    const acoes = criarAcoesReview(review, usuario, { autor, abrirComentarios: true, destacarComentario: commentId });
    alvo.replaceChildren(criarCartaoReview(dados, { mostrarTitulo: true, acoes }));
  } catch (erro) {
    console.error('[review] carregar', erro);
    mostrarEstado({ tipo: 'erro', mensagem: 'Não foi possível carregar a review agora.', acao: { texto: 'Tentar de novo', onClick: carregar } });
  } finally {
    conteudo.removeAttribute('aria-busy');
  }
}

document.getElementById('botao-voltar').addEventListener('click', voltarOuInicio);
iniciarPagina();
carregar();
