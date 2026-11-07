// Tela "Compartilhar" (seleção dos campos) e tela de apresentação (letra grande, copiar por campo).
import { h } from './utils.js';
import { shareItems, QUICK_SETS } from './fields.js';
import * as store from './storage.js';
import * as P from './profiles.js';
import { formDialog, confirmDialog, copyText, toast } from './ui.js';

let presenting = false;
let wakeLock = null;
let lastOpener = null;

export const isPresenting = () => presenting;

async function requestWake() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* não disponível: sem problema */ }
}
function releaseWake() { try { if (wakeLock) wakeLock.release(); } catch { /* ignora */ } wakeLock = null; }
document.addEventListener('visibilitychange', () => { if (presenting && !document.hidden) requestWake(); });

export function closePresentation() {
  const el = document.getElementById('present');
  if (!presenting && el.hidden) return;
  presenting = false;
  releaseWake();
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  el.hidden = true;
  el.replaceChildren();
  if (lastOpener && document.contains(lastOpener)) lastOpener.focus();
}

function openPresentation(profileName, items, opener) {
  const el = document.getElementById('present');
  lastOpener = opener || null;
  presenting = true;
  const canFull = !!document.documentElement.requestFullscreen;
  const copyAll = async () => {
    const ok = await copyText(items.map((i) => `${i.label}: ${i.value}`).join('\n'));
    toast(ok ? 'Tudo copiado.' : 'Não foi possível copiar neste navegador.');
  };
  el.replaceChildren(h('div', { class: 'present-inner' },
    h('div', { class: 'present-head' },
      h('h2', { text: `Dados de ${profileName}` }),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn secondary small', text: 'Copiar tudo', onclick: copyAll }),
        canFull ? h('button', { type: 'button', class: 'btn secondary small', text: 'Tela cheia', onclick: () => { if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen().catch(() => {}); } }) : null,
        h('button', { type: 'button', class: 'btn primary small', id: 'presentClose', text: 'Fechar', onclick: closePresentation }),
      ),
    ),
    h('div', { role: 'list' }, items.map((i) => h('div', { class: 'pitem', role: 'listitem' },
      h('div', { class: 'pl', text: i.label }),
      h('div', { class: i.value.length > 22 ? 'pv long' : 'pv', text: i.value }),
      h('button', {
        type: 'button', class: 'btn secondary', text: 'Copiar', 'aria-label': `Copiar ${i.label}`,
        onclick: async () => toast((await copyText(i.value)) ? `${i.label} copiado.` : 'Não foi possível copiar.', { duration: 1800 }),
      }),
    ))),
  ));
  el.hidden = false;
  el.scrollTop = 0;
  requestWake();
  const close = document.getElementById('presentClose');
  if (close) close.focus();
}

