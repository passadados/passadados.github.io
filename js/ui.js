// Componentes de interface: avisos, diálogos e cópia para a área de transferência.
import { h } from './utils.js';

export function toast(message, { action, duration = 3500 } = {}) {
  const box = document.getElementById('toasts');
  const el = h('div', { class: 'toast', role: 'status' }, h('span', { text: message }));
  if (action) {
    el.append(h('button', {
      type: 'button', class: 'toast-btn', text: action.label,
      onclick: () => { el.remove(); action.onClick(); },
    }));
  }
  box.append(el);
  if (duration > 0) setTimeout(() => el.remove(), duration);
  return el;
}

export function openDialog({ title, body = [], actions = [] }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'dlg';
  dlg.append(h('div', { class: 'dlg-inner' },
    h('h2', { class: 'dlg-title', text: title }),
    h('div', { class: 'dlg-body' }, body),
    actions.length ? h('div', { class: 'dlg-actions' }, actions) : null,
  ));
  document.body.append(dlg);
  let resolveFn;
  const result = new Promise((r) => { resolveFn = r; });
  const close = (value = null) => {
    resolveFn(value);
    try { if (dlg.open) dlg.close(); } catch { /* já fechado */ }
    dlg.remove();
  };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
  dlg.addEventListener('close', () => { resolveFn(null); dlg.remove(); });
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  return { dlg, close, result };
}

export function closeAllDialogs() {
  document.querySelectorAll('dialog').forEach((d) => {
    try { d.close(); } catch { /* ignora */ }
    d.remove();
  });
}

export function confirmDialog({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false }) {
  const d = openDialog({
    title,
    body: [h('p', { text: message })],
    actions: [
      h('button', { type: 'button', class: 'btn ghost', text: cancelLabel, onclick: () => d.close(false) }),
      h('button', { type: 'button', class: `btn ${danger ? 'danger' : 'primary'}`, text: confirmLabel, onclick: () => d.close(true) }),
    ],
  });
  return d.result.then((v) => v === true);
}

export function infoDialog({ title, body, closeLabel = 'Entendi' }) {
  const d = openDialog({
    title,
    body,
    actions: [h('button', { type: 'button', class: 'btn primary', text: closeLabel, onclick: () => d.close(true) })],
  });
  return d.result;
}

// Diálogo com formulário. `submit(values)` pode devolver uma mensagem de erro (string)
// para manter o diálogo aberto; sem erro, o diálogo fecha e a promessa devolve os valores.
export function formDialog({ title, message, notice, fields = [], confirmLabel = 'Salvar', cancelLabel = 'Cancelar', danger = false, submit }) {
  const form = h('form', { novalidate: true });
  const errorEl = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const inputs = {};
  if (message) form.append(h('p', { text: message }));
  if (notice) form.append(h('p', { class: 'warn-box', text: notice }));
  for (const f of fields) {
    const id = `dlg-${f.name}`;
    const input = h('input', {
      id, name: f.name, type: f.type || 'text', autocomplete: f.autocomplete || 'off',
      maxlength: f.maxlength, inputmode: f.inputmode, placeholder: f.placeholder,
      autocapitalize: f.type === 'password' ? 'off' : null,
    });
    if (f.value) input.value = f.value;
    inputs[f.name] = input;
    form.append(h('div', { class: 'field' },
      h('label', { for: id, text: f.label }),
      input,
      f.hint ? h('div', { class: 'hint', text: f.hint }) : null,
    ));
  }
  form.append(errorEl);
  const submitBtn = h('button', { type: 'submit', class: `btn ${danger ? 'danger' : 'primary'}`, text: confirmLabel });
  form.append(h('div', { class: 'dlg-actions' },
    h('button', { type: 'button', class: 'btn ghost', text: cancelLabel, onclick: () => d.close(null) }),
    submitBtn,
  ));
  const d = openDialog({ title, body: [form] });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const values = {};
    for (const k of Object.keys(inputs)) values[k] = inputs[k].value;
    submitBtn.disabled = true;
    try {
      const err = submit ? await submit(values) : undefined;
      if (err) { errorEl.textContent = err; errorEl.hidden = false; submitBtn.disabled = false; return; }
      d.close(values);
    } catch (ex) {
      errorEl.textContent = (ex && ex.message) || 'Algo deu errado. Tente novamente.';
      errorEl.hidden = false;
      submitBtn.disabled = false;
    }
  });
  const first = Object.values(inputs)[0];
  if (first) setTimeout(() => first.focus(), 30);
  return d.result;
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* tenta o método alternativo */ }
  try {
    const ta = h('textarea', { 'aria-hidden': 'true', class: 'sr-copy' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}
