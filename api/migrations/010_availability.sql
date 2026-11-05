-- ============================================================
-- MOZ CAMP ADVENTURES — 010_availability.sql
-- Disponibilidade dos pacotes: regras por pacote, excepções por data e sessão,
-- bloqueios por intervalo e ligação entre reservas e datas ocupadas.
-- Os pacotes continuam em data/*.json: item_id é o slug, como em bookings.item_id.
-- Sem regra, um pacote continua aberto «sob confirmação» (nada muda até ser configurado).
-- ============================================================

CREATE TABLE availability_rules (
  item_id           text PRIMARY KEY,
  mode              text NOT NULL DEFAULT 'request' CHECK (mode IN ('request', 'scheduled')),   -- request: aberto salvo bloqueio; scheduled: só nos dias definidos
  weekdays          smallint[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',                              -- 0 = domingo
  capacity          integer CHECK (capacity > 0),                                               -- NULL = sem limite
  unit              text NOT NULL DEFAULT 'people' CHECK (unit IN ('people', 'units')),         -- units: cada reserva ocupa 1 (barco, transfer)
  sessions          text[] NOT NULL DEFAULT '{}',                                               -- 'HH:MM'
  min_notice_hours  integer NOT NULL DEFAULT 0 CHECK (min_notice_hours >= 0),
  max_advance_days  integer CHECK (max_advance_days > 0),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        text
);

-- Excepções a uma data (session = '') ou a uma sessão
CREATE TABLE availability_slots (
  id          bigserial PRIMARY KEY,
  item_id     text NOT NULL,
  day         date NOT NULL,
  session     text NOT NULL DEFAULT '',
  status      text CHECK (status IN ('open', 'blocked')),      -- NULL = segue a regra
  capacity    integer CHECK (capacity >= 0),                   -- NULL = capacidade da regra
  note        text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text,
  UNIQUE (item_id, day, session)
);
CREATE INDEX availability_slots_day_idx ON availability_slots (day);

-- Bloqueios por intervalo (férias, manutenção, embarcação parada); item_id NULL = todos os pacotes
CREATE TABLE availability_blocks (
  id          bigserial PRIMARY KEY,
  item_id     text,
  date_from   date NOT NULL,
  date_to     date NOT NULL,
  reason      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text,
  CHECK (date_to >= date_from)
);
CREATE INDEX availability_blocks_range_idx ON availability_blocks (date_from, date_to);

-- Datas ocupadas por cada reserva (um alojamento ocupa uma linha por noite).
-- O que conta para a capacidade depende do estado actual da reserva (nada a actualizar ao cancelar).
CREATE TABLE booking_slots (
  booking_id  bigint NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  item_id     text NOT NULL,
  day         date NOT NULL,
  session     text NOT NULL DEFAULT '',
  people      integer NOT NULL CHECK (people > 0),
  PRIMARY KEY (booking_id, day, session)
);
CREATE INDEX booking_slots_lookup_idx ON booking_slots (item_id, day, session);

ALTER TABLE bookings ADD COLUMN session text;
ALTER TABLE bookings ADD COLUMN hold_expires_at timestamptz;     -- um «pedido» ocupa vagas até esta data

-- Reservas já existentes passam a contar
INSERT INTO booking_slots (booking_id, item_id, day, people)
SELECT id, item_id, service_date, greatest(adults + children, 1) FROM bookings WHERE service_date IS NOT NULL;
INSERT INTO booking_slots (booking_id, item_id, day, people)
SELECT b.id, b.item_id, d::date, greatest(b.adults + b.children, 1)
FROM bookings b, generate_series(b.checkin, b.checkout - 1, interval '1 day') d
WHERE b.checkin IS NOT NULL AND b.checkout IS NOT NULL AND b.service_date IS NULL;
UPDATE bookings SET hold_expires_at = created_at + interval '48 hours' WHERE status = 'pedido';

INSERT INTO settings (key, value) VALUES ('availability', '{"hold_hours": 48}') ON CONFLICT (key) DO NOTHING;

-- Permissões novas (o Gerente recebe-as por omissão)
UPDATE roles SET permissions = permissions || ARRAY['availability.view', 'availability.manage']
WHERE code = 'gerente' AND NOT ('availability.view' = ANY (permissions));
