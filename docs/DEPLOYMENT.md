# Publicação e manutenção — Moz Camp Adventures

**Servidor:** VPS com Plesk · **Domínio:** mozcampadventures.co.mz · Vercel só para testes.
**Estado:** Fase 3 pronta para revisão. **Nada foi publicado.**

## 1. Como o site é gerado

O site público é HTML estático gerado a partir de dados e modelos. O servidor só serve ficheiros: não há PHP nem Node no site público (o back-end da Fase 4 fica em `/api/`).

```
data/tours.json, data/accommodations.json   catálogo (PT) — fonte de verdade de preços e textos
data/en.json                                traduções do catálogo (EN)
data/booking-rules.json                     mínimos/máximos, noites, tarifas por escalão, tipo de preço
scripts/i18n.mjs                            textos da interface PT/EN
scripts/build.mjs                           gera as páginas, sitemap.xml e robots.txt
scripts/optimize-images.mjs                 gera variantes WebP em assets/images/_opt/
```

### Alterar conteúdo (ex.: preço de um tour)
Depois de publicado, a forma normal é o painel: **Experiências** (rascunho → «Publicar no site»; ver `CATALOGO.md`). No computador de desenvolvimento:
1. Editar `data/tours.json` (e `data/en.json`, se o texto mudar).
2. `node scripts/build.mjs`
3. Rever localmente, correr os testes e publicar os ficheiros alterados.

### Novas imagens
1. Copiar para `assets/images/...` e referir no JSON (`"../assets/images/..."`, como hoje).
2. `node scripts/optimize-images.mjs` (precisa de `npm install` uma vez; usa o `sharp`, já em `devDependencies`).
3. `node scripts/build.mjs`

### Requisitos
Node.js 20 ou superior no computador de desenvolvimento. No servidor, o Node só é usado para publicar o catálogo a partir do painel (§3.1f); o site público continua a ser HTML estático.

## 2. Testar antes de publicar

```
node scripts/build.mjs
node tests/e2e.mjs                                   # site sem API (fallback WhatsApp) — 43 testes
# com API local (PHP + PostgreSQL de desenvolvimento, ver §7):
E2E_BASE=http://localhost:8791 node tests/e2e.mjs    # site com API — 44 testes
API_BASE=http://localhost:8791 PSQL="psql -h localhost -p 55432 -U mca -d mca" node tests/api.mjs   # API — 43 testes
PHP_CLI="php" MCA_CONFIG=<config dev> PSQL="…" node tests/admin.mjs      # painel e facturação (API) — 51 testes
PHP_CLI="php" MCA_CONFIG=<config dev> PSQL="…" node tests/payments.mjs   # pagamentos e recibos (cenários A–F) — 44 testes
PHP_CLI="php" MCA_CONFIG=<config dev> PSQL="…" node tests/notifications.mjs   # notificações, e-mails, área do cliente — 28 testes
PHP_CLI="php" MCA_CONFIG=<config dev> node tests/admin-ui.mjs           # painel no browser (pagamentos, área do cliente, e-mails) — 33 testes
PHP_CLI="php" MCA_CONFIG=<config dev> PSQL="…" node tests/accounts.mjs   # contas de cliente — 34 testes
node tests/audit.mjs                                 # (npm install uma vez) SEO, links, acessibilidade (axe-core) e desempenho mobile — relatório em docs/AUDITORIA_TECNICA.json
```
Os testes usam o Chrome instalado (`CHROME=<caminho>` para outro). **Nunca correr `tests/api.mjs` contra a base de produção**: cria pedidos e esgota limites de propósito. Ver `docs/RELATORIO_DE_TESTES.md`.

## 3. Publicar no Plesk

**Antes de publicar:** fazer backup do `httpdocs` actual. No Plesk: *Websites & Domains → Backup Manager*, ou descarregar a pasta. É o ponto de reversão.

