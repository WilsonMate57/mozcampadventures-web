# Moz Camp Adventures — documentação

Site público, painel de gestão, facturação, pagamentos e notificações de **mozcampadventures.co.mz**. Estado em 26/10/2026: **fases 1 a 10 concluídas no ambiente local; nada foi publicado nem enviado para o Git** (aguarda autorização).

## Índice

| Documento | Para quê |
|---|---|
| [AUDITORIA_INICIAL.md](AUDITORIA_INICIAL.md) | Diagnóstico do site original, decisões tomadas (§7.0) e plano por fases |
| [REDESIGN_E_UI_UX.md](REDESIGN_E_UI_UX.md) | Direcção visual, protótipo e defeitos do site antigo resolvidos |
| [ARQUITECTURA.md](ARQUITECTURA.md) | Visão geral, API, modelo de dados, migrações |
| [FACTURACAO.md](FACTURACAO.md) | Facturas (FT), pró-formas (PF), numeração e PDF |
| [PAGAMENTOS.md](PAGAMENTOS.md) | Estados calculados, comprovativos, confirmação, recibos (RC), reversões |
| [NOTIFICACOES.md](NOTIFICACOES.md) | E-mails automáticos, registo e reenvio, área do cliente, ticket com QR |
| [PAINEL.md](PAINEL.md) | Painel de administração: sistema visual, resumo por período, reservas, pesquisa global, testes e limitações |
| `/holiday-packages/` | Catálogo de pacotes de férias (EN): conteúdo em `data/holiday-packages.json`; ver `RELATORIO_DE_TESTES.md` (02/11/2026) |
| [DISPONIBILIDADE.md](DISPONIBILIDADE.md) | Calendário, capacidade, sessões, bloqueios e prevenção de sobre-reservas |
| [LIVE_CHAT.md](LIVE_CHAT.md) | Live Chat: atendimento, disponibilidade da equipa, mensagens offline, ficheiros, retenção e carga |
| [WHATSAPP.md](WHATSAPP.md) | WhatsApp Business: credenciais, webhook, modelos a aprovar, tarefa agendada e estados das mensagens |
| [CATALOGO.md](CATALOGO.md) | Pacotes, preços, regras, textos PT/EN e fotos editados no painel: rascunho, publicação, versões anteriores |
| [CONTAS_DE_CLIENTE.md](CONTAS_DE_CLIENTE.md) | Contas de cliente no site (activas logo após o registo), reservas da conta, promoções, segurança |
| [SEGURANCA.md](SEGURANCA.md) | Medidas de segurança por área, CSP e gestão de segredos |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Gerar o site, testar, configurar o Plesk, nginx, ambiente de desenvolvimento |
| [PUBLICACAO.md](PUBLICACAO.md) | **Checklist, publicação passo a passo, backups e reversão** |
| [RELATORIO_DE_TESTES.md](RELATORIO_DE_TESTES.md) | Resultados de cada fase, defeitos encontrados e o que não foi testado |
| `AUDITORIA_TECNICA.json`, `*-resultado*.txt` | Saídas brutas da última execução dos testes |
| `visual-review/` | Capturas antes/depois, painel, exemplos de factura e recibo (dados fictícios) |

## Comandos essenciais

```
npm install                       # uma vez (sharp e axe-core, só para desenvolvimento)
node scripts/build.mjs            # gera as páginas a partir de data/*.json e scripts/i18n.mjs
node tests/e2e.mjs                # testes do site (mais as baterias com API: DEPLOYMENT.md §2)
node tests/audit.mjs              # SEO, links, acessibilidade, desempenho
node scripts/package.mjs          # prepara dist/httpdocs para publicar (não publica)
```

## Relatório final

### O que foi entregue

| Fase | Resultado |
|---|---|
| 1. Auditoria | Diagnóstico completo e plano |
| 2–3. Redesign e site | 78 páginas geradas (PT/EN): página própria por experiência e por alojamento, URLs antigos preservados com redireccionamento, peso das páginas reduzido 75–90 % |
| 4. API e base de dados | PHP 8.1 + PostgreSQL: pedidos de reserva com preço recalculado no servidor, mínimos de participantes, contacto, avaliações geridas no site (sem Firebase) |
| 5. Painel e facturação | Perfis Administrador/Gerente com permissões atribuíveis, reservas, facturas FT e pró-formas PF com PDF próprio, auditoria |
| 6. Pagamentos | Estado «Pago» calculado a partir de movimentos confirmados; comprovativos, confirmação, recibos RC automáticos, reversões e reembolsos |
| 7. Notificações | E-mails PT/EN com resultado real (enviado/falhado), reenvio, área do cliente com link assinado e revogável |
| 8. Qualidade | CSP sem scripts inline, recursos alojados no site, SEO, acessibilidade (axe-core sem violações nas 13 páginas testadas), LCP < 2,5 s em mobile 4G (laboratório) |
| 9. Testes e documentação | 286 testes automáticos + auditoria; esta documentação |
| 10. Publicação | Pacote (`scripts/package.mjs`) com manifesto SHA-256, checklist, plano de backup e de reversão — **por executar** |

### Testes (última execução: 26/10/2026)

**286/286** testes funcionais em 7 baterias, mais a auditoria técnica sem falhas. O detalhe está em `RELATORIO_DE_TESTES.md`. Todos os testes correram num ambiente local (PostgreSQL e PHP de desenvolvimento, e-mail em modo registo); nenhum tocou em dados ou serviços de produção.

**Não testado** (só é possível no servidor real ou com pessoas):
- entrega real de e-mail (SPF/DKIM);
- CSP e cabeçalhos servidos pelo Apache/nginx do Plesk;
- limites de upload do PHP no Plesk;
- desempenho com utilizadores reais;
- leitores de ecrã reais;
- validação fiscal dos documentos por um contabilista.

### Pendências que dependem de si

1. **Autorização para publicar** (e para o commit/push no Git).
2. **Número e-Mola** para as instruções de pagamento.
3. **Contabilista:** validar a factura, o recibo e o tratamento do ISPC 3 %, e o prazo de arquivo dos PDFs.
4. **Textos legais** (Privacidade, Termos): os actuais são provisórios.
5. **Nomes das categorias em PT:** continuam em inglês, como no site original («Island Tours», «Ocean Activities»…). Confirmar se é intencional (marca) ou se devem ser traduzidos.
6. **Foto de snorkeling de origem duvidosa (D15):** já não é usada no site; confirmar se pode ser apagada.
7. **Resend e WhatsApp:** criar as contas, verificar o domínio no Resend, aprovar o modelo `nova_reserva` na Meta e colocar as chaves no servidor (`NOTIFICACOES.md` §6).
8. Configurações do Plesk listadas em `PUBLICACAO.md` §1, mais o Node.js para publicar o catálogo a partir do painel (`DEPLOYMENT.md` §3.1f).
