# Pagamentos e controlo financeiro — Moz Camp Adventures

Fase 6 (26/10/2026). Código: `api/src/Payments.php`, `api/migrations/004_payments.sql`. Painel: **Facturas → (factura) → Pagamentos** e **Pagamentos**. Cliente: `/pagamento/#t=…`.

## 1. Princípios

1. **Só pagamentos confirmados contam.** Um comprovativo enviado pelo cliente, ou um pagamento registado sem confirmação, fica «por verificar» e **não** altera o saldo.
2. **O estado financeiro é calculado, nunca escrito à mão.** A vista `invoice_balances` soma os pagamentos confirmados e subtrai os reembolsos. Não existe nenhum campo «pago» que alguém possa alterar.
3. **Nada se apaga.** Pagamentos, recibos e eventos não podem ser apagados nem alterados (triggers). As correcções fazem-se por movimentos novos (reversão, reembolso), com motivo e autor.
4. **O estado financeiro é separado do estado operacional.** Uma reserva pode estar «confirmada» com saldo em dívida.
5. **Pagamentos só em facturas FT emitidas.** A pró-forma pede o pagamento; o pagamento regista-se na FT.

## 2. Estados

**Factura FT (calculado):**

| Estado | Regra |
|---|---|
| Pendente | Pago (confirmado − reembolsos) = 0 |
| Parcialmente pago | 0 < pago < total |
| Pago | Pago ≥ total |
| Reembolsado | Houve reembolsos e o pago voltou a ≤ 0 |
| Anulada | Factura anulada (só possível sem pagamentos) |

**Movimento:**

| Estado | Significado | Conta? |
|---|---|---|
| Declarado | Enviado pelo cliente com comprovativo | Não |
| Em verificação | Registado no painel, à espera de confirmação | Não |
| **Confirmado** | Fundos verificados → **recibo RC emitido** | **Sim** |
| Recusado | Não se confirmou (motivo obrigatório) | Não |
| Revertido | Era confirmado e não se concretizou (motivo obrigatório; recibo anulado) | Não |

Reembolso: movimento de saída, confirmado no registo, limitado ao valor pago, com motivo.

Exemplo (cenários A–B do caderno de encargos): factura de 30.000 MZN.
- Confirmados 10.000 → **Parcialmente pago**, saldo 20.000.
- Confirmados mais 20.000 → **Pago**, saldo 0.

## 3. Fluxos

**A equipa recebe o dinheiro (banco, M-Pesa, e-Mola):**
1. Abrir a factura e escolher **Registar pagamento**: método, valor, data e referência da transacção.
2. Se os fundos **já** estiverem verificados na conta, marcar «Confirmo que os fundos já entraram» (é preciso a permissão *Confirmar pagamentos*). Assim fica confirmado e o recibo é emitido.
3. Se não, fica «em verificação». Alguém com a permissão confirma ou recusa depois.

**O cliente envia o comprovativo:**
1. O e-mail da factura leva um link privado. Também é possível gerá-lo no painel com **Link para comprovativo**, que tem um atalho para o WhatsApp do cliente.
2. A página mostra o total, o pago, o saldo e as instruções. O cliente indica o método, o valor, a data e a referência e anexa o ficheiro (PDF, JPG ou PNG, até 5 MB).
3. A equipa recebe um e-mail e vê o pagamento «Declarado pelo cliente» com o **Anexo**. Verifica o extracto e **confirma** (emite recibo) ou **recusa** (com motivo).

**Correcções:**
- **Reverter:** para um pagamento confirmado que não se concretizou. O recibo é anulado e o saldo recalculado.
- **Reembolso:** para devolver dinheiro ao cliente.
- **Anular a factura:** só sem pagamentos activos. Primeiro reverte-se, reembolsa-se ou decide-se o que estiver pendente.

## 4. Protecções (testadas — `tests/payments.mjs`, 44/44)

| Risco | Protecção | Teste |
|---|---|---|
| Mesma transacção contada duas vezes | Índice único (método + referência, sem distinguir maiúsculas) | D, D2 |
| Duas confirmações ao mesmo tempo ultrapassam o total | Bloqueio da factura (`FOR UPDATE`) e validação do saldo | D4, D5 |
| Pagar acima do saldo | `exceeds_balance`; nada fica gravado | B3, B4 |
| Comprovativo conta sem verificação | Estado «declarado», que não entra no cálculo | C, C2 |
| Ficheiro malicioso | Tipo verificado pelo **conteúdo** (não pela extensão), limite de 5 MB, guardado fora do `httpdocs` com SHA-256 | C3, C4 |
| Aceder à factura de outro cliente | Cada link tem um token aleatório só dessa factura, guardado como hash, válido 60 dias e substituído quando se gera um novo; o token vai no fragmento `#` (não aparece em logs nem no Referer) | F–F5 |
| Alteração ou eliminação de movimentos | Triggers recusam UPDATE de valores e DELETE; as transições de estado são controladas | E4–E7, G9 |
| Reembolso maior que o pago | `refund_exceeds_paid` | E8 |
| Acções sem autorização | 4 permissões: ver, registar, confirmar, reverter/reembolsar | C6, E10 |

## 5. Recibos

- Série `RC-AAAA/NNNN`, recomeça cada ano, emitido automaticamente na confirmação.
- **Conteúdo:** quem pagou, valor, factura (e o seu total), método e referência, data do pagamento, **saldo em dívida após o pagamento** e a menção ISPC.
- O PDF fica guardado fora do `httpdocs`, com SHA-256.
- Se o pagamento for revertido, o recibo passa a «anulado» (com motivo) e mantém-se no arquivo.

Exemplo: `docs/visual-review/depois/recibo-exemplo.pdf`.

## 6. Resumo do painel

- **Facturado:** total das FT emitidas e não anuladas.
- **Recebido este mês / no ano:** pagamentos **confirmados** menos reembolsos, pela data do pagamento.
- **Em dívida:** saldo das FT pendentes e parcialmente pagas.
- **Pagamentos por verificar:** declarados mais em verificação.

## 7. Pendente

- Número **e-Mola** (Definições → Instruções de pagamento). Até lá, o e-Mola não aparece nas instruções ao cliente.
- Integração automática com gateways (M-Pesa API, etc.): não incluída. Se vier a ser feita, a confirmação automática só poderá vir de notificações autenticadas e verificadas no servidor.
- Validação dos recibos pelo contabilista, tal como para as facturas.
