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

- **Cabeçalho:** logótipo; Mozambique Camp Adventures; nome comercial; NUIT; morada; telefone; e-mail; site.
- **Documento:** tipo e número, data de emissão, referência da reserva, moeda (MZN).
- **Cliente:** nome e, se indicados, NUIT, morada, e-mail e telefone.
- **Linhas:** descrição, quantidade, preço unitário e valor. Depois, o subtotal, o total e a menção fiscal (ISPC, sem IVA discriminado).
- **Instruções de pagamento:** Nedbank (conta e NIB), Millennium bim (conta e NIB) e M-Pesa, mais uma nota a pedir a referência e o comprovativo. O e-Mola só aparece quando tiver número (hoje está pendente).
- **Observações**, e, na pró-forma, a indicação de que não é factura.
- **Rodapé:** denominação, NUIT, número, «Documento processado por computador» e quem emitiu.

Exemplo: `docs/visual-review/depois/factura-exemplo.pdf` (dados de teste).

O PDF é gerado sem bibliotecas externas: PDF 1.4 com Helvetica, que suporta os acentos portugueses. Não precisa de Composer.

## 5. Pagamentos e recibos

Implementados na Fase 6: ver `PAGAMENTOS.md`. Uma factura FT com pagamentos activos não pode ser anulada sem primeiro reverter ou reembolsar.
