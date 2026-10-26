# Redesign e UI/UX — Moz Camp Adventures

**Fase 2** (protótipo, 26/10/2026): **aprovada** em 26/10/2026. **Fase 3** (aplicação ao site): concluída localmente, por publicar. Ver §8.

## 1. Como ver o protótipo

O protótipo está em `prototipo/`, separado do site. Nenhuma página em produção foi alterada.

- `prototipo/index.html`: home.
- `prototipo/pacote.html?id=<slug>`: página de pacote. Funciona com qualquer `id` de `data/tours.json` ou `data/accommodations.json`; sem `id`, abre o Island Hopping.

Os dados (nomes, textos, preços, imagens, extras, barcos, transfers) são lidos do JSON real, sem conteúdo inventado. Os links de navegação levam para as páginas actuais do site. As páginas têm `noindex` e uma etiqueta "Protótipo · Fase 2".

Para ver localmente, sirva a pasta do projecto com qualquer servidor estático (os `fetch` do JSON não funcionam a partir de `file://`) e abra `/prototipo/index.html`.

## 2. Direcção criativa: «Editorial do Índico»

Um site com aspecto de revista de viagens e não de template: fotografia real em grande formato, tipografia Inter forte e alinhada à esquerda, muito espaço em branco e cor usada com intenção.

- **Turquesa** (`#00c6c1`): identidade, ícones e fundos suaves. Deixa de pintar secções inteiras.
- **Laranja** (`#ff9a08`): só para a acção principal (reservar, pedir). O botão mais importante destaca-se sempre.
- **Amarelo** (`#ffbe06`): ênfase pontual (destaques, título do hero).
- **Oceano profundo** (`#0b2e33`, derivado do turquesa): secções escuras e rodapé.
- **Areia** (`#faf6ef`): fundo quente para a secção editorial de destinos.
- A Dancing Script (cursiva) e o padrão marinho de fundo saem; fica só a Inter.

## 3. Antes → depois (o que muda de forma visível)

| Elemento | Antes | Depois |
|---|---|---|
| Hero | Carrossel de 5 slides, título cursivo centrado, 5 `<h1>` na página | Fotografia real única (Island Hopping, Inhaca), título Inter Black à esquerda, um só `<h1>` |
| Procura | Ícone de lupa na navbar | Barra de procura sobre o hero: experiência · data · pessoas |
| Navbar | Barra branca larga, carregada por `fetch` (pisca) | Barra flutuante em cápsula com mega-menu (categorias com miniatura e nº de opções) e botão laranja «Reservar» |
| Mobile | Menu lateral + navbar | Menu em ecrã inteiro + **barra inferior fixa** (Explorar · WhatsApp · Reservar) |
| Confiança | Números contraditórios (5 vs 10 anos) | Faixa de 4 factos confirmados: Marina/Escola Náutica · confirmação pela equipa · M-Pesa/e-Mola/banco · WhatsApp |
| Categorias | Grelha 3×2 de fotos iguais em fundo turquesa | Mosaico editorial assimétrico com nº de opções e preço mínimo **calculados do JSON** |
| Destaques | Não existia na home | Cartões de experiência deslizantes (6 seleccionados) |
| Cartões | Estrelas 5/5 por omissão, "A partir de:" | Chips de categoria, local e duração, preço com unidade («6.000 MZN por adulto»), **sem estrelas automáticas** |
| Destinos | Não existia | Secção editorial: 5 destinos em acordeão; a imagem muda e o texto vem da descrição real do pacote |
| Processo | Não explicado | «Três passos, sem surpresas» + métodos de pagamento aceites (M-Pesa, e-Mola, transferência) |
| Avaliações | Testemunhos fixos + Firestore (com um teste publicado) | Só avaliações aprovadas; a secção esconde-se se não houver nenhuma |
| CTA final | — | Faixa para grupos, eventos e cotações (WhatsApp + quotes@) |
| Rodapé | Morada repetida 3×, Visa/Mastercard, links legais `#` | 4 colunas, uma morada (Marina, Escola Náutica), só os pagamentos aceites, links legais (páginas a criar) |
| Página de pacote | Hero com foto + cartões brancos empilhados | Título editorial, **galeria em mosaico 1+4** com lightbox, menu de secções fixo, factos rápidos, itinerário em linha temporal, inclui/não inclui lado a lado |
| Reserva | Separadores WhatsApp/E-mail (o e-mail não funciona) | **Painel por passos** (data → participantes → opções → dados → resumo), validação acessível, aviso de mínimo de participantes, nota «isto é um pedido, não uma reserva confirmada», barra fixa no mobile |
| Indisponíveis | Tofo e Vilanculos reserváveis por URL | Página «Esta experiência não está disponível» |

