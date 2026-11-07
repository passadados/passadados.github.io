// passadados — inicialização, navegação, tema e bloqueio automático.
import { $, $$, h } from './utils.js';
import * as store from './storage.js';
import { initForm } from './form.js';
import { initShare, closePresentation, isPresenting } from './share.js';
import { initSettings } from './settings.js';
import { showLock } from './lock.js';
import { registerSW, requestPersist, openInstallDialog } from './pwa.js';
import { toast, closeAllDialogs } from './ui.js';
import * as P from './profiles.js';

const appRoot = $('#app');
const views = {};
let current = 'intro';
let locked = false;
let saveErrorShown = false;

const ctx = { showScreen, renderProfileSelect, applyTheme, openIntro, lockApp };

// ---------- Tema ----------
function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  const tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.setAttribute('content', t === 'dark' ? '#0c1424' : '#0f5fb8');
  const meta = store.getMeta();
  if (meta.theme !== t) { meta.theme = t; store.saveMeta(); }
  const btn = $('#themeBtn');
  btn.textContent = t === 'dark' ? '☀️' : '🌙';
  btn.setAttribute('aria-label', t === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro');
}

// ---------- Perfis no topo ----------
function renderProfileSelect() {
  const data = store.getData();
  const sel = $('#profileSelect');
  if (!data) { sel.replaceChildren(); return; }
  sel.replaceChildren(...data.profiles.map((p) => h('option', { value: p.id, text: p.name })));
  sel.value = data.activeProfileId;
}

// ---------- Navegação ----------
function showScreen(name) {
  current = name;
  for (const s of $$('.screen')) s.hidden = s.id !== `screen-${name}`;
  const welcomed = store.getMeta().welcomed;
  $('#bottomnav').hidden = !welcomed;
  for (const b of $$('#bottomnav button')) {
    if (b.dataset.screen === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  $('#profilePick').hidden = !(name === 'data' || name === 'share');
  if (store.getData()) {
    renderProfileSelect();
    if (views[name]) views[name].render();
  }
  window.scrollTo(0, 0);
  $('#main').focus({ preventScroll: true });
}

// Mostra a introdução (primeira visita) ou a página de privacidade (aberta pelas configurações).
function openIntro(first) {
  const box = $('#introActions');
  if (first) {
    box.replaceChildren(
      h('button', { type: 'button', class: 'btn primary block', id: 'btn-start', text: 'Começar a usar', onclick: async () => {
        const meta = store.getMeta();
        meta.welcomed = true;
        store.saveMeta();
        requestPersist();
        showScreen('data');
      } }),
      h('button', { type: 'button', class: 'btn secondary block', text: 'Instalar aplicativo', onclick: openInstallDialog }),
    );
  } else {
    box.replaceChildren(h('button', { type: 'button', class: 'btn primary block', text: 'Voltar para as configurações', onclick: () => showScreen('settings') }));
  }
  showScreen('intro');
}

// ---------- Bloqueio automático ----------
async function lockApp() {
  if (!store.hasLock() || locked) return;
  locked = true;
  closePresentation();
  closeAllDialogs();
  $('#toasts').replaceChildren();
  await store.lockSession();
  appRoot.inert = true;
  await showLock();
  appRoot.inert = false;
  locked = false;
  lastActive = Date.now();
  renderProfileSelect();
  showScreen(store.getMeta().welcomed ? current === 'intro' ? 'data' : current : 'intro');
}

let lastActive = Date.now();
let hiddenAt = null;
const idleMs = () => store.getMeta().lock.idleMinutes * 60000;

function setupAutoLock() {
  const bump = () => { lastActive = Date.now(); };
  ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach((ev) => document.addEventListener(ev, bump, { passive: true, capture: true }));
  setInterval(() => {
    if (!store.hasLock() || locked || isPresenting()) return;
    if (Date.now() - lastActive > idleMs()) lockApp();
  }, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
    } else {
      if (store.hasLock() && !locked && hiddenAt && Date.now() - hiddenAt > idleMs()) lockApp();
      hiddenAt = null;
      lastActive = Date.now();
    }
  });
}

// ---------- Início ----------
async function init() {
  applyTheme(store.getMeta().theme);
  store.setSaveErrorHandler(() => {
    if (saveErrorShown) return;
    saveErrorShown = true;
    toast('Não foi possível salvar neste navegador (armazenamento bloqueado ou cheio). Exporte um backup assim que possível.', { duration: 8000 });
  });

  $('#themeBtn').addEventListener('click', () => applyTheme(store.getMeta().theme === 'dark' ? 'light' : 'dark'));
  for (const b of $$('#bottomnav button')) b.addEventListener('click', () => showScreen(b.dataset.screen));
  $('#profileSelect').addEventListener('change', (e) => {
    P.setActiveProfile(e.target.value);
    if (views[current]) views[current].render();
  });

  views.data = initForm($('#screen-data'), ctx);
  views.share = initShare($('#screen-share'), ctx);
  views.settings = initSettings($('#screen-settings'), ctx);

  registerSW();

  if (store.needsUnlock()) {
    locked = true;
    appRoot.inert = true;
    await showLock();
    appRoot.inert = false;
    locked = false;
  } else {
    const { corrupt } = store.loadPlainData();
    if (corrupt) toast('Seus dados salvos estavam danificados e foi criada uma nova base. Uma cópia foi mantida no navegador.', { duration: 7000 });
    store.scheduleCommit();
  }

  setupAutoLock();
  if (store.getMeta().welcomed) showScreen('data'); else openIntro(true);
}

init();
