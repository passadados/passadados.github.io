// Tela "Meus dados": perfis, campos padrão, campos personalizados e busca de CEP.
import { h, isValidCPF, calcAge, todayISO, digits } from './utils.js';
import { GROUPS } from './fields.js';
import * as store from './storage.js';
import * as P from './profiles.js';
import { lookupCEP } from './cep.js';
import { formDialog, confirmDialog, toast } from './ui.js';

const openGroups = new Set(['pessoais', 'contato', 'documentos']);
let bannerDismissed = false;

export function initForm(root, ctx) {
  function render() {
    const data = store.getData();
    const profile = P.activeProfile();
    const hidden = data.settings.hiddenFields;
    root.replaceChildren(...[
      h('h1', { class: 'screen-title', text: 'Meus dados' }),
      backupBanner(data),
      profileCard(profile, data),
      ...GROUPS.map((g) => group(g, profile, hidden, data)),
      customSection(profile),
      h('p', { class: 'footnote', text: 'Tudo é salvo automaticamente, somente neste aparelho.' }),
    ].filter(Boolean));
  }

  // ----- lembrete de backup -----
  function backupBanner(data) {
    const s = data.settings;
    if (bannerDismissed || !s.lastChangeAt) return null;
    const changed = Date.parse(s.lastChangeAt);
    const last = s.lastBackupAt ? Date.parse(s.lastBackupAt) : null;
    if (last && changed <= last) return null;
    const days = (Date.now() - (last ?? Date.parse(data.createdAt))) / 86400000;
    if (days < (last ? 30 : 7)) return null;
    return h('div', { class: 'banner' },
      h('p', { text: last ? 'Você alterou seus dados desde o último backup. Que tal exportar uma cópia?' : 'Você ainda não fez backup. Se limpar o navegador ou trocar de celular, os dados se perdem.' }),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn primary small', text: 'Fazer backup', onclick: () => ctx.showScreen('settings') }),
        h('button', { type: 'button', class: 'btn ghost small', text: 'Agora não', onclick: () => { bannerDismissed = true; render(); } }),
      ),
    );
  }

  // ----- perfis -----
  function profileCard(profile, data) {
    return h('section', { class: 'card' },
      h('h2', { text: 'Perfil' }),
      h('p', { class: 'hint', text: `Você está editando: ${profile.name}. Use o seletor no topo para trocar de perfil.` }),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn secondary small', text: 'Renomear', onclick: () => renameProfile(profile) }),
        h('button', { type: 'button', class: 'btn secondary small', text: 'Novo perfil', onclick: newProfile }),
        h('button', {
          type: 'button', class: 'btn danger-outline small', text: 'Excluir',
          disabled: data.profiles.length <= 1, onclick: () => deleteProfile(profile),
        }),
      ),
    );
  }

  async function renameProfile(profile) {
    const r = await formDialog({
      title: 'Renomear perfil',
      fields: [{ name: 'nome', label: 'Nome do perfil', value: profile.name, maxlength: 60 }],
      confirmLabel: 'Salvar',
      submit: (v) => (v.nome.trim() ? undefined : 'Digite um nome para o perfil.'),
    });
    if (r) { P.renameProfile(profile.id, r.nome); ctx.renderProfileSelect(); render(); }
  }

  async function newProfile() {
    const r = await formDialog({
      title: 'Novo perfil',
      message: 'Use perfis para guardar os dados de outras pessoas, como filhos, cônjuge ou pais.',
      fields: [{ name: 'nome', label: 'Nome do perfil', placeholder: 'Ex.: Maria', maxlength: 60 }],
      confirmLabel: 'Criar perfil',
      submit: (v) => {
        if (!v.nome.trim()) return 'Digite um nome para o perfil.';
        if (store.getData().profiles.length >= store.MAX_PROFILES) return `O limite é de ${store.MAX_PROFILES} perfis.`;
        return undefined;
      },
    });
    if (r) { P.createProfile(r.nome); ctx.renderProfileSelect(); render(); toast('Perfil criado.'); }
  }

  async function deleteProfile(profile) {
    const ok = await confirmDialog({
      title: 'Excluir perfil?',
      message: `Os dados do perfil “${profile.name}” serão apagados deste aparelho. Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir', danger: true,
    });
    if (ok && P.deleteProfile(profile.id)) { ctx.renderProfileSelect(); render(); toast('Perfil excluído.'); }
  }

  // ----- grupos de campos -----
  function group(g, profile, hidden, data) {
    const visible = g.fields.filter((f) => !hidden.includes(f.id));
    if (!visible.length) return null;
    const details = h('details', { class: 'card group', open: openGroups.has(g.id) },
      h('summary', { text: g.label }),
    );
    details.addEventListener('toggle', () => { if (details.open) openGroups.add(g.id); else openGroups.delete(g.id); });
    const body = h('div', { class: 'group-body' });
    const inputs = {};
    let ageBox = null;
    const updateAge = () => {
      if (!ageBox) return;
      const a = calcAge(profile.values.nascimento);
      ageBox.hidden = a == null;
      if (a != null) ageBox.querySelector('.age-value').textContent = `${a} ${a === 1 ? 'ano' : 'anos'}`;
    };

    for (const f of visible) {
      if (f.computed) {
        ageBox = h('div', { class: 'field' },
          h('span', { class: 'label', text: f.label }),
          h('div', { class: 'ok-box' }, h('strong', { class: 'age-value' }), ' (calculada automaticamente)'),
        );
        body.append(ageBox);
        continue;
      }
      const id = `f-${f.id}`;
      let input;
      let cepAfter = null;
      if (f.type === 'select') {
        input = h('select', { id }, h('option', { value: '', text: '—' }), f.options.map((o) => h('option', { value: o, text: o })));
      } else if (f.type === 'textarea') {
        input = h('textarea', { id, maxlength: f.maxlength, autocomplete: 'off' });
      } else {
        input = h('input', {
          id, type: f.type || f.inputType || 'text', inputmode: f.inputmode, autocomplete: 'off',
          maxlength: f.maxlength, placeholder: f.placeholder,
          max: f.maxToday ? todayISO() : null,
        });
      }
      input.value = profile.values[f.id] || '';
      inputs[f.id] = input;
      const wrap = h('div', { class: 'field' }, h('label', { for: id, text: f.label }));

      if (f.id === 'cep') {
        const status = h('div', { class: 'status', 'aria-live': 'polite' });
        const btn = h('button', { type: 'button', class: 'btn secondary small', text: 'Buscar endereço', onclick: () => doCep(profile, inputs, status, true) });
        wrap.append(h('div', { class: 'field-inline' }, input, btn), status,
          h('div', { class: 'hint', text: 'Ao digitar o CEP, só o CEP é enviado ao serviço ViaCEP para preencher o endereço. Você pode editar tudo depois.' }));
        // Registrado depois do ouvinte geral (abaixo), para o valor já estar gravado no perfil quando a busca rodar.
        cepAfter = () => { if (digits(input.value).length === 8) doCep(profile, inputs, status, false); else status.textContent = ''; };
      } else {
        wrap.append(input);
      }
      let cpfHint = null;
      if (f.validate === 'cpf') {
        cpfHint = h('div', { class: 'status warn-text', 'aria-live': 'polite' });
        wrap.append(cpfHint);
      }
      const checkCpf = () => {
        if (!cpfHint) return;
        const bad = digits(input.value).length === 11 && !isValidCPF(input.value);
        cpfHint.textContent = bad ? 'Este CPF parece inválido. Confira os números (você ainda pode salvar assim).' : '';
      };
      input.addEventListener('input', () => {
        let v = input.value;
        if (f.mask) { v = f.mask(v); if (v !== input.value) input.value = v; }
        profile.values[f.id] = v;
        if (f.id === 'nascimento') updateAge();
        checkCpf();
        store.touch();
      });
      if (cepAfter) input.addEventListener('input', cepAfter);
      if (f.type === 'select') input.addEventListener('change', () => { profile.values[f.id] = input.value; store.touch(); });
      checkCpf();
      body.append(wrap);
    }
    updateAge();
    details.append(body);
    return details;
  }

  async function doCep(profile, inputs, statusEl, force) {
    if (!force && !store.getData().settings.cepLookupEnabled) {
      statusEl.textContent = 'A busca automática está desativada em Configurações. Toque em “Buscar endereço” ou preencha à mão.';
      return;
    }
    const d = digits(profile.values.cep);
    if (d.length !== 8) { statusEl.textContent = 'Digite os 8 números do CEP.'; return; }
    statusEl.textContent = 'Buscando endereço…';
    try {
      const r = await lookupCEP(d);
      if (digits(profile.values.cep) !== d) return; // o CEP mudou durante a busca
      if (!r) { statusEl.textContent = 'CEP não encontrado. Preencha o endereço manualmente.'; return; }
      for (const [k, v] of Object.entries(r)) {
        if (!v) continue;
        profile.values[k] = v;
        if (inputs[k]) inputs[k].value = v;
      }
      store.touch();
      statusEl.textContent = 'Endereço preenchido. Confira e edite o que precisar.';
    } catch {
      statusEl.textContent = 'Não foi possível buscar o CEP agora. Preencha o endereço manualmente.';
    }
  }

  // ----- campos personalizados -----
  function customSection(profile) {
    const card = h('section', { class: 'card' },
      h('h2', { text: 'Campos personalizados' }),
      h('p', { class: 'hint', text: 'Crie campos extras só seus, como matrícula da empresa, número do SUS ou cartão da academia.' }),
    );
    profile.customFields.forEach((c, i) => card.append(customRow(profile, c, i)));
    card.append(h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn secondary', text: '+ Adicionar campo', onclick: () => addCustom(profile) }),
    ));
    return card;
  }

  function customRow(profile, c, i) {
    const label = h('input', { type: 'text', maxlength: 80, 'aria-label': 'Nome do campo', autocomplete: 'off' });
    label.value = c.label;
    label.addEventListener('input', () => { c.label = label.value.slice(0, 80); store.touch(); });
    const value = h('input', { type: 'text', maxlength: 500, 'aria-label': `Valor de ${c.label}`, autocomplete: 'off', placeholder: 'Valor' });
    value.value = c.value;
    value.addEventListener('input', () => { c.value = value.value; store.touch(); });
    return h('div', { class: 'custom-row' },
      label, value,
      h('div', { class: 'row-actions' },
        h('button', { type: 'button', class: 'btn ghost small', text: '↑ Subir', disabled: i === 0, onclick: () => { P.moveCustomField(profile, c.id, -1); render(); } }),
        h('button', { type: 'button', class: 'btn ghost small', text: '↓ Descer', disabled: i === profile.customFields.length - 1, onclick: () => { P.moveCustomField(profile, c.id, 1); render(); } }),
        h('button', { type: 'button', class: 'btn danger-outline small', text: 'Remover', onclick: () => removeCustom(profile, c) }),
      ),
    );
  }

  async function addCustom(profile) {
    const r = await formDialog({
      title: 'Novo campo',
      fields: [
        { name: 'label', label: 'Nome do campo', placeholder: 'Ex.: Matrícula da empresa', maxlength: 80 },
        { name: 'value', label: 'Valor (pode preencher depois)', maxlength: 500 },
      ],
      confirmLabel: 'Adicionar',
      submit: (v) => {
        if (!v.label.trim()) return 'Digite o nome do campo.';
        if (profile.customFields.length >= P.MAX_CUSTOM_FIELDS) return `O limite é de ${P.MAX_CUSTOM_FIELDS} campos por perfil.`;
        return undefined;
      },
    });
    if (r) { P.addCustomField(profile, r.label, r.value); render(); }
  }

  async function removeCustom(profile, c) {
    const ok = await confirmDialog({ title: 'Remover campo?', message: `O campo “${c.label}” e o valor dele serão apagados.`, confirmLabel: 'Remover', danger: true });
    if (ok) { P.removeCustomField(profile, c.id); render(); }
  }

  return { render };
}
