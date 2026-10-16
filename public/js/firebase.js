// =====================================================================
// firebase.js — inicializa o Firebase (SDK modular via CDN) e reexporta
// as funções usadas pelo app. A versão do SDK fica SÓ aqui: para
// atualizar, troque as três URLs abaixo.
// =====================================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

// Instâncias únicas compartilhadas por todos os módulos
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

// Tela de login do Google em português
auth.languageCode = 'pt-BR';

// Funções de autenticação usadas pelo app
export {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';

// Funções do Realtime Database usadas pelo app
export {
  endAt,
  get,
  limitToFirst,
  limitToLast,
  orderByChild,
  orderByKey,
  orderByValue,
  query,
  ref,
  runTransaction,
  serverTimestamp,
  startAt,
  update,
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js';
