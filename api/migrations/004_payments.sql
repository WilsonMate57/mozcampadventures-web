-- ============================================================
-- MOZ CAMP ADVENTURES — 004_payments.sql (Fase 6)
-- Pagamentos, reembolsos, comprovativos e recibos (RC).
-- O estado financeiro é CALCULADO a partir dos movimentos
-- confirmados (vista invoice_balances) — nunca escrito à mão.
-- ============================================================

-- Recibos: emitidos automaticamente quando um pagamento é confirmado
CREATE TABLE receipts (
  id           bigserial PRIMARY KEY,
  number       text NOT NULL UNIQUE,
  series_year  integer NOT NULL,
  seq          integer NOT NULL,
  invoice_id   bigint NOT NULL REFERENCES invoices (id) ON DELETE RESTRICT,
  amount       numeric(12, 2) NOT NULL CHECK (amount > 0),
  status       text NOT NULL DEFAULT 'emitido' CHECK (status IN ('emitido', 'anulado')),
  issued_at    timestamptz NOT NULL DEFAULT now(),
  issued_by    integer REFERENCES users (id),
  pdf_path     text NOT NULL,
  pdf_sha256   text NOT NULL,
  void_reason  text,
  voided_at    timestamptz,
  voided_by    integer REFERENCES users (id),
  UNIQUE (series_year, seq),
  CHECK (status = 'emitido' OR (void_reason IS NOT NULL AND voided_at IS NOT NULL))
);

-- Movimentos financeiros: pagamentos (entradas) e reembolsos (saídas)
CREATE TABLE payments (
  id              bigserial PRIMARY KEY,
  invoice_id      bigint NOT NULL REFERENCES invoices (id) ON DELETE RESTRICT,
  kind            text NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment', 'refund')),
  method          text NOT NULL,                       -- etiqueta das Definições (Nedbank, Millennium bim, M-Pesa, e-Mola)
  amount          numeric(12, 2) NOT NULL CHECK (amount > 0),
  paid_on         date NOT NULL,
  reference       text,                                -- referência da transacção / comprovativo
  status          text NOT NULL CHECK (status IN ('declarado', 'em_verificacao', 'confirmado', 'recusado', 'revertido')),
  source          text NOT NULL DEFAULT 'painel' CHECK (source IN ('painel', 'cliente')),
  notes           text,
  proof_path      text,
  proof_sha256    text,
  proof_mime      text,
  created_by      integer REFERENCES users (id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  decided_by      integer REFERENCES users (id),
  decided_at      timestamptz,
  decision_note   text,
  reversed_by     integer REFERENCES users (id),
  reversed_at     timestamptz,
  reverse_reason  text,
  receipt_id      bigint REFERENCES receipts (id),
  CHECK (status <> 'revertido' OR (reverse_reason IS NOT NULL AND length(trim(reverse_reason)) >= 5 AND reversed_at IS NOT NULL)),
  CHECK (kind = 'payment' OR status IN ('confirmado', 'revertido'))
);
CREATE INDEX payments_invoice_idx ON payments (invoice_id);
CREATE INDEX payments_status_idx ON payments (status, created_at DESC);
-- A mesma transacção (método + referência) não pode ser contada duas vezes
CREATE UNIQUE INDEX payments_unique_tx ON payments (lower(method), lower(reference))
  WHERE kind = 'payment' AND reference IS NOT NULL AND reference <> '' AND status IN ('declarado', 'em_verificacao', 'confirmado');

CREATE TABLE payment_events (
  id          bigserial PRIMARY KEY,
  payment_id  bigint NOT NULL REFERENCES payments (id) ON DELETE RESTRICT,
  type        text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id     integer REFERENCES users (id),
  actor       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER payment_events_append_only BEFORE UPDATE OR DELETE ON payment_events FOR EACH ROW EXECUTE FUNCTION mca_append_only();

-- Movimentos não se apagam; valores, método, referência e factura nunca mudam.
-- Transições permitidas: declarado/em_verificacao → em_verificacao/confirmado/recusado; confirmado → revertido.
CREATE FUNCTION mca_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Movimentos financeiros não podem ser apagados (pagamento %)', OLD.id;
  END IF;
  IF NEW.invoice_id <> OLD.invoice_id OR NEW.kind <> OLD.kind OR NEW.method <> OLD.method OR NEW.amount <> OLD.amount
     OR NEW.paid_on <> OLD.paid_on OR NEW.reference IS DISTINCT FROM OLD.reference OR NEW.created_at <> OLD.created_at
     OR NEW.proof_sha256 IS DISTINCT FROM OLD.proof_sha256 THEN
    RAISE EXCEPTION 'Dados do pagamento % não podem ser alterados', OLD.id;
  END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status IN ('declarado', 'em_verificacao') AND NEW.status IN ('em_verificacao', 'confirmado', 'recusado'))
    OR (OLD.status = 'confirmado' AND NEW.status = 'revertido')) THEN
    RAISE EXCEPTION 'Transição de estado inválida no pagamento %: % → %', OLD.id, OLD.status, NEW.status;
  END IF;
  IF OLD.status IN ('recusado', 'revertido') THEN
    RAISE EXCEPTION 'Pagamento % já está fechado (%)', OLD.id, OLD.status;
  END IF;
  IF OLD.status = 'confirmado' AND NEW.status = 'confirmado' THEN
    RAISE EXCEPTION 'Pagamento % confirmado não pode ser alterado (só revertido)', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payments_guard BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION mca_payment_guard();

