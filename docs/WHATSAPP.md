# WhatsApp Business (Meta Cloud API)

Mensagens automáticas a clientes que autorizaram e avisos à equipa. Usa só a API oficial da Meta.

Enquanto os modelos não estiverem aprovados, deixe **Enviar mensagens a clientes** desligado (é o valor inicial). As reservas funcionam na mesma.

## 1. O que precisa da Meta

| Dado | Onde está | Onde colocar |
| --- | --- | --- |
| Número de WhatsApp da empresa | WhatsApp Manager | Definições → Número remetente |
| Phone Number ID | App → WhatsApp → API Setup | Definições → Phone Number ID |
| WhatsApp Business Account ID | App → WhatsApp → API Setup | Definições |
| App ID e App Secret | App → App settings → Basic | Definições |
| Access Token permanente | Business Settings → System users → Generate token, com `whatsapp_business_messaging` e `whatsapp_business_management` | Definições |
| Verify Token | Inventado por si: um texto longo e aleatório | Definições, e no passo 2 |

Token, App Secret e Verify Token ficam cifrados na base de dados (AES-256-GCM, com chave derivada de `app.secret`, que está fora da base de dados). O painel não os volta a mostrar; indica apenas se existem. Em alternativa, podem ser definidos nas variáveis de ambiente `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET` e `WHATSAPP_VERIFY_TOKEN`, que têm prioridade.

**Se `app.secret` mudar, os valores guardados deixam de ser legíveis** e têm de ser introduzidos de novo.

Confirme no painel da Meta a versão actual da API. O valor por omissão é `v21.0` e pode ser alterado em Definições.

## 2. Webhook

Sem o webhook, as mensagens ficam em «Enviada»: a entrega, a leitura e os pedidos STOP só chegam por aqui.

1. Em Definições, guarde o App Secret e o Verify Token.
2. Na app da Meta: WhatsApp → Configuration → Webhook → Edit.
3. Callback URL: `https://mozcampadventures.co.mz/api/whatsapp/webhook` (também aparece em Definições).
4. Verify token: o mesmo das Definições.
5. Em Webhook fields, subscreva `messages`.

Todos os pedidos são validados com a assinatura `X-Hub-Signature-256`. O webhook nunca envia mensagens.

## 3. Modelos a submeter para aprovação

Crie cada modelo em WhatsApp Manager → Message templates, categoria **Utility**, com o mesmo nome em Portuguese (Portugal) e em English (US). Acrescente em todos o rodapé indicado.

Rodapé PT: `Responda STOP para deixar de receber mensagens.`
Rodapé EN: `Reply STOP to stop receiving messages.`

Os contactos estão no texto fixo. Confirme-os antes de submeter.

### mca_reserva_recebida

Parâmetros: 1 nome, 2 referência, 3 pacote, 4 destino, 5 data, 6 participantes, 7 total estimado, 8 estado.

> Olá {{1}}, recebemos o seu pedido {{2}}.
> Pacote: {{3}}
> Destino: {{4}}
> Data: {{5}}
> Participantes: {{6}}
> Total estimado: {{7}}
> Estado: {{8}}
> A equipa da Moz Camp Adventures vai confirmar a disponibilidade. Contacto: booking@mozcampadventures.co.mz

> Hello {{1}}, we have received your request {{2}}.
> Package: {{3}}
> Destination: {{4}}
> Date: {{5}}
> Participants: {{6}}
> Estimated total: {{7}}
> Status: {{8}}
> The Moz Camp Adventures team will confirm availability. Contact: booking@mozcampadventures.co.mz

### mca_reserva_confirmada

Parâmetros: 1 nome, 2 referência, 3 pacote, 4 destino, 5 data, 6 participantes, 7 total.

> Olá {{1}}, a sua reserva {{2}} está confirmada.
> Pacote: {{3}}
> Destino: {{4}}
> Data: {{5}}
> Participantes: {{6}}
> Total: {{7}}
> Obrigado por escolher a Moz Camp Adventures.

