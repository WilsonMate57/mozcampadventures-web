# Publicação, backup e reversão — Moz Camp Adventures

Fase 10 (26/10/2026). **Nada foi publicado.** Este documento é o guião para quando a publicação for autorizada. Os detalhes de cada configuração estão em `DEPLOYMENT.md`, e este guião remete para lá.

## 1. Checklist antes de publicar

### Bloqueantes (sem isto, não publicar)

- [ ] Autorização explícita do responsável para publicar, com data e hora combinadas (de preferência num período calmo, com alguém disponível para testar logo a seguir).
- [ ] Testes repetidos no próprio dia: `node scripts/build.mjs`, as 7 baterias e `node tests/audit.mjs` (ver `DEPLOYMENT.md` §2). Resultado esperado: 286/286 e «Auditoria sem falhas».
- [ ] Pacote gerado: `node scripts/package.mjs` (o script recusa avançar se houver scripts inline ou ficheiros de configuração com segredos).
- [ ] **Backup completo** do estado actual: `httpdocs`, bases de dados e e-mail, via *Backup Manager* do Plesk. Descarregar uma cópia para fora do servidor (§4).
- [ ] **Inventário do `httpdocs` actual:** procurar ficheiros que existem no servidor mas não no pacote e que têm de ficar. Exemplos: ficheiros de verificação do Google (`google*.html`), `.well-known/` (SSL), `ads.txt`, outros sites em subpastas. Estes ficheiros têm de ser copiados para o novo `httpdocs`.
- [ ] Plesk: PHP 8.1 ou superior com `pdo_pgsql`; PostgreSQL instalado; base `mca` e utilizador `mca_app` criados (`DEPLOYMENT.md` §3.1).
- [ ] `private/mca-config.php` preenchido **fora do `httpdocs`**, com `chmod 600`:
  - segredo novo, gerado no servidor;
  - `allowed_origins` e `site_url` com `https://mozcampadventures.co.mz`;
  - `cookie_secure = true`;
  - `mail.transport = 'resend'` e `mail.resend_key` com a chave do Resend (`NOTIFICACOES.md` §6.2).
- [ ] `private/storage` criada (permissões `750`).
- [ ] SSL activo e redireccionamento HTTP → HTTPS; host preferido sem `www`.

### Antes de usar a facturação a sério (não bloqueia o site)

- [ ] O contabilista valida uma pró-forma (`PF`) e um recibo de teste: dados fiscais, ISPC 3 % incluído e menções obrigatórias. **As facturas `FT` não podem ser apagadas, e o número usado fica na sequência.**
- [ ] Número e-Mola em *Definições → Instruções de pagamento*.
- [ ] DKIM, SPF e, opcionalmente, DMARC (`DEPLOYMENT.md` §3.1d). Teste real de recepção, a confirmar que não cai no spam.
- [ ] `upload_max_filesize = 8M` e `post_max_size = 12M` (comprovativos).
- [ ] Textos das páginas de Privacidade e Termos revistos (hoje são provisórios).

## 2. Publicação, passo a passo

Tempo estimado: 1 a 2 horas na primeira vez, incluindo a verificação.

1. **Backup** (§4) e anotar o nome do ficheiro de backup.
2. **Enviar o pacote para uma pasta nova ao lado da actual**, sem tocar no site em produção:
   - enviar `dist/httpdocs/` para `/var/www/vhosts/mozcampadventures.co.mz/httpdocs-novo/` (SFTP ou *File Manager*; com o *File Manager*, enviar um .zip e extrair lá);
   - enviar `dist/MANIFEST.sha256` para `/var/www/vhosts/mozcampadventures.co.mz/private/`.
3. **Confirmar a cópia** por SSH: `cd httpdocs-novo && sha256sum -c ../private/MANIFEST.sha256 --quiet`. Sem saída significa que todos os ficheiros chegaram intactos.
4. Copiar para `httpdocs-novo/` os ficheiros a manter, identificados no inventário (verificação do Google, `.well-known/`, etc.).
   **Depois da primeira publicação:** o catálogo editado no painel vive no servidor. Antes de gerar um pacote novo, trazer do servidor `data/*.json` e as fotos novas (`assets/images/packages/`, `assets/images/accommodation/`) para o computador de desenvolvimento, e só então correr o build e o `package.mjs`. Caso contrário, as edições do painel perdem-se.
5. **Base de dados:** `php httpdocs-novo/api/bin/migrate.php` e depois `--status` (aplica as migrações 001 a 008).
   **Node (catálogo no painel):** em `httpdocs-novo/`, `npm ci --omit=dev`, e `node_bin` na configuração (`DEPLOYMENT.md` §3.1f).
6. **Troca:** renomear `httpdocs` → `httpdocs-antigo` e `httpdocs-novo` → `httpdocs`. O site fica em baixo apenas alguns segundos, e a reversão é a troca inversa.
7. **Primeiros acessos ao painel:** `php httpdocs/api/bin/create-user.php …` para o Administrador e o Gerente (`DEPLOYMENT.md` §3.1b). Enviar cada link só à pessoa em causa.
8. **Verificação (§3).** Se algo crítico falhar e não se resolver em 15 minutos, reverter (§5).
9. Manter `httpdocs-antigo` pelo menos 2 semanas e só depois apagar.

