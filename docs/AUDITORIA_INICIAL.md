# Auditoria Inicial — Moz Camp Adventures

**Data:** 26/10/2026 · **Âmbito:** repositório `MCA` (commit `9ef42a8`, branch `main`) · **Fase:** 1 — Auditoria (nenhum ficheiro do site foi alterado)

Evidências geradas nesta fase:
- Capturas do estado actual em `docs/visual-review/antes/` (1366 px e 375 px; home, tours, pacote, alojamentos, contacto, home EN).
- Métricas por página em `docs/visual-review/antes/report.json` (altura, scroll horizontal, número de `<h1>`, imagens sem `alt`, peso transferido, erros de consola).

> Nota sobre as capturas: o conteúdo com a classe `.reveal` fica com opacidade 0 até o scroll o activar. Para as capturas de página inteira foi forçada a revelação e escondido o banner de cookies. Numa primeira captura sem isso, metade da home aparecia vazia (ver §2.4).

---

## 1. Diagnóstico técnico

### 1.1 Arquitectura actual

| Camada | O que existe |
|---|---|
| Alojamento | Vercel (`vercel.json` só com cabeçalhos de cache). Não há pasta `.vercel` nem CI no repositório: **o processo de publicação não está documentado** (Git ligado ao Vercel? CLI?). |
| Front-end | HTML estático + Bootstrap 5.3.3 (CDN) + Boxicons 2.1.4 (CDN) + CSS próprio + JavaScript sem framework. Inter + Dancing Script (Google Fonts). Lottie (CDN) para o preloader. |
| Componentes | `components.js` injecta via `fetch` a navbar, o rodapé e o banner de cookies (`components/` e `en/components/`). |
| Dados | `data/tours.json` (22 itens, 2 desactivados), `data/accommodations.json` (8), `data/en.json` (sobreposição de traduções por `id`). Renderização no cliente por `data-loader.js`. |
| Idiomas | Árvore duplicada: `/` (PT) e `/en/` (EN), com HTML próprio por idioma + `en.json` para os dados. |
| Back-end | **Nenhum servidor próprio.** Único serviço com escrita: **Firebase Firestore** (projecto `moz-camp-adventures`), usado só para avaliações (`reviews`), escritas directamente pelo browser. |
| E-mail | EmailJS no cliente, mas **com chaves por preencher** (`YOUR_PUBLIC_KEY`, etc.). |
| Analytics | GTM `GTM-MQ73VSS3` + Consent Mode v2 (`consent.js`) + eventos próprios (`analytics.js`). Está bem implementado. |
| Ferramentas | `package.json` só tem `sharp` (devDependency, para optimizar imagens). Não há testes, linter nem build. |

### 1.2 Páginas existentes

| URL | Função |
|---|---|
| `/index.html`, `/en/index.html` | Home: hero com 5 slides, sobre, categorias, avaliações, 2 alojamentos em destaque |
| `/pages/tours.html` | Catálogo com separadores por categoria e `?cat=` |
| `/pages/package.html?id=<slug>` | Detalhe do tour ou do alojamento (página única, preenchida por JS) + simulador de preço + reserva |
| `/pages/accommodations.html` | Alojamentos (`?loc=`) |
| `/pages/contact.html` | Contactos, mapa, formulário |
| `/package.html`, `/pacotes.html`, `/alojamentos.html` | Redireccionamentos legados (meta refresh + JS). **Preservar.** |
| — | **Não existem:** galeria, destinos, política de privacidade, termos, página 404, área de cliente, painel de administração. |

### 1.3 Catálogo real (fonte: `data/*.json`)

