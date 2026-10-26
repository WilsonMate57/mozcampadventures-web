# Relatório de testes — Moz Camp Adventures

## Fase 8 — segurança, SEO, acessibilidade e desempenho (26/10/2026)

| Bateria | Resultado |
|---|---|
| `tests/audit.mjs` — SEO (64 páginas indexáveis), sitemap, 6119 ligações internas, axe-core (13 páginas), desempenho mobile | **sem falhas** |
| Regressão com a CSP aplicada: site sem API · site com API · API · painel e facturas · pagamentos · notificações · painel no browser | **43/43 · 44/44 · 43/43 · 51/51 · 44/44 · 28/28 · 33/33** |

**Total: 286/286 + auditoria sem falhas.** Saídas em `docs/*-resultado*.txt`, `docs/audit-resultado.txt` e `docs/AUDITORIA_TECNICA.json`.

Desempenho (Chrome, 375 px, 4G lenta simulada — 150 ms, 1,6 Mbit/s —, CPU 4× mais lenta, sem cache, GTM bloqueado):

| Página | LCP | FCP | CLS | Peso |
|---|---|---|---|---|
| `/` | 2,06 s | 1,63 s | 0 | 649 KB / 24 pedidos |
| `/tours/island-hopping-experience/` | 1,82 s | 1,80 s | 0 | 494 KB / 16 |
| `/pages/tours.html` | 1,59 s | 1,49 s | 0 | 675 KB / 17 |
| `/pages/contact.html` | 1,82 s | 1,58 s | 0 | 350 KB / 14 |

Os valores variam ±0,3 s entre corridas; todos ficaram abaixo do limiar «bom» do Google (LCP 2,5 s, CLS 0,1). São medições de laboratório num portátil, não dados de utilizadores reais (esses aparecem no Search Console depois de publicar).

Encontrado e corrigido:
1. **SEO:** fichas de experiências e alojamentos com o mesmo `<title>` em PT e EN (as categorias têm nome inglês nas duas línguas) → o título leva «Experiências»/«Experiences» ou «Alojamentos»/«Accommodation».
2. **SEO:** meta descriptions com mais de 200 caracteres (até 321) → cortadas numa palavra a 160 (o texto da página fica completo).
3. **Contraste:** etiqueta «Sobre nós» sobre a areia (4,44:1), números dos destinos (4:1 e 2,1:1) → cores com ≥ 4,8:1.
4. **Links nas páginas legais** só distinguidos pela cor → sublinhados.
5. **Ordem dos títulos** nos catálogos (h1 → h3) → `h2` «Resultados» para leitores de ecrã; **painel** sem `<main>` no ecrã de entrada → corrigido.
6. **Ambiente de testes:** o servidor de desenvolvimento não enviava a CSP nas páginas estáticas (o servidor embutido do PHP ignora cabeçalhos quando o router devolve `false`) → o router serve os ficheiros. Prova negativa: uma página com script inline foi bloqueada e a violação detectada.
7. **CSP vs. GTM:** o contentor GTM em produção carrega o Microsoft Clarity, que a primeira versão da política bloqueava (detectado pelo teste U18) → domínios do Clarity autorizados.

**Não testado:** a CSP no servidor real (Apache/nginx do Plesk) — ver a verificação pós-publicação em `DEPLOYMENT.md`; leitores de ecrã reais (o axe-core cobre cerca de metade dos critérios WCAG; o resto exige revisão manual); páginas do painel com sessão iniciada (o axe correu no ecrã de entrada).

---

## Fase 7 — notificações e área do cliente (26/10/2026)

| Bateria | Resultado |
|---|---|
| `tests/notifications.mjs` — notificações, registo e reenvio de e-mails, área do cliente | **28/28** |
| `tests/admin-ui.mjs` — painel e área do cliente no Chrome | **33/33** |
| Regressão: site sem API · site com API · API · painel e facturas · pagamentos | **43/43 · 44/44 · 43/43 · 51/51 · 44/44** |

**Total: 286/286.**

Destaques:
- Cada notificação no idioma da reserva.
- O resultado real é devolvido ao painel: uma falha de envio aparece como falha e a acção fica feita na mesma (N15).
- Reenvio honesto: um reenvio que falha continua «failed» (N17).
- Área do cliente:
  - link assinado;
  - acesso só aos documentos da própria reserva (C3, C5);
  - revogação (C8);
  - downloads auditados (C9);
  - 375 px sem scroll horizontal (U29).

Defeitos encontrados e corrigidos:
1. As consultas por POST (área do cliente, informação do comprovativo) respondiam `201 Created`; agora respondem `200`.
2. O e-mail de envio da factura estava só em português; agora segue o idioma da reserva.
3. O anexo da factura ia com os bytes em memória e não podia ser reenviado; agora vai por caminho, com verificação de integridade.