**Pacote:** `node scripts/build.mjs && node scripts/package.mjs` copia para `dist/httpdocs/` só os ficheiros abaixo, recusa avançar se houver script inline ou configuração com segredos dentro do site, e grava `dist/MANIFEST.sha256`. O passo-a-passo da publicação e da reversão está em `docs/PUBLICACAO.md`.

Ficheiros a enviar para `httpdocs/` (o conteúdo de `dist/httpdocs/`):
```
index.html  404.html  sitemap.xml  robots.txt  .htaccess  favicon.ico
pages/  tours/  alojamentos/  en/
assets/   (css/, js/, images/ incluindo images/_opt/)
data/     (só os .json)
api/      (index.php, .htaccess, src/, migrations/, bin/ — ver §3.1)
package.html  pacotes.html  alojamentos.html   (redireccionamentos antigos — manter)
```
**Não enviar:** `scripts/`, `tests/`, `docs/`, `node_modules/`, `prototipo/`, `.git/`, `.claude/`, `*.zip`, `*.md`, `package*.json`, `settings.json`, `vercel.json`. O `.htaccess` bloqueia o acesso a estes caminhos, caso sejam enviados por engano.

Envio: FTP/SFTP, o *File Manager* do Plesk ou a extensão *Git* do Plesk (com "deploy" para `httpdocs` e a lista de exclusões acima).

### 3.1 API e base de dados (primeira instalação)
1. **PostgreSQL:** em *Tools & Settings → Server Components*, confirmar que o componente "PostgreSQL server" está instalado. Depois, em *Websites & Domains → Databases → Add Database*, escolher o tipo **PostgreSQL**, com nome `mca` e utilizador `mca_app` (palavra-passe forte, gerada pelo Plesk).
2. **PHP:** em *PHP Settings* do domínio, escolher **PHP 8.1 ou superior** e confirmar que a extensão `pdo_pgsql` está activa.
3. **Configuração:** copiar `api/config.example.php` para `/var/www/vhosts/mozcampadventures.co.mz/private/mca-config.php` (fora do `httpdocs`). Preencher a BD e gerar o segredo com `php -r "echo bin2hex(random_bytes(32));"`. Permissões: só o utilizador do domínio pode ler (`chmod 600`).
4. **E-mail:** criar no Plesk a caixa ou alias `no-reply@mozcampadventures.co.mz` (remetente) e confirmar `booking@` e `info@`. Configurar SPF/DKIM do domínio em *Mail Settings* para os e-mails não irem para spam.
5. **Migrações** (por SSH, na pasta do site): `php httpdocs/api/bin/migrate.php`, e confirmar com `--status`.
6. **Verificar:** `https://mozcampadventures.co.mz/api/health` deve devolver `{"ok":true,…,"db":true}`. Fazer um pedido de teste numa experiência e confirmar a chegada do e-mail a booking@. Depois marcar esse pedido como teste/cancelado; o painel chega na Fase 5.

Se a API ainda não estiver instalada, o site continua a funcionar: os pedidos e mensagens voltam ao envio directo por WhatsApp/e-mail.

### 3.1b Painel e facturação (Fase 5)
1. **Pasta privada dos PDFs:** criar `/var/www/vhosts/mozcampadventures.co.mz/private/storage` (permissões `750`, dono = utilizador do domínio) e indicá-la em `app.storage_dir`. Acrescentar também `app.site_url` e `app.cookie_secure = true` à configuração (ver `api/config.example.php`).
2. **Migrações:** `php httpdocs/api/bin/migrate.php` aplica a `002_admin_invoicing` e a `003_settings_seed` (dados da empresa e de pagamento).
3. **Primeiros acessos** (por SSH):
   ```
   php httpdocs/api/bin/create-user.php "Nome do administrador" email-do-administrador@exemplo.com admin
   php httpdocs/api/bin/create-user.php "Nome do gerente" email-do-gerente@exemplo.com gerente
   ```
   Cada comando mostra um link (válido 48 h) para a pessoa definir a sua palavra-passe em `https://mozcampadventures.co.mz/admin/`. Enviar cada link só à pessoa em causa. Os utilizadores seguintes criam-se no próprio painel (*Utilizadores e perfis*).
