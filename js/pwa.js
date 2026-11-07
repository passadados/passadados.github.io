// PWA: instalação como app, aviso do risco de perda de dados, service worker e armazenamento persistente.
import { h } from './utils.js';
import { openDialog, toast } from './ui.js';

let deferredPrompt = null;
let swReg = null;
let reloading = false;

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  toast('App instalado! Procure o ícone do passadados na tela inicial.', { duration: 5000 });
});

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function openInstallDialog() {
  if (isStandalone()) { toast('O app já está instalado e aberto neste aparelho.'); return; }
  const ios = isIOS();
  const body = [
    h('div', { class: 'warn-box' },
      h('strong', { text: 'Antes de instalar: ' }),
      'seus dados ficam somente neste aparelho. Eles podem ser perdidos se você limpar os dados do navegador, desinstalar o app, trocar ou perder o celular. Faça backup com frequência em Configurações → Exportar.',
    ),
  ];
  const actions = [];
  let d;
  const closeBtn = h('button', { type: 'button', class: 'btn ghost', text: 'Fechar', onclick: () => d.close(null) });
  if (ios) {
    body.push(
      h('p', null, h('strong', { text: 'No iPhone ou iPad (Safari):' })),
      h('ol', { class: 'steps-list' },
        h('li', { text: 'Toque no botão Compartilhar (quadrado com uma seta).' }),
        h('li', { text: 'Escolha “Adicionar à Tela de Início”.' }),
        h('li', { text: 'Toque em “Adicionar”.' }),
      ),
      h('p', { class: 'hint', text: 'Atenção: no iPhone, o app instalado pode ter um armazenamento separado do Safari. Se você já cadastrou dados no navegador, exporte um backup e importe dentro do app instalado.' }),
    );
  } else if (deferredPrompt) {
    actions.push(h('button', {
      type: 'button', class: 'btn primary', text: 'Entendi, instalar agora',
      onclick: async () => {
        const p = deferredPrompt;
        deferredPrompt = null;
        d.close(null);
        try { await p.prompt(); await p.userChoice; } catch { /* usuário cancelou */ }
      },
    }));
  } else {
    body.push(h('p', { text: 'Abra o menu do navegador e procure por “Instalar aplicativo” ou “Adicionar à tela inicial”. Se a opção não aparecer, o seu navegador pode não oferecer instalação; o passadados continua funcionando normalmente no navegador.' }));
  }
  d = openDialog({ title: 'Instalar o passadados', body, actions: [closeBtn, ...actions] });
}

export async function requestPersist() {
  try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch { return false; }
}

export async function persistStatus() {
  try {
    if (!navigator.storage || !navigator.storage.persisted) return 'indisponível';
    return (await navigator.storage.persisted()) ? 'concedido' : 'não concedido';
  } catch { return 'indisponível'; }
}

export function applyUpdate() {
  if (swReg && swReg.waiting) swReg.waiting.postMessage({ type: 'SKIP_WAITING' });
}

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const offer = () => toast('Nova versão do passadados disponível.', { duration: 0, action: { label: 'Atualizar', onClick: applyUpdate } });
  try {
    swReg = await navigator.serviceWorker.register('./sw.js');
    if (swReg.waiting && navigator.serviceWorker.controller) offer();
    swReg.addEventListener('updatefound', () => {
      const nw = swReg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) offer();
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  } catch { /* sem service worker: o app funciona, só não abre offline */ }
}