- **Island tours:** Island Hopping, Ilha dos Portugueses BBQ, Ilha dos Portugueses + Farol, Santa Maria Snorkeling, Inhaca Cultural.
- **Sunset cruises:** Maputo Bay Sunset Cruise, Sunset Dinner & DJ, Xefina Island Cruise.
- **Beach tours:** Ponta D'Ouro, Macaneta, Bilene, Tofo *(desactivado)*, Vilanculos *(desactivado)*.
- **Safaris:** Kruger, Parque Nacional de Maputo, Reino de Eswatini.
- **Ocean activities:** Whale watching, Deep-sea fishing, Aluguer de barco privado.
- **City tour:** Maputo City Tour. **Transfers:** Aeroporto–Hotel, Hotel–Marina.
- **Alojamentos (Inhaca/Machangulo):** Machangulo Beach Lodge, Mama's Lodge, Manico Camp, Villa Martins, Mad Marlin, Khanimambo Lodge, Cabo Beach Villas, Bemugis Lodge.
- Todos os preços estão em MZN e todos os itens têm tradução em `en.json`. Não falta nenhuma imagem referenciada.

---

## 2. Inventário funcional

### 2.1 Operacional ✅
- Navegação, menu mobile, pesquisa global (normaliza acentos e ignora pacotes desactivados).
- Catálogo por categorias e detalhe do pacote: galeria, lightbox, itinerário, inclui/exclui, menus, informação importante.
- **Simulador de preço** (adultos, crianças, extras por pacote, barco privado, transfer privado) → **mensagem de WhatsApp pré-preenchida** com o pacote, a data, os participantes e o total estimado, para `+258 84 440 6543` (número correcto e igual em todo o site).
- Selector PT/EN, dados traduzidos via `en.json`.
- Avaliações via Firestore: lidas só se `approved == true`; as submetidas entram com `approved: false`.
- Banner de cookies + Consent Mode v2 + GTM/GA4 com um catálogo de eventos útil.
- Popup promocional configurável (actualmente `enabled: false`).
- Sem scroll horizontal a 1366 px e 375 px nas 6 páginas testadas.

### 2.2 Defeituoso ou incompleto ⚠️
| # | Problema | Evidência |
|---|---|---|
| D1 | **Formulário de contacto não envia**: EmailJS com chaves por preencher. O utilizador recebe um `alert` de erro ou, pior, perde a mensagem. | `pages/contact.html:316`, `en/pages/contact.html:313` |
| D2 | **Separador "Contacto"/pedido por e-mail na página do pacote não envia**, pelo mesmo motivo. | `pages/package.html:512` |
| D3 | **Vídeo de testemunho em falta** (`assets/videos/depoimento.mp4` dá 404). O botão de play na home abre um modal vazio. | consola, home/alojamentos |
| D4 | **Classificações inventadas**: cartões sem avaliações mostram 5 estrelas por omissão (`reviews.js`: "No reviews → 5 filled stars"; `data-loader.js` usa `pkg.stars`). | `assets/js/reviews.js` `updateCardCounts` |
| D5 | **Testemunho público assinado por "Wilson Mate"** (o nome do autor do repositório) na home, vindo do Firestore. Parece um teste aprovado em produção. | captura `home-desktop.png` |
| D6 | Números contraditórios na secção "Sobre": "Mais de 5 anos" vs "10+ anos"; "Mais de 1.000 viajantes" vs "5k+". | `index.html:147-166` |
| D7 | Links mortos: "Política de Privacidade" e "Termos & Condições" (`href="#"`); "Contacto" no rodapé aponta para `index.html#footer`; "Aloj. nas Ilhas" aponta para `tours.html?cat=island-accommodation`, um separador que não existe. | `components/footer.html` |
| D8 | Pacotes desactivados (Tofo, Vilanculos) continuam acessíveis por URL directo e reserváveis. | `getPackageBySlug` não verifica `disabled` |
| D9 | O simulador permite 1 adulto, mas a informação de Ponta D'Ouro, Macaneta e Bilene indica um mínimo de 3 ou 4 participantes. | `data/tours.json` `importantInfo` |
| D10 | Texto PT em páginas EN: "A partir de:" nos cartões, mensagens das avaliações, "Incluído", "tudo incluído", "Seleccionado", "fotos". | `data-loader.js:156`, `packages-extras.js`, `reviews*.js` |
| D11 | Promessa "Confirmação em minutos via WhatsApp" — compromisso operacional por confirmar. | `pages/package.html:315` |
| D12 | Domínio de e-mail inconsistente: contacto usa `info@mozcampadventures.com`; rodapé usa `@mozcampadventures.co.mz` (info/booking/quotes). | — |
| ~~D13~~ | ~~Cartões de alojamento da home sem imagem.~~ **Descartado:** era um artefacto da captura headless (imagens `loading="lazy"` não pedidas). Com carregamento forçado, todas as imagens carregam e não há imagens partidas. | `antes/home-desktop.png` (recapturado) |
| D14 | Os botões "Viator", "Tripadvisor" e "GetYourGuide" da secção de avaliações apontam para as páginas iniciais desses sites, não para o perfil da empresa. | `index.html` |
| D15 | `hero_slider_1.webp` (snorkeling, usado no banner de Tours) tem aspecto de fotografia de banco de imagens. **Confirmar a origem e a licença.** | `pages/tours.html` |

