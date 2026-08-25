-- Chatbot Direct — schema inicial (Etapa 1)
-- Roda uma vez no SQL Editor do MESMO projeto Supabase que já hospeda o agendador-stories.
-- Todas as tabelas usam o prefixo chatbot_ e não tocam em nenhuma tabela existente do agendador.
-- RLS ativado sem policies públicas: leitura/escrita só via rotas server-side com a service role
-- key (mesmo padrão de segurança do agendador).

-- ============================================================================
-- Contas do Instagram conectadas a este sistema (conexão própria, separada do agendador)
-- ============================================================================
create table if not exists chatbot_accounts (
  id uuid primary key default gen_random_uuid(),
  instagram_user_id text not null unique,
  page_id text not null,
  page_name text,
  instagram_username text,
  access_token text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table chatbot_accounts enable row level security;

-- ============================================================================
-- Configuração por conta: os 3 campos do "prompt de sistema" do Gemini + regras de reserva
-- ============================================================================
create table if not exists chatbot_account_settings (
  account_id uuid primary key references chatbot_accounts(id) on delete cascade,

  -- atendimento por IA (Gemini)
  base_conhecimento text not null default '',
  tom_de_voz text not null default '',
  guardrails text not null default '',

  -- gatilho da reserva (palavra-chave configurável, padrão "reserva")
  palavra_chave_reserva text not null default 'reserva',
  reserva_regras_texto text not null default '',
  google_sheet_id text,

  -- capacidade (soma de pessoas por data_reserva — ver chatbot_reservations)
  reserva_limite_normal integer not null default 50,
  reserva_limite_maximo integer not null default 60,

  -- cutoff: depois desse horário, não aceita reserva pra "hoje"
  reserva_cutoff_horario time not null default '17:00',

  -- pausa manual, sempre associada a uma data (nunca solta) — deixa de valer sozinha
  -- na virada do dia, sem precisar de rotina de "reset"
  reserva_pausa_ativa boolean not null default false,
  reserva_pausa_data date,
  reserva_pausa_mensagem text,

  updated_at timestamptz not null default now()
);

alter table chatbot_account_settings enable row level security;

-- ============================================================================
-- Palavras-chave especiais adicionais (além da reserva) — ex.: preço/promoção travados.
-- Cadastro dinâmico, sem teto fixo: cada linha é uma entrada da lista "+ adicionar palavra-chave".
-- ============================================================================
create table if not exists chatbot_keywords (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references chatbot_accounts(id) on delete cascade,
  palavra_chave text not null,
  mensagens jsonb not null default '[]'::jsonb, -- lista ordenada de strings
  pausa_entre_mensagens_ms integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists chatbot_keywords_account_idx on chatbot_keywords(account_id);

alter table chatbot_keywords enable row level security;

-- ============================================================================
-- Estado da conversa por cliente — o único lugar do sistema que guarda memória entre mensagens.
-- Usado pelo fluxo de reserva (e por qualquer outro fluxo com estado que surgir no futuro).
-- ============================================================================
create table if not exists chatbot_conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references chatbot_accounts(id) on delete cascade,
  instagram_scoped_id text not null, -- id do cliente no Direct (IGSID)
  fluxo_atual text, -- ex: 'reserva', ou null se não está em nenhum fluxo
  etapa_atual text,
  dados_coletados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  unique (account_id, instagram_scoped_id)
);

alter table chatbot_conversations enable row level security;

-- ============================================================================
-- Reservas confirmadas — fonte de verdade rápida pras checagens de capacidade.
-- A planilha do Google continua sendo o registro visual, em paralelo (escrita síncrona na hora
-- da confirmação); esta tabela existe pra não precisar consultar a planilha a cada mensagem.
-- ============================================================================
create table if not exists chatbot_reservations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references chatbot_accounts(id) on delete cascade,
  data_reserva date not null,
  quantidade_pessoas integer not null,
  whatsapp text,
  confirmado_em timestamptz not null default now()
);

-- índice pensado pra query mais comum: soma de pessoas por conta+data
create index if not exists chatbot_reservations_account_data_idx
  on chatbot_reservations(account_id, data_reserva);

alter table chatbot_reservations enable row level security;

-- ============================================================================
-- Idempotência do webhook: evita processar/responder a mesma mensagem duas vezes
-- (a Meta pode reenviar o mesmo evento de webhook em caso de timeout/retry).
-- ============================================================================
create table if not exists chatbot_processed_messages (
  message_id text primary key,
  account_id uuid references chatbot_accounts(id) on delete cascade,
  processed_at timestamptz not null default now()
);

alter table chatbot_processed_messages enable row level security;

-- ============================================================================
-- Fluxo de conexão de conta via OAuth (mesmo padrão de duas tabelas já usado no agendador:
-- oauth_states pra validar o retorno do Facebook, pending_connections pra guardar as Páginas
-- disponíveis até o usuário escolher qual conectar).
-- ============================================================================
create table if not exists chatbot_oauth_states (
  state text primary key,
  created_at timestamptz not null default now()
);

alter table chatbot_oauth_states enable row level security;

create table if not exists chatbot_pending_connections (
  id uuid primary key default gen_random_uuid(),
  fb_user_token text not null,
  pages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table chatbot_pending_connections enable row level security;