Capturas: `docs/visual-review/antes/` vs `docs/visual-review/prototipo/` (1366 px e 375 px; `*-fold-*` = primeiro ecrã).

## 4. Design tokens (`assets/css/tokens.css`)

Ficheiro novo, ainda não ligado às páginas em produção (isso acontece na Fase 3).

### Cores e contraste (medido)

| Combinação | Contraste | Uso |
|---|---|---|
| `--text` #353535 / branco | 12,3:1 | Texto corrido |
| `--text-soft` #5f6466 / branco | 6,0:1 | Texto secundário |
| `--text-mute` #7f7f7f / branco | 4,0:1 | Só ≥ 18 px ou decorativo |
| `--teal-700` #00807d / branco | 4,8:1 | Links, botões turquesa com texto branco |
| `--ink` / `--brand-orange` | 7,5:1 | Botão principal |
| `--brand-teal` #00c6c1 / branco | **2,1:1** | **Nunca para texto** — só ícones/fundos |
| `--teal-300` / `--sea-900` | 8,7:1 | Destaques em secções escuras |
| Amarelo / `--sea-950` | 10,3:1 | Ênfase do título do hero |

### Restantes tokens
Tipografia fluida (`--fs-xs` … `--fs-3xl` com `clamp`), pesos 400–800, espaçamento em escala de 4 (`--sp-1` … `--sp-24`), `--section-y` fluido, larguras (`--w-content` 1200 px, `--w-prose` 68ch), raios (6 → 28 px + cápsula), três sombras discretas + anel de foco, durações e easing (zeradas com `prefers-reduced-motion`), camadas `z-index`.

## 5. Componentes do protótipo (`prototipo/proto.css`)

Botões (primário, turquesa, ghost, claro, contorno, WhatsApp, bloco, pequeno) · botão-ícone · chips · cabeçalho com mega-menu · menu mobile · barra de procura · faixa de confiança · mosaico · cartão de experiência · cartão de alojamento · acordeão de destinos · passos · cartão de citação · faixa de CTA · rodapé · barra inferior mobile · migalhas · galeria + lightbox · menu de âncoras · grelha de factos · listas de verificação · linha temporal · cartões de menu · avisos · painel de reserva (campos, steppers, opções rádio/checkbox, resumo, erros) · skeleton.

Acessibilidade incluída: link «Saltar para o conteúdo», foco visível em todos os controlos, `aria-expanded` no mega-menu, no menu e no acordeão, lightbox com Escape e setas, erros de formulário com `aria-invalid`, resumo de preço com `aria-live`, alvos de toque ≥ 36–48 px.

Bootstrap 5.3.3 continua carregado (reboot e utilitários), como no site actual; os componentes visuais são próprios.

## 6. Verificações feitas

