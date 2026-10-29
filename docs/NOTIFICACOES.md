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

## 3. Registo de e-mails (painel → E-mails e WhatsApp)

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

## 4b. Ticket do pedido com QR code (27/10/2026)

**Onde aparece:**
- No fim do pedido no site.
- Na área do cliente, para o poder reabrir.

**O que contém:**
- Referência, experiência, data(s), participantes e primeiro nome.
- Hora do pedido, linhas de preço e total estimado.
- Estado actual: «Pedido recebido — aguarda confirmação», «Reserva confirmada», etc.
- QR code e contactos.

**Botão:** «Imprimir / guardar PDF». Imprime só o ticket; no telemóvel, permite guardar como PDF.

**O QR code:**
- Contém o link pessoal da área do cliente (`/reserva/#r=REF&t=TOKEN`).
- Ao lê-lo, abre a reserva com o estado actualizado, e a equipa pode lê-lo no dia para confirmar a reserva.
- O link pode ser revogado no painel (*Reserva → Link da área do cliente → Revogar*); o QR antigo deixa então de funcionar.

**Não é documento fiscal:** o ticket diz expressamente que não é factura nem recibo. Os recibos (RC) só são emitidos depois de um pagamento confirmado.

**Implementação:**
- `assets/js/ticket.js`, usado por `site.js` e `client.js`.
- QR gerado no browser por `assets/vendor/qrcode/qrcode.js` (qrcode-generator 1.4.4, MIT), alojado no site por causa da CSP.
- A API devolve `client_url` na resposta de `POST /api/bookings`, também quando o mesmo pedido é repetido.
- `POST /api/client/booking` passou a devolver as linhas de preço e o total.

**Testes:**
- `tests/api.mjs` T1–T4: link na resposta, link igual quando o pedido é repetido, link em inglês, e o link abre a reserva.
- `tests/e2e.mjs` I4: ticket, QR com o link e botão de impressão.
- QR descodificado com um leitor independente, a partir do ecrã e do PDF impresso.

## 5. Testes

- `tests/notifications.mjs`: **28/28**, cobrindo idiomas, cada tipo de notificação, «não notificar», tipo desligado, cliente sem e-mail, falha de envio reportada como falha, reenvio e área do cliente (C1–C9).
- `tests/admin-ui.mjs`: **33/33** no browser, incluindo o aviso real do e-mail (U8b), o link e a área do cliente em 375 px (U27–U29), o registo de e-mails (U30) e as preferências (U31).

Em desenvolvimento, `mail.transport = 'log'` regista sem enviar. Destinatários em domínios `.invalid` (reservados pela RFC 2606) simulam falha. **Em produção (`mail`), esta regra não se aplica.**

**Não testado:** a entrega real pelo Postfix do Plesk. Ver a lista de verificação em `DEPLOYMENT.md` §3.1d.

## 6. E-mail pelo Resend e avisos à equipa pelo WhatsApp (29/10/2026)

Preparado e testado localmente com um servidor falso que imita o Resend e a Meta (`tests/messaging.mjs`). **Falta activar com as contas reais** (passos abaixo). Até lá, o site continua a enviar pelo `mail()` do servidor, e o WhatsApp fica desligado.

Código: `api/src/Mailer.php` (modo `resend`), `api/src/WhatsApp.php`, `http_post_json()` e `secret()` em `api/src/bootstrap.php`, `api/migrations/008_messaging.sql`. Painel: **Definições → Canais de envio** e **E-mails e WhatsApp → WhatsApp**.

### 6.1 O que acontece num pedido de reserva
1. **E-mail à equipa** (`mail.team`) e, se o cliente indicou e-mail, **e-mail ao cliente**, enviados pelo Resend.
2. **WhatsApp a cada número da equipa** (até 5), com o modelo `nova_reserva`: referência, experiência, data, pessoas, cliente, telefone e total.
3. **Falhas:** uma falha do Resend ou da Meta fica registada com o motivo e **nunca impede o pedido**. O cliente recebe a referência na mesma, e a equipa vê a falha em **E-mails e WhatsApp**.
4. **Outros e-mails:** facturas (com PDF em anexo), recibos, notificações, convites e reposição de palavra-passe também saem pelo Resend. O reenvio continua a funcionar.

«Enviado» quer dizer **aceite** pelo Resend ou pela Meta: o id (Resend) ou o `wamid` (Meta) fica guardado no registo. A entrega e a leitura não são seguidas. Para isso seriam precisos webhooks, que podem ser acrescentados depois.

### 6.2 Resend (e-mail)

**Estado em 29/10/2026:**
- **Configuração:** domínio `mozcampadventures.co.mz` verificado no Resend e chave de envio criada (guardada só na configuração local de desenvolvimento, fora do repositório).
- **Envios reais de teste**, ambos aceites pelo Resend:
  - um e-mail para o gmail da empresa;
  - um aviso de teste para a lista da equipa.
- **Por fazer:** confirmar a recepção e que não foi para o spam.
- **Produção:** falta pôr a chave no servidor ao publicar (passo 4).

