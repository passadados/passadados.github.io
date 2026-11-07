# passadados

Site (PWA) para guardar seus dados pessoais **somente no seu aparelho** e mostrá-los na tela quando alguém pedir seu cadastro (dentista, hospital, loja, locadora...), sem precisar falar tudo em voz alta.

- Sem login, sem servidor, sem banco de dados.
- Os dados ficam no `localStorage` do navegador do próprio aparelho.
- HTML + CSS + JavaScript puros, sem bibliotecas e sem build.
- A única chamada externa é a busca de endereço pelo CEP (ViaCEP), que envia só o número do CEP.

## Como publicar no GitHub Pages (endereço `https://passadados.github.io`)

1. Crie a organização gratuita **`passadados`** no GitHub (botão "+" → New organization → plano Free).
2. Dentro dela, crie um repositório **público** chamado exatamente **`passadados.github.io`**.
3. Extraia o arquivo `.zip` no seu computador. Envie **o conteúdo da pasta extraída** (não a pasta em si) para a raiz do repositório:
   - Repositório → **Add file → Upload files** → arraste todos os arquivos e pastas (`index.html`, `sw.js`, `manifest.json`, `css`, `js`, `icons`...) → **Commit changes**.
   - O arquivo `index.html` precisa ficar na raiz, não dentro de outra pasta.
4. Vá em **Settings → Pages**. Em *Build and deployment*, escolha **Deploy from a branch**, branch **`main`** e pasta **`/ (root)`**, e clique em **Save**.
5. Aguarde de 1 a 3 minutos e abra `https://passadados.github.io`.
6. Marque **Enforce HTTPS** em Settings → Pages, se estiver disponível.

> Se preferir usar sua conta pessoal, crie um repositório `passadados` e o site ficará em `https://SEU-USUARIO.github.io/passadados/`. Todo o código usa caminhos relativos, então funciona nos dois casos.

## Teste depois de publicar

1. Abra o site no celular, toque em **Começar a usar** e preencha alguns dados de exemplo.
2. Abra o mesmo endereço em outro navegador ou outro aparelho: o app deve estar **vazio** (prova de que nada fica em servidor).
3. No computador, abra as ferramentas do desenvolvedor (F12) → aba **Rede**. Salve dados e veja que nenhuma requisição é feita. Ao digitar um CEP, aparece somente a consulta ao `viacep.com.br`.
4. Em **Compartilhar**, marque campos e toque em **Mostrar**.
5. Teste **Exportar** e **Importar** em Configurações.
6. Instale como app: Android (Chrome) pelo botão **Instalar aplicativo**; iPhone (Safari) em Compartilhar → Adicionar à Tela de Início.

## Como atualizar o site depois

1. Altere os arquivos no repositório (Add file → Upload files, ou edite no GitHub).
2. **Aumente o número da versão em `sw.js`** (`const VERSION = 'passadados-v1'` → `'passadados-v2'`). Sem isso, quem já abriu o app continua vendo os arquivos antigos guardados no cache.
3. Se criar arquivos novos, acrescente-os à lista `ASSETS` do `sw.js`.
4. Os aparelhos mostrarão o aviso **"Nova versão disponível"** com o botão Atualizar.

## Mudar para `passadados.com` no futuro

1. Registre o domínio.
2. No repositório: **Settings → Pages → Custom domain** → `passadados.com` (o GitHub cria o arquivo `CNAME`).
3. No provedor do domínio, crie os registros DNS indicados na documentação oficial do GitHub Pages (registros A para o domínio raiz e CNAME para `www`).
4. **Atenção:** os dados guardados em `passadados.github.io` **não passam sozinhos** para o domínio novo, porque o navegador guarda os dados separados por endereço. Avise os usuários para **exportarem um backup** antes e **importarem** no endereço novo.

## Segurança e privacidade (resumo técnico)

- **Content Security Policy** definida por `<meta>` no `index.html`: só scripts e estilos do próprio site; `connect-src` permite apenas o próprio site e `https://viacep.com.br`.
- Nenhum `innerHTML` com dados do usuário (evita XSS). Importação de backup valida e limpa a estrutura; nada do arquivo é executado.
- **PIN/senha opcional:** os dados são criptografados com AES-GCM 256, usando chave derivada por PBKDF2-SHA256 (310 mil iterações). O PIN nunca é gravado. Sem o PIN não há como recuperar os dados. Atenção: PIN curto (4 números) é fraco contra quem copiar os dados do aparelho; prefira senha longa.
- **Biometria opcional (WebAuthn):** o site não vê nem guarda imagem do rosto ou da digital. Com PIN ativo, a biometria só acelera o desbloqueio enquanto o app continua aberto; ao reabrir, pede o PIN. Sem PIN, funciona apenas como trava de tela (dados sem criptografia).
- Backup exportado **sem senha** fica legível para quem abrir o arquivo; exporte com senha quando possível.
- O provedor de hospedagem (GitHub) pode registrar dados técnicos de acesso (como o IP de quem visita a página), como qualquer site. Os dados cadastrados no passadados não são enviados a ninguém.
- Recomenda-se uma revisão jurídica do texto de privacidade antes de divulgar amplamente.

## Estrutura

```
index.html          página única (telas alternadas por JavaScript)
manifest.json       configuração do PWA
sw.js               service worker (funcionamento offline) — aumente a VERSION a cada publicação
css/styles.css      estilos e temas claro/escuro
js/app.js           inicialização, navegação, tema e bloqueio automático
js/storage.js       armazenamento, esquema versionado, PIN e criptografia
js/crypto.js        PBKDF2 + AES-GCM (Web Crypto)
js/webauthn.js      biometria do aparelho
js/profiles.js      perfis, campos personalizados, conjuntos favoritos
js/fields.js        campos padrão, atalhos de seleção, formatação
js/form.js          tela "Meus dados" (inclui busca de CEP)
js/cep.js           integração com a ViaCEP
js/share.js         tela "Compartilhar" e tela de apresentação
js/settings.js      tela "Configurações"
js/backup.js        exportar e importar JSON
js/lock.js          tela de bloqueio
js/pwa.js           instalação como app e registro do service worker
js/ui.js            avisos, diálogos e cópia para a área de transferência
js/utils.js         DOM seguro, máscaras, validação de CPF, idade
js/theme-init.js    aplica o tema salvo antes da página aparecer
icons/              ícones do app
```
