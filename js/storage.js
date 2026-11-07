// Armazenamento local (localStorage) com versão de esquema, bloqueio por PIN e criptografia opcional.
//
// Duas chaves:
//  - passadados:v1:meta  -> preferências do aparelho (tema, bloqueio, tentativas). Fica em texto simples,
//                           porque é preciso lê-la antes de desbloquear. NÃO contém dados pessoais.
//  - passadados:v1:data  -> perfis e campos. Em texto simples, ou cifrado quando há PIN/senha.
import { deriveKey, encryptText, decryptText, isEnvelope, randomB64, KDF_ITERATIONS } from './crypto.js';
import { uid } from './utils.js';

export const SCHEMA_VERSION = 1;
export const MAX_PROFILES = 20;
const PREFIX = 'passadados:';
const META_KEY = 'passadados:v1:meta';
const DATA_KEY = 'passadados:v1:data';

let meta = null;
const session = { data: null, key: null, kdf: null };
let saveTimer = null;
let chain = Promise.resolve();
let onSaveError = () => {};
export let storageWorks = true;

export const setSaveErrorHandler = (fn) => { onSaveError = fn; };

function lsGet(k) { try { return localStorage.getItem(k); } catch { storageWorks = false; return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { storageWorks = false; return false; } }

// ---------- Preferências do aparelho (meta) ----------
const defaultMeta = () => ({
  theme: 'light',
  welcomed: false,
  lock: { pin: false, bio: false, credId: null, idleMinutes: 2 },
  attempts: 0,
  lockedUntil: 0,
});

export function getMeta() {
  if (!meta) {
    meta = defaultMeta();
    const raw = lsGet(META_KEY);
    if (raw) {
      try {
        const p = JSON.parse(raw);
        meta = { ...meta, ...p, lock: { ...meta.lock, ...(p.lock || {}) } };
      } catch { /* meta corrompida: usa o padrão */ }
    }
  }
  return meta;
}
export function saveMeta() { lsSet(META_KEY, JSON.stringify(getMeta())); }

// ---------- Dados ----------
export function newProfile(name, id = uid()) {
  return { id, name, values: {}, customFields: [], favoriteSets: [] };
}

export function defaultData() {
  const id = uid();
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    settings: { cepLookupEnabled: true, hiddenFields: [], lastBackupAt: null, lastChangeAt: null },
    activeProfileId: id,
    profiles: [newProfile('Meu perfil', id)],
  };
}

export function normalizeData(d) {
  const def = defaultData();
  if (!d || typeof d !== 'object' || !Array.isArray(d.profiles) || !d.profiles.length) return def;
  d.settings = { ...def.settings, ...(d.settings && typeof d.settings === 'object' ? d.settings : {}) };
  if (!Array.isArray(d.settings.hiddenFields)) d.settings.hiddenFields = [];
  for (const p of d.profiles) {
    if (!p.id) p.id = uid();
    if (typeof p.name !== 'string' || !p.name) p.name = 'Perfil';
    if (!p.values || typeof p.values !== 'object') p.values = {};
    if (!Array.isArray(p.customFields)) p.customFields = [];
    if (!Array.isArray(p.favoriteSets)) p.favoriteSets = [];
  }
  if (!d.profiles.some((p) => p.id === d.activeProfileId)) d.activeProfileId = d.profiles[0].id;
  d.schemaVersion = SCHEMA_VERSION;
  return d;
}

export const getData = () => session.data;
export function setData(d) { session.data = normalizeData(d); return commit(); }

export function hasLock() { const l = getMeta().lock; return !!(l.pin || l.bio); }

// Devolve true se o app precisa pedir PIN/biometria antes de mostrar qualquer dado.
export function needsUnlock() {
  const m = getMeta();
  if (m.lock.pin || m.lock.bio) return true;
  const raw = lsGet(DATA_KEY);
  if (raw) {
    try {
      if (isEnvelope(JSON.parse(raw))) { m.lock.pin = true; saveMeta(); return true; }
    } catch { /* tratado em loadPlainData */ }
  }
  return false;
}

export function loadPlainData() {
  const raw = lsGet(DATA_KEY);
  let corrupt = false;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (isEnvelope(parsed)) throw new Error('cifrado');
      session.data = normalizeData(parsed);
    } catch {
      corrupt = true;
      lsSet(`${DATA_KEY}:corrompido`, raw); // guarda uma cópia antes de recomeçar
      session.data = defaultData();
    }
  } else {
    session.data = defaultData();
  }
  return { corrupt };
}

