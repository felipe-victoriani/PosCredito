// =====================================================================
// auth.js — login com Google, sessão e dados do perfil
// ---------------------------------------------------------------------
// Perfil público em users/{uid}; o @ fica reservado em usernames/{chave}.
// Os dois são gravados juntos (update multi-path) para nunca existir
// um sem o outro.
// =====================================================================

import {
  auth,
  db,
  get,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  ref,
  serverTimestamp,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  update,
} from './firebase.js';
import { chaveUsername, fotoSegura } from './perfil-regras.js';

// Erros do popup que pedem o plano B (redirecionamento)
const ERROS_USAR_REDIRECT = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'];
// Erros em que a pessoa só desistiu (não é falha)
const ERROS_CANCELADO = ['auth/popup-closed-by-user', 'auth/user-cancelled'];

// Se o login voltou de um redirecionamento, conclui aqui (silencioso)
getRedirectResult(auth).catch((erro) => console.error('[auth] retorno do redirect', erro?.code));

// ---------- Sessão ----------

/** Espera o Firebase restaurar a sessão e devolve o usuário (ou null). */
export async function usuarioAtual() {
  await auth.authStateReady();
  return auth.currentUser;
}

/** Avisa sempre que a pessoa entra ou sai. Devolve função para parar. */
export function aoMudarUsuario(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Abre o login do Google. Popup primeiro; se o navegador bloquear
 * (ou for WebView), cai para redirecionamento.
 * @returns {Promise<import('firebase/auth').User|null>} null se a pessoa cancelou
 */
export async function entrarComGoogle() {
  const provedor = new GoogleAuthProvider();
  provedor.setCustomParameters({ prompt: 'select_account' });
  try {
    const { user } = await signInWithPopup(auth, provedor);
    return user;
  } catch (erro) {
    if (ERROS_CANCELADO.includes(erro?.code)) return null;
    if (ERROS_USAR_REDIRECT.includes(erro?.code)) {
      await signInWithRedirect(auth, provedor); // a página recarrega
      return null;
    }
    throw erro;
  }
}

/** Sai da conta. */
export function sair() {
  return signOut(auth);
}

/**
 * Para onde mandar a pessoa logo após entrar: sem perfil ainda,
 * vai para o onboarding; com perfil, segue para o destino pedido.
 */
export async function destinoAposLogin(uid, destinoPadrao = 'perfil.html') {
  const perfil = await obterPerfil(uid);
  return perfil ? destinoPadrao : 'onboarding.html';
}

// ---------- Leitura de perfis ----------

/** Perfil público por uid (ou null). */
export async function obterPerfil(uid) {
  const instantaneo = await get(ref(db, `users/${uid}`));
  return instantaneo.exists() ? { uid, ...instantaneo.val() } : null;
}

/** Descobre o uid dono de um @ (ou null). */
export async function obterUidPorUsername(username) {
  const instantaneo = await get(ref(db, `usernames/${chaveUsername(username)}`));
  return instantaneo.exists() ? instantaneo.val() : null;
}

/** Perfil público por @ (ou null). */
export async function obterPerfilPorUsername(username) {
  const uid = await obterUidPorUsername(username);
  return uid ? obterPerfil(uid) : null;
}

/** true se o @ ainda está livre. */
export async function usernameDisponivel(username) {
  return (await obterUidPorUsername(username)) === null;
}

// ---------- Escrita de perfis ----------

/**
 * Cria o perfil e reserva o @ numa única escrita atômica.
 * Se outra pessoa reservar o mesmo @ no meio do caminho, as regras
 * recusam tudo (PERMISSION_DENIED) e nada fica gravado pela metade.
 */
export async function criarPerfil(usuario, { username, displayName, bio, interests }) {
  const perfil = {
    username,
    displayName,
    bio,
    interests,
    createdAt: serverTimestamp(),
    stats: { followers: 0, following: 0, reviews: 0, watched: 0 },
  };
  // Foto só se vier do Google (o banco aceita só https)
  const foto = fotoSegura(usuario.photoURL);
  if (foto) perfil.photoURL = foto;

  await update(ref(db), {
    [`users/${usuario.uid}`]: perfil,
    [`usernames/${chaveUsername(username)}`]: usuario.uid,
  });
}

/** Atualiza só os campos editáveis (o @ não muda depois de criado). */
export function atualizarPerfil(uid, { displayName, bio, interests }) {
  return update(ref(db, `users/${uid}`), { displayName, bio, interests });
}

/** true quando o erro do Firebase foi recusa das Security Rules. */
export function ehPermissaoNegada(erro) {
  return erro?.code === 'PERMISSION_DENIED' || /permission[_ ]denied/i.test(erro?.message ?? '');
}