### 2.3 Em falta ❌
- **Sistema de reservas com persistência.** Hoje uma "reserva" é apenas uma conversa de WhatsApp. Não há registo, **não há referência de reserva**, não há estados nem confirmação ao cliente.
- **Painel de administração, autenticação e permissões.**
- **Facturação, registo de pagamentos e controlo financeiro.**
- Notificações por e-mail (nenhum envio funciona).
- Área de cliente.
- Páginas legais, 404, `robots.txt`, `sitemap.xml`, `canonical`, `og:image`, dados estruturados.

### 2.4 Problemas técnicos transversais
- **SEO:** todos os pacotes partilham um único URL (`package.html?id=…`) com título, descrição e conteúdo gerados no browser. Os 30 produtos são praticamente invisíveis para os motores de pesquisa e para as pré-visualizações em redes sociais. A home tem **5 `<h1>`** e alojamentos tem 3.
- **Conteúdo dependente de JS e de scroll:** as secções `.reveal` começam invisíveis. Se o JS falhar ou o crawler não fizer scroll, o conteúdo não aparece.
- **Desempenho:** o peso transferido por página varia entre ~1,9 MB e **~6,7 MB** (alojamentos). Há imagens pesadas: `mad_marlin_4.webp` com 2,6 MB, `island-hopping-2.jpg` com 1,4 MB (JPG usado pelo Island Hopping), e `marine-bg.webp` (1,1 MB) como fundo repetido do `body`. O preloader Lottie atrasa a primeira visualização (mínimo de 700 ms). Os componentes são injectados por `fetch`, o que faz a navbar "piscar" e atrasa o LCP.
- **Código morto ou duplicado (publicado em produção):**
  - `tours.json`, `accommodations.json` e `en.json` na raiz são **cópias antigas com preços desactualizados** (ex.: Island Hopping 5.500 vs 6.000 MZN) e incluem a promoção expirada "Dia da Mulher". O código usa `data/`, mas estes ficheiros estão acessíveis publicamente.
  - `settings.json` na raiz (permissões locais do Claude, com caminhos do disco) e `moz_camp_adventures.md` também são publicados.
  - JS não usado: `script.js`, `packages-data.js`. CSS não usado: `style.css`, `components.css`, `base.css` (vazio), `pages/alojamentos.css`. Preloader duplicado (`assets/images/preloader/summer_vibes.json`). Fontes Pantherdam não usadas. Imagens JPG com equivalente WebP.
  - `MCA.zip` e `` `mozcamp.zip `` (75 MB) estão na pasta. O `.gitignore` exclui-os do Git, mas **seriam enviados num deploy feito pela CLI do Vercel** (não há `.vercelignore`).
- **Preços duplicados no JS:** `packages-transfer.js` tem preços fixos de transfer (25.000 / 30.000 MZN) fora do JSON. `packages-extras.js` contém listas globais com preços (Privada +5.000, Premium +10.000, Fotógrafo 3.000…) que hoje não são usadas, mas são uma armadilha.
- **Design tokens:** existem 8 variáveis em `main.css`, mas há 160+ cores fixas no CSS (`#fff`, `#888`, `#2d9a27`…). Os valores **diferem da paleta de referência**: `--teal: #00C4B4` (referência `#00c6c1`) e `--orange: #FFA500` (referência `#ff9a08`). `#3c9bb6`, `#ffbe06`, `#353535` e `#7f7f7f` não existem como tokens. Os títulos do hero usam Dancing Script (cursiva), não Inter.
- **Segurança:** a chave Firebase web é pública por natureza (normal). **As regras do Firestore não estão no repositório**, por isso não é possível confirmar que só se pode criar avaliações com `approved: false`, nem que não se pode ler/alterar outras colecções. Não há App Check nem limite de submissões (risco de spam). Faltam cabeçalhos de segurança (CSP, `X-Content-Type-Options`, `Referrer-Policy`) no `vercel.json`.

