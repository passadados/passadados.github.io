// Busca de endereço pelo CEP no serviço público ViaCEP.
// É a ÚNICA chamada externa do app, e envia somente os 8 dígitos do CEP.
import { digits } from './utils.js';

export async function lookupCEP(cep) {
  const d = digits(cep);
  if (d.length !== 8) throw new Error('CEP inválido');
  if (navigator.onLine === false) throw new Error('offline');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`, {
      signal: ctrl.signal, referrerPolicy: 'no-referrer', credentials: 'omit', cache: 'no-store',
    });
    if (!res.ok) throw new Error('falha');
    const j = await res.json();
    if (j && j.erro) return null; // CEP não encontrado
    return {
      logradouro: String(j.logradouro || '').slice(0, 120),
      bairro: String(j.bairro || '').slice(0, 80),
      cidade: String(j.localidade || '').slice(0, 80),
      uf: String(j.uf || '').slice(0, 2),
    };
  } finally {
    clearTimeout(timer);
  }
}
