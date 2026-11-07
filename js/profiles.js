// Operações sobre perfis, campos personalizados e conjuntos favoritos.
import { getData, newProfile, touch, scheduleCommit, MAX_PROFILES } from './storage.js';
import { uid } from './utils.js';

export const MAX_CUSTOM_FIELDS = 30;
export const MAX_SETS = 12;

export function activeProfile() {
  const d = getData();
  return d.profiles.find((p) => p.id === d.activeProfileId) || d.profiles[0];
}

export function setActiveProfile(id) {
  const d = getData();
  if (d.profiles.some((p) => p.id === id)) { d.activeProfileId = id; scheduleCommit(); }
}

export function createProfile(name) {
  const d = getData();
  if (d.profiles.length >= MAX_PROFILES) return null;
  const p = newProfile(String(name).trim().slice(0, 60) || 'Novo perfil');
  d.profiles.push(p);
  d.activeProfileId = p.id;
  touch();
  return p;
}

export function renameProfile(id, name) {
  const p = getData().profiles.find((x) => x.id === id);
  const n = String(name).trim().slice(0, 60);
  if (p && n) { p.name = n; touch(); }
}

// O último perfil não pode ser excluído.
export function deleteProfile(id) {
  const d = getData();
  if (d.profiles.length <= 1) return false;
  d.profiles = d.profiles.filter((p) => p.id !== id);
  if (d.activeProfileId === id) d.activeProfileId = d.profiles[0].id;
  touch();
  return true;
}

export function addCustomField(profile, label, value = '') {
  if (profile.customFields.length >= MAX_CUSTOM_FIELDS) return null;
  const c = { id: uid(), label: String(label).trim().slice(0, 80) || 'Novo campo', value: String(value).slice(0, 500) };
  profile.customFields.push(c);
  touch();
  return c;
}

export function removeCustomField(profile, id) {
  profile.customFields = profile.customFields.filter((c) => c.id !== id);
  profile.favoriteSets.forEach((s) => { s.fieldIds = s.fieldIds.filter((k) => k !== `c:${id}`); });
  touch();
}

export function moveCustomField(profile, id, dir) {
  const i = profile.customFields.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= profile.customFields.length) return;
  [profile.customFields[i], profile.customFields[j]] = [profile.customFields[j], profile.customFields[i]];
  touch();
}

export function saveFavoriteSet(profile, name, keys) {
  if (profile.favoriteSets.length >= MAX_SETS) return false;
  profile.favoriteSets.push({ id: uid(), name: String(name).trim().slice(0, 40) || 'Conjunto', fieldIds: [...keys] });
  touch();
  return true;
}

export function deleteFavoriteSet(profile, id) {
  profile.favoriteSets = profile.favoriteSets.filter((s) => s.id !== id);
  touch();
}