---

## 3. A preservar · melhorar · implementar

**Preservar:** stack HTML/Bootstrap/JS/JSON; Inter + Boxicons; JSON como fonte do catálogo; URLs actuais (incluindo os 3 redireccionamentos legados e `?cat=`, `?id=`, `?loc=`); fluxo de WhatsApp com mensagem pré-preenchida; GTM + Consent Mode + catálogo de eventos; avaliações com moderação; fotografias reais existentes.

**Melhorar:** redesign visual (§4); SEO dos pacotes; desempenho das imagens; tradução EN completa; consistência de dados (mínimos de participantes, contactos, números "Sobre"); limpeza de ficheiros mortos; design tokens.

**Implementar de raiz** (não há nada a reaproveitar): pedido de reserva persistido com referência; painel admin com autenticação; facturação; pagamentos; notificações por e-mail; páginas legais; 404; sitemap/robots.

---

## 4. Proposta de redesign

### 4.1 Diagnóstico visual do estado actual
O site está limpo, mas tem um ar de template. O hero é um carrossel genérico com tipografia cursiva centrada. As secções alternam blocos turquesa sólidos com um padrão marinho de fundo, o que cansa a vista. As categorias aparecem como uma grelha de 6 fotografias com um rótulo. O detalhe do pacote é longo, com muitos cartões brancos idênticos empilhados, e o preço tem pouca hierarquia. O mobile é a versão desktop empilhada (a página de tours tem 6.184 px de altura).

### 4.2 Direcção criativa: «Editorial do Índico»
Uma linguagem de revista de viagens: fotografia real em grande formato, tipografia Inter forte e muito espaço. O turquesa fica como cor de acção e de identidade, não como fundo de secções inteiras.

