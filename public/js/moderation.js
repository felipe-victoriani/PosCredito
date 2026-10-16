// =====================================================================
// moderation.js — denunciar e bloquear
// ---------------------------------------------------------------------
// Dados (Firebase) + o diálogo de opções aberto pelo botão "⋯" das
// reviews e comentários. Bloquear esconde na hora tudo daquela pessoa
// na página (elementos com data-autor="uid").
// =====================================================================

import { db, get, ref, serverTimestamp, update } from './firebase.js';
import { DETALHES_MAX, idAlvo, montarBloqueio, montarDenuncia, MOTIVOS } from './moderacao-regras.js';
import { el, mostrarToast } from './ui.js';

// ---------- Dados ----------

// Bloqueados da pessoa logada (lido uma vez por página)
let promessaBloqueados = null;

/** Conjunto de uids bloqueados por quem está logado. */
export function obterBloqueados(uid) {
  if (!uid) return Promise.resolve(new Set());
  promessaBloqueados ??= get(ref(db, `blocks/${uid}`))
    .then((instantaneo) => new Set(Object.keys(instantaneo.val() ?? {})))
    .catch((erro) => {
      console.error('[moderação] bloqueados', erro);
      promessaBloqueados = null;
      return new Set();
    });
  return promessaBloqueados;
}

/** Bloqueia ou desbloqueia alguém. */
export async function definirBloqueio(uid, alvo, bloquear) {
  await update(ref(db), montarBloqueio({ uid, alvo, bloquear }));
  const bloqueados = await obterBloqueados(uid);
  if (bloquear) bloqueados.add(alvo);
  else bloqueados.delete(alvo);
}

/**
 * Envia uma denúncia. Denunciar de novo o mesmo alvo é recusado pelas
 * regras: tratamos como "já recebido".
 * @returns {Promise<'enviada'|'repetida'>}
 */
export async function denunciar(uid, { tipo, alvo, motivo, detalhes }) {
  try {
    await update(ref(db), montarDenuncia({ uid, tipo, alvo, motivo, detalhes, carimbo: serverTimestamp() }));
    return 'enviada';
  } catch (erro) {
    if (/permission[_ ]denied/i.test(`${erro?.code} ${erro?.message}`)) return 'repetida';
    throw erro;
  }
}

/** Some com tudo que a pessoa bloqueada escreveu na página atual. */
function removerConteudoDe(uid) {
  for (const elemento of document.querySelectorAll(`[data-autor="${CSS.escape(uid)}"]`)) {
    (elemento.closest('li') ?? elemento).remove();
  }
}

// ---------- Diálogo ----------

let dialogo = null;

/** Cria (uma vez) o <dialog> reaproveitado por todas as etapas. */
function obterDialogo() {
  if (dialogo) return dialogo;
  dialogo = el('dialog', { classe: 'dialogo dialogo--pequeno', atributos: { 'aria-labelledby': 'titulo-moderacao' } });
  document.body.append(dialogo);
  return dialogo;
}

/** Troca o conteúdo do diálogo por uma etapa (título + corpo). */
function mostrarEtapa(titulo, ...conteudo) {
  const caixa = obterDialogo();
  caixa.replaceChildren(
    el('div', { classe: 'dialogo__form' }, [el('h2', { classe: 'dialogo__titulo', texto: titulo, atributos: { id: 'titulo-moderacao' } }), ...conteudo]),
  );
  if (!caixa.open) caixa.showModal();
  // Foco no primeiro controle da etapa
  caixa.querySelector('button, input, textarea')?.focus();
}

/** Botão simples do diálogo. */
function botao(texto, classe, aoClicar) {
  const b = el('button', { classe: `botao ${classe}`, texto, atributos: { type: 'button' } });
  b.addEventListener('click', aoClicar);
  return b;
}

