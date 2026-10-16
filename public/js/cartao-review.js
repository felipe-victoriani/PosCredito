// =====================================================================
// cartao-review.js — cartão de review (página do título, perfil e feed)
// ---------------------------------------------------------------------
// Texto da pessoa SEMPRE via textContent. Spoiler fica borrado e
// escondido do leitor de tela até alguém tocar em "Mostrar".
// =====================================================================

import { ROTULO_STATUS, tempoRelativo } from './reviews-regras.js';
import { criarAvatar, criarEstrelas, criarPoster, criarSelo, el, icone } from './ui.js';

/**
 * Texto da review com tratamento de spoiler.
 * @returns {HTMLElement|null}
 */
function criarTexto(review) {
  if (!review.text) return null;
  const texto = el('p', { classe: 'review__texto', texto: review.text });
  if (!review.spoiler) return texto;

  // Borrado + fora da árvore de acessibilidade até revelar
  texto.classList.add('review__texto--spoiler');
  texto.setAttribute('aria-hidden', 'true');
  texto.inert = true;

  const botao = el('button', { classe: 'review__revelar', atributos: { type: 'button', 'aria-expanded': 'false' } }, [
    icone('olho', { tamanho: 20 }),
    el('span', { texto: 'Contém spoiler · Mostrar' }),
  ]);
  botao.addEventListener('click', () => {
    texto.classList.remove('review__texto--spoiler');
    texto.removeAttribute('aria-hidden');
    texto.inert = false;
    botao.remove();
  });

  return el('div', { classe: 'review__spoiler' }, [texto, botao]);
}

/**
 * Cartão de review.
 * @param {{review: object, autor: object|null}} dados
 * @param {{mostrarTitulo?: boolean, mostrarAutor?: boolean, acoes?: HTMLElement|null}} [opcoes]
 */
export function criarCartaoReview({ review, autor }, { mostrarTitulo = false, mostrarAutor = true, acoes = null } = {}) {
  const nomeAutor = autor?.displayName ?? 'Pessoa removida';
  const linkAutor = autor ? `perfil.html?u=${encodeURIComponent(autor.username)}` : null;

  // Cabeçalho: avatar + nome + @ · tempo
  const cabecalho = mostrarAutor
    ? el('header', { classe: 'review__cabecalho' }, [
        criarAvatar({ ...autor, uid: review.uid }, 'p'),
        el('div', { classe: 'review__autor' }, [
          linkAutor ? el('a', { classe: 'review__nome', texto: nomeAutor, atributos: { href: linkAutor } }) : el('span', { classe: 'review__nome', texto: nomeAutor }),
          el('span', { classe: 'review__meta-autor', texto: [autor ? `@${autor.username}` : null, tempoRelativo(review.createdAt)].filter(Boolean).join(' · ') }),
        ]),
      ])
    : null;

  // Bloco do título (feed e perfil): pôster pequeno + nome + selo
  const titulo = mostrarTitulo
    ? el('a', { classe: 'review__titulo', atributos: { href: `titulo.html?id=${review.mediaKey}` } }, [
        criarPoster({ poster_path: review.posterPath, title: review.title }),
        el('span', { classe: 'review__titulo-nome' }, [
          el('span', { texto: review.title }),
          review.year ? el('span', { classe: 'review__ano', texto: ` ${review.year}` }) : null,
        ]),
      ])
    : null;

  // Nota + status (+ selo do tipo quando mostra o título)
  const linhaNota = el('div', { classe: 'review__nota' }, [
    mostrarTitulo ? criarSelo(review.tipo) : null,
    criarEstrelas(review.rating),
    el('span', { classe: 'review__status', texto: ROTULO_STATUS[review.status] ?? '' }),
  ]);

  // data-autor: permite sumir com a review na hora em que a pessoa é bloqueada
  return el('article', { classe: 'review', atributos: { 'aria-label': `Review de ${nomeAutor}`, 'data-autor': review.uid } }, [
    cabecalho,
    titulo,
    linhaNota,
    criarTexto(review),
    acoes,
  ]);
}
