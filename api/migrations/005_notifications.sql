-- ============================================================
-- MOZ CAMP ADVENTURES — 005_notifications.sql (Fase 7)
-- Notificações ao cliente, área do cliente e registo de e-mails
-- com reenvio.
-- ============================================================

-- Área do cliente: o link é uma assinatura HMAC(app.secret, reserva + versão).
-- Nada secreto fica guardado; aumentar a versão revoga todos os links anteriores.
ALTER TABLE bookings ADD COLUMN client_link_version integer NOT NULL DEFAULT 1 CHECK (client_link_version >= 1);

-- Registo de e-mails: corpo e anexos (caminhos) para diagnóstico e reenvio
ALTER TABLE email_log ADD COLUMN body text;
ALTER TABLE email_log ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE email_log ADD COLUMN lang text;
ALTER TABLE email_log ADD COLUMN resent_of bigint REFERENCES email_log (id);
ALTER TABLE email_log ADD COLUMN reply_to text;
CREATE INDEX email_log_created_idx ON email_log (created_at DESC);
CREATE INDEX email_log_status_idx ON email_log (status, created_at DESC);

-- Tipos de notificação activos (editáveis em Definições)
INSERT INTO settings (key, value) VALUES ('notifications', '{
  "booking_received": true,
  "booking_confirmed": true,
  "booking_cancelled": true,
  "booking_completed": true,
  "payment_confirmed": true,
  "payment_refused": true,
  "payment_reversed": true,
  "refund": true,
  "invoice_voided": true
}'::jsonb) ON CONFLICT (key) DO NOTHING;

-- Permissão nova: registo de e-mails (o Gerente recebe-a por omissão)
UPDATE roles SET permissions = permissions || ARRAY['emails.manage']
WHERE code = 'gerente' AND NOT ('emails.manage' = ANY (permissions));