**Quem recebe os avisos de novos pedidos e de comprovativos:** painel → **Definições → Canais de envio**, até 10 endereços. Todos recebem o mesmo e-mail, enviado de uma só vez. Sem lista, vai para `mail.team`. Lista definida em desenvolvimento:
- dois endereços gmail (empresa e responsável)
- `booking@mozcampadventures.co.mz`
- `info@mozcampadventures.co.mz`

A lista fica na base de dados, por isso **tem de ser introduzida também no painel de produção**. As respostas dos clientes continuam a ir para `mail.team` (`booking@`).

1. Criar a conta em resend.com. Em **Domains → Add domain**, indicar `mozcampadventures.co.mz`.
2. **DNS:** criar no DNS do domínio (Plesk → DNS) os registos que o Resend mostrar: DKIM (`resend._domainkey`) e, para o retorno, MX e SPF no subdomínio indicado.
   - O SPF do domínio principal e o e-mail actual (caixas no Plesk) não mudam.
   - Esperar até o Resend marcar o domínio como **Verified**.
3. **API Keys → Create API key**, com permissão *Sending access* e limitada ao domínio. A chave começa por `re_`.
4. **No servidor**, de preferência como variável de ambiente `RESEND_API_KEY` (Plesk → PHP Settings ou configuração do PHP-FPM). Em alternativa, `mail.resend_key` em `private/mca-config.php`. **Nunca** no repositório nem no painel.
5. Em `private/mca-config.php`: `'transport' => 'resend'`, e `from` num endereço do domínio verificado (ex.: `no-reply@mozcampadventures.co.mz`).
6. **Teste:** painel → **Definições → Canais de envio → Enviar e-mail de teste** (vai para `mail.team`). O resultado aparece logo, e o e-mail fica em **E-mails e WhatsApp**.

**Limites do plano gratuito do Resend** (confirmar em resend.com/pricing, porque mudam): uma quota mensal e diária de e-mails e cerca de 2 pedidos por segundo. Um pedido de reserva gera 2 e-mails. Um 429 (limite por segundo) é repetido automaticamente uma vez.

### 6.3 Meta WhatsApp Cloud API (avisos à equipa)
1. **Conta e aplicação:**
   - em business.facebook.com, usar (ou criar) a conta empresarial da Moz Camp Adventures; a verificação da empresa é recomendada;
   - em developers.facebook.com, criar uma app do tipo **Business** e adicionar o produto **WhatsApp**.
2. **Número que envia:**
   - registar o número da empresa na conta WhatsApp Business (WhatsApp Manager → Phone numbers);
   - um número que já está na app WhatsApp normal não pode ser usado em simultâneo sem migração;
   - **usar um número dedicado**, ou confirmar com a Meta a opção de coexistência com a app WhatsApp Business;
   - copiar o **Phone number ID** (é um id, não o número de telefone).
3. **Token permanente:**
   - em Business Settings → **System users**, criar um utilizador de sistema (Admin);
   - atribuir-lhe a app e a conta WhatsApp;
   - **Generate token**, com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
   - O token temporário da página «API Setup» expira em 24 h.
4. **Pagamento:** adicionar um método de pagamento à conta WhatsApp. Os modelos «Utility» são cobrados por mensagem (preços por país em developers.facebook.com/docs/whatsapp/pricing).
5. **Modelo:** WhatsApp Manager → **Message templates → Create**, com:
   - **Categoria:** *Utility*;
   - **Nome:** `nova_reserva`;
   - **Idioma:** *Portuguese (POR)*, ou seja, `pt_PT`;
   - **Corpo:** o texto abaixo (as variáveis têm de ficar por esta ordem):
     ```
     Novo pedido de reserva {{1}}
     Experiência: {{2}}
     Data: {{3}}
     Pessoas: {{4}}
     Cliente: {{5}} ({{6}})
     Total estimado: {{7}}
     Confirme a disponibilidade no painel.
     ```
   - **Exemplos para a aprovação:** `MCA-2026-00123`, `Ponta D'Ouro — Dia Completo`, `2026-11-14`, `4 (3 adultos, 1 crianças)`, `Joana Silva`, `+258 84 000 0000`, `36.000 MZN`.
   - **Botão (opcional):** *Visit website*, URL dinâmico `https://mozcampadventures.co.mz/admin/#/reservas/{{1}}`, texto «Abrir no painel». Se o usar, pôr `'button' => true` na configuração.
   - Esperar pela aprovação (normalmente minutos a horas).
6. **No servidor:**
   - token como variável de ambiente `WHATSAPP_TOKEN`, ou em `whatsapp.token` na configuração;
   - em `private/mca-config.php`, o bloco `whatsapp`: `mode` `api`, `phone_number_id`, `template`, `language`, `button`.
   - Se o modelo for aprovado com outro nome ou idioma, basta mudar `template` e `language`.
7. **Painel → Definições → Canais de envio:**
   - indicar os números da equipa, até 5, em formato internacional; números moçambicanos podem ir sem o 258;
   - marcar «Avisar a equipa por WhatsApp» e guardar;
   - **Enviar WhatsApp de teste**: cada número recebe uma mensagem com a referência `MCA-TESTE`.