Mudanças concretas, perceptíveis para quem já conhece o site:
1. **Hero:** sai o carrossel de 5 slides. Entra uma composição estática de impacto: fotografia real em ecrã inteiro, título em Inter Extra Bold alinhado à esquerda (sem cursiva) e uma **barra de procura de experiências** sobreposta (tipo de experiência · data · pessoas → catálogo filtrado). As restantes fotografias passam para uma faixa de "experiências em destaque".
2. **Navegação:** navbar renderizada no HTML (sem `fetch`, sem "piscar"), mega-menu com as categorias e uma miniatura cada, botão "Reservar" sempre visível e, em mobile, uma barra inferior fixa (Explorar · WhatsApp · Reservar).
3. **Home reorganizada:** experiências por categoria num **mosaico editorial assimétrico** (bloco grande de Island Tours + blocos menores); faixa "Porquê a Moz Camp" com factos confirmados; destaque de destinos (Inhaca, Ilha dos Portugueses, Santa Maria, Machangulo) com mapa ilustrado simples em SVG; avaliações reais; CTA final.
4. **Cartões de experiência novos:** imagem 4:3, chips de duração e local, **preço com unidade clara** ("6.000 MZN / adulto"), avaliações só quando existirem (**fim das 5 estrelas por omissão**) e etiquetas de categoria com cor.
5. **Página do pacote reestruturada:** galeria em mosaico (1 grande + 4); barra de "factos rápidos" (duração · local · mínimo de pessoas · idade · cancelamento); conteúdo em secções ancoradas com navegação fixa (Visão geral · Itinerário · Inclui · Informação importante · Avaliações); itinerário em linha temporal vertical; **painel de reserva por passos** (data → pessoas → extras → dados → resumo) com o aviso explícito "Pedido sujeito a confirmação da equipa".
6. **Catálogo:** filtros em chips com contagem, ordenação por preço e duração, grelha responsiva e, em mobile, filtros num bottom sheet.
7. **Rodapé** mais compacto: uma morada (hoje repetida 3×), contactos por finalidade, métodos de pagamento e links legais reais.
8. **Design system** documentado: tokens de cor (paleta de referência + neutros + estados), escala tipográfica fluida (`clamp`), espaçamentos em escala de 4, raios, sombras discretas, botões, campos, cartões, modais, toasts e skeletons de carregamento.
9. **Movimento:** as animações de entrada passam a ser opcionais. O conteúdo é visível por omissão e há `prefers-reduced-motion`. O preloader Lottie é removido.

Antes de aplicar a direcção visual a todo o site, proponho entregar um **protótipo da home e da página de pacote** (desktop + mobile) para aprovação.

### 4.3 SEO dos pacotes (recomendação técnica)
Proponho um pequeno script Node (`scripts/build-pages.mjs`, sem framework) que gera **páginas HTML estáticas por pacote** a partir do JSON (ex.: `/pages/tours/island-hopping-experience.html` e o equivalente EN), com título, descrição, canonical, hreflang, Open Graph e JSON-LD `TouristTrip`/`Product` preenchidos. `package.html?id=…` passa a redireccionar para o novo URL, por isso não se perde nenhum link existente. O mesmo script gera `sitemap.xml`. O Vercel executa-o no build. O JSON continua a ser a fonte de verdade.

---

## 5. Proposta para reservas, facturação e pagamentos

### 5.1 Ponto de partida
Não existe nenhuma referência de reserva: as reservas vivem no WhatsApp. Por isso, a regra "usar a referência do sistema actual" não é aplicável e **é preciso criar a referência uma única vez**, como base de tudo o resto. A facturação fica obrigatoriamente pendurada nessa reserva.

### 5.2 Arquitectura recomendada (a que menos acrescenta ao que já existe)
- **Base de dados: Firestore** (o projecto Firebase já existe e já está em produção).
- **Lógica no servidor: Vercel Serverless Functions** (`/api/*`, Node), no mesmo projecto Vercel, com `firebase-admin`. Todas as escritas financeiras passam pelo servidor. **As regras do Firestore negam ao browser qualquer leitura ou escrita** em `bookings`, `invoices`, `payments`, `counters` e `audit_log`.
- **Autenticação do painel: Firebase Authentication** (e-mail + palavra-passe, com 2FA quando disponível), papéis em custom claims (`admin`, `finance`, `operations`).
- **PDF:** gerado no servidor (`pdf-lib`), guardado em armazenamento privado e entregue por **URL assinado e temporário**. Nunca por um URL público previsível.
- **Painel:** `/admin/` em HTML + Bootstrap + JS (mesma stack), `noindex`, bloqueado no `robots.txt`.
- **E-mail transaccional:** um fornecedor com plano gratuito (ex.: Resend ou Brevo) chamado **a partir do servidor**, com registo do estado de cada envio. O EmailJS no browser deixa de ser usado.

Alternativa: Cloud Functions do Firebase em vez de funções Vercel. É equivalente, mas acrescenta um segundo sítio de deploy. Recomendo as funções Vercel.