/** Etapa: formulário de denúncia. */
function etapaDenuncia({ usuario, tipo, alvo }) {
  const nomeAlvo = tipo === 'comment' ? 'comentário' : 'review';
  const opcoes = MOTIVOS.map(({ id, rotulo }, i) =>
    el('label', { classe: 'opcao-radio' }, [
      el('input', { atributos: { type: 'radio', name: 'motivo-denuncia', value: id, checked: i === 0 } }),
      el('span', { texto: rotulo }),
    ]),
  );
  const detalhes = el('textarea', {
    classe: 'campo__texto',
    atributos: { id: 'detalhes-denuncia', rows: 3, maxlength: DETALHES_MAX, placeholder: 'Quer contar mais? (opcional)' },
  });
  const erro = el('p', { classe: 'erro-form', atributos: { role: 'alert' } });

  const enviar = botao('Enviar denúncia', 'botao--perigo', async () => {
    enviar.disabled = true;
    try {
      const motivo = dialogo.querySelector('input[name="motivo-denuncia"]:checked').value;
      const resultado = await denunciar(usuario.uid, { tipo, alvo, motivo, detalhes: detalhes.value });
      dialogo.close();
      mostrarToast(resultado === 'repetida' ? 'Você já tinha denunciado. Obrigado!' : 'Denúncia enviada. Obrigado por avisar.');
    } catch (falha) {
      console.error('[moderação] denunciar', falha);
      erro.textContent = 'Não foi possível enviar agora. Tente de novo.';
      enviar.disabled = false;
    }
  });

  mostrarEtapa(
    `Denunciar ${nomeAlvo}`,
    el('fieldset', { classe: 'grupo-motivos' }, [el('legend', { classe: 'dialogo__texto', texto: 'Qual é o problema?' }), ...opcoes]),
    el('label', { classe: 'visualmente-oculto', texto: 'Detalhes da denúncia', atributos: { for: 'detalhes-denuncia' } }),
    detalhes,
    erro,
    el('div', { classe: 'dialogo__acoes dialogo__acoes--simples' }, [botao('Cancelar', 'botao--secundario', () => dialogo.close()), enviar]),
  );
}

/** Etapa: confirmar bloqueio. */
function etapaBloqueio({ usuario, autor }) {
  const confirmar = botao('Bloquear', 'botao--perigo', async () => {
    confirmar.disabled = true;
    try {
      await definirBloqueio(usuario.uid, autor.uid, true);
      dialogo.close();
      removerConteudoDe(autor.uid);
      mostrarToast(`@${autor.username} foi bloqueado.`);
    } catch (falha) {
      console.error('[moderação] bloquear', falha);
      mostrarToast('Não foi possível bloquear agora.');
      confirmar.disabled = false;
    }
  });

  mostrarEtapa(
    `Bloquear @${autor.username}?`,
    el('p', {
      classe: 'dialogo__texto',
      texto: 'Você deixa de ver as reviews e comentários dessa pessoa, e ela não consegue mais curtir, comentar nem seguir você. Ela não é avisada. Dá para desbloquear no perfil dela.',
    }),
    el('div', { classe: 'dialogo__acoes dialogo__acoes--simples' }, [botao('Cancelar', 'botao--secundario', () => dialogo.close()), confirmar]),
  );
}

/**
 * Abre o menu "⋯" de uma review ou comentário.
 * @param {{usuario: object, autor: {uid: string, username: string}, tipo: 'review'|'comment', reviewId: string, commentId?: string}} p
 */
export function abrirOpcoes({ usuario, autor, tipo, reviewId, commentId }) {
  const alvo = idAlvo(tipo, reviewId, commentId);
  const nomeAlvo = tipo === 'comment' ? 'comentário' : 'review';
  mostrarEtapa(
    'Opções',
    el('div', { classe: 'lista-opcoes' }, [
      botao(`Denunciar ${nomeAlvo}`, 'botao--secundario', () => etapaDenuncia({ usuario, tipo, alvo })),
      autor?.username ? botao(`Bloquear @${autor.username}`, 'botao--perigo', () => etapaBloqueio({ usuario, autor })) : null,
      botao('Cancelar', 'botao--secundario', () => dialogo.close()),
    ]),
  );
}
