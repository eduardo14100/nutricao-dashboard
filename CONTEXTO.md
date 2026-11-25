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
- `src/app/page.tsx` e `src/app/layout.tsx` — Página principal e layout raiz.
- `src/app/api/` — Route Handlers autenticados no servidor:
  - `auth/login/route.ts` — Login com PIN numérico (4 a 6 dígitos).
  - `auth/logout/route.ts` — Encerramento de sessão (limpa cookie).
  - `auth/change-pin/route.ts` — Alteração do PIN atual (valida PIN antigo, gera novo hash `scrypt`).
  - `dashboard/route.ts` — Carga inicial completa (`user_settings`, `weight_logs`, `daily_logs`, `scale_measurements`).
  - `day-state/route.ts` — Persistência imediata das seleções de refeições (`A`/`B`/`C`) e água (`water_ml`) no `daily_logs`.
  - `checkins/route.ts` — Salva/atualiza e remove check-in completo do dia em `daily_logs` (e sincroniza `weight_logs` quando há peso informado).
  - `weights/route.ts` — Upsert manual de pesagem (`POST`), reset da projeção para checkpoints padrão (`PUT` com `action: "reset"`) e remoção (`DELETE`, com opção `includeScale=1`).
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
  - `ChangePinModal.tsx` — Modal para troca de PIN.
- `src/data/` — Dados estáticos e utilitários de domínio:
  - `nutrition.ts` — Cardápio base (`MEALS_DATA`), cálculos de macros (`calcItemMacros`, `calcMealMacros`, `computeDailyTotals`, `computeBalanceScore`), checkpoints padrão (`DEFAULT_CHECKPOINTS`) e utilitários de data (fuso `America/Sao_Paulo`).
  - `scale.ts` — Constantes BLE da Xiaomi (`SVC_BODY_COMP = 0x181b`, `CHR_BODY_COMP_MEAS = 0x2a9c`, `CHR_HISTORY`, `SVC_CURRENT_TIME`, `CHR_CURRENT_TIME`), cálculo de composição corporal (`computeBodyComposition`) e construção da série `buildProjectedVsRealizedSeries`.
  - `taco-foods.json` — Base com 603 alimentos da Tabela TACO.
  - `plano_nutricional.pdf` — PDF do plano alimentar.
- `src/lib/` — Infraestrutura server-side:
  - `auth.ts` — Hash/verificação de PIN (`scrypt` + `crypto.timingSafeEqual`) e criptografia/descriptografia do cookie de sessão (`AES-256-GCM`).
  - `supabase.ts` — Autenticação do proprietário e cliente Supabase com token escopado (`getAuthedContext`, `signInOwnerSession`, `createScopedClient`).

---

## 3. Arquitetura de Segurança e Variáveis de Ambiente

1. **Autenticação por PIN no Servidor:**
   - O PIN nunca é validado no frontend nem salvo em texto puro; o hash `scrypt$<salt>$<derived>` fica em `public.user_settings.pin_hash`.
   - Ao validar o PIN em `/api/auth/login`, o servidor autentica a sessão do proprietário no Supabase Auth e grava o cookie `nutri_session` (`HttpOnly`, `Secure` em produção, `SameSite=Lax`, validade de 30 dias quando `remember` está ativo).
   - O conteúdo do cookie é criptografado com **AES-256-GCM** usando chave derivada (SHA-256) de `SESSION_SECRET`.
   - `getAuthedContext()` valida o cookie, reutiliza o `accessToken` enquanto restam mais de 5 minutos, faz refresh automático via `refresh_token` quando próximo de expirar ou renova a sessão server-side.
2. **Isolamento no Banco (Supabase RLS):**
   - Acesso anônimo (`anon`/`public`) revogado e **Row Level Security (RLS)** forçada em todas as tabelas (`public.user_settings`, `public.daily_logs`, `public.weight_logs`, `public.scale_measurements`), restringindo leituras e escritas ao registro do proprietário autenticado (`user_id = auth.uid()`).
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
   - Metas e protocolo: `sim_deficit`, `tmb_kcal`, `get_kcal`, `calorie_goal`, `protein_goal`, `carb_goal`, `fat_goal`, `fiber_goal`, `sodium_limit`, `water_goal_ml`, `start_weight_kg`, `target_weight_min_kg`, `target_weight_max_kg`, `protocol_start_date`, `protocol_end_date`
   - Perfil corporal (bioimpedância): `height_cm`, `age_years`, `sex` (`1` masculino / `0` feminino), `scale_user_id`
   - Segurança: `pin_hash`
2. **`public.daily_logs`** (único por `(user_id, log_date)`)
   - `id`, `log_date`, `selected_options` (JSON com escolhas `A`/`B`/`C` das refeições `"1"` a `"5"`), `water_ml`, `weight_kg`, `hunger_score`, `hunger_label`, `training_energy_score`, `training_energy_label`, `sleep_digestion`, `notes`, `total_kcal`, `total_protein_g`, `total_carbs_g`, `total_fat_g`, `total_fiber_g`, `balance_score`, `checkin_submitted`, `updated_at`
3. **`public.weight_logs`** (único por `(user_id, recorded_date)`)
   - `id`, `recorded_date`, `weight_kg`, `source` (`manual` | `checkin` | `checkpoint`), `is_projected`, `notes`
   - Representa a referência diária realizada usada para cruzar com a curva projetada no gráfico.
4. **`public.scale_measurements`**
   - `id`, `measured_at`, `measured_date`, `weight_kg`, `impedance_ohm`, `bmi`, `body_fat_pct`, `fat_mass_kg`, `muscle_kg`, `water_pct`, `bone_kg`, `visceral_fat`, `source` (`ble-live` | `ble-history` | `manual` | `checkin`)

---

## 5. Regras de Negócio e Decisões Recentes

- **Balança Xiaomi Mi Body Composition Scale 2 (`XMTZC05HM` / `"MIBFS"`):**
  - Integração direta no navegador via **Web Bluetooth** (requer navegador compatível como Chrome/Edge desktop ou Android em HTTPS).
  - `/api/scale` (`POST`) deduplica medições enviadas contra o histórico existente (`±90s` e `±0,15 kg`), calcula composição corporal via `computeBodyComposition` usando o perfil salvo em `user_settings`, grava em `scale_measurements` e **reconcilia automaticamente a 1ª pesagem de cada dia (jejum, no fuso do Brasil)** em `weight_logs`.
  - Ao excluir uma medição em `/api/scale` (`DELETE`), o backend recalcula a 1ª pesagem restante do mesmo dia para `weight_logs` (ou remove a entrada de `weight_logs` se não restarem pesagens e a nota tiver origem `Balança Xiaomi`).
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
