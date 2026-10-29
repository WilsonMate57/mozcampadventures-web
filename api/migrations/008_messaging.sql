-- ============================================================
-- MOZ CAMP ADVENTURES — 008_messaging.sql
-- E-mail pelo Resend e avisos à equipa pelo WhatsApp (Meta Cloud API).
-- Chaves e tokens NÃO ficam na base de dados: variáveis de ambiente
-- ou private/mca-config.php (ver docs/NOTIFICACOES.md §6).
-- ============================================================

-- Registo de e-mails: por onde saiu e o id devolvido pelo fornecedor (para procurar no painel do Resend)
ALTER TABLE email_log ADD COLUMN provider text;
ALTER TABLE email_log ADD COLUMN provider_id text;

-- Registo de mensagens WhatsApp (só acrescentar, como o de e-mails)
CREATE TABLE whatsapp_log (
  id            bigserial PRIMARY KEY,
  kind          text NOT NULL,                 -- booking_team, test
  to_number     text NOT NULL,                 -- número da equipa, formato internacional sem «+»
  template      text NOT NULL,
  params        jsonb NOT NULL DEFAULT '[]'::jsonb,
  related_type  text,
  related_id    bigint,
  status        text NOT NULL CHECK (status IN ('sent', 'failed', 'logged')),
  error         text,
  provider_id   text,                          -- wamid devolvido pela Meta
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_log_created_idx ON whatsapp_log (created_at DESC);
CREATE TRIGGER whatsapp_log_append_only BEFORE UPDATE OR DELETE ON whatsapp_log FOR EACH ROW EXECUTE FUNCTION mca_append_only();

-- Números da equipa que recebem os avisos (editáveis em Definições; desligado até ser configurado)
INSERT INTO settings (key, value) VALUES ('whatsapp', '{"enabled": false, "recipients": []}') ON CONFLICT (key) DO NOTHING;

