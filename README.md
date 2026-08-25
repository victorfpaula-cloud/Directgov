# Chatbot Direct

Sistema próprio de atendimento automático de Instagram Direct — substitui o SendPulse para uso
pessoal do Victor. Projeto irmão do
[agendador-stories](https://agendador-stories2.vercel.app), totalmente separado (código, deploy,
cadastro na Meta), mas reaproveitando o **mesmo projeto Supabase** (tabelas com prefixo
`chatbot_`, sem tocar nas tabelas do agendador).

Stack: Next.js 14 (App Router, TypeScript) + Tailwind + Supabase (Postgres) + Meta Graph API
(Instagram messaging) + Gemini (atendimento por IA).

## Estado atual: Etapa 1 — infraestrutura base

Só uma página "em construção". Ainda não tem webhook, não tem conexão de conta, não tem lógica
nenhuma. O objetivo desta etapa é só validar que o caminho GitHub → Vercel → ar está funcionando
antes de construir qualquer coisa de verdade.

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