### 5.3 Modelo de dados (resumo)
- `bookings/{ref}`: referência legível (ex.: `MCA-2026-00042`, gerada por transacção), cliente, pacote (`slug` + snapshot de nome e preços na data), data, participantes, extras, **preço recalculado no servidor a partir de `data/tours.json`**, `status_operacional` (pedido → confirmada → realizada / cancelada), origem (site / WhatsApp / manual), notas e histórico.
- `invoices/{id}`: série, número sequencial (transacção sobre `counters/{serie}`), `booking_ref`, linhas, totais, `estado_documental` (rascunho → emitida → anulada), PDF (caminho privado + hash), emitida por / em. **Imutável depois de emitida**; correcção só por anulação registada + nova factura (ou nota de crédito, conforme o contabilista indicar).
- `payments/{id}`: `invoice_id`, montante, data, método (só os aceites: M-Pesa, e-Mola, cartão, transferência… **a confirmar**), referência da transacção (**única por método**, para impedir duplicados), `estado` (declarado → em verificação → confirmado / recusado / revertido / reembolsado), registado por.
- **O estado de pagamento é sempre calculado**, nunca editado: `pago = Σ confirmados − Σ revertidos/reembolsados` → Pendente / Parcialmente pago / Pago. Os cenários A–F do brief viram testes automáticos.
- `audit_log`: cada acção administrativa ou financeira (quem, quando, antes/depois). Só acrescenta registos, nunca apaga.

### 5.4 Fluxo do cliente (mantém o WhatsApp)
O cliente preenche o pedido no site → o servidor valida, recalcula o preço e grava a reserva com estado **"Pedido recebido — aguarda confirmação"** → o cliente recebe a referência no ecrã e por e-mail → o botão de WhatsApp abre a conversa **já com a referência**. Quem reserva só pelo WhatsApp é registado manualmente no painel, com a mesma referência. Nada é apresentado como "confirmado" sem acção da equipa.

### 5.5 Área de cliente
Não é necessária nesta fase. Proponho em vez disso **links privados por reserva** (token aleatório e com validade) para o cliente ver o estado da reserva e descarregar a factura. Assim evitam-se contas e palavras-passe de clientes. Uma área com login pode vir depois.

---

## 6. Riscos e dependências técnicas

| Risco | Impacto | Mitigação |
|---|---|---|
| **Validade legal das facturas em Moçambique** (requisitos de facturação, eventual software certificado ou numeração autorizada pela AT, regime de IVA) | Pode impedir a emissão de "facturas" pelo sistema próprio | Validar com o contabilista **antes** da Fase 5. Até lá, o sistema pode emitir **"Factura pró-forma / Nota de cobrança"**, e a série e o título ficam configuráveis. |
| Plano Vercel | O plano Hobby destina-se a uso não comercial; as funções têm limites | Confirmar o plano actual. Para uso comercial, o Vercel Pro (~20 USD/mês por membro) é o enquadramento correcto. |
| Firebase Storage para os PDFs | Os buckets novos podem exigir o plano Blaze (pay-as-you-go; custo esperado próximo de zero com este volume) | Alternativa: Vercel Blob privado. Decidir com base no plano actual. |
| Regras do Firestore desconhecidas | Exposição ou spam da colecção `reviews` | Exportar as regras actuais, versioná-las no repositório e testá-las com o emulador. |
| Mudança de URLs dos pacotes (SEO) | Perda de tráfego se mal feita | Manter `package.html?id=` com redireccionamento e canonical. |
| Deploy desconhecido | Risco de publicar os zips, os JSON antigos e `settings.json` | Documentar o processo, criar `.vercelignore` e remover os ficheiros mortos (com autorização). |
| Fornecedor de e-mail | Exige verificação do domínio (DNS) | Precisa de acesso ao DNS do domínio confirmado. |

Custos novos previsíveis: possivelmente Vercel Pro e Firebase Blaze (uso residual). O fornecedor de e-mail cabe no plano gratuito com este volume. Não há outras licenças.

---

## 7. Decisões que precisam de si

### 7.0 Respostas recebidas (26/10/2026)

