-- ============================================================
-- MOZ CAMP ADVENTURES — 001_init.sql (Fase 4)
-- Pedidos de reserva com referência, mensagens de contacto,
-- avaliações (geridas no site), registo de e-mails, limites de
-- pedidos e contadores. PostgreSQL ≥ 13.
-- Reversão: ver docs/ARQUITECTURA.md §5 (DROP das tabelas criadas aqui).
-- ============================================================

-- Contadores atómicos (referências de reserva; mais tarde séries de facturas)
CREATE TABLE counters (
  name   text PRIMARY KEY,
  value  bigint NOT NULL CHECK (value >= 0)
);

-- Pedidos de reserva. O estado operacional NÃO é o estado financeiro (Fase 6).
CREATE TABLE bookings (
  id                bigserial PRIMARY KEY,
  reference         text NOT NULL UNIQUE CHECK (reference ~ '^MCA-[0-9]{4}-[0-9]{5,}$'),
  idempotency_key   uuid UNIQUE,
  status            text NOT NULL DEFAULT 'pedido'
                    CHECK (status IN ('pedido', 'confirmada', 'cancelada', 'concluida')),
  channel           text NOT NULL DEFAULT 'site' CHECK (channel IN ('site', 'whatsapp', 'email', 'manual')),
  lang              text NOT NULL DEFAULT 'pt' CHECK (lang IN ('pt', 'en')),
  item_id           text NOT NULL,
  item_kind         text NOT NULL CHECK (item_kind IN ('tour', 'stay')),
  item_name         text NOT NULL,
  service_date      date,
  checkin           date,
  checkout          date,
  nights            integer CHECK (nights IS NULL OR nights > 0),
  adults            integer NOT NULL CHECK (adults >= 1),
  children          integer NOT NULL DEFAULT 0 CHECK (children >= 0),
  options           jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_lines       jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_estimate    numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total_estimate >= 0),
  total_to_confirm  boolean NOT NULL DEFAULT false,
  currency          char(3) NOT NULL DEFAULT 'MZN',
  customer_name     text NOT NULL,
  customer_phone    text NOT NULL,
  customer_email    text,
  customer_message  text,
  access_token_hash text NOT NULL,
  ip_hash           text,
  user_agent        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((item_kind = 'tour' AND service_date IS NOT NULL) OR (item_kind = 'stay' AND checkin IS NOT NULL AND checkout > checkin))
);
CREATE INDEX bookings_created_idx ON bookings (created_at DESC);
CREATE INDEX bookings_status_idx ON bookings (status);
CREATE INDEX bookings_customer_idx ON bookings (lower(customer_name), customer_phone);

-- Histórico da reserva (só acréscimo)
CREATE TABLE booking_events (
  id          bigserial PRIMARY KEY,
  booking_id  bigint NOT NULL REFERENCES bookings (id) ON DELETE RESTRICT,
  type        text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor       text NOT NULL DEFAULT 'system',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_events_booking_idx ON booking_events (booking_id, created_at);

-- Mensagens do formulário de contacto
CREATE TABLE contact_messages (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL,
  email       text NOT NULL,
  phone       text,
  subject     text NOT NULL,
  message     text NOT NULL,
  lang        text NOT NULL DEFAULT 'pt',
  status      text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'respondido', 'arquivado')),
  ip_hash     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Avaliações (substituem a colecção `reviews` do Firestore)
CREATE TABLE reviews (
  id            bigserial PRIMARY KEY,
  item_id       text,
  name          text NOT NULL,
  origin        text,
  rating        smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body          text NOT NULL,
  lang          text NOT NULL DEFAULT 'pt',
  status        text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'rejeitada')),
  ip_hash       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  moderated_at  timestamptz,
  moderated_by  text
);
CREATE INDEX reviews_public_idx ON reviews (status, item_id, created_at DESC);

-- Registo de e-mails (nunca se afirma um envio que falhou)
CREATE TABLE email_log (
  id            bigserial PRIMARY KEY,
  kind          text NOT NULL,
  to_addr       text NOT NULL,
  subject       text NOT NULL,
  related_type  text,
  related_id    bigint,
  status        text NOT NULL CHECK (status IN ('sent', 'failed', 'logged')),
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Limites de pedidos por IP (janela fixa)
CREATE TABLE rate_limits (
  key           text NOT NULL,
  window_start  timestamptz NOT NULL,
  hits          integer NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);

-- Registos só de acréscimo: impedir UPDATE/DELETE
CREATE FUNCTION mca_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Tabela % é só de acréscimo: % não permitido', TG_TABLE_NAME, TG_OP;
END $$;
CREATE TRIGGER booking_events_append_only BEFORE UPDATE OR DELETE ON booking_events FOR EACH ROW EXECUTE FUNCTION mca_append_only();
CREATE TRIGGER email_log_append_only      BEFORE UPDATE OR DELETE ON email_log      FOR EACH ROW EXECUTE FUNCTION mca_append_only();

-- updated_at automático
CREATE FUNCTION mca_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER bookings_touch BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION mca_touch();