Ajuste nos testes: o `fetch` do Node tem um erro interno quando uma resposta não é lida e o servidor fecha a ligação. Os testes passaram a ler sempre o corpo.

**Não testado:** entrega real de e-mail (Postfix, SPF/DKIM). Ver `DEPLOYMENT.md` §3.1d.

---

## Fase 6 — pagamentos e recibos (26/10/2026)

| Bateria | Resultado |
|---|---|
| `tests/payments.mjs` — pagamentos, recibos, comprovativos (API + BD) | **44/44** |
| `tests/admin-ui.mjs` — painel e página do cliente no Chrome | **27/27** (2 corridas seguidas) |
| Regressão: site sem API · site com API · API · painel e facturas | **43/43 · 44/44 · 43/43 · 51/51** |

**Total: 252/252.** As saídas estão em `docs/*-resultado*.txt`.

**Cenários do caderno de encargos:**

| Cenário | Resultado |
|---|---|
| A — Factura de 30.000, pagamento confirmado de 10.000 | «Parcialmente pago», saldo 20.000, recibo RC emitido ✅ |
| B — Mais 20.000 confirmados | «Pago», saldo 0; o recebido no resumo aumenta exactamente 30.000 ✅ |
| C — Comprovativo por verificar | A factura **não** passa a «Pago»; depois de confirmado, passa ✅ |
| D — Pagamento duplicado | Mesma transacção recusada (409), incluindo envios simultâneos ✅ |
| E — Reversão / reembolso | Estado recalculado; pagamento «revertido» e recibo «anulado» com motivo e autor; nada apagado ✅ |
| F — Acesso indevido | Sem sessão → 401; link de outra factura → 404; link antigo invalidado ✅ |

**Defeito encontrado pelos testes e corrigido:** um pagamento acima do saldo com «confirmar» ficava gravado como «em verificação» (registo órfão). Agora o saldo é validado antes de gravar. Numa corrida rara, o registo é recusado automaticamente com o motivo. Testes B4 e D5.

**Verificação visual:** recibo renderizado (`docs/visual-review/depois/recibo-exemplo.png`), página do cliente e factura paga (`docs/visual-review/painel/09–11`).

**Não testado:** envio real de e-mail; upload no servidor Plesk com o limite de PHP configurado (ver `DEPLOYMENT.md` §3.1c).

---

## Fase 5 — painel e facturação (26/10/2026)

Mesmo ambiente de desenvolvimento da Fase 4: PHP 8.2 + PostgreSQL 16, e-mails em modo `log`, sem dados reais.

| Bateria | Resultado | Saída |
|---|---|---|
| `tests/admin.mjs` — painel e facturação (API + BD) | **51/51** | `docs/admin-resultado.txt` |
| `tests/admin-ui.mjs` — painel no Chrome (1366 e 375 px) | **19/19** (3 corridas seguidas) | `docs/admin-ui-resultado.txt` |
| Regressão: API / site com API / site sem API | **43/43 · 44/44 · 43/43** | `docs/*-resultado*.txt` |

**Total: 200/200.**

Coberto:
- **Autenticação:** link de configuração de uso único, palavra-passe fraca recusada, cookie `HttpOnly` + `SameSite=Strict`, CSRF, Origin, força bruta → 429, logout.
- **Permissões:**
  - o Gerente não vê utilizadores nem definições;
  - o perfil Administrador não é editável;
  - permissões desconhecidas são ignoradas;
  - tem de existir sempre um administrador activo;
  - o Administrador atribui «anular» ao Gerente e o efeito é imediato.
- **Reservas no painel:** pedido manual (WhatsApp) com preço do servidor, pesquisa por referência e por nome, transições de estado válidas e inválidas, motivo obrigatório para cancelar, notas e histórico.
- **Facturação:**
  - rascunho a partir da reserva; desconto, com valores recalculados no servidor; total negativo e NUIT inválido recusados;
  - emissão com número `FT-AAAA/NNNN`, cópia dos dados da empresa e de pagamento, PDF com SHA-256;
  - PDF só com sessão;
  - imutabilidade pela API **e** pela base de dados (UPDATE e DELETE recusados);
  - anulação com motivo e permissão; anulada é definitiva;
  - 10 emissões simultâneas com números únicos e consecutivos; duas emissões do mesmo rascunho dão uma emitida e um 409;
  - série PF separada;
  - envio ao cliente com o estado real registado;
  - PDF alterado no disco é detectado;
  - reserva cancelada não pode ser facturada.
