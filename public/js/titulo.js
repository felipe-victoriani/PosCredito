// =====================================================================
// titulo.js — página do título (titulo.html?id=movie_603)
// ---------------------------------------------------------------------
// Mostra capa, sinopse, elenco, trailer, onde assistir no Brasil e
// semelhantes. Nota da comunidade e reviews entram na Fase 3.
// =====================================================================

import {
  anoDe,
  buscarDetalhes,
  buscarProvedores,
  classificarTipo,
  consolidarProvedores,
  escolherTrailer,
  formatarDuracao,
  lerMediaKey,
  tituloDe,
  tituloOriginalDe,
  urlImagem,
} from './tmdb.js';
import { criarCartaoPoster, criarEstado, criarPoster, criarSelo, el, icone, iniciarPagina, mensagemErro, mostrarToast } from './ui.js';

// Quantos itens mostrar nos carrosséis
const MAX_ELENCO = 15;
const MAX_SEMELHANTES = 12;

// Elementos fixos da página
const $ = (id) => document.getElementById(id);
const conteudo = $('conteudo');
const corpo = $('corpo-titulo');
const areaErro = $('erro-titulo');

// ---------- Cabeçalho ----------

/** Linha "2023 · 28 ep." / "2024 · 2h 46min". */
function montarInfo(detalhes, mediaType) {
  const partes = [anoDe(detalhes)];
  if (mediaType === 'movie') {
    partes.push(formatarDuracao(detalhes.runtime));
  } else {
    const temporadas = detalhes.number_of_seasons;
    const episodios = detalhes.number_of_episodes;
    if (temporadas > 1) partes.push(`${temporadas} temporadas`);
    if (episodios) partes.push(`${episodios} ep.`);
  }
  return partes.filter(Boolean).join(' · ');
}

function renderizarCabecalho(detalhes, mediaType) {
  const nome = tituloDe(detalhes);
  const tipo = classificarTipo(detalhes, mediaType);
  document.title = `${nome} · PósCréditos`;

  // Fundo: backdrop w780 (se faltar, fica só a cor de superfície)
  const fundo = urlImagem(detalhes.backdrop_path, 'w780');
  if (fundo) {
    const img = $('titulo-fundo');
    img.src = fundo;
    img.hidden = false;
    img.addEventListener('error', () => (img.hidden = true), { once: true });
  }

  // Pôster com prioridade alta (é o maior conteúdo visível = LCP)
  $('titulo-poster').replaceChildren(criarPoster(detalhes, { tamanho: 'w342', alt: `Pôster de ${nome}`, prioridade: true }));
  $('titulo-nome').textContent = nome;

  const original = tituloOriginalDe(detalhes);
  const elOriginal = $('titulo-original');
  elOriginal.textContent = original ?? '';
  elOriginal.hidden = !original;
  if (original) elOriginal.lang = detalhes.original_language;

  $('titulo-meta').replaceChildren(criarSelo(tipo), el('span', { texto: montarInfo(detalhes, mediaType) }));

  // Gêneros como pílulas discretas
  $('titulo-generos').replaceChildren(...(detalhes.genres ?? []).map((g) => el('li', { classe: 'pilula', texto: g.name })));
}

// ---------- Onde assistir ----------

function renderizarProvedores(dadosBR) {
  const lista = $('lista-provedores');
  const provedores = consolidarProvedores(dadosBR);

  if (!provedores.length) {
    lista.replaceChildren(el('li', { classe: 'provedores__vazio', texto: 'Ainda não está disponível em streaming, aluguel ou compra no Brasil.' }));
    return;
  }

  lista.replaceChildren(
    ...provedores.map((p) => {
      const logo = urlImagem(p.logo, 'w92');
      return el('li', { classe: 'provedor' }, [
        logo
          ? el('img', { classe: 'provedor__logo', atributos: { src: logo, alt: '', width: 40, height: 40, loading: 'lazy' } })
          : el('span', { classe: 'provedor__logo provedor__logo--vazio', atributos: { 'aria-hidden': 'true' } }),
        el('span', { classe: 'provedor__texto' }, [
          el('span', { classe: 'provedor__nome', texto: p.nome }),
          el('span', { classe: 'provedor__categoria', texto: p.categorias.join(' · ') }),
        ]),
      ]);
    }),
  );

  // Link oficial do TMDB com as opções (os dados vêm da JustWatch)
  const link = $('link-opcoes');
  if (dadosBR?.link?.startsWith('https://www.themoviedb.org/')) {
    link.href = dadosBR.link;
    link.hidden = false;
  }
}