4. **Confirmar em Definições:** os dados da empresa, os bancos, o M-Pesa e o número e-Mola (hoje pendente).
5. **Primeira factura de teste:** emitir uma pró-forma (`PF`) para validar o PDF com o contabilista antes de emitir facturas `FT` reais. Nota: os números `FT` emitidos ficam na sequência e não podem ser apagados.
6. **Backup** da pasta `private/storage` junto com a base de dados (os PDFs emitidos fazem parte do arquivo fiscal).

### 3.1c Pagamentos (Fase 6)
1. `php httpdocs/api/bin/migrate.php` aplica a `004_payments`.
2. **Plesk → PHP Settings** do domínio: `upload_max_filesize = 8M` e `post_max_size = 12M`. O padrão de 2 MB recusaria comprovativos maiores; a aplicação limita a 5 MB.
3. Em **Definições → Instruções de pagamento**, preencher o número **e-Mola**.
4. Rever as permissões do Gerente. Por omissão, pode **ver** e **registar** pagamentos. **Confirmar** e **reverter/reembolsar** ficam com o Administrador, que os pode atribuir.
5. O backup de `private/storage` passa a incluir `receipts/` e `proofs/`.

### 3.1d Notificações e área do cliente (Fase 7)
1. `php httpdocs/api/bin/migrate.php` aplica a `005_notifications`.
2. **Entrega de e-mail (essencial):** no Plesk, *Mail → Mail Settings* do domínio:
   - activar **DKIM**;
   - confirmar o registo **SPF** (`v=spf1 a mx ~all`, mais o IP do VPS se for diferente);
   - opcionalmente, DMARC (`v=DMARC1; p=none; rua=mailto:info@mozcampadventures.co.mz`).
   
   Sem estes registos, os e-mails tendem a ir para o spam.
3. **Teste real:**
   1. Criar uma reserva de teste com um e-mail vosso e confirmá-la no painel. O aviso deve dizer «E-mail enviado ao cliente».
   2. Confirmar a recepção e verificar se não foi para o spam.
   3. Abrir o link da área do cliente que vem no e-mail.
4. Em **Definições → Notificações**, desligar o que não quiserem enviar.
5. As páginas `/reserva/` e `/en/booking/` são geradas pelo build e enviadas com o resto do site.

### 3.1e Contas de cliente (27/10/2026)
1. `php httpdocs/api/bin/migrate.php` aplica a `006_customer_accounts`.
2. Confirmar que o SPF/DKIM está activo (§3.1d), para o e-mail de reposição da palavra-passe não ir para o spam.
3. Testar com uma conta vossa em `/conta/` (ver `PUBLICACAO.md` §3).

Detalhes em `CONTAS_DE_CLIENTE.md`.

### 3.1f Catálogo no painel (29/10/2026)
1. `php httpdocs/api/bin/migrate.php` aplica a `007_catalog_editor` (permissão `catalog.edit` para o Gerente).
2. **Node.js 20+** no Plesk (Extensões → Node.js). Na pasta do site, por SSH: `npm ci --omit=dev` (instala só o `sharp`; `package.json` e `package-lock.json` vêm no pacote).
3. Na configuração (`private/mca-config.php`): `'node_bin' => '/opt/plesk/node/22/bin/node'` (caminho real: `ls /opt/plesk/node/`).
4. **Permissões de escrita** do utilizador do PHP (o do domínio, no Plesk): `data/`, `assets/images/`, as páginas geradas e `private/storage/`.
5. Teste: no painel, editar uma frase de um pacote, publicar e confirmar no site; depois repor o texto e publicar de novo.
6. `scripts/`, `data/`, `node_modules/` e `package*.json` já estão bloqueados ao público (`.htaccess` e regras nginx abaixo).