- **Definições e auditoria:** NUIT validado, actualização dos métodos de pagamento, auditoria completa e só de acréscimo.
- **Interface:** fluxo completo como utilizador (definir palavra-passe → entrar → pedido de WhatsApp → confirmar → factura com desconto → emitir → PDF), menus por perfil, acesso directo negado, mobile a 375 px sem zoom nem scroll horizontal, zero erros de JavaScript.

Defeitos encontrados pelos testes e corrigidos:
1. O perfil Gerente não podia ser editado: o PHP devolve `false` para a coluna booleana `is_system`, e isso era confundido com «perfil não encontrado».
2. O painel em mobile ficava com 577 px de largura (a tabela de facturas alargava a grelha). O teste U15 foi reforçado para detectar este caso.
3. **Corrida no painel:** uma resposta atrasada do resumo desenhava-se por cima da página seguinte. Agora as respostas de páginas abandonadas são descartadas, e o teste U17b provoca a corrida de propósito.
4. Na composição do PDF havia sobreposições («Referência da reserva», «Total a pagar», caixa do cliente) e o travessão era medido com a largura errada.

Verificação visual: PDF renderizado com pdf.js (`docs/visual-review/depois/factura-exemplo.png`) e capturas do painel em `docs/visual-review/painel/`.

Não testado: envio real de e-mail com anexo (Postfix do Plesk) e abertura do PDF em leitores de terceiros (Adobe, Preview).

---

## Fase 4 — API e base de dados (26/10/2026)

Ambiente: PHP 8.2.35 + PostgreSQL 16.4 portáteis, base de **desenvolvimento** `mca` (porta 55432), e-mails em modo `log` (não enviados). Nenhum dado de produção foi usado.

| Bateria | Resultado | Saída |
|---|---|---|
| `tests/api.mjs` — API e BD | **43/43** | `docs/api-resultado.txt` |
| `tests/e2e.mjs` — site **com** API | **44/44** | `docs/e2e-resultado-api.txt` |
| `tests/e2e.mjs` — site **sem** API (fallback) | **43/43** | `docs/e2e-resultado.txt` |

Cobertura da API:
- referência `MCA-AAAA-NNNNN`;
- total recalculado no servidor, ignorando o valor do browser;
- idempotência e 20 pedidos simultâneos com referências únicas e consecutivas;
- todas as regras de negócio (mínimos, noites, capacidade, datas, desactivados, opções inválidas, preço por barco e por villa, escalões de noites, extras por pessoa, linhas em EN);
- segurança: origem, Content-Type, honeypot, JSON inválido, injecção SQL, limite por IP;
- contacto; avaliações (pendente não aparece, aprovada aparece com média);
- integridade da BD: histórico e registo de e-mails só de acréscimo, IP nunca em claro, e-mails registados por pedido.

Cobertura do site com API: o pedido mostra a referência e o total do servidor, o botão de WhatsApp leva a referência, o contacto é enviado pelo site e as avaliações só aparecem se houver aprovadas. Sem API, o pedido e o contacto voltam ao envio directo por WhatsApp/e-mail.

Problemas encontrados e corrigidos:
- A extensão `mbstring` foi bloqueada pela política de controlo de aplicações do Windows. O código deixou de depender dela, o que também simplifica o servidor.
- Três falhas eram dos testes, não do código: um nome de teste demasiado curto (R3), uma expectativa que assumia a BD vazia (T) e o limite de mensagens esgotado de propósito por L1. Os testes foram corrigidos para não dependerem do estado.

Não testado nesta fase: envio real de e-mail (Postfix do Plesk), comportamento em Apache/nginx reais e carga.

---

## Fase 3 — site estático

Actualizado: Fase 3 (26/10/2026). Ambiente: Windows 11, Node 24, Chrome headless (CDP), servidor estático local. **Nenhum teste tocou em dados de produção.** Os testes automáticos bloqueiam a rede externa (GTM, Firebase, Maps).

## 1. Testes funcionais automáticos — `tests/e2e.mjs`

**Resultado: 41/41 passaram** (saída completa em `docs/e2e-resultado.txt`).