-- Recibos: só podem passar a «anulado» (com motivo); nunca apagados
CREATE FUNCTION mca_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Recibo % não pode ser apagado', OLD.number;
  END IF;
  IF OLD.status = 'anulado'
     OR NEW.status <> 'anulado'
     OR (to_jsonb(NEW) - ARRAY['status', 'void_reason', 'voided_at', 'voided_by']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'void_reason', 'voided_at', 'voided_by']) THEN
    RAISE EXCEPTION 'Recibo % não pode ser alterado (só anulado)', OLD.number;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER receipts_guard BEFORE UPDATE OR DELETE ON receipts FOR EACH ROW EXECUTE FUNCTION mca_receipt_guard();

-- Link privado para o cliente enviar o comprovativo de uma factura
ALTER TABLE invoices ADD COLUMN proof_token_hash text;
ALTER TABLE invoices ADD COLUMN proof_token_expires timestamptz;
-- A coluna nova não pode furar a imutabilidade: o guard ignora-a, mas só em facturas emitidas
CREATE OR REPLACE FUNCTION mca_invoice_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  ignored text[] := ARRAY['status', 'void_reason', 'voided_at', 'voided_by', 'updated_at', 'proof_token_hash', 'proof_token_expires'];
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
    IF (to_jsonb(NEW) - ignored) IS DISTINCT FROM (to_jsonb(OLD) - ignored)
       OR NEW.status NOT IN ('emitida', 'anulada')
       OR (NEW.status = 'emitida' AND (NEW.void_reason IS NOT NULL OR NEW.voided_at IS NOT NULL)) THEN
      RAISE EXCEPTION 'Factura % emitida não pode ser alterada (só anulada)', OLD.number;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Saldo e estado financeiro calculados (fonte única para painel, PDFs e testes)
CREATE VIEW invoice_balances AS
SELECT i.id AS invoice_id,
       i.total,
       coalesce(sum(p.amount) FILTER (WHERE p.kind = 'payment' AND p.status = 'confirmado'), 0) AS received,
       coalesce(sum(p.amount) FILTER (WHERE p.kind = 'refund' AND p.status = 'confirmado'), 0) AS refunded,
       coalesce(sum(p.amount) FILTER (WHERE p.kind = 'payment' AND p.status = 'confirmado'), 0)
         - coalesce(sum(p.amount) FILTER (WHERE p.kind = 'refund' AND p.status = 'confirmado'), 0) AS paid,
       i.total - (coalesce(sum(p.amount) FILTER (WHERE p.kind = 'payment' AND p.status = 'confirmado'), 0)
         - coalesce(sum(p.amount) FILTER (WHERE p.kind = 'refund' AND p.status = 'confirmado'), 0)) AS balance,
       count(*) FILTER (WHERE p.status IN ('declarado', 'em_verificacao')) AS awaiting,
       CASE
         WHEN i.status = 'anulada' THEN 'anulada'
         WHEN coalesce(sum(p.amount) FILTER (WHERE p.kind = 'refund' AND p.status = 'confirmado'), 0) > 0
              AND coalesce(sum(p.amount) FILTER (WHERE p.kind = 'payment' AND p.status = 'confirmado'), 0)
                - coalesce(sum(p.amount) FILTER (WHERE p.kind = 'refund' AND p.status = 'confirmado'), 0) <= 0 THEN 'reembolsado'
         WHEN coalesce(sum(p.amount) FILTER (WHERE p.kind = 'payment' AND p.status = 'confirmado'), 0)
                - coalesce(sum(p.amount) FILTER (WHERE p.kind = 'refund' AND p.status = 'confirmado'), 0) >= i.total THEN 'pago'
         WHEN coalesce(sum(p.amount) FILTER (WHERE p.kind = 'payment' AND p.status = 'confirmado'), 0)
                - coalesce(sum(p.amount) FILTER (WHERE p.kind = 'refund' AND p.status = 'confirmado'), 0) > 0 THEN 'parcial'
         ELSE 'pendente'
       END AS pay_status
FROM invoices i
LEFT JOIN payments p ON p.invoice_id = i.id
WHERE i.doc_type = 'FT' AND i.status IN ('emitida', 'anulada')
GROUP BY i.id;

-- Permissões novas no perfil Gerente (o Administrador ajusta no painel)
UPDATE roles SET permissions = permissions || ARRAY['payments.view', 'payments.record']
WHERE code = 'gerente' AND NOT ('payments.view' = ANY (permissions));
