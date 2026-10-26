# Arquitectura — Moz Camp Adventures

Actualizado: Fase 10 (26/10/2026). Servidor: **VPS com Plesk**. Base de dados: **PostgreSQL** (decisão de 26/10/2026).

## 1. Visão geral

```
                       ┌──────────────── httpdocs/ (Plesk) ─────────────────┐
Browser ──────────────►│ Site público: HTML estático gerado (scripts/build.mjs)│
  │                    │   assets/ (css, js, imagens _opt/), data/*.json       │
  │  fetch JSON        │                                                       │
  └───────────────────►│ /api/  PHP 8.1+  (index.php → src/)                   │──► PostgreSQL (mca)
                       │   POST /api/bookings   GET|POST /api/reviews          │      bookings, booking_events,
                       │   POST /api/contact    GET /api/health                │      contact_messages, reviews,
                       └───────────────────────────────────────────────────────┘      email_log, counters, rate_limits
   <domínio>/private/mca-config.php  (credenciais, fora da pasta pública)
   sendmail/Postfix do Plesk  ──►  e-mails (registados em email_log)
   GTM-MQ73VSS3 → GA4 (Consent Mode v2)   ·   wa.me/258844406543 (WhatsApp)
```

- O **site público continua estático**: rápido, sem PHP nas páginas, e funciona mesmo sem API (os formulários voltam a usar WhatsApp/e-mail).
- O **catálogo continua em `data/*.json`** e é a fonte de verdade para o site e para a API. O preço é recalculado no servidor (`api/src/Catalog.php`) com as mesmas regras de `assets/js/site.js`. O valor enviado pelo browser é ignorado.
- O **Firebase deixou de ser usado**: as avaliações são geridas no site (tabela `reviews`). A única avaliação aprovada no Firestore era a de teste, excluída como autorizado; não houve dados a migrar. O projecto Firebase pode ser desactivado.

## 2. API (Fase 4)

| Método e rota | Função | Protecções |
|---|---|---|
| `GET /api/health` | Estado da API e da BD | — |
| `POST /api/bookings` | Pedido de reserva → referência `MCA-AAAA-NNNNN`, estado «pedido» | Origem, JSON, honeypot, limite por IP, idempotência, validação completa |
| `POST /api/contact` | Mensagem de contacto | Origem, JSON, honeypot, limite por IP |
| `GET /api/reviews?item=<slug>\|home` | Avaliações **aprovadas** + média | — |
| `POST /api/reviews` | Nova avaliação (fica «pendente») | Origem, JSON, honeypot, limite por IP |

Códigos de erro (JSON `{"error": …}`): `min_people`, `min_nights`, `capacity`, `item_unavailable`, `invalid_*`, `date_out_of_range`, `boat_required`, `origin_not_allowed` (403), `unsupported_media_type` (415), `too_many_requests` (429), `server_error` (500, com detalhe só no registo do servidor).

### Referência de reserva
`MCA-<ano>-<5 dígitos>`, gerada por `INSERT … ON CONFLICT DO UPDATE … RETURNING` sobre `counters`, dentro da mesma transacção que cria a reserva. É atómica: 20 pedidos simultâneos geram 20 referências únicas e consecutivas (teste B6). Repetir o mesmo pedido (duplo clique, rede instável) devolve a mesma referência graças à `idempotency_key` única (testes B4/B5).

### Estados
- **Operacional** (`bookings.status`): `pedido` → `confirmada` → `concluida` / `cancelada`. As alterações de estado serão feitas no painel (Fase 5) e registadas em `booking_events`.
- **Financeiro**: Fases 5–6 (facturas e pagamentos em tabelas próprias). O estado financeiro é calculado a partir dos pagamentos válidos, nunca editado à mão.

## 3. Modelo de dados — `api/migrations/001_init.sql`

| Tabela | Conteúdo | Notas |
|---|---|---|
| `bookings` | Pedido, datas, participantes, opções, linhas de preço e total **calculados no servidor**, dados do cliente | `reference` e `idempotency_key` únicos; CHECKs de integridade; `access_token_hash` para futuro link privado do cliente |
| `booking_events` | Histórico da reserva | **Só acréscimo** (trigger recusa UPDATE/DELETE) |
| `contact_messages` | Mensagens do formulário | estado `novo` / `respondido` / `arquivado` |
| `reviews` | Avaliações | `pendente` / `aprovada` / `rejeitada`; quem moderou e quando |
| `email_log` | Cada e-mail: destino, assunto, `sent` / `failed` / `logged`, erro | **Só acréscimo** |
| `counters` | Sequências (reservas; depois séries de facturas) | — |
| `rate_limits` | Contagem por IP (hash) e janela | limpeza automática > 1 dia |
| `schema_migrations` | Migrações aplicadas | criada por `api/bin/migrate.php` |

Privacidade: o IP nunca é guardado em claro, só como HMAC-SHA256 com segredo (`app.secret`).

## 4. Configuração

Ficheiro PHP **fora do `httpdocs`** (`<domínio>/private/mca-config.php`, ou o caminho indicado em `MCA_CONFIG`). Modelo: `api/config.example.php`. Contém: DSN/utilizador/palavra-passe da BD, `app.secret`, origens permitidas, remetente e destinatários de e-mail, limites.

