-- DirectGov — schema inicial (setores, base de conhecimento, contatos, contas, mensagens)
-- Roda uma vez no SQL Editor do MESMO projeto Supabase que já hospeda o agendador-stories e o
-- Chatbot Direct — tabelas com prefixo próprio directgov_, sem tocar em nenhuma tabela dos outros
-- dois produtos (chatbot_*, ou as do agendador). RLS ativado sem policies públicas: leitura/escrita
-- só via rotas server-side com a service role key (mesmo padrão de segurança dos dois projetos
-- irmãos).

-- ============================================================================
-- Prefeituras (tenants) — cada uma é um ambiente isolado, com seus próprios setores, conta do
-- Instagram e mensagens.
-- ============================================================================
create table if not exists directgov_prefeituras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table directgov_prefeituras enable row level security;

-- ============================================================================
-- Contas do Instagram conectadas — uma por prefeitura (mesmo padrão de conexão via OAuth do
-- Chatbot Direct, só que amarrada a uma prefeitura em vez de solta).
-- ============================================================================
create table if not exists directgov_contas (
  id uuid primary key default gen_random_uuid(),
  prefeitura_id uuid not null references directgov_prefeituras(id) on delete cascade,
  instagram_user_id text not null unique,
  page_id text not null,
  page_name text,
  instagram_username text,
  access_token text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists directgov_contas_prefeitura_idx on directgov_contas(prefeitura_id);

alter table directgov_contas enable row level security;

-- ============================================================================
-- Setores (cards) — cada prefeitura nasce com os 22 setores padrão (ver trigger de seed no fim
-- deste arquivo), totalmente editáveis: pode excluir qualquer um e adicionar outros próprios.
-- "Geral" (eh_geral = true) é o fallback pra assunto que não bate com nenhum setor específico —
-- toda prefeitura deve manter exatamente um setor com eh_geral = true (garantido pelo índice
-- único parcial abaixo).
--
-- Campos de contato estruturados são todos opcionais (cidade pequena pode não preencher tudo) —
-- só "nome" é obrigatório.
-- ============================================================================
create table if not exists directgov_setores (
  id uuid primary key default gen_random_uuid(),
  prefeitura_id uuid not null references directgov_prefeituras(id) on delete cascade,
  nome text not null,
  eh_geral boolean not null default false,
  ordem integer not null default 0,
  ativo boolean not null default true,

  -- contatos e informações estruturadas (todos opcionais)
  endereco text,
  telefone text,
  email text,
  horario_atendimento text,
  responsavel text,

  -- base de conhecimento em texto livre, digitada direto no card (entra no prompt do Gemini
  -- deste setor). Upload de arquivo (PDF/Word) fica em directgov_setor_arquivos, à parte.
  base_conhecimento_texto text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists directgov_setores_prefeitura_idx on directgov_setores(prefeitura_id);

-- só pode haver um setor "Geral" (fallback) por prefeitura
create unique index if not exists directgov_setores_um_geral_por_prefeitura
  on directgov_setores(prefeitura_id)
  where eh_geral;

alter table directgov_setores enable row level security;

-- ============================================================================
-- Arquivos enviados pra base de conhecimento de um setor (PDF, Word). Guarda o documento
-- original (Supabase Storage) e o texto já extraído separadamente — na v1 o texto extraído entra
-- direto no prompt (sem RAG); manter os dois campos separados deixa a estrutura pronta pra uma
-- migração futura pra chunking + busca vetorial sem precisar redesenhar a tabela.
-- ============================================================================
create table if not exists directgov_setor_arquivos (
  id uuid primary key default gen_random_uuid(),
  setor_id uuid not null references directgov_setores(id) on delete cascade,
  nome_arquivo text not null,
  tipo_arquivo text not null, -- 'pdf' | 'docx'
  storage_path text not null, -- caminho no bucket do Supabase Storage
  tamanho_bytes integer,
  texto_extraido text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists directgov_setor_arquivos_setor_idx on directgov_setor_arquivos(setor_id);

alter table directgov_setor_arquivos enable row level security;

-- ============================================================================
-- Idempotência do webhook: evita processar/responder a mesma mensagem duas vezes (mesmo padrão
-- do Chatbot Direct).
-- ============================================================================
create table if not exists directgov_processed_messages (
  message_id text primary key,
  conta_id uuid references directgov_contas(id) on delete cascade,
  processed_at timestamptz not null default now()
);

alter table directgov_processed_messages enable row level security;

-- ============================================================================
-- Histórico de mensagens e roteamento — cada linha é uma mensagem (do cidadão ou de resposta),
-- com o setor que a triagem decidiu (quando aplicável). Serve de log/auditoria; não guarda estado
-- de fluxo porque o roteamento é decidido do zero a cada mensagem, sem etapas encadeadas.
-- ============================================================================
create table if not exists directgov_mensagens (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references directgov_contas(id) on delete cascade,
  instagram_scoped_id text not null, -- id do cidadão no Direct (IGSID)
  direcao text not null check (direcao in ('recebida', 'enviada')),
  texto text not null,
  setor_id uuid references directgov_setores(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists directgov_mensagens_conta_idx
  on directgov_mensagens(conta_id, instagram_scoped_id);

alter table directgov_mensagens enable row level security;

-- ============================================================================
-- Fluxo de conexão de conta via OAuth (mesmo padrão de duas tabelas do Chatbot Direct):
-- oauth_states valida o retorno do Facebook, pending_connections guarda as Páginas disponíveis
-- até escolher qual conectar — amarrada à prefeitura que iniciou a conexão.
-- ============================================================================
create table if not exists directgov_oauth_states (
  state text primary key,
  prefeitura_id uuid references directgov_prefeituras(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table directgov_oauth_states enable row level security;

create table if not exists directgov_pending_connections (
  id uuid primary key default gen_random_uuid(),
  prefeitura_id uuid references directgov_prefeituras(id) on delete cascade,
  fb_user_token text not null,
  pages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table directgov_pending_connections enable row level security;

-- ============================================================================
-- Seed automático: toda prefeitura nova nasce com os 22 setores padrão (lista fechada, confirmada
-- em 01/09/2026). Totalmente editável depois — a prefeitura pode excluir qualquer um destes e
-- adicionar outros próprios.
-- ============================================================================
create or replace function directgov_seed_setores_padrao()
returns trigger as $$
begin
  insert into directgov_setores (prefeitura_id, nome, eh_geral, ordem) values
    (new.id, 'Administrativo (Gabinete/Administração)', false, 1),
    (new.id, 'Geral', true, 2),
    (new.id, 'Saúde', false, 3),
    (new.id, 'Educação', false, 4),
    (new.id, 'Obras e Infraestrutura', false, 5),
    (new.id, 'Serviços Públicos / Serviços Urbanos', false, 6),
    (new.id, 'Meio Ambiente', false, 7),
    (new.id, 'Assistência Social / Desenvolvimento Social', false, 8),
    (new.id, 'Cultura', false, 9),
    (new.id, 'Esportes e Lazer', false, 10),
    (new.id, 'Turismo', false, 11),
    (new.id, 'Agricultura e Abastecimento', false, 12),
    (new.id, 'Habitação', false, 13),
    (new.id, 'Planejamento Urbano / Desenvolvimento Urbano', false, 14),
    (new.id, 'Trânsito e Mobilidade Urbana', false, 15),
    (new.id, 'Segurança Pública / Guarda Civil Municipal / Defesa Civil', false, 16),
    (new.id, 'Desenvolvimento Econômico / Indústria, Comércio e Trabalho', false, 17),
    (new.id, 'Fazenda / Finanças', false, 18),
    (new.id, 'Mulher / Direitos Humanos / Igualdade Racial', false, 19),
    (new.id, 'Comunicação', false, 20),
    (new.id, 'Procuradoria Geral do Município', false, 21),
    (new.id, 'Ouvidoria Municipal', false, 22);
  return new;
end;
$$ language plpgsql;

drop trigger if exists directgov_prefeituras_seed_setores on directgov_prefeituras;

create trigger directgov_prefeituras_seed_setores
  after insert on directgov_prefeituras
  for each row execute function directgov_seed_setores_padrao();
