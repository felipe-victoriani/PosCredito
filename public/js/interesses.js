// =====================================================================
// interesses.js — tipos e gêneros do onboarding (e da edição de perfil)
// ---------------------------------------------------------------------
// As chaves (filme, terror…) são nossas e estáveis; o mapa "tmdb" diz
// quais gêneros do TMDB cada uma representa em filmes e em séries
// (o TMDB usa IDs diferentes para cada um). O feed usa isso na Fase 4.
// =====================================================================

import { el, icone } from './ui.js';

// Tipos de conteúdo (cards grandes com ícone)
export const TIPOS = [
  { id: 'filme', rotulo: 'Filmes', icone: 'filme' },
  { id: 'serie', rotulo: 'Séries', icone: 'tv' },
  { id: 'anime', rotulo: 'Animes', icone: 'estrela' },
  { id: 'dorama', rotulo: 'Doramas', icone: 'coracao' },
  { id: 'documentario', rotulo: 'Documentários', icone: 'globo' },
  { id: 'reality', rotulo: 'Reality shows', icone: 'pessoas' },
];

// Gêneros favoritos (chips). Lista vazia = o TMDB não tem esse gênero ali.
export const GENEROS = [
  { id: 'acao', rotulo: 'Ação', tmdb: { movie: [28], tv: [10759] } },
  { id: 'aventura', rotulo: 'Aventura', tmdb: { movie: [12], tv: [10759] } },
  { id: 'comedia', rotulo: 'Comédia', tmdb: { movie: [35], tv: [35] } },
  { id: 'crime', rotulo: 'Crime', tmdb: { movie: [80], tv: [80] } },
  { id: 'drama', rotulo: 'Drama', tmdb: { movie: [18], tv: [18] } },
  { id: 'fantasia', rotulo: 'Fantasia', tmdb: { movie: [14], tv: [10765] } },
  { id: 'ficcao', rotulo: 'Ficção científica', tmdb: { movie: [878], tv: [10765] } },
  { id: 'misterio', rotulo: 'Mistério', tmdb: { movie: [9648], tv: [9648] } },
  { id: 'romance', rotulo: 'Romance', tmdb: { movie: [10749], tv: [] } },
  { id: 'suspense', rotulo: 'Suspense', tmdb: { movie: [53], tv: [9648] } },
  { id: 'terror', rotulo: 'Terror', tmdb: { movie: [27], tv: [] } },
];

/**
 * Cria um grupo de botões liga/desliga (aria-pressed).
 * @param {{itens: {id:string, rotulo:string, icone?:string}[], selecionados?: Iterable<string>, rotulo: string, variante: 'cartao'|'chip'}} opcoes
 */
export function criarSeletor({ itens, selecionados = [], rotulo, variante }) {
  const marcados = new Set(selecionados);
  const grupo = el('div', { classe: `seletor seletor--${variante}`, atributos: { role: 'group', 'aria-label': rotulo } });

  for (const item of itens) {
    const botao = el(
      'button',
      {
        classe: variante === 'cartao' ? 'cartao-opcao' : 'chip',
        atributos: { type: 'button', 'data-id': item.id, 'aria-pressed': String(marcados.has(item.id)) },
      },
      [item.icone ? icone(item.icone, { tamanho: 26 }) : null, el('span', { texto: item.rotulo })],
    );
    grupo.append(botao);
  }

  // Um único ouvinte no grupo alterna o botão tocado
  grupo.addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-id]');
    if (!botao) return;
    botao.setAttribute('aria-pressed', String(botao.getAttribute('aria-pressed') !== 'true'));
  });

  return grupo;
}

/** Lê os ids marcados de um seletor. */
export function lerSelecao(grupo) {
  return [...grupo.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.dataset.id);
}

/** Monta o objeto gravado no banco: { tipos: {filme: true}, generos: {terror: true} }. */
export function montarInteresses(tipos, generos) {
  const paraMapa = (ids) => Object.fromEntries(ids.map((id) => [id, true]));
  return { tipos: paraMapa(tipos), generos: paraMapa(generos) };
}

/** Caminho inverso: do banco para listas de ids. */
export function lerInteresses(interests) {
  return {
    tipos: Object.keys(interests?.tipos ?? {}),
    generos: Object.keys(interests?.generos ?? {}),
  };
}