Requisitos do servidor: **PHP ≥ 8.1** com `pdo_pgsql`; **PostgreSQL ≥ 13**. Não precisa de `mbstring` nem de Composer.

## 5. Migrações e reversão

- Aplicar: `php api/bin/migrate.php` (cada migração numa transacção; se falhar, nada é aplicado). Ver o estado: `--status`.
- **Antes** de qualquer migração em produção: `pg_dump` da base (ver `DEPLOYMENT.md`).
- Reverter a 001 (só numa base sem dados reais): `DROP TABLE booking_events, bookings, contact_messages, reviews, email_log, rate_limits, counters, schema_migrations; DROP FUNCTION mca_append_only, mca_touch;`
  Com dados reais, a reversão faz-se restaurando o `pg_dump`. **Nunca se apagam dados financeiros.**

## 6. Fase 5 — painel e facturação (26/10/2026)

- **Painel** `/admin/` (HTML + JS, `noindex`) sobre `/api/admin/*` (`api/src/Admin.php`).
- **Autenticação** (`api/src/Auth.php`):
  - sessões no servidor, com cookie `HttpOnly` + `Secure` + `SameSite=Strict`;
  - token CSRF por sessão;
  - limite de 5 tentativas de login em 15 minutos;
  - palavras-passe com `password_hash`;
  - acesso inicial por link de 48 h (`api/bin/create-user.php` ou o próprio painel).
- **Perfis e permissões:**
  - **Administrador** (`*`, não editável) — Wilson Mate.
  - **Gerente** (conjunto inicial, editável pelo Administrador) — Domingos Sitoe.
  - O Administrador pode criar outros perfis e atribuir qualquer combinação das 13 permissões. Tem de existir sempre um Administrador activo.
- **Facturação** (`api/src/Invoices.php`, `api/src/Pdf.php`): ver `FACTURACAO.md`.
- **Novas tabelas** (002): `roles`, `users`, `sessions`, `audit_log` (só acréscimo), `settings`, `invoices` (trigger de imutabilidade) e `invoice_events` (só acréscimo).
- **Dados iniciais** (003): empresa (NUIT 459001987, ISPC) e instruções de pagamento (Nedbank, Millennium bim, M-Pesa; e-Mola pendente).
- **Ficheiros privados:** os PDFs ficam em `app.storage_dir`, fora do `httpdocs`.

## 6b. Fase 6 — pagamentos (26/10/2026)

- `api/src/Payments.php`:
  - registo, confirmação (com recibo RC), recusa, reversão e reembolso;
  - link privado e página do cliente para enviar o comprovativo (`POST /api/proof/info`, `POST /api/proof` multipart).
- **Migração 004:**
  - tabelas `payments`, `payment_events` (só acréscimo) e `receipts`, com triggers de imutabilidade e índice único anti-duplicados;
  - vista `invoice_balances` (estado financeiro calculado);
  - colunas `proof_token_*` nas facturas;
  - permissões `payments.view` e `payments.record` acrescentadas ao Gerente.
- **Página estática** `/pagamento/`, gerada pelo build: `noindex`, sem Referer, bloqueada no `robots.txt`.
- **Ficheiros privados:** `storage/invoices/`, `storage/receipts/`, `storage/proofs/`.

## 6c. Fase 7 — notificações e área do cliente (26/10/2026)

- `api/src/Notify.php`: modelos PT/EN, envio com resultado real e área do cliente (`POST /api/client/booking|document|proof-link`). O link é assinado por HMAC e revogável (`bookings.client_link_version`).
- `api/src/Mailer.php`: o registo guarda corpo e anexos (caminhos), permite reenviar (`resent_of`) e, em modo `log`, simula falhas para domínios `.invalid`.
- Migração 005, definições `notifications` e permissão `emails.manage`.
- Páginas estáticas `/reserva/` e `/en/booking/`, geradas pelo build.
- Ver `NOTIFICACOES.md`.

## 6d. Fase 8 — segurança, SEO, acessibilidade e desempenho (26/10/2026)

- **Content-Security-Policy** sem scripts inline; ícones (Boxicons, subconjunto de 71) e fonte (Inter) servidos pelo próprio site. Ver `SEGURANCA.md`.
- **`tests/audit.mjs`:** SEO, sitemap, links internos, axe-core e desempenho mobile, com relatório em `docs/AUDITORIA_TECNICA.json`.

## 7. Publicação (Fase 10)

- `scripts/package.mjs` prepara `dist/httpdocs/` e o manifesto SHA-256; a publicação é manual e só com autorização. Ver `PUBLICACAO.md`.

## 8. Alternativas consideradas

| Opção | Porque não |
|---|---|
| MySQL/MariaDB | Também viável no Plesk; o PostgreSQL foi escolhido por decisão do cliente e oferece transacções, `ON CONFLICT … RETURNING`, JSONB e triggers adequados à auditoria financeira |
| Node.js no VPS | Exige gerir um processo (PM2/systemd); o PHP é nativo no Plesk |
| Manter o Firebase | Decisão: avaliações e dados geridos no site; evita dados financeiros/pessoais num serviço externo manipulável pelo browser |
| Funções Vercel | O Vercel é só para testes |