> Hello {{1}}, your booking {{2}} is confirmed.
> Package: {{3}}
> Destination: {{4}}
> Date: {{5}}
> Participants: {{6}}
> Total: {{7}}
> Thank you for choosing Moz Camp Adventures.

### mca_reserva_alterada

Parâmetros: 1 nome, 2 referência, 3 pacote, 4 data, 5 o que mudou.

> Olá {{1}}, a sua reserva {{2}} ({{3}}, {{4}}) foi actualizada: {{5}}

> Hello {{1}}, your booking {{2}} ({{3}}, {{4}}) has been updated: {{5}}

### mca_reserva_cancelada

Parâmetros: 1 nome, 2 referência, 3 pacote, 4 data, 5 motivo.

> Olá {{1}}, a sua reserva {{2}} ({{3}}, {{4}}) foi cancelada: {{5}}

> Hello {{1}}, your booking {{2}} ({{3}}, {{4}}) has been cancelled: {{5}}

### mca_lembrete_actividade

Parâmetros: 1 nome, 2 pacote, 3 data, 4 participantes, 5 referência.

> Olá {{1}}, lembramos a sua actividade {{2}} em {{3}}, para {{4}} participantes. Referência: {{5}}

> Hello {{1}}, this is a reminder of your activity {{2}} on {{3}}, for {{4}} participants. Reference: {{5}}

O aviso à equipa continua a usar o modelo `nova_reserva` (ver [NOTIFICACOES.md](NOTIFICACOES.md)).

## 4. Tarefa agendada

Repete envios temporariamente falhados e envia os lembretes a partir das 08:00 de Maputo. Também envia as respostas do Live Chat a quem saiu do site e aplica a retenção das conversas. Em Plesk → Tarefas agendadas, crie uma tarefa de 5 em 5 minutos:

```
/opt/plesk/php/8.4/bin/php /var/www/vhosts/mozcampadventures.co.mz/httpdocs/api/bin/worker.php
```

Sem esta tarefa, o envio imediato funciona, mas não há repetições nem lembretes.

## 5. Ordem para activar

1. Aplicar a migração `011_whatsapp_customers`.
2. Preencher as Definições e usar **Testar ligação**.
3. Configurar o webhook.
4. Criar a tarefa agendada.
5. Esperar a aprovação dos modelos.
6. Ligar **Enviar mensagens a clientes** e fazer uma reserva de teste com um número próprio.

## 6. Como funciona

**Quem recebe.** Só clientes que marcaram a autorização na reserva, ou cuja autorização foi registada pela equipa no pedido manual. As reservas anteriores ficam sem autorização.

**Saída.** Quem responde STOP, PARAR, SAIR ou UNSUBSCRIBE deixa de receber mensagens. A equipa também pode retirar a autorização na reserva. A saída vale para o número, mesmo que o cliente volte a marcar a caixa numa reserva nova. Para a anular, é preciso apagar a linha em `whatsapp_optouts`.

**Estados.**

| Estado | Significado |
| --- | --- |
| Pendente | Na fila, ou à espera de nova tentativa |
| Enviada | A Meta aceitou. Não significa que foi entregue |
| Entregue | Confirmado pelo webhook |
| Lida | Confirmado pelo webhook. Depende das definições de privacidade do cliente |
| Falhou | Recusada pela Meta, ou sem confirmação de envio |
| Modo de teste | Registada sem enviar (`whatsapp.mode = 'log'`) |

**Repetições.** Só se repetem sozinhas as falhas temporárias da Meta (HTTP 429 ou 5xx), até 5 tentativas. Sem resposta da Meta, ou com o envio interrompido, a mensagem pode ter saído: fica «Falhou» com aviso para confirmar antes de reenviar.

**Reenvio.** Em E-mails → WhatsApp, só as mensagens falhadas têm **Reenviar**. Actualiza a mesma linha, por isso duas ordens seguidas enviam uma só vez.

**Mensagens recebidas.** Aparecem em E-mails → WhatsApp e não são respondidas automaticamente.

## 7. Custos

A Meta cobra por modelo entregue, conforme a categoria e o país de destino. Consulte a tabela actual no painel da Meta antes de activar. O site não acrescenta custos.