// ---------- Salvamento ----------
export function scheduleCommit() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { commit(); }, 300);
}

export function commit() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!session.data) return chain;
  const snapshot = JSON.stringify(session.data);
  const { key, kdf } = session;
  chain = chain.then(async () => {
    const out = key ? JSON.stringify(await encryptText(snapshot, key, kdf)) : snapshot;
    if (!lsSet(DATA_KEY, out)) throw new Error('falha ao salvar');
  }).catch(() => { onSaveError(); });
  return chain;
}

export async function flush() {
  if (saveTimer) commit();
  await chain;
}

// Marca que houve alteração nos dados (usado no lembrete de backup) e agenda o salvamento.
export function touch() {
  if (!session.data) return;
  session.data.settings.lastChangeAt = new Date().toISOString();
  scheduleCommit();
}

// ---------- Bloqueio, PIN e biometria ----------
export const lockRemainingMs = () => Math.max(0, getMeta().lockedUntil - Date.now());

function readEnvelope() {
  const raw = lsGet(DATA_KEY);
  try {
    const env = JSON.parse(raw);
    return isEnvelope(env) ? env : null;
  } catch { return null; }
}

export async function unlockWithPin(pin) {
  const wait = lockRemainingMs();
  if (wait > 0) return { ok: false, wait };
  const env = readEnvelope();
  if (!env) return { ok: false, error: 'Não foi possível ler os dados salvos.' };
  try {
    const key = await deriveKey(pin, env.salt, env.iterations);
    const text = await decryptText(env, key);
    session.key = key;
    session.kdf = { salt: env.salt, iterations: env.iterations };
    session.data = normalizeData(JSON.parse(text));
    const m = getMeta();
    m.attempts = 0; m.lockedUntil = 0; saveMeta();
    return { ok: true };
  } catch {
    const m = getMeta();
    m.attempts += 1;
    if (m.attempts >= 5) {
      const steps = [30, 60, 300];
      m.lockedUntil = Date.now() + steps[Math.min(m.attempts - 5, steps.length - 1)] * 1000;
    }
    saveMeta();
    return { ok: false, wait: lockRemainingMs() };
  }
}

// Biometria só atalha o desbloqueio quando a chave ainda está na memória (app não foi fechado)
// ou quando não há PIN (a biometria funciona só como trava de tela).
export function canQuickUnlock() {
  const l = getMeta().lock;
  return !!l.bio && (l.pin ? !!session.key : true);
}

export async function unlockQuick() {
  const l = getMeta().lock;
  if (!l.pin) return { ok: true, ...loadPlainData() };
  if (!session.key) return { ok: false };
  const env = readEnvelope();
  if (!env) return { ok: false };
  try {
    session.data = normalizeData(JSON.parse(await decryptText(env, session.key)));
    return { ok: true };
  } catch { return { ok: false }; }
}

// Bloqueia: grava o que estiver pendente e tira os dados da memória.
export async function lockSession() {
  await flush();
  session.data = null;
}

export async function verifyPin(pin) {
  const env = readEnvelope();
  if (!env) return false;
  try {
    const key = await deriveKey(pin, env.salt, env.iterations);
    await decryptText(env, key);
    return true;
  } catch { return false; }
}

async function applyNewPin(pin) {
  const salt = randomB64(16);
  session.key = await deriveKey(pin, salt, KDF_ITERATIONS);
  session.kdf = { salt, iterations: KDF_ITERATIONS };
  const m = getMeta();
  m.lock.pin = true; m.attempts = 0; m.lockedUntil = 0;
  saveMeta();
  await commit();
}

export const enablePin = (pin) => applyNewPin(pin);

export async function changePin(oldPin, newPin) {
  if (!(await verifyPin(oldPin))) return false;
  await applyNewPin(newPin);
  return true;
}

export async function disablePin(pin) {
  if (!(await verifyPin(pin))) return false;
  session.key = null;
  session.kdf = null;
  const m = getMeta();
  m.lock.pin = false; saveMeta();
  await commit(); // regrava em texto simples
  return true;
}

export function setBio(credId) {
  const m = getMeta();
  m.lock.bio = !!credId;
  m.lock.credId = credId || null;
  saveMeta();
}

export function setIdleMinutes(n) {
  const m = getMeta();
  m.lock.idleMinutes = n;
  saveMeta();
}

// Apaga tudo o que o passadados guardou neste aparelho.
export function wipeAll() {
  clearTimeout(saveTimer);
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* sem acesso ao armazenamento */ }
  session.data = null; session.key = null; session.kdf = null;
  meta = null;
  chain = Promise.resolve();
}