| Área | Testes | O que é verificado |
|---|---|---|
| Cálculo de tours | A–F | Preço por adulto, crianças, barco privado que substitui o preço por pessoa, extras por pessoa, limite de capacidade do barco, botão «+» desactivado |
| Validação | G, G2 | Data/nome/telefone obrigatórios; nada é enviado com campos em falta |
| **Mínimo de participantes (bloqueante)** | H, H2, I2 | Começa no mínimo (Ponta D'Ouro, 3); abaixo do mínimo o pedido **não é enviado** e aparece a mensagem; no mínimo abre o WhatsApp com o total correcto |
| Transfers | I, J | Transfer próprio do JSON (Ponta D'Ouro 14.000) e transfer por omissão (25.000) |
| Preço por grupo | K | Aluguer de barco privado = 8.000 MZN por barco, independentemente do nº de pessoas (antes multiplicava por adulto) |
| Pacote desactivado | L | Tofo: sem formulário e com `noindex` |
| **Alojamentos** | M–M4, N–N3, O | 1 noite; 2 noites com a **tarifa publicada** (24.400, não 2 × 14.900); crianças; 3 noites → «a confirmar»; Villa Martins com mínimo de 2 noites (saída automática e bloqueio abaixo do mínimo); Cabo Beach por villa por noite |
| Catálogo | P–S | `?cat=`, pesquisa sem acentos, ordenação por preço, desactivados ocultos, `?loc=` nos alojamentos |
| Home / SEO | T–T3 | Um só `<h1>`, 6 destaques, secção de avaliações escondida sem avaliações; canonical/hreflang em `.co.mz`; JSON-LD válido |
| Idiomas | U, W | Página EN com `lang=en` e formulário em inglês; mudar de idioma mantém o filtro |
| URLs antigos | V, V2 | `pages/package.html?id=…` (PT e EN) redireccionam para a nova página |
| Contacto | X, X2 | 4 campos validados; mensagem válida abre o WhatsApp |
| Cookies | Y, Y2 | Banner na 1.ª visita; «Aceitar tudo» esconde o banner e guarda a escolha |
| Sitemap / JS | Z, Z2 | 64 URLs, sem desactivados nem `.com`; zero erros de JavaScript |

Problemas encontrados e corrigidos durante os testes:
- O `site.js` corria tarde porque o CSS do Bootstrap (CDN) bloqueava a página. Retirei o Bootstrap CSS (o novo design não usa classes dele) e acrescentei um reset mínimo ao `site.css`.
- Dois testes estavam errados, não o código: o Ponta D'Ouro tem transfer próprio no JSON, e o teste de idioma lia a página a meio da navegação. Ambos foram corrigidos.

## 2. Responsividade (scroll horizontal)

Sem scroll horizontal em **todas** as combinações medidas: home, catálogo, pacote, alojamentos, alojamento, contacto e pacote EN × **360, 375, 768, 1024, 1366 e 1920 px**. Também verificado: privacidade e 404 a 375 e 1366 px.
Corrigido durante a verificação: o mapa da página de contacto transbordava a 375 px.

## 3. Comparação antes/depois (`docs/visual-review/antes/` vs `depois/`)

Peso transferido por página (todas as imagens carregadas, nas mesmas condições):

| Página | Ecrã | Antes | Depois | `<h1>` |
|---|---|---|---|---|
| Home | 1366 | 5,11 MB | 1,35 MB | 5 → 1 |
| Home | 375 | 4,99 MB | 0,70 MB | 5 → 1 |
| Tours | 1366 | 6,63 MB | 0,96 MB | 1 → 1 |
| Tours | 375 | 6,63 MB | 0,82 MB | 1 → 1 |
| Pacote | 1366 | 4,91 MB | 0,66 MB | 1 → 1 |
| Pacote | 375 | 4,91 MB | 0,62 MB | 1 → 1 |
| Alojamentos | 1366 | 6,59 MB | 0,77 MB | 3 → 1 |
| Alojamentos | 375 | 6,59 MB | 0,60 MB | 3 → 1 |
| Contacto | 1366 | 1,86 MB | 0,41 MB | 1 → 1 |
| Home EN | 375 | 5,06 MB | 0,86 MB | 5 → 1 |

Inspeccionei visualmente as capturas da home, do catálogo, do pacote, do alojamento e do contacto (1366, 375 e 1024 px).

## 4. Não executado / limitações

- **Lighthouse / Core Web Vitals** em rede real: não medido. Fica para a Fase 8, no servidor de testes.
- **Safari/iOS, Firefox, leitor de ecrã real:** não testados.
- **Avaliações (Firestore):** os testes automáticos bloqueiam o Firebase. Nas capturas com rede, as avaliações carregam: a de teste "Wilson Mate" aparece porque está aprovada no Firestore (ver pendências).
- **Envio real de WhatsApp/e-mail:** verificado o URL gerado, não o envio.
- **Fases 4–7 (reservas no servidor, facturação, pagamentos):** ainda não implementadas; os cenários financeiros A–F do caderno de encargos serão testados nessas fases.
- O mapa do Google não aparece nas capturas headless (carregamento diferido do iframe).
