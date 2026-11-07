// Biometria do aparelho (digital ou reconhecimento facial) via WebAuthn.
// O site NÃO vê nem guarda imagem do rosto ou da digital: quem valida é o sistema do celular.
// Aqui a biometria serve como trava de tela / atalho de desbloqueio (não gera a chave de criptografia).
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

const b64u = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => {
    let t = s.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
  },
};

export async function isSupported() {
  try {
    return !!(window.isSecureContext && window.PublicKeyCredential
      && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}

export async function register() {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: rand(32),
      rp: { name: 'passadados' },
      user: { id: rand(16), name: 'passadados', displayName: 'passadados' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
      attestation: 'none',
    },
  });
  if (!cred) throw new Error('cancelado');
  return b64u.enc(cred.rawId);
}

export async function authenticate(credId) {
  const a = await navigator.credentials.get({
    publicKey: {
      challenge: rand(32),
      allowCredentials: [{ type: 'public-key', id: b64u.dec(credId), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  if (!a) throw new Error('cancelado');
  return true;
}
