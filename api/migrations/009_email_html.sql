-- ============================================================
-- MOZ CAMP ADVENTURES — 009_email_html.sql
-- E-mails com layout HTML da marca (api/src/EmailView.php):
-- a versão HTML fica no registo, para o reenvio sair igual.
-- ============================================================
ALTER TABLE email_log ADD COLUMN body_html text;
