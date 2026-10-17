// =====================================================================
// sino.js — sino de notificações no topo do feed
// ---------------------------------------------------------------------
// O link <a id="sino"> já vem no HTML (escondido, sem salto de layout);
// aqui ele aparece para quem está logado e ganha o contador de avisos
// novos, atualizado em tempo real.
// =====================================================================

import { observarNaoLidas } from './social.js';
import { rotuloContador } from './social-regras.js';
import { el, icone } from './ui.js';

/**
 * Mostra o sino e liga o contador.
 * @param {string} uid - pessoa logada
 * @returns {Promise<() => void>} função para parar de observar
 */
export async function montarSino(uid) {
  const sino = document.getElementById('sino');
  if (!sino) return () => {};

  const contador = el('span', { classe: 'sino__contador', atributos: { 'aria-hidden': 'true', hidden: true } });
  sino.replaceChildren(icone('sino', { tamanho: 24 }), contador);
  sino.hidden = false;

  /** Desenha o total de avisos novos. */
  const pintar = (total) => {
    contador.hidden = total === 0;
    contador.textContent = rotuloContador(total);
    // O número visual é aria-hidden; o leitor de tela ouve pelo rótulo do link
    sino.setAttribute('aria-label', total ? `Notificações, ${rotuloContador(total)} novas` : 'Notificações');
  };

  let parar = await observarNaoLidas(uid, pintar);

  // Voltou da página de avisos pelo "voltar" (página restaurada do cache
  // do navegador): a marca de "visto" mudou, então refaz a consulta
  window.addEventListener('pageshow', async (evento) => {
    if (!evento.persisted) return;
    parar();
    parar = await observarNaoLidas(uid, pintar);
  });

  return () => parar();
}