**Erros comuns, como aparecem no registo:**

| Código | Causa |
|---|---|
| `132001` | Modelo inexistente nesse idioma (nome ou `language` errados, ou ainda por aprovar) |
| `132000` | Número de variáveis diferente de 7 |
| `190` | Token inválido ou expirado |
| `131030` | Número de destino não autorizado (só acontece com o número de teste da Meta) |
| `131026` | Destino sem WhatsApp |

### 6.4 Segurança
- **Segredos:** a chave do Resend e o token da Meta nunca chegam ao browser nem aos registos. O painel mostra só se estão configurados, e o Phone number ID mascarado (`••••••7890`).
- **Permissões:**
  - números, interruptor e envios de teste exigem `settings.manage` (Administrador);
  - o registo do WhatsApp exige `emails.manage`.
  - As alterações e os testes ficam na **Auditoria**.
- **Dados enviados à Meta:** a mensagem leva o nome e o telefone do cliente para os números da equipa. É informação que a equipa já recebe por e-mail; mencionar o WhatsApp na Política de Privacidade (textos legais ainda provisórios).
- **Pedidos de saída:** só para `api.resend.com` e `graph.facebook.com`, por HTTPS com verificação do certificado. Precisam de `allow_url_fopen` e da extensão `openssl`, ambos activos por omissão no Plesk.

### 6.5 Testes
- **`tests/messaging.mjs`: 19/19.** Corre sem enviar nada para fora: servidor falso em `127.0.0.1:8799` e um segundo PHP com configuração temporária. Cobre:
  - estado sem segredos;
  - validação e normalização dos números;
  - permissões;
  - pedido → 2 e-mails Resend e 1 WhatsApp por número, com o formato exacto da API (7 variáveis, botão, idioma, token);
  - registos com o id do fornecedor;
  - recusas do Resend (domínio não verificado) e da Meta (modelo inexistente) registadas sem bloquear o pedido;
  - repetição em caso de 429;
  - factura com PDF em anexo;
  - testes do painel;
  - interruptor desligado;
  - auditoria.
- **`tests/admin-ui.mjs`: 57/57**, com U51–U53 no cartão «Canais de envio» e no separador WhatsApp. Captura: `visual-review/painel-v2/19-canais-envio.png`.
- **Não testado** (precisa das contas reais): verificação do domínio no Resend, aprovação do modelo pela Meta, entrega real.

## 7. Layout HTML dos e-mails (30/10/2026)

Todos os e-mails saem com **HTML com a identidade da marca** e com a **versão em texto** (multipart/alternative), para os programas de e-mail que não mostram HTML.

- **Estrutura:**
  - logótipo e faixa com as 4 cores da marca (turquesa, azul, amarelo, laranja);
  - foto da experiência;
  - etiqueta de estado e saudação em Dancing Script;
  - cartão-resumo (referência, experiência, data por extenso, participantes, linhas de preço, total);
  - botão principal e próximos passos;
  - bloco «Dúvidas?» com WhatsApp (com a referência já escrita) e e-mail;
  - rodapé escuro com morada, contactos, Instagram e Facebook.
- **Modelos próprios:**
  - pedido recebido (cliente, PT/EN);
  - novo pedido (equipa, com «Abrir no painel», «WhatsApp do cliente» e «Responder por e-mail»);
  - reserva confirmada, cancelada ou concluída (com «Deixar a minha avaliação»);
  - pagamento recebido, recusado ou anulado, reembolso, factura anulada;
  - factura ou pró-forma (com «Como pagar», a partir das **Definições → Instruções de pagamento**, e «Enviar comprovativo»).
- **Restantes e-mails** (convites ao painel, palavra-passe, testes): o texto é posto automaticamente no mesmo layout, e o link principal passa a botão.
- **Compatibilidade:**
  - tabelas e estilos em linha, para Gmail, Outlook e Apple Mail;
  - 600 px, com coluna única e botões empilhados no telemóvel;
  - 6 a 13 KB por e-mail (o Gmail corta acima de 102 KB);
  - sem Inter nem Dancing Script, o e-mail usa Segoe UI/Arial e Georgia.
- **Imagens:** em `assets/images/_email/`, geradas por `scripts/email-images.mjs` (também na publicação do catálogo):
  - capas em JPG 1200×600, porque o Outlook do Windows não mostra WebP;
  - logótipo a cores e logótipo branco.
  - São servidas a partir de `app.site_url`, por isso só aparecem quando os ficheiros estão no servidor.
- **Registo:** a versão HTML fica em `email_log.body_html` (migração `009_email_html`), e o reenvio sai igual. Nos e-mails de palavra-passe, o registo continua sem o link secreto.
- **Código e ferramentas:**
  - layout em `api/src/EmailView.php`;
  - pré-visualização com dados fictícios: `php tests/email-preview.php <pasta>`;
  - capturas em `visual-review/emails/`.
