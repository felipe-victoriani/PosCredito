// =====================================================================
// pessoas-sugeridas.js — aba "Pessoas" do início: sugestões para seguir
// ---------------------------------------------------------------------
// Quem segue você, quem tem gostos parecidos (interesses do onboarding)
// e quem anda publicando. Seguir direto da lista, sem abrir o perfil.
// A ordem é decidida em social-regras.js (sugerirPessoas).
// =====================================================================

import { obterPerfil } from './auth.js';
import { GENEROS, TIPOS } from './interesses.js';
import { carregarCandidatos, definirSeguindo } from './social.js';
import { sugerirPessoas } from './social-regras.js';
import { criarAvatar, el, mostrarToast } from './ui.js';

// id do interesse → nome que aparece no motivo ("terror" → "Terror")
const ROTULOS = Object.fromEntries([...GENEROS, ...TIPOS].map((item) => [item.id, item.rotulo]));

/**
 * Calcula as sugestões da pessoa (ou de um visitante).
 * @param {{usuario: object|null, bloqueados: Set<string>, autoresAtivos: string[]}} p
 *   autoresAtivos: uids de quem publicou reviews recentemente
 * @returns {Promise<{perfil: object, motivo: string}[]>}
 */
export async function obterSugestoes({ usuario, bloqueados, autoresAtivos }) {
  const [candidatos, meuPerfil] = await Promise.all([
    carregarCandidatos(usuario?.uid ?? null, autoresAtivos),
    usuario ? obterPerfil(usuario.uid) : null,
  ]);
  return sugerirPessoas({
    ...candidatos,
    meuUid: usuario?.uid ?? null,
    bloqueados,
    meusInteresses: meuPerfil?.interests ?? null,
    ativos: new Set(autoresAtivos),
    rotulos: ROTULOS,
  });
}

/**
 * Pinta o botão: "Seguir" (amarelo) ou "Seguindo" (contorno). O nome da
 * pessoa vai escondido no fim, para o leitor de tela saber quem é
 * (o texto visível continua contido no nome acessível — WCAG 2.5.3).
 */
function pintarBotao(botao, seguindo, nome) {
  botao.setAttribute('aria-pressed', String(seguindo));
  botao.replaceChildren(seguindo ? 'Seguindo' : 'Seguir', el('span', { classe: 'visualmente-oculto', texto: ` ${nome}` }));
  botao.classList.toggle('botao--primario', !seguindo);
  botao.classList.toggle('botao--secundario', seguindo);
}

/**
 * Linha de sugestão: avatar + nome + @ + motivo (link para o perfil)
 * e o botão "Seguir" ao lado (fora do link: botão dentro de link é inválido).
 * @param {{perfil: object, motivo: string}} sugestao
 * @param {{usuario: object|null, irParaLogin: () => void, aoMudar?: () => void}} contexto
 *   aoMudar: chamado depois de seguir/deixar de seguir (o feed "Seguindo" recarrega)
 */
export function criarLinhaSugestao({ perfil, motivo }, { usuario, irParaLogin, aoMudar = () => {} }) {
  // Linha curta (só o @): o motivo já explica por que a pessoa aparece
  const meta = el('span', { classe: 'resultado__mono', texto: `@${perfil.username}` });

  const botao = el('button', { classe: 'botao sugestao__seguir', atributos: { type: 'button' } });
  pintarBotao(botao, false, perfil.displayName);

  botao.addEventListener('click', async () => {
    if (!usuario) return irParaLogin();
    const seguir = botao.getAttribute('aria-pressed') !== 'true';
    // Muda na hora; desfaz se o banco recusar
    pintarBotao(botao, seguir, perfil.displayName);
    botao.disabled = true;
    try {
      await definirSeguindo(usuario.uid, perfil.uid, seguir);
      aoMudar();
    } catch (erro) {
      console.error('[pessoas] seguir', erro);
      pintarBotao(botao, !seguir, perfil.displayName);
      mostrarToast('Não foi possível agora. Tente de novo.');
    } finally {
      botao.disabled = false;
    }
  });

  return el('li', { classe: 'sugestao', atributos: { 'data-autor': perfil.uid } }, [
    el('a', { classe: 'sugestao__perfil', atributos: { href: `perfil.html?u=${encodeURIComponent(perfil.username)}` } }, [
      criarAvatar(perfil, 'm'),
      el('div', { classe: 'resultado__info' }, [
        el('span', { classe: 'sugestao__nome', texto: perfil.displayName }),
        meta,
        el('span', { classe: 'sugestao__motivo', texto: motivo }),
      ]),
    ]),
    botao,
  ]);
}