## 3. Verificação depois de publicar

| # | Verificação | Esperado |
|---|---|---|
| 1 | `https://mozcampadventures.co.mz/api/health` | `{"ok":true,…,"db":true}` |
| 2 | `curl -sI https://mozcampadventures.co.mz/` | Cabeçalhos `Content-Security-Policy`, `Strict-Transport-Security` e `X-Content-Type-Options` presentes |
| 3 | `/`, `/en/`, uma experiência, um alojamento, contacto | Abrem sem erros na consola do browser (sobretudo sem «Content Security Policy») |
| 4 | `/pages/package.html?id=island-hopping-experience`, `/package.html?id=…`, `/pacotes.html`, `/alojamentos.html` | Redireccionam para as páginas novas |
| 5 | `/pagina-inexistente` | Página 404 do site |
| 6 | `/docs/`, `/data/tours.json`, `/api/src/`, `/package.json` | 403 ou 404 (nunca o conteúdo) |
| 7 | Pedido de reserva de teste (com o vosso e-mail) | Referência `MCA-…`, e-mail recebido em `booking@` e pelo cliente |
| 8 | Painel: entrar, abrir a reserva de teste, confirmá-la | Aviso «E-mail enviado ao cliente»; o cliente recebe o link da área do cliente |
| 9 | Pró-forma de teste e PDF | O PDF abre com o logótipo, o NUIT e os bancos correctos |
| 10 | Cancelar a reserva de teste | Fica registada como cancelada (não se apaga, por auditoria) |
| 11 | GTM em modo de pré-visualização | GA4 e Clarity disparam sem erros de CSP; não há tags «HTML personalizado» |
| 12a | Conta de cliente de teste em `/conta/`: criar, fazer um pedido com a sessão iniciada, «Esqueci-me da palavra-passe» | A conta abre logo; o pedido aparece na conta; o e-mail de reposição chega (e não vai para o spam) |
| 12 | Google Search Console | Submeter `sitemap.xml`; confirmar que não há erros de cobertura nos dias seguintes |

## 4. Plano de backup

| O quê | Como | Frequência | Retenção |
|---|---|---|---|
| Base de dados `mca` | *Backup Manager* do Plesk (agendado, inclui BD) | Diária | 30 dias |
| `private/storage` (PDFs de facturas e recibos, comprovativos) | O mesmo backup do Plesk (incluir a pasta `private`) | Diária | **Pelo menos 10 anos**, por ser arquivo fiscal (confirmar o prazo com o contabilista) |
| `httpdocs` | Backup do Plesk | Diária, e sempre antes de publicar | 30 dias |
| Antes de cada migração | `pg_dump -Fc -U mca_app mca > mca-AAAAMMDD.dump` | Pontual | Até à migração seguinte correr bem |

- **Cópia externa:** configurar no *Backup Manager* o armazenamento remoto (FTP, S3, Google Drive, etc.). Um backup só no próprio VPS não protege contra a perda do servidor.
- **Teste de restauro:** uma vez por trimestre, restaurar o dump mais recente para uma base temporária (`createdb mca_teste && pg_restore -d mca_teste …`) e confirmar que as facturas e os pagamentos lá estão. Um backup nunca restaurado não está verificado.
- `mca-config.php` (segredo e palavra-passe da BD): guardar uma cópia num gestor de palavras-passe, não no repositório.

## 5. Reversão

| Situação | Acção | Tempo |
|---|---|---|
| Site novo com problema grave logo após a troca | Renomear `httpdocs` → `httpdocs-falhado` e `httpdocs-antigo` → `httpdocs` | 1 min |
| Problema só na API ou no painel | O site público continua a funcionar sem a API (os formulários voltam ao WhatsApp e e-mail). Corrigir sem pressa ou repor o backup da BD | — |
| Migração falhou a meio | As migrações correm em transacção. Ver `--status`, corrigir e repetir; em último caso, `pg_restore -c` do dump feito antes | 5–15 min |
| Mais tarde (`httpdocs-antigo` já apagado) | Restaurar o `httpdocs` a partir do backup do Plesk; ou, com Git, `git checkout 9ef42a8 -- .` numa cópia, e publicar | 15–30 min |

**O que a reversão não desfaz:**
- e-mails já enviados a clientes;
- números de factura `FT` e de recibo `RC` já emitidos (a reversão do site não os apaga e a sequência continua);
- links da área do cliente já enviados (deixam de funcionar se a API for desligada, e voltam quando for reposta).

Ao reverter depois de haver reservas reais, **não restaurar a BD** para um ponto anterior sem exportar primeiro as reservas, facturas e pagamentos criados entretanto.

## 6. Depois da publicação (primeiras semanas)

- Painel → resumo: vigiar «E-mails falhados» (indica problemas de SPF/DKIM) e «Pagamentos por verificar».
- Search Console: cobertura e Core Web Vitals (dados reais; os valores do `RELATORIO_DE_TESTES.md` são de laboratório).
- Após 2 semanas sem problemas: apagar `httpdocs-antigo` e desactivar o projecto Firebase antigo.