| Tema | Decisão | Consequência |
|---|---|---|
| Domínio | **mozcampadventures.co.mz** | Corrigir canonical/hreflang/OG (hoje `.com`) e o e-mail `info@mozcampadventures.com` da página de contacto. E-mails assumidos (a confirmar): `info@`, `booking@`, `quotes@mozcampadventures.co.mz`. |
| Alojamento | **Servidor próprio**; Vercel só para testes | O §5.2 (funções Vercel) deixa de se aplicar. O back-end será escolhido conforme o servidor (ver pergunta pendente em `ARQUITECTURA.md`). O Firestore pode manter-se. |
| Entidade | **Mozambique Camp Adventures** (nome comercial: Moz Camp Adventures) | Usar na factura. |
| Morada | Marina, Escola Náutica, Cidade de Maputo | Substitui "Av. 10 de Novembro, Escola Náutica" do rodapé? **A confirmar.** |
| Telefone | +258 84 440 6543 | Igual ao actual. |
| NUIT | **Por definir** | Campo fica marcado como pendente nas configurações; as facturas não podem ser emitidas como definitivas sem ele. Até lá: documento pró-forma. |
| Regime fiscal | **ISPC 3% (incluído nos preços)** | A factura **não discrimina IVA** nem acrescenta imposto ao total. Proposta de menção: «Contribuinte sujeito ao ISPC — imposto incluído no preço». **Redacção a validar com o contabilista.** |
| Pagamentos | **Transferência bancária, M-Pesa, e-Mola** | Remover Visa/Mastercard do rodapé (hoje anunciados). Dados bancários e números M-Pesa/e-Mola para as instruções de pagamento: **por fornecer.** |
| Servidor (27/10) | **VPS com Plesk** | Back-end em PHP 8 + MySQL/MariaDB (ver `ARQUITECTURA.md` §3). |
| Mínimo de participantes (27/10) | **Bloquear o pedido abaixo do mínimo** | Regras explícitas em `data/booking-rules.json`. |
| Alojamentos (27/10) | **Preço por pessoa por noite** | Total = (adultos × tarifa + crianças × tarifa criança) × noites. Excepção: Cabo Beach Villas, cujo preço é por villa por noite. |
| Direcção visual (27/10) | **Aprovada** | Fase 3 iniciada. |
| Avaliações (28/10) | **Geridas no site**, não no Firebase; a avaliação de teste «Wilson Mate» pode sair | Tabela `reviews` (PostgreSQL) + API; Firebase removido do site. Era a única aprovada: não houve nada a migrar. |
| Alojamentos 3+ noites (28/10) | Cada noite adicional soma a tarifa de 1 noite | Tarifa de 2 noites + (n − 2) × tarifa de 1 noite, por adulto e por criança |
| Transfers «por trajecto» (28/10) | **Por pessoa**, como hoje | Sem alteração |
| Limpeza (28/10) | Autorizada | 34 ficheiros removidos (no Git) + `MCA.zip`; `` `mozcamp.zip `` mantido (conteúdo único) |
| Base de dados (28/10) | **PostgreSQL** | PHP 8.1+ com `pdo_pgsql` no Plesk |
| Acessos ao painel (28/10) | Administrador e Gerente (nomes e e-mails combinados com o cliente); o Administrador atribui permissões a outros níveis | Perfis editáveis com 13 permissões; o Administrador não é editável |
| Numeração (28/10) | `FT-2026/0001` e `PF-2026/0001` | Implementado; recomeça cada ano |
| NUIT (28/10) | **459001987** | Facturas `FT` disponíveis |
| Pagamentos (28/10) | Nedbank 00026449008 / NIB 0043 0000 0002 6449 0085 9; Millennium bim 1068386228 / NIB 0001 0000 0106 8386 2285 7; M-Pesa +258 84 440 6543 | Nas Definições e nos PDFs. **e-Mola: número em falta** |
| Composer (28/10) | Desconhecido | PDF gerado sem dependências |
| Fase 6 e recibos (28/10) | «Sim» — avançar e emitir recibos | Recibos `RC-AAAA/NNNN` automáticos a cada pagamento confirmado |
| Restante | Pode ser sugerido e corrigido durante o projecto | As sugestões ficam marcadas como `[A CONFIRMAR]` no conteúdo e na documentação. |

1. **Domínio oficial:** `mozcampadventures.com` (usado no hreflang e no e-mail de contacto) ou `mozcampadventures.co.mz` (usado nos e-mails do rodapé)? Quais são os e-mails válidos?
2. **Deploy:** como é publicado hoje (Git → Vercel ou CLI)? Qual é o plano Vercel? Tem acesso de administrador ao projecto Firebase `moz-camp-adventures` e ao DNS?
3. **Dados fiscais e legais:** denominação legal, NUIT, morada fiscal, regime de IVA, série e formato de numeração, e se o contabilista aceita facturas emitidas por este sistema (ou se começamos por pró-forma).
4. **Pagamentos aceites** e as respectivas instruções (M-Pesa, e-Mola, Visa/Mastercard por POS ou link, transferência — que contas?). Existe algum sinal ou depósito obrigatório?
5. **Regras de negócio:** mínimo de participantes por tour (o JSON diz 3–4, o simulador permite 1); política de cancelamento geral (só 2 tours a têm definida); a promessa "confirmação em minutos".
6. **Conteúdo "Sobre":** anos de experiência e número de viajantes correctos (hoje há números contraditórios).
7. **Testemunhos:** os três testemunhos fixos no HTML (Njabulo Nkabinde, Luisa Adelina, Natércia Mucucusa) são reais e autorizados? O de "Wilson Mate" no Firestore deve ser despublicado?
8. **Vídeo de testemunho** (`depoimento.mp4`): existe o ficheiro, ou removemos o botão?
9. **Textos legais:** tem política de privacidade e termos aprovados, ou devo preparar um rascunho para revisão jurídica?
10. **Autorização de limpeza:** posso remover os ficheiros mortos listados em §2.4 (JSON antigos na raiz, `settings.json`, JS/CSS sem uso) e criar `.vercelignore`?
11. **Aprovação da direcção visual** (§4.2) e da arquitectura financeira (§5.2).

---

## 8. Plano de implementação por fases

| Fase | Conteúdo | Depende de |
|---|---|---|
| 2 | Design tokens, protótipo da home e do pacote (desktop/mobile), documento `REDESIGN_E_UI_UX.md`, `ARQUITECTURA.md` | Aprovação desta auditoria |
| 3 | Redesign público (todas as páginas, PT+EN), páginas estáticas por pacote + redireccionamentos, componentes sem `fetch`, imagens optimizadas (`sharp`), limpeza autorizada, capturas "depois" | Decisões 1, 6, 7, 8, 10 |
| 4 | Pedido de reserva persistido + referência + WhatsApp com referência; correcção do contacto (e-mail via servidor); mínimos de participantes | Decisões 2, 5; fornecedor de e-mail |
| 5 | Painel admin (auth + papéis), pesquisa de reservas, emissão de facturas (numeração transaccional, PDF privado, imutabilidade, anulação) | Decisões 3, 11 |
| 6 | Pagamentos (estados, cálculo automático, anti-duplicação, reversões, auditoria) + testes dos cenários A–F | Decisão 4 |
| 7 | Dashboard financeiro (facturado ≠ recebido), notificações por e-mail PT/EN | — |
| 8 | SEO técnico (sitemap, robots, JSON-LD, OG), cabeçalhos de segurança, acessibilidade, desempenho | — |
| 9 | Testes funcionais, financeiros e visuais; `RELATORIO_DE_TESTES.md` e restante documentação | — |
| 10 | Checklist de produção, backups (export do Firestore), plano de reversão | Autorização explícita para publicar |

Ambiente de testes proposto: Firebase Emulator Suite (Firestore + Auth) e `vercel dev`, para que nenhum teste toque nos dados reais.
