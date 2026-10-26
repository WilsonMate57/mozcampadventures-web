# Notificações e área do cliente — Moz Camp Adventures

Fase 7 (26/10/2026). Código: `api/src/Notify.php`, `api/src/Mailer.php`, `api/migrations/005_notifications.sql`, `assets/js/client.js`. Painel: acções nas Reservas, Facturas e Pagamentos; **E-mails enviados**; **Definições → Notificações**.

## 1. E-mails automáticos ao cliente

Todos saem no **idioma da reserva** (PT ou EN), com o link pessoal da área do cliente e a assinatura da empresa. O Reply-To é booking@, por isso as respostas do cliente chegam à equipa.

| Evento | Quando | Conteúdo |
|---|---|---|
| Pedido de reserva recebido | Pedido feito no site | Referência, resumo, total estimado, «isto é um pedido, não uma reserva confirmada» |
| Reserva confirmada | Estado → Confirmada | Experiência, data, nota opcional |
| Reserva cancelada | Estado → Cancelada | Motivo |
| Actividade concluída | Estado → Concluída | Agradecimento e link para avaliar a experiência |
| Factura enviada | Botão «Enviar ao cliente» | PDF em anexo, link para o comprovativo, link da área do cliente |
| Pagamento recebido | Pagamento confirmado | Valor, método, **recibo em anexo**, saldo em dívida ou «totalmente paga» |
| Comprovativo recusado | Recusa de um comprovativo **enviado pelo cliente** | Motivo e pedido para reenviar |
| Pagamento revertido | Reversão | Motivo, recibo anulado, saldo |
| Reembolso | Reembolso registado | Valor e motivo |
| Factura anulada | Anulação | Motivo |

A equipa também recebe e-mail quando:
- há um novo pedido de reserva (booking@);
- chega uma mensagem de contacto (info@);
- chega um comprovativo de um cliente (booking@).

## 2. Controlo

- **Definições → Notificações automáticas:** liga ou desliga cada tipo.
- **Em cada acção** (confirmar reserva, confirmar ou recusar pagamento, reverter, reembolsar, anular factura) há a caixa «Notificar o cliente por e-mail», marcada por omissão.
- **O resultado é sempre o real.** Depois de cada acção, o painel mostra um destes:
  - «E-mail enviado ao cliente» — o servidor de e-mail aceitou a mensagem;
  - «o e-mail FALHOU — veja E-mails e reenvie» (aviso a vermelho);
  - «O cliente não tem e-mail: avise-o por WhatsApp»;
  - «Notificação desligada nas Definições»;
  - «modo de teste» (desenvolvimento).
  
  A acção em si (por exemplo, confirmar a reserva) fica feita mesmo que o e-mail falhe.

## 3. Registo de e-mails (painel → E-mails enviados)

- Cada e-mail fica registado com data, tipo, destinatário, assunto, estado e erro.
- Os anexos ficam por caminho, sem duplicar os PDFs.
- Filtros: falhados, enviados, modo de teste, todos.
- **Reenviar:** reenvia o mesmo conteúdo e anexos (verificados de novo). O reenvio fica ligado ao original, e o original deixa de contar como pendente.
- O resumo mostra «E-mails falhados (7 dias)» que ainda não foram reenviados com sucesso.
- Registos anteriores à Fase 7 não guardavam o corpo e não podem ser reenviados.
- «Enviado» significa que o servidor de e-mail aceitou a mensagem. A entrega na caixa do cliente não pode ser garantida (spam, caixa cheia). Para aumentar a entrega, é preciso SPF e DKIM do domínio (ver `DEPLOYMENT.md`).

## 4. Área do cliente (`/reserva/` e `/en/booking/`)

**O que o cliente vê:**
- estado da reserva;
- facturas, com total, pago, em dívida e estado;
- recibos;
- download dos PDFs;
- botão «Enviar comprovativo» para facturas com saldo.

**Segurança:**
- **Link assinado:** `#r=<referência>&t=<HMAC-SHA256(app.secret, reserva + versão)>`. Nada secreto fica guardado na base de dados. O token vai no fragmento `#`, que não aparece nos logs do servidor nem no Referer.
- **Revogação:** no painel, *Reserva → Área do cliente → Revogar links anteriores* invalida todos os links já enviados e gera um novo.
- **Só esta reserva:** pedir a factura ou o recibo de outra reserva com o mesmo link dá 404 (teste C5).
- **Sem dados de contacto:** a página mostra apenas o primeiro nome, não o e-mail nem o telefone.
- **Auditoria:** cada download pelo cliente fica registado.
- **Abuso:** limite de 60 consultas por hora por IP.
- **Indexação:** páginas `noindex`, bloqueadas no `robots.txt`, `Referrer-Policy: no-referrer`.

O painel gera o link com atalho para o WhatsApp do cliente, que é útil para clientes que tratam tudo por WhatsApp.

## 5. Testes

- `tests/notifications.mjs`: **28/28**, cobrindo idiomas, cada tipo de notificação, «não notificar», tipo desligado, cliente sem e-mail, falha de envio reportada como falha, reenvio e área do cliente (C1–C9).
- `tests/admin-ui.mjs`: **33/33** no browser, incluindo o aviso real do e-mail (U8b), o link e a área do cliente em 375 px (U27–U29), o registo de e-mails (U30) e as preferências (U31).

Em desenvolvimento, `mail.transport = 'log'` regista sem enviar. Destinatários em domínios `.invalid` (reservados pela RFC 2606) simulam falha. **Em produção (`mail`), esta regra não se aplica.**

**Não testado:** a entrega real pelo Postfix do Plesk. Ver a lista de verificação em `DEPLOYMENT.md` §3.1d.
