# Segurança — Moz Camp Adventures

Actualizado: Fase 8 (26/10/2026). Estado de cada medida: ✅ implementada e testada · ⏳ fase seguinte · ⚠️ depende do servidor/cliente.

## API pública (`/api/`)

| Ameaça | Medida | Estado | Teste |
|---|---|---|---|
| CSRF (formulário de outro site a publicar pedidos) | Exige `Origin` da lista `app.allowed_origins` **e** `Content-Type: application/json` (formulários HTML não o conseguem enviar) | ✅ | S1, S2, S3 |
| Bots / spam | Campo-armadilha invisível (`website`) e limite por IP: 10 reservas/h, 5 mensagens/h, 3 avaliações/dia | ✅ | S4, L1 |
| Manipulação de preços no browser | O total é **recalculado no servidor** a partir de `data/*.json`; valores do cliente são ignorados; só são aceites opções que existem para o item | ✅ | B2, B12 |
| Regras de negócio contornadas | Mínimo/máximo de participantes, noites mínimas, capacidade dos barcos, datas válidas e futuras, itens desactivados — validados no servidor | ✅ | B7–B18 |
| Pedidos duplicados (duplo clique, rede) | `idempotency_key` única por pedido | ✅ | B4, B5 |
| Referências repetidas em concorrência | Contador atómico (`ON CONFLICT … RETURNING`) na mesma transacção | ✅ | B6 |
| Injecção SQL | Só *prepared statements* PDO (sem emulação) | ✅ | S7, S8 |
| XSS | A API devolve texto puro; o site insere-o sempre com escape (`textContent`/`esc()`) | ✅ | revisão de código |
| Fuga de informação em erros | Erros internos devolvem só `server_error`; o detalhe vai para o registo do servidor | ✅ | S6 |
| Ficheiros internos acessíveis | `.htaccess` (raiz e `/api`) bloqueia `src/`, `migrations/`, `bin/`, `scripts/`, `tests/`, `docs/`, `*.md`, `*.zip`, `package*.json`; directivas nginx equivalentes em `DEPLOYMENT.md` | ✅ (Apache) ⚠️ (só nginx: aplicar directivas) | — |
| Credenciais no repositório | Configuração **fora do `httpdocs`**; o repositório só tem `config.example.php` | ✅ | — |
| Alteração silenciosa de históricos | `booking_events` e `email_log` são só de acréscimo (trigger recusa UPDATE/DELETE) | ✅ | D2, D3 |
| Privacidade | IP guardado só como HMAC-SHA256 com segredo; token de acesso do cliente guardado como hash | ✅ | D5 |
| E-mail dado como enviado sem o ser | O resultado de `mail()` é registado (`sent`/`failed`/`logged`); o site só diz «enviámos um resumo» se o estado for `sent` | ✅ | D4 |

## Site estático

| Medida | Estado |
|---|---|
| Cabeçalhos `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` | ✅ `.htaccess` |
| HTTPS obrigatório e host único | ⚠️ configurar no Plesk (`DEPLOYMENT.md`) |
| Content-Security-Policy | ✅ Fase 8 — `script-src 'self'` + GTM, sem `unsafe-inline` nos scripts (ver abaixo) |
| HSTS (`Strict-Transport-Security`, 1 ano, só em HTTPS) | ✅ `.htaccess` |
| Ícones (Boxicons) e fonte (Inter) alojados no próprio site | ✅ Fase 8 — sem pedidos a CDNs de terceiros (privacidade e CSP mais restrita) |
| Páginas legais/404/indisponíveis com `noindex` | ✅ |
| Firebase (chave pública e regras não versionadas) | ✅ **removido**; o projecto Firebase pode ser desactivado na consola |

## Painel de administração (Fase 5)

| Ameaça | Medida | Estado | Teste |
|---|---|---|---|
| Roubo de sessão via JavaScript | Cookie `HttpOnly`; o token fica no servidor apenas como hash SHA-256 | ✅ | A7, U12 |
| CSRF no painel | `SameSite=Strict` + token CSRF por sessão no cabeçalho `X-CSRF-Token` + verificação de `Origin` | ✅ | A8, A9 |
| Força bruta | 5 tentativas / 15 min por e-mail+IP; mesmo tempo de resposta com e-mail inexistente | ✅ | A10 |
| Palavras-passe | `password_hash` (bcrypt), mínimo 10 caracteres com letras e números; definidas pelo próprio utilizador num link de 48 h, de uso único | ✅ | A2–A4 |
| Sessões | Expiram após 4 h de inactividade ou 12 h no total; o logout invalida-as; desactivar um utilizador termina as suas sessões | ✅ | E6 |
| Escalada de privilégios | Permissões verificadas no servidor em cada rota; o perfil Administrador não é editável; só são aceites permissões do catálogo; tem de existir sempre um administrador activo | ✅ | B1–B6, D12–D13, U16–U17 |
| Facturas adulteradas | Emitidas imutáveis (trigger), anulação só com motivo e permissão própria, PDF com hash verificado em cada acesso | ✅ | D9–D16, D21 |
| PDFs expostos | Fora do `httpdocs`; só com sessão e permissão `invoices.view`; `Cache-Control: no-store` | ✅ | D8 |
| Acções não rastreadas | `audit_log` só de acréscimo: logins (incluindo falhados), estados, notas, facturas, permissões, definições (antes/depois), avaliações | ✅ | E4, E5 |
| Painel indexado | `noindex`, `robots.txt` (`Disallow: /admin/`), `Referrer-Policy: same-origin` | ✅ | — |