// ---------- Sinopse com "ler mais" ----------

function renderizarSinopse(detalhes) {
  const texto = $('sinopse');
  const botao = $('ler-mais');
  texto.textContent = detalhes.overview || 'Sinopse ainda não disponível em português.';

  // Só mostra "ler mais" se o texto realmente passou de 4 linhas
  requestAnimationFrame(() => {
    botao.hidden = texto.scrollHeight <= texto.clientHeight + 1;
  });
}

function alternarSinopse() {
  const texto = $('sinopse');
  const aberto = texto.classList.toggle('sinopse--aberta');
  $('ler-mais').textContent = aberto ? 'Ler menos' : 'Ler mais';
  $('ler-mais').setAttribute('aria-expanded', String(aberto));
}

// ---------- Trailer (fachada: só carrega o YouTube ao tocar) ----------

function renderizarTrailer(detalhes) {
  const chave = escolherTrailer(detalhes.videos?.results);
  if (!chave) return;

  const secao = $('secao-trailer');
  const fachada = el('button', { classe: 'trailer__fachada', atributos: { type: 'button', 'aria-label': `Assistir trailer de ${tituloDe(detalhes)}` } }, [
    el('img', { atributos: { src: `https://i.ytimg.com/vi/${chave}/hqdefault.jpg`, alt: '', width: 480, height: 360, loading: 'lazy' } }),
    el('span', { classe: 'trailer__play' }, [icone('play', { tamanho: 28, preenchido: true })]),
  ]);

  // Troca a imagem pelo player só quando a pessoa pede (economiza dados)
  fachada.addEventListener('click', () => {
    const iframe = el('iframe', {
      atributos: {
        src: `https://www.youtube-nocookie.com/embed/${chave}?autoplay=1&rel=0&playsinline=1`,
        title: `Trailer de ${tituloDe(detalhes)}`,
        allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
        allowfullscreen: true,
        referrerpolicy: 'strict-origin-when-cross-origin',
      },
    });
    fachada.replaceWith(iframe);
    iframe.focus();
  });

  $('trailer').replaceChildren(fachada);
  secao.hidden = false;
}

// ---------- Elenco ----------

function renderizarElenco(detalhes) {
  const elenco = (detalhes.credits?.cast ?? []).slice(0, MAX_ELENCO);
  if (!elenco.length) return;

  $('lista-elenco').replaceChildren(
    ...elenco.map((pessoa) => {
      const foto = urlImagem(pessoa.profile_path, 'w185');
      return el('li', { classe: 'pessoa' }, [
        foto
          ? el('img', { classe: 'pessoa__foto', atributos: { src: foto, alt: '', width: 185, height: 278, loading: 'lazy' } })
          : el('span', { classe: 'pessoa__foto pessoa__foto--vazia', atributos: { 'aria-hidden': 'true' } }, [icone('perfil', { tamanho: 28 })]),
        el('span', { classe: 'pessoa__nome', texto: pessoa.name }),
        pessoa.character ? el('span', { classe: 'pessoa__papel', texto: pessoa.character }) : null,
      ]);
    }),
  );
  $('secao-elenco').hidden = false;
}

// ---------- Semelhantes ----------

function renderizarSemelhantes(detalhes, mediaType) {
  // Recomendações primeiro; se o TMDB não tiver nenhuma, usa os "similares"
  const recomendados = detalhes.recommendations?.results ?? [];
  const fonte = recomendados.length ? recomendados : (detalhes.similar?.results ?? []);
  const itens = fonte.slice(0, MAX_SEMELHANTES);
  if (!itens.length) return;
  // Recomendações podem misturar filme e série: respeita o media_type de cada item
  $('lista-semelhantes').replaceChildren(...itens.map((item) => criarCartaoPoster(item, item.media_type ?? mediaType)));
  $('secao-semelhantes').hidden = false;
}

