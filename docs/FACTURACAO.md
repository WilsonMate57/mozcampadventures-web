# Facturação — Moz Camp Adventures

Fase 5 (26/10/2026). Código: `api/src/Invoices.php`, `api/src/Pdf.php`, `api/migrations/002_admin_invoicing.sql`. Painel: `/admin/` → Reservas / Facturas.

> **A validar pelo contabilista antes de usar em produção:** as menções obrigatórias, o formato da numeração, a menção do ISPC («Contribuinte sujeito ao ISPC — imposto incluído no preço.») e o procedimento de anulação. Os textos podem ser alterados em *Definições* sem mexer no código.

## 1. Documentos

| Tipo | Série | Exemplo | Uso |
|---|---|---|---|
| Factura | `FT` | `FT-2026/0001` | Documento fiscal (exige NUIT da empresa: **459001987**) |
| Factura pró-forma | `PF` | `PF-2026/0001` | Pedido de pagamento antes da prestação; não é factura nem recibo (indicado no PDF) |

Cada série recomeça em `0001` a cada ano. O número é atribuído **no momento da emissão**, dentro da mesma transacção que gera o PDF. Se algo falhar, nada é gravado e o número não é consumido, por isso não há buracos na sequência. Testado com 10 emissões simultâneas (D17) e com duas emissões em simultâneo do mesmo rascunho (D18).

## 2. Fluxo no painel

1. **Reservas** → pesquisar pela referência (`MCA-2026-…`), nome, telefone ou e-mail → abrir a reserva.
   - Clientes que chegam pelo WhatsApp: **Novo pedido** regista-os com o preço calculado pelo sistema e dá-lhes uma referência.
2. Confirmar os dados (experiência, datas, participantes, valor).
3. **Criar factura** (ou **Criar pró-forma**) → abre um **rascunho** com as linhas da reserva e os dados do cliente.
4. No rascunho, pode:
   - acrescentar o NUIT e a morada do cliente;
   - ajustar linhas e acrescentar um **desconto** (linha com valor negativo);
   - escrever observações.
   Os valores são sempre recalculados no servidor, e o total não pode ser negativo.
5. **Emitir** (com confirmação):
   - recebe o número;
   - copia os dados da empresa e as instruções de pagamento em vigor;
   - gera o PDF e calcula o SHA-256;
   - fica **imutável**.
6. **Ver PDF** (só com sessão iniciada) e **Enviar ao cliente**. O envio segue por e-mail, com o PDF em anexo, e o resultado real fica registado: aceite pelo servidor de e-mail, falhou, ou registado em modo de teste.
7. Correcções: **Anular**, com motivo obrigatório (permissão própria), e emitir uma nova factura. A factura anulada mantém o número, o PDF e o histórico.

## 3. Garantias de integridade

| Regra | Como é garantida | Teste |
|---|---|---|
| Factura emitida não muda | Trigger `mca_invoice_guard` recusa qualquer UPDATE, excepto a passagem a «anulada» | D9, D10 |
| Factura emitida não se apaga | O mesmo trigger recusa DELETE (só rascunhos podem ser descartados) | D11 |
| Anulada é definitiva | Trigger recusa alterações a facturas anuladas | D15, D16 |
| Anulação justificada | CHECK na BD: motivo ≥ 5 caracteres, data e autor | D13, D14 |
| PDF não adulterado | SHA-256 guardado na emissão e verificado em cada download e envio | D7, D21 |
| PDF privado | Guardado em `app.storage_dir`, **fora do httpdocs**; servido só a utilizadores com `invoices.view` | D8, U12 |
| Histórico | `invoice_events` (emitida, enviada, anulada) e `audit_log` são só de acréscimo | D14, E4, E5 |
| Reserva cancelada | Não pode ser facturada | D22 |

## 4. Conteúdo do PDF

**Layout (27/10/2026):** segue o modelo de factura que a empresa já usa (fundo cinza-claro, logótipo horizontal, título e barras em laranja `#d0841f`). O mesmo layout é usado na factura (FT), na pró-forma (PF) e no recibo (RC) — classe `DocTheme` em `api/src/Invoices.php`.

- **Cabeçalho:** logótipo horizontal; título «FACTURA» / «FACTURA PRÓ-FORMA» / «RECIBO» em laranja; morada e telefone com ícones; filete.
- **Caixa de três colunas:**
  - «Factura para» com nome, morada, e-mail e NUIT do cliente («N/A» se não houver);
  - número e data de emissão;
  - «Valor da factura».
- **Tabela:** barra laranja «Descrição · Preço Unit. · QTD · Total» e, no mínimo, 4 linhas, como no modelo. Com muitas linhas, a tabela continua numa segunda página, com o cabeçalho repetido.
- **Métodos de pagamento:**
  - Nedbank e Millennium bim (conta e NIB) e M-Pesa (número), com marcadores laranja;
  - nome comercial em laranja;
  - nota a pedir a referência e o comprovativo.

  O e-Mola só aparece quando tiver número.
- **Totais:** SUB-TOTAL, Desconto (%) e ISPC (3%) «Incluso», com o total final numa barra laranja «Total (MZN)».
- **Observações** e, na pró-forma, a indicação de que não é factura.
- **Menções legais:** denominação, NUIT, número, reserva, «Documento processado por computador» e quem emitiu. Ficam numa linha discreta por cima do rodapé; o modelo original não tinha o NUIT da empresa, mas não pode faltar.
- **Rodapé:** morada, e-mail, site e telefone com ícones, e o logótipo.

**Diferenças em relação ao modelo original:**
- **«Expira»:** dá lugar à data de emissão, porque o sistema não tem data de vencimento.
- **Desconto:** aparece como 0%, porque o sistema não faz descontos.
- **Valores:** em formato português (`44.000,00`), como no resto do sistema; o modelo usava `44,000.00`.
- **Numeração:** `FT-2026/0001`, como decidido em 26/10/2026; o modelo usava `031/MCA/2025`.

**Imagens:** `api/assets/doc-logo.jpg` e `doc-icon-*.jpg`, geradas por `node scripts/document-assets.mjs` a partir de `assets/images/logo/logo_moz_camp_adventures_horizontal.png`. Esse logótipo foi extraído do modelo de factura da empresa.

Exemplos: `docs/visual-review/depois/factura-exemplo.pdf` e `recibo-exemplo.pdf` (dados fictícios).

**Fonte:** Inter, a mesma do site, embebida no PDF nos pesos 400 (texto), 700 (negrito) e 800 (título). O PDF fica com cerca de 100 KB.
- Ficheiros: `api/assets/fonts/inter-{400,700,800}.ttf` (SIL OFL, `LICENSE.txt`), com 18 KB cada.
- São um subconjunto Windows-1252 (latim e acentos portugueses) da Inter estática do Google Fonts, gerado com `pyftsubset` (fonttools 4.55.3; caracteres U+0020–007E, U+00A0–00FF e os extras do Windows-1252; sem hinting nem tabelas de layout).
- Se os ficheiros faltarem, o PDF volta a sair com Helvetica.

O PDF é gerado sem bibliotecas externas (PDF 1.4; `api/src/Pdf.php` lê as métricas da TrueType sozinho). Não precisa de Composer. Validado com pdf.js e com pypdf em modo estrito: as fontes estão embebidas e o texto, com os acentos, extrai-se correctamente.

## 5. Pagamentos e recibos

Implementados na Fase 6: ver `PAGAMENTOS.md`. Uma factura FT com pagamentos activos não pode ser anulada sem primeiro reverter ou reembolsar.
