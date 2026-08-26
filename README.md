# Chatbot Direct

Sistema próprio de atendimento automático de Instagram Direct — substitui o SendPulse para uso
pessoal do Victor. Projeto irmão do
[agendador-stories](https://agendador-stories2.vercel.app), totalmente separado (código, deploy,
cadastro na Meta), mas reaproveitando o **mesmo projeto Supabase** (tabelas com prefixo
`chatbot_`, sem tocar nas tabelas do agendador).

Stack: Next.js 14 (App Router, TypeScript) + Tailwind + Supabase (Postgres) + Meta Graph API
(Instagram messaging) + Gemini (atendimento por IA).

## Estado atual: Etapa 2 — webhook + conexão de conta (quase completa)

- **Webhook** (`src/app/api/webhook/instagram/route.ts`): confere o handshake de verificação da
  Meta, valida a assinatura de cada chamada (`X-Hub-Signature-256`), evita processar a mesma
  mensagem duas vezes (`chatbot_processed_messages`) e responde com um texto fixo de teste.
  Configurado e verificado no painel do Meta (Callback URL + campo `messages` assinado).
- **Conexão de conta** (`/contas`, `/contas/conectar`, `src/lib/facebookOAuth.ts`): login via
  Facebook Login (mesmo padrão do agendador), lista as Páginas com Instagram vinculado, e deixa
  escolher qual conectar. Ainda falta **adicionar a URL de redirecionamento do OAuth
  (`/api/auth/facebook/callback`) nas configurações de "Login do Facebook para Empresas" do app
  do chatbot no painel do Meta** — sem isso o Facebook recusa o redirecionamento na volta do
  login.

Depois disso: testar de ponta a ponta (conectar uma conta de teste, mandar um Direct, ver a
resposta fixa chegando) antes de seguir pra Etapa 3.

## Como rodar (visão geral, não precisa fazer isso localmente)

1. `npm install`
2. Copiar `.env.example` para `.env.local` e preencher com os valores reais (Supabase, Meta,
   Gemini) — nunca commitar o `.env.local`.
3. `npm run dev`

Na Vercel, as mesmas variáveis de ambiente vão em Project Settings → Environment Variables.

## Banco de dados

O schema das tabelas novas está em `supabase/schema.sql` — rodar uma vez no SQL Editor do mesmo
projeto Supabase que já hospeda o agendador. Todas as tabelas usam o prefixo `chatbot_` e RLS
ativado sem policies públicas (mesmo padrão de segurança do agendador — leitura/escrita só via
rotas server-side com a chave de service role).

## Próximas etapas (ver plano completo no projeto "Agendamento Stories" no Claude)

1. ~~Infraestrutura base (este commit)~~
2. Webhook mínimo + conexão de 1 conta via OAuth
3. Atendimento por IA (Gemini) com base de conhecimento, tom de voz e guardrails configuráveis
4. Palavras-chave especiais (gatilho de reserva, e o que mais for preciso)
5. Fluxo de reserva completo (capacidade, cutoff de horário, pausa manual, planilha do Google)
6. Migração das contas do SendPulse, uma de cada vez
