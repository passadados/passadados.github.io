// Tela "Configurações": tema, proteção, CEP, campos visíveis, backup, instalação, privacidade e apagar dados.
import { h, APP_VERSION } from './utils.js';
import { GROUPS } from './fields.js';
import * as store from './storage.js';
import * as wa from './webauthn.js';
import { exportBackup, readBackupFile, decryptBackup, applyReplace, applyMerge } from './backup.js';
import { formDialog, confirmDialog, openDialog, infoDialog, toast } from './ui.js';
import { openInstallDialog, persistStatus, isStandalone } from './pwa.js';

export function initSettings(root, ctx) {
  let bioSupported = false;
  wa.isSupported().then((v) => { bioSupported = v; });

  async function render() {
    bioSupported = await wa.isSupported();
    const data = store.getData();
    if (!data) return;
    const meta = store.getMeta();
    const lock = meta.lock;
    const persisted = await persistStatus();
    const lastBackup = data.settings.lastBackupAt ? new Date(data.settings.lastBackupAt).toLocaleString('pt-BR') : 'nunca';

    // ----- Aparência -----
    const themeSel = h('select', { id: 'set-theme', 'aria-label': 'Tema' },
      h('option', { value: 'light', text: 'Claro' }), h('option', { value: 'dark', text: 'Escuro' }));
    themeSel.value = meta.theme;
    themeSel.addEventListener('change', () => ctx.applyTheme(themeSel.value));

    // ----- Proteção -----
    const protection = [h('h2', { text: 'Proteção de acesso' })];
    protection.push(h('p', { class: 'hint', text: lock.pin
      ? 'PIN/senha ativo: seus dados ficam criptografados neste aparelho.'
      : 'Sem PIN/senha: qualquer pessoa com o seu celular desbloqueado pode abrir o app.' }));
    protection.push(h('div', { class: 'row' },
      !lock.pin ? h('button', { type: 'button', class: 'btn primary', id: 'btn-pin-on', text: 'Ativar PIN ou senha', onclick: enablePin }) : null,
      lock.pin ? h('button', { type: 'button', class: 'btn secondary', text: 'Trocar PIN/senha', onclick: changePin }) : null,
      lock.pin ? h('button', { type: 'button', class: 'btn danger-outline', text: 'Desativar', onclick: disablePin }) : null,
    ));
    if (bioSupported || lock.bio) {
      protection.push(h('div', { class: 'setting' },
        h('div', { class: 'setting-title', text: 'Biometria do aparelho (digital ou rosto)' }),
        h('p', { class: 'hint', text: lock.pin
          ? 'Com o PIN ativo, a biometria acelera o desbloqueio enquanto o app continuar aberto. Ao reabrir o app, o PIN é pedido.'
          : 'Sem PIN, a biometria funciona como trava de tela: os dados não ficam criptografados. Para criptografar, ative também o PIN ou a senha.' }),
        h('button', { type: 'button', class: lock.bio ? 'btn danger-outline' : 'btn secondary', id: 'btn-bio', text: lock.bio ? 'Desativar biometria' : 'Ativar biometria', onclick: toggleBio }),
      ));
    } else {
      protection.push(h('p', { class: 'hint', text: 'Biometria indisponível neste navegador ou aparelho.' }));
    }
    if (lock.pin || lock.bio) {
      const idle = h('select', { id: 'set-idle', 'aria-label': 'Bloquear após inatividade' },
        [1, 2, 5, 10, 15].map((m) => h('option', { value: String(m), text: `${m} ${m === 1 ? 'minuto' : 'minutos'}` })));
      idle.value = String(lock.idleMinutes);
      idle.addEventListener('change', () => store.setIdleMinutes(Number(idle.value)));
      protection.push(h('div', { class: 'setting' },
        h('label', { for: 'set-idle', class: 'setting-title', text: 'Bloquear automaticamente após' }), idle,
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn secondary small', text: 'Bloquear agora', onclick: () => ctx.lockApp() })),
      ));
    }

    // ----- CEP -----
    const cepCb = h('input', { type: 'checkbox', id: 'set-cep' });
    cepCb.checked = data.settings.cepLookupEnabled;
    cepCb.addEventListener('change', () => { data.settings.cepLookupEnabled = cepCb.checked; store.touch(); });

    // ----- Campos visíveis -----
    const visible = GROUPS.map((g) => h('div', { class: 'setting' },
      h('div', { class: 'setting-title', text: g.label }),
      g.fields.map((f) => {
        const cb = h('input', { type: 'checkbox', id: `vis-${f.id}` });
        cb.checked = !data.settings.hiddenFields.includes(f.id);
        cb.addEventListener('change', () => {
          const hid = data.settings.hiddenFields.filter((k) => k !== f.id);
          if (!cb.checked) hid.push(f.id);
          data.settings.hiddenFields = hid;
          store.touch();
        });
        return h('label', { class: 'switch-row', for: `vis-${f.id}` }, cb, h('span', { text: f.label }));
      }),
    ));

    // ----- Backup -----
    const fileInput = h('input', { type: 'file', accept: '.json,application/json', id: 'import-file', class: 'sr-only', tabindex: '-1' });
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (f) await importFile(f);
    });

    root.replaceChildren(
      h('h1', { class: 'screen-title', text: 'Configurações' }),

      h('section', { class: 'card' }, h('h2', { text: 'Aparência' }),
        h('div', { class: 'field' }, h('label', { for: 'set-theme', text: 'Tema' }), themeSel)),

      h('section', { class: 'card' }, protection),

      h('section', { class: 'card' }, h('h2', { text: 'Endereço e CEP' }),
        h('label', { class: 'switch-row', for: 'set-cep' }, cepCb, h('span', { text: 'Preencher o endereço automaticamente ao digitar o CEP' })),
        h('p', { class: 'hint', text: 'Quando ativado, só o número do CEP é enviado ao serviço público ViaCEP. Desative para não enviar nada à internet.' })),

      h('section', { class: 'card' }, h('h2', { text: 'Campos visíveis' }),
        h('p', { class: 'hint', text: 'Desmarque os campos que você não usa. Os dados deles não são apagados, só ficam ocultos.' }),
        visible),

      h('section', { class: 'card' }, h('h2', { text: 'Backup' }),
        h('p', { text: `Último backup: ${lastBackup}.` }),
        h('p', { class: 'hint', text: 'O backup é um arquivo que fica com você. Use-o para trocar de celular ou se precisar limpar o navegador.' }),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn primary', id: 'btn-export', text: 'Exportar dados', onclick: exportFlow }),
          h('button', { type: 'button', class: 'btn secondary', id: 'btn-import', text: 'Importar dados', onclick: () => fileInput.click() }),
        ), fileInput),

      h('section', { class: 'card' }, h('h2', { text: 'Instalar como aplicativo' }),
        h('p', { text: isStandalone() ? 'O passadados já está instalado e aberto como aplicativo.' : 'Instale na tela inicial para abrir rápido e funcionar sem internet.' }),
        h('p', { class: 'hint', text: `Armazenamento persistente do navegador: ${persisted}.` }),
        !isStandalone() ? h('button', { type: 'button', class: 'btn secondary', id: 'btn-install', text: 'Instalar aplicativo', onclick: openInstallDialog }) : null),

      h('section', { class: 'card' }, h('h2', { text: 'Privacidade e LGPD' }),
        h('p', { text: 'Entenda como seus dados são tratados e como testar por conta própria.' }),
        h('button', { type: 'button', class: 'btn secondary', text: 'Ler sobre privacidade', onclick: () => ctx.openIntro(false) })),

      h('section', { class: 'card' }, h('h2', { text: 'Apagar tudo' }),
        h('p', { text: 'Remove todos os perfis, campos e configurações guardados neste aparelho.' }),
        h('button', { type: 'button', class: 'btn danger', id: 'btn-wipe', text: 'Apagar todos os meus dados', onclick: wipe })),

      h('p', { class: 'footnote', text: `passadados versão ${APP_VERSION}. Seus dados ficam só neste aparelho.` }),
    );
  }

  // ----- PIN -----
  async function enablePin() {
    const r = await formDialog({
      title: 'Ativar PIN ou senha',
      notice: 'Se você esquecer o PIN ou a senha, não há como recuperar os dados. Faça um backup antes.',
      fields: [
        { name: 'pin', label: 'Novo PIN ou senha', type: 'password', hint: 'Mínimo de 4 caracteres. Uma senha longa protege mais do que um PIN curto.' },
        { name: 'pin2', label: 'Repita o PIN ou a senha', type: 'password' },
      ],
      confirmLabel: 'Ativar',
      submit: async (v) => {
        if (v.pin.length < 4) return 'Use pelo menos 4 caracteres.';
        if (v.pin !== v.pin2) return 'Os dois campos não são iguais.';
        await store.enablePin(v.pin);
        return undefined;
      },
    });
    if (r) { toast('PIN ativado. Seus dados agora ficam criptografados.'); render(); }
  }

  async function changePin() {
    const r = await formDialog({
      title: 'Trocar PIN ou senha',
      fields: [
        { name: 'old', label: 'PIN ou senha atual', type: 'password' },
        { name: 'pin', label: 'Novo PIN ou senha', type: 'password', hint: 'Mínimo de 4 caracteres.' },
        { name: 'pin2', label: 'Repita o novo PIN ou senha', type: 'password' },
      ],
      confirmLabel: 'Trocar',
      submit: async (v) => {
        if (v.pin.length < 4) return 'O novo PIN precisa ter pelo menos 4 caracteres.';
        if (v.pin !== v.pin2) return 'Os dois campos novos não são iguais.';
        if (!(await store.changePin(v.old, v.pin))) return 'O PIN ou a senha atual está incorreto.';
        return undefined;
      },
    });
    if (r) toast('PIN alterado.');
  }

  async function disablePin() {
    const r = await formDialog({
      title: 'Desativar PIN ou senha',
      message: 'Seus dados deixarão de ser criptografados neste aparelho. Digite o PIN ou a senha atual para confirmar.',
      fields: [{ name: 'old', label: 'PIN ou senha atual', type: 'password' }],
      confirmLabel: 'Desativar', danger: true,
      submit: async (v) => ((await store.disablePin(v.old)) ? undefined : 'O PIN ou a senha está incorreto.'),
    });
    if (r) { toast('PIN desativado.'); render(); }
  }

  // ----- Biometria -----
  async function toggleBio() {
    const lock = store.getMeta().lock;
    if (lock.bio) {
      const ok = await confirmDialog({ title: 'Desativar biometria?', message: 'O app deixará de pedir a biometria do aparelho para abrir.', confirmLabel: 'Desativar', danger: true });
      if (ok) { store.setBio(null); render(); }
      return;
    }
    if (!lock.pin) {
      const ok = await confirmDialog({
        title: 'Ativar biometria sem PIN?',
        message: 'Sem PIN, a biometria funciona como uma trava de tela, e os dados continuam sem criptografia no armazenamento do navegador. Para proteção completa, ative também o PIN ou a senha. Deseja continuar?',
        confirmLabel: 'Continuar',
      });
      if (!ok) return;
    }
    try {
      const credId = await wa.register();
      store.setBio(credId);
      toast('Biometria ativada.');
      render();
    } catch {
      toast('Não foi possível ativar a biometria neste aparelho.');
    }
  }

  // ----- Backup -----
  async function exportFlow() {
    const r = await formDialog({
      title: 'Exportar dados',
      message: 'Será baixado um arquivo com todos os seus perfis e campos.',
      notice: 'Sem senha, o arquivo fica legível por qualquer pessoa que o abrir. Guarde-o com cuidado. Para protegê-lo, defina uma senha abaixo.',
      fields: [
        { name: 'senha', label: 'Senha do arquivo (opcional)', type: 'password', hint: 'Deixe em branco para exportar sem senha.' },
        { name: 'senha2', label: 'Repita a senha', type: 'password' },
      ],
      confirmLabel: 'Exportar',
      submit: async (v) => {
        if (v.senha || v.senha2) {
          if (v.senha.length < 6) return 'A senha do arquivo precisa ter pelo menos 6 caracteres.';
          if (v.senha !== v.senha2) return 'As senhas não são iguais.';
        }
        await exportBackup({ password: v.senha || undefined });
        return undefined;
      },
    });
    if (r) { toast('Backup baixado. Guarde o arquivo em um lugar seguro.', { duration: 5000 }); render(); }
  }

  async function importFile(file) {
    let incoming;
    try {
      const res = await readBackupFile(file);
      if (res.data) incoming = res.data;
      else {
        const r = await formDialog({
          title: 'Backup protegido',
          message: 'Digite a senha definida ao exportar este arquivo.',
          fields: [{ name: 'senha', label: 'Senha do backup', type: 'password' }],
          confirmLabel: 'Abrir backup',
          submit: async (v) => {
            try { incoming = await decryptBackup(res.env, v.senha); } catch { return 'Senha incorreta ou arquivo danificado.'; }
            return undefined;
          },
        });
        if (!r) return;
      }
    } catch (e) {
      await infoDialog({ title: 'Não foi possível importar', body: [h('p', { text: (e && e.message) || 'Arquivo inválido.' })], closeLabel: 'Fechar' });
      return;
    }
    const n = incoming.profiles.length;
    const choice = await new Promise((resolve) => {
      const d = openDialog({
        title: 'Como importar?',
        body: [h('p', { text: `O arquivo tem ${n} ${n === 1 ? 'perfil' : 'perfis'}. Você pode substituir todos os dados atuais ou juntar os perfis do arquivo aos que você já tem.` })],
        actions: [
          h('button', { type: 'button', class: 'btn ghost', text: 'Cancelar', onclick: () => d.close('cancel') }),
          h('button', { type: 'button', class: 'btn secondary', id: 'imp-merge', text: 'Mesclar', onclick: () => d.close('merge') }),
          h('button', { type: 'button', class: 'btn danger', id: 'imp-replace', text: 'Substituir tudo', onclick: () => d.close('replace') }),
        ],
      });
      d.result.then((v) => resolve(v || 'cancel'));
    });
    if (choice === 'cancel') return;
    if (choice === 'replace') {
      if (!(await confirmDialog({ title: 'Substituir tudo?', message: 'Os dados atuais deste aparelho serão trocados pelos do arquivo.', confirmLabel: 'Substituir', danger: true }))) return;
      await applyReplace(incoming);
      toast('Dados importados.');
    } else {
      const { added, skipped } = await applyMerge(incoming);
      toast(skipped ? `${added} perfil(is) adicionado(s). ${skipped} não coube(ram) no limite.` : `${added} perfil(is) adicionado(s).`);
    }
    ctx.renderProfileSelect();
    render();
  }

  // ----- Apagar tudo -----
  async function wipe() {
    const r = await formDialog({
      title: 'Apagar todos os dados?',
      message: 'Isto remove TUDO que o passadados guardou neste aparelho e não pode ser desfeito. Se quiser manter uma cópia, exporte um backup antes.',
      fields: [{ name: 'conf', label: 'Digite APAGAR para confirmar', placeholder: 'APAGAR' }],
      confirmLabel: 'Apagar tudo', danger: true,
      submit: (v) => (v.conf.trim().toUpperCase() === 'APAGAR' ? undefined : 'Digite APAGAR (em maiúsculas) para confirmar.'),
    });
    if (r) { store.wipeAll(); location.reload(); }
  }

  return { render };
}
