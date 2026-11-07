// Exportar e importar backup em JSON (opcionalmente protegido por senha).
// Nada do arquivo importado é executado: só dados validados e "limpos" entram no app.
import { getData, setData, flush, scheduleCommit, SCHEMA_VERSION, MAX_PROFILES } from './storage.js';
import { deriveKey, encryptText, decryptText, isEnvelope, randomB64, KDF_ITERATIONS } from './crypto.js';
import { ALL } from './fields.js';
import { uid, todayISO } from './utils.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const cap = (v, n) => (typeof v === 'string' ? v.slice(0, n) : typeof v === 'number' ? String(v).slice(0, n) : '');
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const validId = (s) => typeof s === 'string' && /^[a-z0-9]{1,40}$/i.test(s);

function download(filename, content) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function exportBackup({ password } = {}) {
  await flush();
  const data = getData();
  const payload = { app: 'passadados', kind: 'backup', v: 1, exportedAt: new Date().toISOString(), data };
  let content;
  if (password) {
    const salt = randomB64(16);
    const key = await deriveKey(password, salt, KDF_ITERATIONS);
    const env = await encryptText(JSON.stringify(payload), key, { salt, iterations: KDF_ITERATIONS });
    content = JSON.stringify({ app: 'passadados', kind: 'backup', ...env });
  } else {
    content = JSON.stringify(payload, null, 2);
  }
  const name = `passadados-backup-${todayISO()}${password ? '-protegido' : ''}.json`;
  download(name, content);
  data.settings.lastBackupAt = new Date().toISOString();
  scheduleCommit();
  return name;
}

// Valida e limpa os dados vindos de um arquivo. Lança Error com mensagem amigável se algo estiver errado.
export function sanitizeData(raw) {
  if (!isObj(raw)) throw new Error('Estrutura do backup inválida.');
  if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1 || raw.schemaVersion > SCHEMA_VERSION) {
    throw new Error('Este backup foi feito por uma versão que este app não reconhece.');
  }
  if (!Array.isArray(raw.profiles) || !raw.profiles.length || raw.profiles.length > MAX_PROFILES) {
    throw new Error('O backup não tem perfis válidos.');
  }
  const knownKeys = new Set(Object.keys(ALL));
  const profiles = raw.profiles.map((p) => {
    if (!isObj(p)) throw new Error('Perfil inválido no backup.');
    const values = {};
    if (isObj(p.values)) {
      for (const id of knownKeys) {
        if (id === 'idade') continue;
        const v = p.values[id];
        if (typeof v === 'string' && v) values[id] = cap(v, 500);
      }
    }
    const customFields = (Array.isArray(p.customFields) ? p.customFields : []).slice(0, 30)
      .filter(isObj)
      .map((c) => ({ id: validId(c.id) ? c.id : uid(), label: cap(c.label, 80) || 'Campo', value: cap(c.value, 500) }));
    const customIds = new Set(customFields.map((c) => `c:${c.id}`));
    const favoriteSets = (Array.isArray(p.favoriteSets) ? p.favoriteSets : []).slice(0, 12)
      .filter(isObj)
      .map((s) => ({
        id: validId(s.id) ? s.id : uid(),
        name: cap(s.name, 40) || 'Conjunto',
        fieldIds: (Array.isArray(s.fieldIds) ? s.fieldIds : []).filter((k) => typeof k === 'string' && (knownKeys.has(k) || customIds.has(k))).slice(0, 80),
      }));
    return { id: validId(p.id) ? p.id : uid(), name: cap(p.name, 60) || 'Perfil', values, customFields, favoriteSets };
  });
  const s = isObj(raw.settings) ? raw.settings : {};
  const settings = {
    cepLookupEnabled: s.cepLookupEnabled !== false,
    hiddenFields: (Array.isArray(s.hiddenFields) ? s.hiddenFields : []).filter((k) => knownKeys.has(k)),
    lastBackupAt: typeof s.lastBackupAt === 'string' ? s.lastBackupAt.slice(0, 40) : null,
    lastChangeAt: typeof s.lastChangeAt === 'string' ? s.lastChangeAt.slice(0, 40) : null,
  };
  const activeProfileId = profiles.some((p) => p.id === raw.activeProfileId) ? raw.activeProfileId : profiles[0].id;
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt.slice(0, 40) : new Date().toISOString(),
    settings, activeProfileId, profiles,
  };
}

// Lê o arquivo escolhido. Devolve { env } (protegido por senha) ou { data } (já validado).
export async function readBackupFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error('O arquivo é grande demais para ser um backup do passadados.');
  let obj;
  try { obj = JSON.parse(await file.text()); } catch { throw new Error('O arquivo não é um JSON válido.'); }
  if (!isObj(obj) || obj.app !== 'passadados') throw new Error('Este arquivo não parece ser um backup do passadados.');
  if (obj.encrypted === true) {
    if (!isEnvelope(obj)) throw new Error('Arquivo de backup protegido está danificado.');
    return { env: obj };
  }
  return { data: sanitizeData(obj.data) };
}

export async function decryptBackup(env, password) {
  const key = await deriveKey(password, env.salt, env.iterations);
  const obj = JSON.parse(await decryptText(env, key));
  if (!isObj(obj) || obj.app !== 'passadados') throw new Error('conteúdo inesperado');
  return sanitizeData(obj.data);
}

export async function applyReplace(incoming) {
  await setData(incoming);
}

// Junta os perfis do backup aos atuais (os ids são gerados de novo para não colidir).
export async function applyMerge(incoming) {
  const current = JSON.parse(JSON.stringify(getData()));
  let added = 0;
  let skipped = 0;
  for (const p of incoming.profiles) {
    if (current.profiles.length >= MAX_PROFILES) { skipped++; continue; }
    const names = new Set(current.profiles.map((x) => x.name));
    let name = p.name;
    if (names.has(name)) name = `${name} (importado)`.slice(0, 60);
    current.profiles.push({ ...p, id: uid(), name });
    added++;
  }
  current.settings.lastChangeAt = new Date().toISOString();
  await setData(current);
  return { added, skipped };
}
