// Criptografia local com a Web Crypto API: PBKDF2 (SHA-256) para derivar a chave + AES-GCM 256.
// O PIN/senha nunca é gravado. Só ficam salvos: sal, número de iterações, vetor (iv) e texto cifrado.
const enc = new TextEncoder();
const dec = new TextDecoder();

export const KDF_ITERATIONS = 310000;
export const MIN_ITERATIONS = 100000;
export const MAX_ITERATIONS = 1000000;

export function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export const fromB64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
export const randomB64 = (n = 16) => toB64(crypto.getRandomValues(new Uint8Array(n)));

export async function deriveKey(secret, saltB64, iterations = KDF_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(plain, key, kdf) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
  return {
    encrypted: true, v: 1, kdf: 'PBKDF2-SHA256',
    iterations: kdf.iterations, salt: kdf.salt, iv: toB64(iv), data: toB64(ct),
  };
}

export async function decryptText(env, key) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) }, key, fromB64(env.data));
  return dec.decode(pt);
}

export function isEnvelope(o) {
  return !!o && typeof o === 'object' && o.encrypted === true
    && typeof o.salt === 'string' && typeof o.iv === 'string' && typeof o.data === 'string'
    && Number.isInteger(o.iterations) && o.iterations >= MIN_ITERATIONS && o.iterations <= MAX_ITERATIONS;
}