- **Sem scroll horizontal** a 1366 px e 375 px na home e em 2 pacotes (medido no Chrome headless; `report.json`).
- **Um só `<h1>`** por página.
- **Imagens:** todas carregam; as decorativas têm `alt=""`, e as de conteúdo têm o nome da experiência.
- **13 testes funcionais do painel de reserva** (`docs/visual-review/prototipo/testes-funcionais.txt`): preço base, crianças, barco privado que substitui o preço por pessoa, extras por pessoa, limite de capacidade, validação, aviso de mínimo, transfer próprio do JSON e transfer por omissão, pacote desactivado, contagens do mosaico, cartões em destaque. **13/13 passaram.** Um primeiro resultado "falhado" era uma expectativa errada minha (o Ponta D'Ouro tem transfer próprio de 14.000 MZN no JSON).
- **Não verificado ainda:** 360/768/1024/1920 px, leitor de ecrã real, Safari/iOS. Fica para a Fase 3.

## 7. Decisões e pendências

| # | Pendente | Proposta |
|---|---|---|
| 1 | Aprovar a direcção visual | — |
| 2 | Mínimo de participantes: o protótipo **avisa**, mas não bloqueia | Bloquear quando confirmar as regras |
| 3 | Textos novos (hero, secções, passos, CTA) | Sugestões minhas `[A CONFIRMAR]`; preços, descrições e destinos vêm do JSON |
| 4 | O passo 2 promete «uma referência de reserva» | Só fica verdade com a Fase 4. Se a Fase 3 for publicada antes, este texto muda. |
| 5 | Avaliações e plataformas externas | Links reais do Tripadvisor/Google da empresa, se existirem |
| 6 | Origem de `hero_slider_1.webp` | Confirmar a licença ou substituir |
| 7 | Versão EN | Feita na Fase 3 com o mesmo HTML e um dicionário de textos |
| 8 | Alojamentos sem cálculo por noites (igual ao actual) | Pedir regra: preço × noites × pessoas? |

## 8. Fase 3 — aplicação ao site (26/10/2026)

**Como funciona agora:** `node scripts/build.mjs` gera todas as páginas PT e EN (75 ficheiros HTML) a partir do JSON, de `scripts/i18n.mjs` e de `data/booking-rules.json`. A navbar e o rodapé passam a estar no HTML (sem `fetch`), e há uma página estática por experiência e por alojamento. Detalhes em `docs/DEPLOYMENT.md`.

**Diferenças em relação ao protótipo aprovado:**
- Secção «Sobre nós» (`#about`) com o texto actual da empresa, sem os números contraditórios.
- Avaliações reais do Firestore (`#feedback`): a secção só aparece se houver avaliações aprovadas.
- Formulário para deixar avaliação mantido (`approved:false`, moderado como antes).
- Pedido de reserva por **WhatsApp ou por e-mail**: abre o e-mail pré-preenchido para booking@, em vez do EmailJS, que não funcionava.
- **Mínimo de participantes bloqueante**; capacidade máxima respeitada.
- Alojamentos com datas de entrada/saída e tarifas publicadas para 1 e 2 noites. Sem tarifa publicada, o total mostra «A confirmar pela equipa».
- Páginas novas: privacidade e termos (provisórias, `noindex`), 404 e redireccionamento dos URLs `package.html?id=` antigos.
- O CSS do Bootstrap foi retirado (o novo design não o usa e atrasava a página), tal como o preloader Lottie.
- O popup promocional foi preservado (desactivado, como estava), com estilos próprios em `assets/css/promo.css`.
- O banner de cookies e o Consent Mode v2 foram mantidos (`consent.js` adaptado a `<dialog>`).

**Estado dos achados da auditoria:**

| # | Estado |
|---|---|
| D1/D2 Formulários EmailJS sem chaves | **Resolvido**: WhatsApp + e-mail pré-preenchido. O envio directo pelo servidor chega na Fase 4. |
| D3 Vídeo em falta | **Resolvido**: botão de vídeo retirado |
| D4 Estrelas automáticas | **Resolvido**: só avaliações reais |
| D5 Avaliação de teste «Wilson Mate» | **Resolvido**: as avaliações passaram para a base de dados do site; a de teste não foi migrada. O projecto Firebase pode ser desactivado |
| D6 Números contraditórios | **Resolvido**: retirados |
| D7 Links mortos | **Resolvido**: páginas legais criadas (texto provisório) |
| D8 Desactivados acessíveis | **Resolvido**: página «indisponível» + `noindex` |
| D9 Mínimos ignorados | **Resolvido**: bloqueio |
| D10 Textos PT nas páginas EN | **Resolvido**: dicionário PT/EN; o conteúdo dos pacotes vem de `en.json` |
| D11 «Confirmação em minutos» | **Resolvido**: substituído por «a equipa confirma» |
| D12 Domínio `.com`/`.co.mz` | **Resolvido**: tudo em `.co.mz` |
| D14 Links das plataformas de avaliação | **Resolvido**: retirados até haver perfis reais |
| D15 Foto de snorkeling de origem duvidosa | **Pendente**: deixou de ser usada no banner de tours |
| Peso das páginas | **Resolvido**: −75 a −90 % (ver `RELATORIO_DE_TESTES.md`) |
| SEO dos pacotes | **Resolvido**: páginas próprias, canonical, hreflang, OG, JSON-LD, sitemap e robots |
| Aluguer de barco multiplicado por pessoa | **Corrigido**: preço por barco |
