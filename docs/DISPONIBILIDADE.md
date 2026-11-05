# Disponibilidade dos pacotes

Fase 2 do plano «Live Chat, WhatsApp e Disponibilidade». Concluída localmente; não publicada.

Código: `api/src/Availability.php`, `api/migrations/010_availability.sql`, `admin/admin.js` (`availability`), `assets/js/site.js` (`initAvailability`).

## 1. Como funciona

- **Sem configuração, nada muda.** Um pacote sem regra continua aberto «sob confirmação», sem limite. Só passa a ser controlado quando a equipa define a regra.
- **O site consulta a disponibilidade real** em `GET /api/availability` e mostra só as datas reserváveis. Sem resposta da API, volta ao campo de data normal.
- **O servidor decide sempre.** No momento da reserva, volta a verificar a data, a sessão e as vagas, dentro da transacção que grava a reserva.

## 2. O que ocupa vagas

| Estado da reserva | Ocupa vagas? |
|---|---|
| `pedido` | Sim, durante a retenção (48 h por omissão, configurável em **Disponibilidade**). Depois liberta, e o pedido continua por tratar |
| `confirmada`, `concluida` | Sim, sem prazo |
| `cancelada` | Não: liberta logo |

- **Confirmar um pedido com a retenção expirada**, ou reabrir uma reserva cancelada, volta a verificar as vagas. Sem lugar, o painel avisa e o administrador pode forçar; fica registado no histórico.
- **Pedidos manuais** seguem as mesmas regras, com a opção «Registar mesmo sem vagas ou com a data bloqueada».
- **Reservas fora das sessões actuais** (anteriores às sessões, ou numa sessão retirada) contam contra todas as sessões da data, para nunca haver vagas a mais.

## 3. Regras por pacote

| Campo | Efeito |
|---|---|
| Funcionamento | Aberto todos os dias salvo bloqueios, ou só nos dias da semana definidos e nas datas abertas |
| Capacidade | Por data ou por sessão. Vazio = sem limite |
| Conta | Pessoas, ou unidades (cada reserva ocupa 1: barco, viatura) |
| Sessões | Horários, por exemplo `09:00, 16:30`. O cliente tem de escolher um |
| Antecedência mínima e máxima | Em horas e em dias, em hora de Maputo |

**Em cada data:** bloquear, abrir, alterar a capacidade, criar uma sessão ou repor a regra. **Por intervalo:** bloquear um pacote ou todos, com motivo. As reservas já existentes nas datas bloqueadas mantêm-se.

**Alojamentos:** uma estadia ocupa uma linha por noite, e a noite de saída não conta. No site, os campos de entrada e saída mantêm-se, e o formulário avisa se houver noites indisponíveis.

**Pacotes de férias** (`/holiday-packages/`): ficam fora do calendário, porque são pedidos por WhatsApp e e-mail.

## 4. Concorrência

Dentro da transacção da reserva, `pg_advisory_xact_lock` bloqueia o par pacote + data. Os pedidos simultâneos contam as vagas um de cada vez. Nas estadias, as noites são bloqueadas sempre pela mesma ordem, para evitar bloqueios cruzados. Testado com 12 pedidos em simultâneo para 3 vagas: entram exactamente 3.

## 5. Dados

| Tabela | Conteúdo |
|---|---|
| `availability_rules` | Regra de cada pacote (`item_id` = slug do catálogo) |
| `availability_slots` | Excepções por data ou sessão |
| `availability_blocks` | Bloqueios por intervalo (`item_id` vazio = todos os pacotes) |
| `booking_slots` | Datas ocupadas por cada reserva |
| `bookings.session`, `bookings.hold_expires_at` | Sessão escolhida e fim da retenção |

A migração 010 liga as reservas já existentes às suas datas, por isso contam desde o primeiro dia.

**Permissões novas:** `availability.view` e `availability.manage` (Administrador e Gerente, por omissão).

## 6. Publicar

1. Backup da base de dados.
2. Deploy do código e `/opt/plesk/php/8.4/bin/php httpdocs/api/bin/migrate.php`, que aplica a `010_availability`.
3. Em **Disponibilidade**, configurar pacote a pacote. Até lá, tudo continua sob confirmação.

## 7. Deploy por Git e catálogo do painel

O deploy por Git substitui `data/*.json` pela versão do repositório. A partir de agora, cada publicação no painel guarda uma cópia em `storage/catalog-live/`, e `api/bin/catalog-restore.php` repõe-a e regenera o site.

Colocar em **Plesk → Git → Deployment actions**:

```
/opt/plesk/php/8.4/bin/php api/bin/catalog-restore.php
```

**Primeira vez:** as edições publicadas no painel antes desta versão ainda não têm cópia. **Antes** do deploy desta versão, criar a cópia no servidor:

```
cd /var/www/vhosts/mozcampadventures.co.mz
mkdir -p private/storage/catalog-live
cp httpdocs/data/tours.json httpdocs/data/accommodations.json httpdocs/data/en.json httpdocs/data/booking-rules.json httpdocs/data/categories.json private/storage/catalog-live/
chown -R mozcampadventures.co_9g95rl365mr:psacln private/storage/catalog-live
```

Com esta cópia, o catálogo do servidor prevalece sobre o do repositório em todos os deploys. Para fazer entrar no site uma alteração feita em `data/*.json` no repositório, apagar a cópia antes do deploy.

## 8. Limitações

- **Dados operacionais por definir:** capacidade, dias e horários reais de cada pacote são da equipa; não há valores inventados.
- **Alterar a data de uma reserva:** o painel não tem esta função; é preciso cancelar e criar outra.
- **PHP:** os testes correm em PHP 8.2 e o servidor usa 8.4.
