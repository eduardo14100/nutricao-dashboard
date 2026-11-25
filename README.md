# 🥗 Painel de Acompanhamento Nutricional (Next.js + Supabase + Vercel)

Painel pessoal de acompanhamento nutricional (protocolo cutting 2026) com banco de dados PostgreSQL no **Supabase**, autenticação por **PIN validada no servidor** e hospedagem em produção na **Vercel**:

- 🔒 **Segurança real no servidor:** bloqueio por PIN (hash `scrypt` + cookie `HttpOnly` criptografado AES-256-GCM) e Row Level Security (RLS) restrito ao proprietário no Supabase.
- ⚖️ **Balança Xiaomi Mi Body Composition Scale 2 (Web Bluetooth):** leitura ao vivo e importação automática do histórico da balança (peso, IMC, gordura %, massa gorda, músculo, água %, massa óssea, gordura visceral e impedância Ω) salvos no Supabase (`scale_measurements`).
- 📈 **Gráfico Projetado × Realizado dia a dia (EWMA α=0,15):** cruza continuamente a curva projetada pelo déficit calórico contra a **primeira pesagem de cada dia (jejum)** sincronizada da balança ou lançada manualmente, com desvio dia a dia (`Real − Projetado`) e simulador em tela cheia.
- 🌮 **Tabela TACO Oficial (603 alimentos) com busca aproximada:** pesquisa por palavras em qualquer ordem, sem acento, plural, tolerância a erros de digitação (Levenshtein) e sugestões equivalentes de macros.
- 🍽️ **Cardápio interativo (5 refeições A/B/C), hidratação e histórico de check-ins diários:** sincronizados entre celular e computador via Supabase (`daily_logs`).
- 📄 **Plano em PDF protegido:** servido por rota autenticada (`/api/plano-pdf`).

## Acesso online
- **Produção (Vercel + Supabase):** [https://painel-nutricional.vercel.app](https://painel-nutricional.vercel.app)
- **Link antigo (GitHub Pages):** redireciona automaticamente para a versão na Vercel via `index.html`.

## Desenvolvimento local
1. Copie `.env.example` para `.env.local` e preencha as variáveis do Supabase e `SESSION_SECRET`.
2. Instale as dependências e rode o servidor:
   ```bash
   npm install
   npm run dev
   ```
