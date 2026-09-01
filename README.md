# DirectGov

Secretaria virtual de prefeituras via Instagram Direct — o cidadão manda mensagem, uma camada de
IA identifica qual setor da prefeitura é responsável (Saúde, Educação, Obras, etc.) e responde
usando só a base de conhecimento daquele setor. Projeto irmão do
[Chatbot Direct](https://chatbot-direct.vercel.app) (automação de Direct pra restaurantes/
comércios), totalmente separado (código, deploy, App da Meta), mas reaproveitando o **mesmo
projeto Supabase** (tabelas com prefixo `directgov_`, sem tocar nas tabelas dos outros dois
produtos que já rodam nele).

Stack: Next.js 14 (App Router, TypeScript) + Tailwind + Supabase (Postgres) + Meta Graph API
(Instagram messaging) + Gemini (atendimento por IA).

## Como funciona

- Cada **prefeitura** é um ambiente isolado, com sua própria conta do Instagram conectada e seus
  próprios setores — nada cruza entre prefeituras diferentes.
- Toda prefeitura nasce com **22 setores padrão** já cadastrados automaticamente (trigger no
  banco — ver `supabase/schema.sql`), totalmente editáveis: dá pra excluir qualquer um e
  adicionar outros específicos da cidade. Existe sempre um setor **"Geral"**, fallback pra
  assunto que não bate com nenhum setor específico.
- Cada setor tem sua própria base de conhecimento (texto digitado direto no card, upload de
  PDF/Word entra numa próxima etapa) e seus próprios dados de contato (endereço, telefone,
  e-mail, horário, responsável — todos opcionais, só o nome é obrigatório).
- Fluxo de mensagem: cidadão manda Direct → uma camada de triagem decide qual setor é responsável
  → o setor responde usando só a própria base de conhecimento → a resposta volta pro cidadão como
  se fosse uma secretária só. A camada de triagem + especialista por setor ainda está sendo
  construída — por enquanto o webhook só confirma o recebimento da mensagem.

## Estado atual

- **Schema do banco** (`supabase/schema.sql`): pronto e já validado em produção — prefeituras,
  setores (com contato estruturado e base de conhecimento em texto), arquivos de conhecimento por
  setor, histórico de mensagens, idempotência do webhook e fluxo de conexão via OAuth.
- **CRUD de setor** (`/prefeituras`, `/prefeituras/[id]`, `/prefeituras/[id]/setores/...`):
  criar prefeitura (já nasce com os 22 setores padrão), criar/editar/excluir setor, preencher
  contato e base de conhecimento em texto.
- **Conexão de conta do Instagram** (`/prefeituras/[id]/conta`): login via Facebook Login,
  escolhe qual Página/Instagram conectar pra aquela prefeitura, pausa/reativa/desconecta.
- **Webhook** (`src/app/api/webhook/instagram/route.ts`): confere o handshake de verificação da
  Meta, valida a assinatura de cada chamada (`X-Hub-Signature-256`), evita processar a mesma
  mensagem duas vezes, identifica a prefeitura da conta que recebeu a mensagem, registra no
  histórico (`directgov_mensagens`) e responde com um texto fixo de confirmação — a triagem por
  IA + resposta especializada por setor ainda não foi construída.

## Próximas etapas

1. Upload de PDF/Word na base de conhecimento do setor (extração de texto, sem RAG na v1).
2. Camada de triagem (roteador): IA decide qual setor é responsável por cada mensagem recebida.
3. Camada de especialista: IA gera a resposta usando só a base de conhecimento do setor escolhido.
4. Testar cedo se contas desconhecidas (fora da administradora do app) recebem resposta — risco
   herdado do Chatbot Direct, mais crítico aqui porque o público é qualquer cidadão desconhecido.
5. App próprio na Meta (hoje ainda usando o processo/callback do Chatbot Direct como base — falta
   registrar um App novo, com Callback URL e Verify Token próprios deste projeto).

## Como rodar (visão geral, não precisa fazer isso localmente)

1. `npm install`
2. Copiar `.env.example` para `.env.local` e preencher com os valores reais (Supabase, Meta,
   Gemini) — nunca commitar o `.env.local`.
3. `npm run dev`

Na Vercel, as mesmas variáveis de ambiente vão em Project Settings → Environment Variables.

## Banco de dados

O schema das tabelas está em `supabase/schema.sql` — roda no SQL Editor do mesmo projeto Supabase
que já hospeda o agendador-stories e o Chatbot Direct. Todas as tabelas usam o prefixo
`directgov_` e RLS ativado sem policies públicas (leitura/escrita só via rotas server-side com a
chave de service role).
