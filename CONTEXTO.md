# CONTEXTO.md — Painel de Acompanhamento Nutricional ("Dieta")

Este documento consolida a arquitetura, estrutura de arquivos, banco de dados, regras de negócio, fluxos de segurança e instruções operacionais do projeto **Painel de Acompanhamento Nutricional**, permitindo que qualquer nova conversa (local ou na nuvem no projeto **Dieta**) retome o trabalho imediatamente sem perda de contexto.

---

## 1. Visão Geral e Links

- **Objetivo:** Painel pessoal interativo de acompanhamento nutricional (protocolo *cutting* 2026), com cardápio configurável (5 refeições A/B/C), controle de hidratação, check-ins diários, integração Bluetooth com balança Xiaomi, gráfico **Projetado × Realizado** dia a dia, calculadora de substituições pela Tabela TACO e acesso protegido ao plano em PDF.
- **Produção (Vercel + Supabase):** [https://painel-nutricional.vercel.app](https://painel-nutricional.vercel.app)
- **Projeto na Vercel:** `painel-nutricional`
- **Repositório GitHub:** `eduardo14100/nutricao-dashboard` (branch principal: `main`)
  - O GitHub Pages foi desativado (25/11/2026); o único endereço oficial é `https://painel-nutricional.vercel.app/`.
- **Banco de Dados (Supabase):** projeto `painel-nutricional` (região `sa-east-1`, São Paulo).

---

## 2. Stack Tecnológica e Estrutura do Projeto

- **Framework:** Next.js `16.1.0` (App Router) + React `19` + TypeScript `5.8`
- **Estilização:** Tailwind CSS `v4` (`@tailwindcss/postcss`, `postcss.config.mjs`, `src/app/globals.css`)
- **Backend / Persistência:** Supabase (`@supabase/supabase-js` `^2.99.0`) + métricas via `@vercel/functions` (`^3.9.0`)

### Estrutura principal de diretórios
- `src/app/page.tsx`, `src/app/layout.tsx` e `src/app/manifest.ts` — Página principal, layout raiz (metadados PWA) e manifesto instalável (`/manifest.webmanifest`).
- `public/` — Recursos PWA: `sw.js` (service worker sem cache de `/api/*`), `offline.html` e `icons/*`.
- `supabase/migrations/` — Migrações SQL idempotentes (`20261125_auth_rate_limits.sql`, `20261126_protocol_cycles.sql`).
- `src/app/api/` — Route Handlers autenticados no servidor:
  - `auth/login/route.ts` — Login com PIN numérico (4 a 6 dígitos), bloqueio progressivo anti força-bruta (`rate-limit.ts`) e verificação via sessão de leitura em cache antes de autenticar o usuário.
  - `auth/logout/route.ts` — Encerramento de sessão (limpa cookie).
  - `auth/change-pin/route.ts` — Alteração do PIN atual (valida PIN antigo, gera novo hash `scrypt`).
  - `dashboard/route.ts` — Carga inicial completa (`user_settings`, `weight_logs`, `daily_logs`, `scale_measurements`, `protocol_cycles`).
  - `day-state/route.ts` — Persistência imediata das seleções de refeições (`A`/`B`/`C`) e água (`water_ml`) no `daily_logs`.
  - `checkins/route.ts` — Salva/atualiza e remove check-in completo do dia em `daily_logs` (e sincroniza `weight_logs` quando há peso informado).
  - `weights/route.ts` — Upsert manual de pesagem (`POST`), reset dinâmico da projeção do ciclo atual (`PUT` com `action: "reset"`) preservando ciclos anteriores e remoção (`DELETE`, com opção `includeScale=1`).
  - `cycles/route.ts` — Lista histórico (`GET`), inicia novo ciclo arquivando o anterior ou edita o ciclo atual (`POST`), e remove ciclos arquivados (`DELETE`).
  - `scale/route.ts` — Lista medições (`GET`), recebe leituras ao vivo/histórico da balança Xiaomi (`POST`), deduplica e reconcilia `weight_logs`, e remove medições individuais (`DELETE`).
  - `settings/route.ts` — Atualiza `sim_deficit` e perfil corporal (`height_cm`, `age_years`, `sex`, `scale_user_id`), recalculando automaticamente os índices de bioimpedância já salvos quando o perfil muda.
  - `plano-pdf/route.ts` — Serve `src/data/plano_nutricional.pdf` somente com sessão autenticada (`Cache-Control: private, no-store`).
- `src/components/` — Componentes React client-side:
  - `PinLockScreen.tsx` — Tela de bloqueio por PIN e opção de lembrar sessão.
  - `NutritionDashboard.tsx` — Orquestrador do painel, metas diárias, cardápio, hidratação e histórico.
  - `WeightChartCard.tsx` — Gráfico SVG **Projetado × Realizado** dia a dia, curva EWMA, simulador de déficit e modo tela cheia.
  - `XiaomiScalePanel.tsx` — Pareamento/leitura Web Bluetooth com a balança Xiaomi.
  - `TacoSwapCalculator.tsx` — Calculadora de substituições baseada na Tabela TACO (603 alimentos).
  - `CheckinHistorySection.tsx` — Formulário e histórico dos check-ins diários.
  - `ProtocolCycleModal.tsx` — Modal para iniciar novo ciclo, editar datas/metas do ciclo atual e consultar histórico de ciclos.
  - `ChangePinModal.tsx` — Modal para troca de PIN.
  - `ServiceWorkerRegister.tsx` — Registra `/sw.js` em produção para instalação como PWA.
- `src/data/` — Dados estáticos e utilitários de domínio:
  - `nutrition.ts` — Cardápio base (`MEALS_DATA`), cálculos de macros (`calcItemMacros`, `calcMealMacros`, `computeDailyTotals`, `computeBalanceScore`), gerador dinâmico de checkpoints (`buildProtocolCheckpoints`) e utilitários de data (fuso `America/Sao_Paulo`).
  - `scale.ts` — Constantes BLE da Xiaomi (`SVC_BODY_COMP = 0x181b`, `CHR_BODY_COMP_MEAS = 0x2a9c`, `CHR_HISTORY`, `SVC_CURRENT_TIME`, `CHR_CURRENT_TIME`), cálculo de composição corporal (`computeBodyComposition`) e construção da série `buildProjectedVsRealizedSeries` (filtrada à janela do ciclo ativo).
  - `taco-foods.json` — Base com 603 alimentos da Tabela TACO.
  - `plano_nutricional.pdf` — PDF do plano alimentar.
- `src/lib/` — Infraestrutura server-side:
  - `auth.ts` — Hash/verificação de PIN (`scrypt` + `crypto.timingSafeEqual`) e criptografia/descriptografia do cookie de sessão (`AES-256-GCM`).
  - `rate-limit.ts` — Gate de bloqueio progressivo por hash de IP (`auth_gate_check`, `auth_gate_fail`, `auth_gate_reset`) com modo *fail-open* caso a migração ainda não tenha sido aplicada.
  - `supabase.ts` — Autenticação do proprietário, leitor em cache para validação de PIN (`getOwnerPinReader`) e cliente Supabase com token escopado (`getAuthedContext`, `signInOwnerSession`, `createScopedClient`).

---

## 3. Arquitetura de Segurança e Variáveis de Ambiente

1. **Autenticação por PIN no Servidor + Proteção Anti Força-Bruta:**
   - O PIN nunca é validado no frontend nem salvo em texto puro; o hash `scrypt$<salt>$<derived>` fica em `public.user_settings.pin_hash`.
   - Antes de verificar o PIN, `/api/auth/login` consulta `auth_gate_check` (por hash SHA-256 de `IP + SESSION_SECRET` e contador global). A cada 5 erros do mesmo IP, bloqueia por 5 min, 10 min, 20 min... (máx. 24 h); 30 erros globais bloqueiam por 15 min.
   - A conferência do PIN usa `getOwnerPinReader()` (token em cache por instância serverless), evitando chamar `signInWithPassword` em tentativas inválidas. Somente quando o PIN está correto o servidor gera a sessão do cookie (`signInOwnerSession`), grava `nutri_session` (`HttpOnly`, `Secure` em produção, `SameSite=Lax`, AES-256-GCM) e zera o contador via `auth_gate_reset`.
   - `getAuthedContext()` valida o cookie, reutiliza o `accessToken` enquanto restam mais de 5 minutos, faz refresh automático via `refresh_token` quando próximo de expirar ou renova a sessão server-side.
2. **Isolamento no Banco (Supabase RLS):**
   - Acesso anônimo (`anon`/`public`) revogado e **Row Level Security (RLS)** forçada em todas as tabelas (`public.user_settings`, `public.daily_logs`, `public.weight_logs`, `public.scale_measurements`, `public.protocol_cycles`), restringindo leituras e escritas ao registro do proprietário autenticado (`user_id = auth.uid()`). A tabela `public.auth_rate_limits` não concede acesso direto a nenhum papel (apenas via funções `SECURITY DEFINER`).
3. **Variáveis de Ambiente Obrigatórias (`.env.local` local / Vercel Environment Variables):**
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_OWNER_EMAIL`
   - `SUPABASE_OWNER_PASSWORD`
   - `SUPABASE_OWNER_USER_ID`
   - `SESSION_SECRET` (mínimo 16 caracteres)
   > **Regra:** nunca registrar valores reais de senhas, chaves, tokens, UUIDs ou segredos em commits, código-fonte ou neste `CONTEXTO.md`.

---

## 4. Schema do Banco de Dados (Supabase — `public`)

1. **`public.user_settings`** (chave por `user_id`)
   - Metas e protocolo ativo: `sim_deficit`, `tmb_kcal`, `get_kcal`, `calorie_goal`, `protein_goal`, `carb_goal`, `fat_goal`, `fiber_goal`, `sodium_limit`, `water_goal_ml`, `start_weight_kg`, `target_weight_min_kg`, `target_weight_max_kg`, `protocol_start_date`, `protocol_end_date`
   - Perfil corporal (bioimpedância): `height_cm`, `age_years`, `sex` (`1` masculino / `0` feminino), `scale_user_id`
   - Segurança: `pin_hash`
2. **`public.daily_logs`** (único por `(user_id, log_date)`)
   - `id`, `log_date`, `selected_options` (JSON com escolhas `A`/`B`/`C` das refeições `"1"` a `"5"`), `water_ml`, `weight_kg`, `hunger_score`, `hunger_label`, `training_energy_score`, `training_energy_label`, `sleep_digestion`, `notes`, `total_kcal`, `total_protein_g`, `total_carbs_g`, `total_fat_g`, `total_fiber_g`, `balance_score`, `checkin_submitted`, `updated_at`
3. **`public.weight_logs`** (único por `(user_id, recorded_date)`)
   - `id`, `recorded_date`, `weight_kg`, `source` (`manual` | `checkin` | `checkpoint`), `is_projected`, `notes`
   - Representa a referência diária realizada usada para cruzar com a curva projetada no gráfico.
4. **`public.scale_measurements`**
   - `id`, `measured_at`, `measured_date`, `weight_kg`, `impedance_ohm`, `bmi`, `body_fat_pct`, `fat_mass_kg`, `muscle_kg`, `water_pct`, `bone_kg`, `visceral_fat`, `source` (`ble-live` | `ble-history` | `manual` | `checkin`)
5. **`public.protocol_cycles`** (migração `20261126_protocol_cycles.sql`)
   - `id`, `user_id`, `name`, `start_date`, `end_date`, `start_weight_kg`, `target_weight_min_kg`, `target_weight_max_kg`, `sim_deficit`, `final_weight_kg`, `is_active` (índice parcial único por usuário), `notes`, `created_at`, `updated_at`
6. **`public.auth_rate_limits`** (migração `20261125_auth_rate_limits.sql`)
   - `key` (hash do IP ou `__global__`), `failures`, `locked_until`, `updated_at` — acessada exclusivamente pelas funções `auth_gate_check`, `auth_gate_fail` e `auth_gate_reset`.

---

## 5. Regras de Negócio e Decisões Recentes

- **Balança Xiaomi Mi Body Composition Scale 2 (`XMTZC05HM` / `"MIBFS"`):**
  - Integração direta no navegador via **Web Bluetooth** (requer navegador compatível como Chrome/Edge desktop ou Android em HTTPS).
  - `/api/scale` (`POST`) deduplica medições enviadas contra o histórico existente (`±90s` e `±0,15 kg`), calcula composição corporal via `computeBodyComposition` usando o perfil salvo em `user_settings`, grava em `scale_measurements` e **reconcilia automaticamente a 1ª pesagem de cada dia (jejum, no fuso do Brasil)** em `weight_logs`.
  - Ao excluir uma medição em `/api/scale` (`DELETE`), o backend recalcula a 1ª pesagem restante do mesmo dia para `weight_logs` (ou remove a entrada de `weight_logs` se não restarem pesagens e a nota tiver origem `Balança Xiaomi`).
- **Ciclos Dinâmicos de Protocolo (`ProtocolCycleModal.tsx` + `/api/cycles`):**
  - Nenhuma data do protocolo fica chumbada no código: duração, checkpoints semanais (`buildProtocolCheckpoints`), rótulos do cabeçalho e janela do gráfico seguem `user_settings.protocol_start_date`..`protocol_end_date`.
  - Ao iniciar um novo ciclo, o anterior é arquivado em `protocol_cycles` com o último peso realizado e as pesagens anteriores continuam intactas no Supabase.
- **PWA Instalável (`manifest.ts`, `public/sw.js`, `public/offline.html`):**
  - Instalável como app em tela cheia no Android (Chrome) e iOS (Safari), com ícones próprios e tela de fallback offline. O service worker nunca faz cache de `/api/*` nem de requisições mutáveis.
- **Gráfico Projetado × Realizado (`WeightChartCard.tsx`):**
  - Cruza a curva projetada pelo déficit (`sim_deficit`) com as pesagens reais (`weight_logs`) e suavização **EWMA (`α = 0,15`)**, exibindo desvio dia a dia (`Real − Projetado`) e simulador em modal expandido.
- **Busca Aproximada TACO (`TacoSwapCalculator.tsx`):**
  - Busca normalizada sobre 603 alimentos sem depender de acentos, ordem das palavras ou stopwords (`de`, `da`, `do`, `com`, etc.), tolerando plural simples (`s` final) e pequenos erros de digitação (distância de edição/Levenshtein).
- **Layout Desktop (`NutritionDashboard.tsx`, commit `ede97d7`):**
  - O card **Metas Diárias & Progresso** fica em largura total acima da seção ampliada **Acompanhamento de Peso — Projetado × Realizado**, evitando distorção visual em telas largas.

---

## 6. Fluxo de Desenvolvimento e Deploy

```bash
# 1. Instalar dependências (primeira vez)
npm install

# 2. Copiar .env.example para .env.local e preencher credenciais localmente
# 3. Rodar em desenvolvimento
npm run dev

# 4. Validar build e tipos antes de publicar
npm run build
```

- **Publicação:** o projeto `painel-nutricional` na Vercel está conectado ao repositório GitHub (Settings → Git). Todo push na branch `main` gera deploy de produção automático em `https://painel-nutricional.vercel.app`; branches/PRs geram *preview deployments*. A Vercel CLI (`npx vercel --prod --yes`) fica apenas como alternativa manual.
- **Atenção ao editar:** preservar sempre a validação server-side em `getAuthedContext()`, manter RLS intacta no Supabase, não expor `pin_hash` nem variáveis de servidor ao cliente e nunca versionar `.env.local`.

---

## 7. Prompt Sugerido para Nova Conversa no Projeto "Dieta"

> Leia o arquivo `CONTEXTO.md` na raiz do repositório `eduardo14100/nutricao-dashboard` para entender a arquitetura atual do Painel Nutricional (Next.js + Supabase + Vercel + balança Xiaomi + gráfico Projetado × Realizado). A partir dele, quero fazer o seguinte ajuste: ...
