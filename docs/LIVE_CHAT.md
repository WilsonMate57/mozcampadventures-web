# Live Chat

Atendimento em tempo real no site, sem conta e sem serviços externos. Tudo fica na base de dados do projecto.

## 1. Para a equipa

**Ficar disponível.** Em Live Chat, escolha **Online** em «O meu estado». Abrir o painel não basta: quem não escolher Online aparece como offline.

**Atender.** A lista tem os filtros Novas, Não atribuídas, Em atendimento, Aguardando resposta e Encerradas. Abra uma conversa e responda: Enter envia e Shift+Enter muda de linha. Ao responder, fica responsável pela conversa, se ainda não tiver ninguém.

**Na coluna da direita:** dados do visitante, pacote da página onde começou, reserva associada, atribuição, encerrar ou reabrir, e notas internas. As notas nunca chegam ao visitante.

**Permissões.** `chat.view` permite ver; `chat.manage` permite atender. O perfil Gerente tem as duas. Perfis personalizados têm de as receber em Utilizadores e perfis.

**Definições** (botão na página Live Chat, com `settings.manage`): mostrar ou esconder o chat no site, horário, prazo de retenção e aviso por e-mail.

## 2. Disponibilidade

O estado é calculado no servidor.

| Estado efectivo | Condição |
| --- | --- |
| Online | Escolheu Online, o painel deu sinal nos últimos 90 s e houve actividade real nos últimos 15 minutos |
| Ausente | Escolheu Ausente, ou está Online sem actividade há mais de 15 minutos |
| Offline | Escolheu Offline, ou o painel não dá sinal há mais de 90 s |

O painel envia um sinal de 30 em 30 s em qualquer página, desde que esteja aberto. Só conta como actividade o uso real do rato, teclado ou ecrã.

O site mostra Online se houver pelo menos uma pessoa online, Ausente se só houver ausentes, e Offline nos restantes casos. Fora do horário definido mostra sempre Offline. Sem horário definido, depende só da presença da equipa.

## 3. Sem ninguém disponível

O visitante vê o aviso e pode deixar a mensagem. A equipa recebe um e-mail, que pode ser desligado nas Definições, e a conversa fica em «Aguardando resposta».

Se o visitante não vir a resposta ao fim de 5 minutos, a tarefa agendada envia-lhe por e-mail tudo o que ficou por ler, numa só mensagem e na língua dele. **Sem a tarefa agendada, quem saiu do site não recebe a resposta.**

## 4. Instalar

1. `php httpdocs/api/bin/migrate.php` aplica a `012_live_chat`.
2. Confirme a tarefa agendada do Plesk, de 5 em 5 minutos ([WHATSAPP.md](WHATSAPP.md) §4). É a mesma do WhatsApp.
3. Confirme `upload_max_filesize` de pelo menos 8M, já exigido pelos comprovativos.
4. Faça uma conversa de teste com dois dispositivos antes de divulgar.

O chat fica visível no site logo depois da publicação. Para o esconder até a equipa estar preparada, desligue-o nas Definições.

## 5. Como funciona

**Tempo real.** O servidor não tem WebSockets nem Redis, por isso o site consulta a API: de 3 em 3 s com a janela aberta, de 20 em 20 s minimizada e de 60 em 60 s com o separador oculto. Depois de uma falha, as consultas espaçam-se até 30 s. Quem nunca abriu o chat faz no máximo um pedido por minuto de navegação.

**Sessão.** Cookie `mca_chat`, HttpOnly e SameSite=Strict, com um token aleatório. Na base de dados fica só o hash. O visitante pode terminar a sessão no seu dispositivo; a conversa continua disponível para a equipa.

**Conversa encerrada.** Se o visitante voltar a escrever, a conversa reabre com o histórico.

**Ficheiros.** Imagens JPEG, PNG e WebP, e PDF, até 5 MB. O tipo é verificado pelo conteúdo do ficheiro e não pelo nome. Ficam em `storage/chat/`, fora da pasta pública, e só a conversa dona ou a equipa os abre.

**Limites contra spam.** 5 conversas por hora por IP, 30 mensagens por minuto e 10 ficheiros por hora por conversa, e campo-armadilha no formulário.

**Retenção.** Conversas, notas e ficheiros são apagados 12 meses após a última mensagem. O prazo é configurável até 24 meses.

**Reservas.** Quem conversa e reserva no mesmo browser fica ligado à reserva automaticamente. Para os outros casos, o painel sugere reservas com o mesmo e-mail, e a equipa pode associá-las.

## 6. Carga

Cada consulta faz cinco leituras simples à base de dados e só escreve quando há novidades, ou de 15 em 15 s com a janela aberta. 20 janelas abertas geram cerca de 7 pedidos por segundo.

Medido em desenvolvimento, com um único processo PHP em Windows e sem opcache: cerca de 12 consultas por segundo. Nesse ambiente, um pedido `/health` demora mais do que uma consulta do chat, por isso o limite vem do ambiente e não das consultas.

**Falta medir na produção**, que tem até 10 processos PHP e 2 CPU. Depois de publicar, acompanhe a carga durante os primeiros dias de uso real.
