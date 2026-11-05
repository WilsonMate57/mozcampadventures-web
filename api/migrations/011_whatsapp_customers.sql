-- ============================================================
-- MOZ CAMP ADVENTURES — 011_whatsapp_customers.sql
-- WhatsApp Business Cloud API: mensagens a clientes com consentimento,
-- estados de entrega (webhook), mensagens recebidas e pedidos de saída.
-- Tokens nunca ficam em claro: settings «whatsapp_secrets» guarda-os cifrados.
-- ============================================================

-- Consentimento por reserva (as reservas anteriores ficam sem consentimento)
ALTER TABLE bookings ADD COLUMN whatsapp_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN whatsapp_opt_in_at timestamptz;

-- Fila e histórico: uma linha por mensagem; o estado evolui com o envio e com o webhook
CREATE TABLE whatsapp_messages (
  id               bigserial PRIMARY KEY,
  kind             text NOT NULL,            -- booking_received, booking_confirmed, booking_changed, booking_cancelled, activity_reminder, booking_team, test
  audience         text NOT NULL DEFAULT 'customer' CHECK (audience IN ('customer', 'team')),
  to_number        text NOT NULL,            -- internacional, só algarismos
  lang             text NOT NULL DEFAULT 'pt',
  template         text NOT NULL,
  params           jsonb NOT NULL DEFAULT '[]'::jsonb,
  button           text,
  booking_id       bigint REFERENCES bookings (id) ON DELETE SET NULL,
  dedupe_key       text UNIQUE,              -- a mesma notificação nunca entra duas vezes
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'logged')),
  error            text,
  provider_id      text,                     -- wamid devolvido pela Meta
  attempts         integer NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  locked_at        timestamptz,              -- impede que o envio imediato e a tarefa agendada enviem a mesma mensagem
  created_at       timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz,
  delivered_at     timestamptz,
  read_at          timestamptz,
  failed_at        timestamptz
);
CREATE UNIQUE INDEX whatsapp_messages_provider_idx ON whatsapp_messages (provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX whatsapp_messages_queue_idx ON whatsapp_messages (next_attempt_at) WHERE status = 'pending';
CREATE INDEX whatsapp_messages_created_idx ON whatsapp_messages (created_at DESC);
CREATE INDEX whatsapp_messages_booking_idx ON whatsapp_messages (booking_id);

-- Eventos do webhook (só acrescentar): a chave única torna inofensivas as chamadas repetidas da Meta
CREATE TABLE whatsapp_events (
  id           bigserial PRIMARY KEY,
  event_key    text NOT NULL UNIQUE,         -- status:<wamid>:<estado> ou message:<wamid>
  type         text NOT NULL,                -- status, message
  wamid        text,
  from_number  text,
  body         text,
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_events_created_idx ON whatsapp_events (created_at DESC);
CREATE TRIGGER whatsapp_events_append_only BEFORE UPDATE OR DELETE ON whatsapp_events FOR EACH ROW EXECUTE FUNCTION mca_append_only();

-- Quem pediu para deixar de receber mensagens (STOP, ou retirado no painel)
CREATE TABLE whatsapp_optouts (
  number      text PRIMARY KEY,
  source      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- O histórico antigo dos avisos à equipa passa para a tabela nova (whatsapp_log fica só como arquivo)
INSERT INTO whatsapp_messages (kind, audience, to_number, template, params, booking_id, status, error, provider_id, created_at, sent_at, failed_at)
SELECT l.kind, 'team', l.to_number, l.template, l.params, b.id, l.status, l.error, l.provider_id, l.created_at,
       CASE WHEN l.status = 'sent' THEN l.created_at END, CASE WHEN l.status = 'failed' THEN l.created_at END
FROM whatsapp_log l LEFT JOIN bookings b ON l.related_type = 'booking' AND b.id = l.related_id
ORDER BY l.id
ON CONFLICT DO NOTHING;

-- Mensagens a clientes ficam desligadas até os modelos estarem aprovados pela Meta
INSERT INTO settings (key, value) VALUES ('whatsapp_api', '{"customer_enabled": false, "reminder_days": 1, "events": {"booking_received": true, "booking_confirmed": true, "booking_changed": true, "booking_cancelled": true, "activity_reminder": true}}') ON CONFLICT (key) DO NOTHING;
