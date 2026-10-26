-- ============================================================
-- MOZ CAMP ADVENTURES — 002_admin_invoicing.sql (Fase 5)
-- Utilizadores, perfis e permissões, sessões, auditoria,
-- definições da empresa e facturação (FT / PF).
-- ============================================================

-- Perfis. O perfil de sistema 'admin' tem todas as permissões ('*') e não é editável.
CREATE TABLE roles (
  id           serial PRIMARY KEY,
  code         text NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_-]{1,30}$'),
  name         text NOT NULL,
  permissions  text[] NOT NULL DEFAULT '{}',
  is_system    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO roles (code, name, permissions, is_system) VALUES
  ('admin',   'Administrador', ARRAY['*'], true),
  ('gerente', 'Gerente', ARRAY[
     'dashboard.view', 'bookings.view', 'bookings.manage', 'bookings.create',
     'invoices.view', 'invoices.issue', 'invoices.send',
     'reviews.moderate', 'messages.view'], false);

CREATE TABLE users (
  id                 serial PRIMARY KEY,
  name               text NOT NULL,
  email              text NOT NULL,
  role_id            integer NOT NULL REFERENCES roles (id),
  password_hash      text,
  active             boolean NOT NULL DEFAULT true,
  setup_token_hash   text,
  setup_expires_at   timestamptz,
  last_login_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));

-- Sessões do painel (o cookie guarda um token aleatório; aqui só o hash)
CREATE TABLE sessions (
  token_hash   text PRIMARY KEY,
  user_id      integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  csrf_token   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  ip_hash      text,
  user_agent   text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Auditoria de todas as acções administrativas (só acréscimo)
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  user_id     integer REFERENCES users (id),
  user_name   text,
  action      text NOT NULL,
  entity      text,
  entity_id   text,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id);
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION mca_append_only();

-- Definições editáveis no painel (dados da empresa, pagamentos, facturação)
CREATE TABLE settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  integer REFERENCES users (id)
);

-- Facturas e facturas pró-forma
CREATE TABLE invoices (
  id              bigserial PRIMARY KEY,
  doc_type        text NOT NULL CHECK (doc_type IN ('FT', 'PF')),
  status          text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'emitida', 'anulada')),
  series_year     integer,
  seq             integer,
  number          text UNIQUE,
  booking_id      bigint NOT NULL REFERENCES bookings (id) ON DELETE RESTRICT,
  customer        jsonb NOT NULL,          -- {name, email, phone, nuit, address}
  company         jsonb,                   -- cópia dos dados da empresa no momento da emissão
  payment_info    jsonb,                   -- cópia das instruções de pagamento no momento da emissão
  lines           jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{description, qty, unit_price, amount}]
  subtotal        numeric(12, 2) NOT NULL DEFAULT 0,
  total           numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  currency        char(3) NOT NULL DEFAULT 'MZN',
  notes           text,
  issue_date      date,
  issued_at       timestamptz,
  issued_by       integer REFERENCES users (id),
  pdf_path        text,
  pdf_sha256      text,
  void_reason     text,
  voided_at       timestamptz,
  voided_by       integer REFERENCES users (id),
  created_by      integer REFERENCES users (id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'rascunho' OR (number IS NOT NULL AND issued_at IS NOT NULL AND pdf_sha256 IS NOT NULL)),
  CHECK (status <> 'anulada' OR (void_reason IS NOT NULL AND length(trim(void_reason)) >= 5 AND voided_at IS NOT NULL)),
  UNIQUE (doc_type, series_year, seq)
);
CREATE INDEX invoices_booking_idx ON invoices (booking_id);
CREATE INDEX invoices_status_idx ON invoices (status, doc_type, issue_date DESC);

-- Histórico das facturas (só acréscimo)
CREATE TABLE invoice_events (
  id          bigserial PRIMARY KEY,
  invoice_id  bigint NOT NULL REFERENCES invoices (id) ON DELETE RESTRICT,
  type        text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id     integer REFERENCES users (id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER invoice_events_append_only BEFORE UPDATE OR DELETE ON invoice_events FOR EACH ROW EXECUTE FUNCTION mca_append_only();

-- Integridade documental: uma factura emitida não muda; só pode passar a «anulada»
-- (preenchendo motivo, data e autor). Rascunhos podem ser editados e descartados.
CREATE FUNCTION mca_invoice_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'rascunho' THEN
      RAISE EXCEPTION 'Factura % não pode ser apagada (estado %)', OLD.number, OLD.status;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'anulada' THEN
    RAISE EXCEPTION 'Factura % anulada não pode ser alterada', OLD.number;
  END IF;
  IF OLD.status = 'emitida' THEN
    IF NEW.status <> 'anulada'
       OR (to_jsonb(NEW) - ARRAY['status', 'void_reason', 'voided_at', 'voided_by', 'updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'void_reason', 'voided_at', 'voided_by', 'updated_at']) THEN
      RAISE EXCEPTION 'Factura % emitida não pode ser alterada (só anulada)', OLD.number;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER invoices_guard BEFORE UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION mca_invoice_guard();

CREATE TRIGGER roles_touch BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION mca_touch();
CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION mca_touch();