Detalhes em `CATALOGO.md`.

### 3.1g E-mail pelo Resend e WhatsApp da equipa (29/10/2026)
1. `php httpdocs/api/bin/migrate.php` aplica a `008_messaging`.
2. **Resend:** o domínio já está verificado (29/10/2026). No servidor: chave em `RESEND_API_KEY` (ou `mail.resend_key`), `mail.transport` = `resend` e, no painel de produção, os destinatários dos avisos (`NOTIFICACOES.md` §6.2). O DKIM do Plesk (§3.1d) continua a servir as caixas de correio do domínio.
3. **WhatsApp:** número, token permanente em `WHATSAPP_TOKEN` (ou `whatsapp.token`), `whatsapp.phone_number_id` e modelo `nova_reserva` aprovado (§6.3). Os números da equipa definem-se no painel.
4. **Teste:** Definições → Canais de envio → «Enviar e-mail de teste» e «Enviar WhatsApp de teste»; depois, um pedido real a partir do site.

### 3.2 Backups da base de dados
- Activar o backup agendado do Plesk (*Backup Manager → Schedule*), incluindo bases de dados, **diário**, com retenção mínima de 30 dias e cópia para armazenamento externo (FTP remoto ou cloud).
- Antes de cada migração: `pg_dump -Fc -U mca_app mca > mca-AAAAMMDD.dump`.
- Restaurar: `pg_restore -c -U mca_app -d mca mca-AAAAMMDD.dump`.

