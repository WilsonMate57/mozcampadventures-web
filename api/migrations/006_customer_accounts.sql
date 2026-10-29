-- ============================================================
-- MOZ CAMP ADVENTURES — 006_customer_accounts.sql
-- Contas de cliente no site: registo com palavra-passe (a conta
-- funciona de imediato), sessões próprias (separadas das da equipa),
-- reposição da palavra-passe e preferência de promoções (com data).
-- As reservas ficam ligadas à conta quando são feitas com a sessão
-- iniciada (customer_id) — não pelo e-mail, que não é confirmado.
-- ============================================================

CREATE TABLE customers (
  id                     bigserial PRIMARY KEY,
  name                   text NOT NULL CHECK (length(trim(name)) >= 2),
  email                  text NOT NULL,
  phone                  text,
  lang                   text NOT NULL DEFAULT 'pt' CHECK (lang IN ('pt', 'en')),
  password_hash          text NOT NULL,
  reset_token_hash       text,
  reset_expires_at       timestamptz,
  -- Promoções: só com consentimento explícito; guarda quando foi dado e quando foi retirado
  marketing_opt_in       boolean NOT NULL DEFAULT false,
  marketing_consent_at   timestamptz,
  marketing_withdrawn_at timestamptz,
  last_login_at          timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customers_email_idx ON customers (lower(email));

CREATE TABLE customer_sessions (
  token_hash   text PRIMARY KEY,
  customer_id  bigint NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  csrf_token   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  ip_hash      text,
  user_agent   text
);
CREATE INDEX customer_sessions_customer_idx ON customer_sessions (customer_id);

-- Reserva feita com a sessão iniciada → pertence à conta (a conta apagada não apaga a reserva)
ALTER TABLE bookings ADD COLUMN customer_id bigint REFERENCES customers (id) ON DELETE SET NULL;
CREATE INDEX bookings_customer_id_idx ON bookings (customer_id) WHERE customer_id IS NOT NULL;

-- Permissão nova: ver contas de clientes (o Gerente recebe-a por omissão)
UPDATE roles SET permissions = permissions || ARRAY['customers.view']
WHERE code = 'gerente' AND NOT ('customers.view' = ANY (permissions));
