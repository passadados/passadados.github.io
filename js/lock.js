// Tela de bloqueio: PIN/senha e/ou biometria do aparelho.
import { h } from './utils.js';
import * as store from './storage.js';
import * as wa from './webauthn.js';
import { confirmDialog, toast } from './ui.js';

// Mostra a tela de bloqueio e só resolve quando o app for desbloqueado.
export function showLock() {
  return new Promise((resolve) => {
    const el = document.getElementById('lock');
    const { pin, bio, credId } = store.getMeta().lock;
    let timer = null;

    const msg = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const showError = (t) => { msg.textContent = t || ''; msg.hidden = !t; };

    const pinInput = pin ? h('input', {
      id: 'lock-pin', type: 'password', autocomplete: 'off', autocapitalize: 'off',
      placeholder: 'PIN ou senha', 'aria-label': 'PIN ou senha',
    }) : null;
    const unlockBtn = pin ? h('button', { type: 'submit', class: 'btn primary block', text: 'Desbloquear' }) : null;
    const quick = store.canQuickUnlock();
    const bioBtn = quick ? h('button', {
      type: 'button', class: `btn ${pin ? 'secondary' : 'primary'} block`, id: 'lock-bio', text: 'Desbloquear com biometria',
    }) : null;

    const setDisabled = (v) => { if (pinInput) pinInput.disabled = v; if (unlockBtn) unlockBtn.disabled = v; };
    const done = (info) => {
      clearInterval(timer);
      el.hidden = true;
      el.replaceChildren();
      if (info && info.corrupt) toast('Seus dados salvos estavam danificados e foi criada uma nova base. Uma cópia foi mantida no navegador.', { duration: 7000 });
      resolve();
    };
    const checkWait = () => {
      const ms = store.lockRemainingMs();
      if (ms > 0) { showError(`Muitas tentativas incorretas. Tente de novo em ${Math.ceil(ms / 1000)} s.`); setDisabled(true); return true; }
      if (pinInput && pinInput.disabled) { showError(''); setDisabled(false); pinInput.focus(); }
      return false;
    };

    const form = h('form', { novalidate: true },
      pinInput ? h('div', { class: 'field' }, pinInput) : null,
      msg,
      h('div', { class: 'actions-col' }, unlockBtn, bioBtn),
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!pinInput || checkWait()) return;
      const value = pinInput.value;
      if (!value) { showError('Digite o PIN ou a senha.'); return; }
      setDisabled(true);
      showError('');
      const r = await store.unlockWithPin(value);
      if (r.ok) { done(); return; }
      pinInput.value = '';
      setDisabled(false);
      if (r.wait > 0) checkWait(); else showError('PIN ou senha incorretos.');
      pinInput.focus();
    });
    if (bioBtn) {
      bioBtn.addEventListener('click', async () => {
        showError('');
        try {
          await wa.authenticate(credId);
          const r = await store.unlockQuick();
          if (r.ok) { done(r); return; }
          showError('Use o PIN ou a senha para desbloquear.');
        } catch {
          showError(pin ? 'Não foi possível validar a biometria. Use o PIN ou a senha.' : 'Não foi possível validar a biometria. Tente novamente.');
        }
      });
    }

    const forgot = h('button', {
      type: 'button', class: 'link-btn',
      text: pin ? 'Esqueci o PIN ou a senha' : 'Não consigo desbloquear',
      onclick: async () => {
        const ok = await confirmDialog({
          title: 'Apagar tudo e recomeçar?',
          message: 'Não existe como recuperar os dados sem o PIN ou a senha, porque nós não temos cópia deles. Se você tiver um arquivo de backup, poderá importá-lo depois. Deseja apagar todos os dados deste aparelho?',
          confirmLabel: 'Apagar tudo', danger: true,
        });
        if (ok) { store.wipeAll(); location.reload(); }
      },
    });

    el.replaceChildren(h('div', { class: 'lock-card' },
      h('img', { src: './icons/icon.svg', alt: '', width: 72, height: 72 }),
      h('h1', { text: 'passadados bloqueado' }),
      h('p', { class: 'hint', text: pin
        ? (bio && !quick ? 'Digite seu PIN ou senha. A biometria volta a funcionar enquanto o app ficar aberto.' : 'Digite seu PIN ou senha para ver seus dados.')
        : 'Confirme com a biometria do aparelho para ver seus dados.' }),
      form,
      forgot,
    ));
    el.hidden = false;
    if (pin) timer = setInterval(checkWait, 1000);
    checkWait();
    if (pinInput && !pinInput.disabled) pinInput.focus();
    else if (bioBtn) bioBtn.focus();
  });
}