Recomendações:
- Activar autenticação de dois factores na conta de e-mail de cada utilizador do painel, porque é aí que chegam os links de acesso.
- Mais tarde, considerar 2FA no próprio painel.

## Pagamentos (Fase 6)

| Ameaça | Medida | Estado |
|---|---|---|
| «Pago» atribuído à mão | Estado calculado na vista `invoice_balances`; não existe campo editável | ✅ |
| Duplicados e corridas | Índice único método+referência; `FOR UPDATE` na factura ao confirmar | ✅ |
| Alteração ou eliminação de movimentos e recibos | Triggers de imutabilidade; eventos só de acréscimo | ✅ |
| Upload malicioso | Tipo pelo conteúdo (PDF/JPEG/PNG), 5 MB, nome aleatório, fora do `httpdocs`, SHA-256, servido só com sessão | ✅ |
| Link do cliente | Token aleatório de 192 bits (hash na BD), uma factura, 60 dias, no fragmento `#`, `Referrer-Policy: no-referrer`, limite de pedidos | ✅ |
| Página do cliente expõe dados | Só o número da factura, os valores, o primeiro nome e as instruções de pagamento | ✅ |

Detalhe em `PAGAMENTOS.md` §4.

## Notificações e área do cliente (Fase 7)

| Ameaça | Medida | Estado | Teste |
|---|---|---|---|
| Acesso aos documentos de outro cliente | Link assinado (HMAC-SHA256 com `app.secret`) por reserva; documentos só desta reserva | ✅ | C2, C3, C5 |
| Link partilhado por engano | Revogação no painel (nova versão invalida todos os anteriores) | ✅ | C8 |
| Token em logs ou Referer | Token no fragmento `#`; pedidos por POST; `Referrer-Policy: no-referrer` | ✅ | — |
| Exposição de dados pessoais | A área do cliente mostra só o primeiro nome; nenhum e-mail ou telefone | ✅ | C1 |
| E-mail dado como enviado sem o ser | Resultado real em cada acção; registo com erro; reenvio honesto | ✅ | N15–N17 |
| Conteúdo dos e-mails guardado | O corpo fica no registo para diagnóstico e reenvio (só com a permissão `emails.manage`) | ✅ | — |

Nota: rodar `app.secret` invalida todos os links de área do cliente já enviados (e os hashes de IP antigos deixam de corresponder). Só se deve fazer em caso de fuga.

## Content-Security-Policy (Fase 8)

Todo o JavaScript está em ficheiros (`/assets/js/*.js`, `/admin/admin.js`); as 82 páginas HTML não têm `<script>` inline nem atributos `on…`. Os dados que antes iam em scripts inline seguem em blocos `<script type="application/json">` (não executáveis) lidos pelos ficheiros JS; o GTM arranca em `/assets/js/gtm.js` (`data-gtm`); os redireccionamentos antigos usam `redirect.js`/`legacy-redirect.js`.

Política (`.htaccess`):
```
default-src 'self'; script-src 'self' https://www.googletagmanager.com https://*.googletagmanager.com https://*.clarity.ms https://c.bing.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com https://*.clarity.ms https://c.bing.com; font-src 'self'; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.clarity.ms https://c.bing.com; frame-src https://www.google.com https://www.googletagmanager.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests
```
- `style-src 'unsafe-inline'` mantém-se porque o HTML usa alguns atributos `style=` (ex.: posição de imagens); não permite executar código.
- `frame-src https://www.google.com` — mapa do Google na página de contacto.
- **Microsoft Clarity:** o contentor GTM-MQ73VSS3 (verificado a 26/10/2026) tem GA4 e um modelo do Clarity; os domínios `*.clarity.ms` e `c.bing.com` estão autorizados por isso. O teste do painel detectou o bloqueio do Clarity antes desta correcção.
- **Atenção ao GTM:** tags do tipo «HTML personalizado» no Google Tag Manager executam scripts inline e **serão bloqueadas** por esta política. As tags oficiais (GA4, Google Ads) funcionam. Se for preciso outro fornecedor (ex.: Meta Pixel), acrescentar o domínio dele a `script-src`, `img-src` e `connect-src` no `.htaccess` e testar.
- Verificação: `tests/e2e.mjs` e `tests/admin-ui.mjs` falham se o Chrome registar qualquer violação de CSP; o servidor de testes (`tests/dev-router.php`) aplica a mesma política lida do `.htaccess`. Prova negativa feita: uma página com script inline foi bloqueada e a violação foi detectada.