// ---------- Ações do topo ----------

/** Volta para a página anterior do app, ou para o início se veio de fora. */
function voltar() {
  const veioDoApp = document.referrer && new URL(document.referrer).origin === location.origin;
  if (veioDoApp && history.length > 1) history.back();
  else location.href = 'index.html';
}

/** Compartilha o link do título (Web Share API, com cópia como alternativa). */
async function compartilhar() {
  const dados = { title: document.title, url: location.href };
  try {
    if (navigator.share) {
      await navigator.share(dados);
      return;
    }
    await navigator.clipboard.writeText(location.href);
    mostrarToast('Link copiado.');
  } catch (erro) {
    // Cancelar o menu de compartilhar não é erro
    if (erro?.name !== 'AbortError') {
      console.error('[titulo] compartilhar', erro);
      mostrarToast('Não foi possível compartilhar.');
    }
  }
}

// ---------- Carregamento ----------

function mostrarErro(mensagem, tentarDeNovo) {
  corpo.hidden = true;
  areaErro.hidden = false;
  areaErro.replaceChildren(
    criarEstado({ tipo: 'erro', mensagem, acao: tentarDeNovo ? { texto: 'Tentar de novo', onClick: tentarDeNovo } : undefined }),
    el('a', { classe: 'botao botao--secundario', texto: 'Voltar ao início', atributos: { href: 'index.html' } }),
  );
  conteudo.removeAttribute('aria-busy');
}

async function carregar() {
  // Valida a chave da URL antes de qualquer chamada
  const chave = lerMediaKey(new URLSearchParams(location.search).get('id'));
  if (!chave) return mostrarErro('Link de título inválido.');
  const { mediaType, id } = chave;

  areaErro.hidden = true;
  corpo.hidden = false;
  conteudo.setAttribute('aria-busy', 'true');

  // Detalhes e provedores em paralelo; provedores podem falhar sem derrubar a página
  const [detalhes, provedores] = await Promise.allSettled([buscarDetalhes(mediaType, id), buscarProvedores(mediaType, id)]);

  if (detalhes.status === 'rejected') {
    console.error('[titulo] detalhes', detalhes.reason);
    const status = detalhes.reason?.status;
    return mostrarErro(mensagemErro(detalhes.reason), status === 404 ? null : carregar);
  }

  const dados = detalhes.value;
  renderizarCabecalho(dados, mediaType);
  renderizarSinopse(dados);
  renderizarTrailer(dados);
  renderizarElenco(dados);
  renderizarSemelhantes(dados, mediaType);

  if (provedores.status === 'fulfilled') {
    renderizarProvedores(provedores.value);
  } else {
    console.error('[titulo] provedores', provedores.reason);
    $('lista-provedores').replaceChildren(el('li', { classe: 'provedores__vazio', texto: 'Não foi possível carregar onde assistir agora.' }));
  }

  conteudo.removeAttribute('aria-busy');
  corpo.classList.remove('carregando');

  // Parte social (Firebase) carregada à parte: se falhar, o resto da página fica
  carregarComunidade(dados, mediaType);
}

/** Importa e liga nota da comunidade, listas, reviews e editor. */
async function carregarComunidade(detalhes, mediaType) {
  try {
    const { iniciarComunidade } = await import('./titulo-comunidade.js');
    await iniciarComunidade({ detalhes, mediaType });
  } catch (erro) {
    console.error('[titulo] comunidade', erro);
    $('nota-texto').textContent = 'Notas indisponíveis agora.';
    const aviso = $('aviso-comunidade');
    aviso.textContent = 'Não foi possível conectar à comunidade. Recarregue a página para avaliar ou salvar em listas.';
    aviso.hidden = false;
    $('lista-reviews').replaceChildren(el('li', {}, [criarEstado({ tipo: 'erro', mensagem: 'Não foi possível carregar as reviews.' })]));
    $('lista-reviews').removeAttribute('aria-busy');
  }
}

// ---------- Eventos e início ----------

$('botao-voltar').addEventListener('click', voltar);
$('botao-compartilhar').addEventListener('click', compartilhar);
$('ler-mais').addEventListener('click', alternarSinopse);

iniciarPagina();
carregar();