### Configuração no Plesk
- **Apache + nginx** (o padrão do Plesk): o `.htaccess` trata da página 404, da cache, dos cabeçalhos de segurança e do bloqueio de ficheiros internos.
- **Só nginx**: em *Apache & nginx Settings → Additional nginx directives*, colar:
```nginx
error_page 404 /404.html;
location ~ ^/(scripts|tests|docs|data|dist|node_modules|prototipo|\.git|\.claude)(/|$) { deny all; }
location ~ (package(-lock)?\.json|settings\.json|vercel\.json|\.md|\.zip|\.mjs)$ { deny all; }
location ~* \.(css|js)$ { add_header Cache-Control "public, max-age=31536000, immutable"; }
location ~* \.(webp|jpe?g|png|ico|woff2)$ { add_header Cache-Control "public, max-age=2592000"; }
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Strict-Transport-Security "max-age=31536000" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://www.googletagmanager.com https://*.googletagmanager.com https://*.clarity.ms https://c.bing.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com https://*.clarity.ms https://c.bing.com; font-src 'self'; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.clarity.ms https://c.bing.com; frame-src https://www.google.com https://www.googletagmanager.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests" always;
location ~ ^/api/(src|migrations|bin|assets)(/|$) { deny all; }
location = /api/config.example.php { deny all; }
location /api/ { try_files $uri /api/index.php$is_args$args; }
```
- Confirmar que o SSL (Let's Encrypt) está activo e que há redireccionamento HTTP → HTTPS (*SSL/TLS Certificates → Redirect from HTTP to HTTPS*).
- Escolher um único host: `www` ou sem `www`. O site assume **sem www** (`https://mozcampadventures.co.mz`). Configurar o 301 no Plesk em *Hosting Settings → Preferred domain*.

### Depois de publicar
1. Abrir `/`, `/pages/tours.html`, uma experiência, um alojamento, `/en/` e `/pagina-que-nao-existe` (deve mostrar a 404).
2. Testar `pages/package.html?id=island-hopping-experience` (link antigo) → deve abrir `/tours/island-hopping-experience/`.
3. Ver os cabeçalhos: `curl -sI https://mozcampadventures.co.mz/` deve mostrar `Content-Security-Policy` e `Strict-Transport-Security`. Abrir a consola do browser em 2–3 páginas e no painel: não pode haver erros «Content Security Policy».
4. No GTM, confirmar que não há tags «HTML personalizado» activas (são bloqueadas pela CSP — ver `SEGURANCA.md`).
5. Google Search Console: submeter `https://mozcampadventures.co.mz/sitemap.xml`.

## 4. Reversão

- **Servidor:** restaurar o backup do `httpdocs` feito antes da publicação.
- **Código:** cada fase fica num commit Git (quando autorizado). Para voltar ao site anterior: `git checkout 9ef42a8 -- .` numa cópia, e publicar.

## 5. URLs

| Antes | Agora | Tratamento |
|---|---|---|
| `/index.html` | `/` (o `/index.html` continua a funcionar) | — |
| `/pages/tours.html?cat=…` | igual | preservado |
| `/pages/accommodations.html?loc=…` | igual | preservado |
| `/pages/contact.html` | igual | preservado |
| `/pages/package.html?id=<slug>` | `/tours/<slug>/` ou `/alojamentos/<slug>/` | redireccionamento automático (JS) |
| `/en/pages/package.html?id=<slug>` | `/en/tours/<slug>/` ou `/en/accommodations/<slug>/` | redireccionamento automático (JS) |
| `/package.html`, `/pacotes.html`, `/alojamentos.html` | — | mantidos sem alterações (encaminham para as páginas acima) |
| — | `/pages/privacidade.html`, `/pages/termos.html`, `/en/pages/privacy.html`, `/en/pages/terms.html`, `/404.html` | novos (`noindex` até à revisão jurídica) |

## 6. Limpeza (feita em 26/10/2026, autorizada)

Removidos 34 ficheiros sem uso, todos recuperáveis pelo histórico Git (commit `9ef42a8`): cópias antigas do catálogo na raiz, `settings.json`, `moz_camp_adventures.md`, CSS/JS antigos, `components/`, `en/components/`, preloader Lottie, fontes Pantherdam e 4 imagens vazias. Removido também `assets/js/firebase-config.js` (o Firebase deixou de ser usado).

- `MCA.zip`: **apagado**. Foi verificado ficheiro a ficheiro que é idêntico ao commit `9ef42a8` (só mudam os finais de linha).
- `` `mozcamp.zip ``: **mantido**. Contém uma versão anterior do catálogo (preços antigos) e uma versão diferente de `island-hopping-2.jpg` (190 KB) que não existem em mais lado nenhum. Está fora do Git e é bloqueado pelo `.htaccess`. Sugestão: movê-lo para um arquivo fora da pasta do site.
- `prototipo/`: mantido até à aprovação final da Fase 3 (bloqueado pelo `.htaccess` e `noindex`).

**Na publicação:** como o site antigo tem estes ficheiros no servidor, apagá-los também do `httpdocs` (depois do backup).

## 7. Ambiente de desenvolvimento da API

Usado para os testes desta fase (versões portáteis, sem instalar nada no sistema):
- PHP 8.2 NTS (windows.php.net, SHA-256 verificado) com `pdo_pgsql`.
- PostgreSQL 16 (binários EnterpriseDB), base `mca` na porta 55432.
- Configuração com `mail.transport = 'log'` (não envia e-mails) e origem `http://localhost:8791`.
- Servidor: `MCA_CONFIG=<config> php -S localhost:8791 tests/dev-router.php` (serve o site e a API, como o Plesk).

## WhatsApp Business

1. `php httpdocs/api/bin/migrate.php` aplica a `011_whatsapp_customers`.
2. Siga a ordem de activação em [WHATSAPP.md](WHATSAPP.md) §5. A migração deixa as mensagens a clientes desligadas.

## Live Chat

1. `php httpdocs/api/bin/migrate.php` aplica a `012_live_chat`.
2. Siga [LIVE_CHAT.md](LIVE_CHAT.md) §4. O chat fica visível no site logo depois da publicação, a não ser que seja desligado nas Definições.
