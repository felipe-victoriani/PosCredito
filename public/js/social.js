// =====================================================================
// social.js — pessoas (Fase 2: busca por @; Fase 4: seguir, curtir…)
// =====================================================================

import { obterPerfil } from './auth.js';
import { db, endAt, get, limitToFirst, orderByKey, query, ref, startAt } from './firebase.js';
import { chaveUsername, normalizarUsername } from './perfil-regras.js';

// Prefixo mínimo para buscar pessoas (evita listar todo mundo com "a")
const PREFIXO_MIN = 2;

/**
 * Busca pessoas pelo começo do @ ("mari" acha @marina.cine).
 * Lê só a lista de @ (pública) e depois os perfis encontrados.
 * @returns {Promise<object[]>} perfis públicos
 */
export async function buscarPessoas(termo, limite = 5) {
  const prefixo = chaveUsername(normalizarUsername(termo));
  if (prefixo.length < PREFIXO_MIN) return [];

  // Ordena pelas chaves e pega o intervalo que começa com o prefixo
  const consulta = query(ref(db, 'usernames'), orderByKey(), startAt(prefixo), endAt(`${prefixo}`), limitToFirst(limite));
  const instantaneo = await get(consulta);

  const uids = [];
  instantaneo.forEach((filho) => {
    uids.push(filho.val());
  });

  const perfis = await Promise.all(uids.map(obterPerfil));
  return perfis.filter(Boolean);
}
