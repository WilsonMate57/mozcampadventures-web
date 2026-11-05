-- ============================================================
-- MOZ CAMP ADVENTURES — 012_live_chat.sql
-- Live Chat próprio: conversas, mensagens, notas internas e estado da equipa.
-- O visitante é identificado por um token aleatório (só o hash fica aqui).
-- ============================================================

CREATE TABLE chat_conversations (
  id                 bigserial PRIMARY KEY,
  token_hash         text NOT NULL UNIQUE,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  name               text NOT NULL,
  email              text NOT NULL,
  phone              text,
  subject            text NOT NULL,
  lang               text NOT NULL DEFAULT 'pt',
  origin_page        text,
  item_id            text,                     -- pacote da página onde a conversa começou
  booking_id         bigint REFERENCES bookings (id) ON DELETE SET NULL,
  assigned_to        integer REFERENCES users (id) ON DELETE SET NULL,
  offline            boolean NOT NULL DEFAULT false,   -- começou sem equipa disponível
  last_message_at    timestamptz NOT NULL DEFAULT now(),
  last_sender        text,
  last_preview       text,
  first_response_at  timestamptz,
  closed_at          timestamptz,
  visitor_seen_at    timestamptz,
  visitor_read_id    bigint NOT NULL DEFAULT 0,
  agent_read_id      bigint NOT NULL DEFAULT 0,
  emailed_upto_id    bigint NOT NULL DEFAULT 0,        -- respostas já enviadas por e-mail a quem saiu
  visitor_typing_at  timestamptz,
  agent_typing_at    timestamptz,
  agent_typing_user  integer REFERENCES users (id) ON DELETE SET NULL,
  ip_hash            text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_conversations_inbox_idx ON chat_conversations (status, last_message_at DESC);
CREATE INDEX chat_conversations_email_idx ON chat_conversations (lower(email));
CREATE INDEX chat_conversations_booking_idx ON chat_conversations (booking_id);

CREATE TABLE chat_messages (
  id               bigserial PRIMARY KEY,
  conversation_id  bigint NOT NULL REFERENCES chat_conversations (id) ON DELETE CASCADE,
  sender           text NOT NULL CHECK (sender IN ('visitor', 'agent')),
  user_id          integer REFERENCES users (id) ON DELETE SET NULL,
  author           text NOT NULL,
  body             text NOT NULL DEFAULT '',
  file_name        text,
  file_path        text,                       -- relativo a storage_dir, fora da pasta pública
  file_mime        text,
  file_size        integer,
  client_id        text,                       -- repetir o envio após uma falha de rede não duplica
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, client_id)
);
CREATE INDEX chat_messages_conversation_idx ON chat_messages (conversation_id, id);

-- Tabela própria: nenhuma consulta do visitante lê daqui
CREATE TABLE chat_notes (
  id               bigserial PRIMARY KEY,
  conversation_id  bigint NOT NULL REFERENCES chat_conversations (id) ON DELETE CASCADE,
  user_id          integer REFERENCES users (id) ON DELETE SET NULL,
  author           text NOT NULL,
  body             text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_notes_conversation_idx ON chat_notes (conversation_id, id);

-- Estado escolhido e sinais de presença; o estado efectivo é calculado no servidor
CREATE TABLE chat_agents (
  user_id         integer PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'away', 'offline')),
  last_seen_at    timestamptz,                 -- heartbeat do painel
  last_active_at  timestamptz                  -- última interacção real (rato, teclado)
);

UPDATE roles SET permissions = permissions || ARRAY['chat.view', 'chat.manage']
WHERE code = 'gerente' AND NOT ('chat.view' = ANY (permissions));

-- Sem horário definido, a disponibilidade depende só da presença da equipa
INSERT INTO settings (key, value) VALUES ('chat', '{"enabled": true, "hours": {}, "retention_months": 12, "notify_offline": true}') ON CONFLICT (key) DO NOTHING;
