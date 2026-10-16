// =====================================================================
// perfil-regras.js — regras puras de perfil (sem Firebase, sem DOM)
// ---------------------------------------------------------------------
// As mesmas regras estão repetidas em database.rules.json: aqui é para
// dar resposta rápida na tela; lá é a proteção de verdade.
// =====================================================================

// Limites de tamanho (iguais aos das Security Rules)
export const LIMITES = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 20,
  NOME_MAX: 50,
  BIO_MAX: 160,
};

// @ reservados (não podem ser escolhidos por ninguém)
const RESERVADOS = ['admin', 'poscredito', 'poscreditos', 'suporte', 'moderacao', 'root', 'oficial'];

/**
 * Deixa o @ no formato canônico: sem "@" na frente, minúsculo, sem
 * acento e só com letras, números, ponto e sublinhado.
 */
export function normalizarUsername(texto = '') {
  return texto
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos (á → a)
    .replace(/[^a-z0-9._]/g, '');
}

/**
 * Valida um @ já normalizado.
 * @returns {string|null} mensagem de erro para a tela, ou null se válido
 */
export function validarUsername(username) {
  if (username.length < LIMITES.USERNAME_MIN) return `Use pelo menos ${LIMITES.USERNAME_MIN} caracteres.`;
  if (username.length > LIMITES.USERNAME_MAX) return `Use no máximo ${LIMITES.USERNAME_MAX} caracteres.`;
  if (!/^[a-z0-9._]+$/.test(username)) return 'Use só letras, números, ponto e sublinhado.';
  if (username.startsWith('.') || username.endsWith('.')) return 'O @ não pode começar nem terminar com ponto.';
  if (username.includes('..')) return 'Não use dois pontos seguidos.';
  if (RESERVADOS.includes(username)) return 'Esse @ é reservado. Escolha outro.';
  return null;
}

/**
 * Chave do @ no banco. O Realtime Database não aceita "." em chaves,
 * então "marina.cine" vira "marina,cine" em usernames/.
 */
export function chaveUsername(username) {
  return username.replaceAll('.', ',');
}

/** Iniciais para o avatar sem foto ("Marina Rocha" → "MR"). */
export function iniciais(nome = '') {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes.at(-1)[0] : '';
  return (primeira + ultima).toUpperCase();
}

// Quantas cores de avatar existem (classes .avatar--cor-0 a -5 no CSS)
const TOTAL_CORES_AVATAR = 6;

/** Cor estável por pessoa: o mesmo uid sempre gera o mesmo índice (0–5). */
export function indiceCorAvatar(uid = '') {
  let soma = 0;
  for (const letra of uid) soma = (soma * 31 + letra.charCodeAt(0)) >>> 0;
  return soma % TOTAL_CORES_AVATAR;
}

/** Só aceita foto vinda do Google (o que o login fornece). */
export function fotoSegura(url) {
  return typeof url === 'string' && url.startsWith('https://lh3.googleusercontent.com/') ? url : null;
}

/** Formata contadores como no app ("1,2 mil"). */
export function formatarContador(numero = 0) {
  if (numero < 1000) return String(numero);
  if (numero < 1_000_000) {
    const mil = Math.floor(numero / 100) / 10; // 1250 → 1,2 (sem arredondar para cima)
    return `${mil.toLocaleString('pt-BR')} mil`;
  }
  const mi = Math.floor(numero / 100_000) / 10;
  return `${mi.toLocaleString('pt-BR')} mi`;
}