export function initShare(root, ctx) {
  const selections = new Map(); // id do perfil -> Set de chaves marcadas

  function render() {
    const data = store.getData();
    const profile = P.activeProfile();
    const items = shareItems(profile, data.settings.hiddenFields);
    const valid = new Set(items.map((i) => i.key));
    let sel = selections.get(profile.id);
    if (!sel) { sel = new Set(); selections.set(profile.id, sel); }
    for (const k of [...sel]) if (!valid.has(k)) sel.delete(k);

    if (!items.length) {
      root.replaceChildren(
        h('h1', { class: 'screen-title', text: 'Compartilhar' }),
        h('div', { class: 'card' },
          h('p', { text: `O perfil “${profile.name}” ainda não tem dados preenchidos.` }),
          h('button', { type: 'button', class: 'btn primary', text: 'Preencher meus dados', onclick: () => ctx.showScreen('data') }),
        ),
      );
      return;
    }

    const showBtn = h('button', { type: 'button', class: 'btn primary block', id: 'showBtn' });
    const saveBtn = h('button', { type: 'button', class: 'btn secondary small', text: 'Salvar seleção como conjunto' });
    const checks = new Map();

    const refresh = () => {
      showBtn.textContent = sel.size ? `Mostrar (${sel.size} ${sel.size === 1 ? 'item' : 'itens'})` : 'Marque o que quer mostrar';
      showBtn.disabled = sel.size === 0;
      saveBtn.disabled = sel.size === 0;
      for (const [k, cb] of checks) cb.checked = sel.has(k);
    };
    const apply = (keys) => { sel.clear(); keys.forEach((k) => { if (valid.has(k)) sel.add(k); }); refresh(); };

    const quick = h('div', { class: 'chips' }, QUICK_SETS.map((q) => h('button', {
      type: 'button', class: 'chip', text: q.label,
      onclick: () => {
        const keys = q.keys.filter((k) => valid.has(k));
        if (!keys.length) { toast('Você ainda não preencheu os campos deste atalho.'); return; }
        apply(keys);
      },
    })));
    const favs = h('div', { class: 'chips' }, profile.favoriteSets.map((s) => h('span', { class: 'chip fav' },
      h('button', { type: 'button', class: 'link-btn', text: s.name, onclick: () => apply(s.fieldIds) }),
      h('button', {
        type: 'button', class: 'chip-x link-btn', text: '✕', 'aria-label': `Excluir o conjunto ${s.name}`,
        onclick: async () => {
          if (await confirmDialog({ title: 'Excluir conjunto?', message: `O conjunto “${s.name}” será removido.`, confirmLabel: 'Excluir', danger: true })) {
            P.deleteFavoriteSet(profile, s.id); render();
          }
        },
      }),
    )));

    saveBtn.addEventListener('click', async () => {
      const r = await formDialog({
        title: 'Salvar conjunto',
        message: 'Guarde esta seleção para reutilizar depois, como “Dentista” ou “Hospital”.',
        fields: [{ name: 'nome', label: 'Nome do conjunto', placeholder: 'Ex.: Dentista', maxlength: 40 }],
        confirmLabel: 'Salvar',
        submit: (v) => {
          if (!v.nome.trim()) return 'Digite um nome para o conjunto.';
          if (profile.favoriteSets.length >= P.MAX_SETS) return `O limite é de ${P.MAX_SETS} conjuntos.`;
          return undefined;
        },
      });
      if (r) { P.saveFavoriteSet(profile, r.nome, sel); render(); toast('Conjunto salvo.'); }
    });

    const list = h('div', null, items.map((i) => {
      const cb = h('input', { type: 'checkbox' });
      checks.set(i.key, cb);
      cb.addEventListener('change', () => { if (cb.checked) sel.add(i.key); else sel.delete(i.key); refresh(); });
      return h('label', { class: 'pick' }, cb,
        h('span', { class: 'pick-text' }, h('span', { class: 'pick-label', text: i.label }), h('span', { class: 'pick-value', text: i.value })));
    }));

    showBtn.addEventListener('click', () => {
      const chosen = items.filter((i) => sel.has(i.key));
      if (chosen.length) openPresentation(profile.name, chosen, showBtn);
    });

    root.replaceChildren(
      h('h1', { class: 'screen-title', text: 'Compartilhar' }),
      h('p', { class: 'hint', text: 'Marque o que a recepção pediu e toque em “Mostrar”. Assim você não precisa falar seus dados em voz alta.' }),
      h('section', { class: 'card' },
        h('h2', { text: 'Seleção rápida' }),
        quick,
        profile.favoriteSets.length ? h('div', null, h('p', { class: 'hint', text: 'Seus conjuntos:' }), favs) : null,
      ),
      h('section', { class: 'card' },
        h('div', { class: 'row between' },
          h('h2', { text: `Dados de ${profile.name}` }),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn ghost small', text: 'Marcar tudo', onclick: () => apply(items.map((i) => i.key)) }),
            h('button', { type: 'button', class: 'btn ghost small', text: 'Desmarcar', onclick: () => apply([]) }),
          ),
        ),
        list,
        h('div', { class: 'row' }, saveBtn),
      ),
      h('div', { class: 'sticky-action' }, showBtn),
    );
    refresh();
  }

  return { render };
}
