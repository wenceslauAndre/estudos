-- =============================================================================
-- schema.sql — banco do App de Estudos (Supabase)
--
-- Como usar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode rodar de novo quantas vezes quiser (é idempotente): nada é apagado.
--
-- Modelo: uma linha por usuário × chave do localStorage ("estudos.planner.v1",
-- "estudos.flashcards.v1", ...). O app grava o JSON exatamente como está no
-- aparelho e usa a coluna "revisao" para detectar edições simultâneas em dois
-- aparelhos (controle otimista: update ... where revisao = <a que eu conheço>).
--
-- Segurança: o navegador usa só a chave pública (publishable/anon). Quem impede
-- um usuário de ver/alterar os dados de outro é o Row Level Security (RLS) abaixo.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tabela
--    - user_id: dono da linha. Default auth.uid() (o usuário logado) e FK para
--      auth.users com "on delete cascade": apagar a conta apaga os dados.
--    - chave: sempre começa com "estudos." e tem no máximo 100 caracteres.
--    - valor: o JSON do localStorage, limitado a ~1 MB por linha.
--    - revisao / atualizado_em: controlados pelo gatilho (seção 2); o valor que o
--      app mandar nessas colunas é ignorado.
--    - dispositivo: id aleatório do aparelho que gravou por último (informativo).
-- -----------------------------------------------------------------------------
create table if not exists public.estudos_dados (
  user_id       uuid        not null default auth.uid()
                            references auth.users (id) on delete cascade,
  chave         text        not null,
  valor         jsonb       not null,
  revisao       bigint      not null default 1,
  atualizado_em timestamptz not null default now(),
  dispositivo   text,
  primary key (user_id, chave),
  constraint estudos_dados_chave_valida
    check (left(chave, 8) = 'estudos.' and char_length(chave) <= 100),
  constraint estudos_dados_tamanho
    check (pg_column_size(valor) < 1048576),
  constraint estudos_dados_dispositivo_curto
    check (dispositivo is null or char_length(dispositivo) <= 100)
);

comment on table public.estudos_dados is
  'App de Estudos: uma linha por usuário × chave do localStorage (estudos.*).';


-- -----------------------------------------------------------------------------
-- 2. Gatilho de versão
--    - insert: revisao = 1 e atualizado_em = now().
--    - update: revisao = revisão anterior + 1 e atualizado_em = now().
--      Também impede trocar o dono (user_id) ou a chave de uma linha existente.
--    "set search_path = ''" evita sequestro de funções por outro schema
--    (recomendação do linter do Supabase).
-- -----------------------------------------------------------------------------
create or replace function public.estudos_dados_versionar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revisao := 1;
  else
    new.revisao := old.revisao + 1;
    new.user_id := old.user_id;
    new.chave   := old.chave;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

-- Função de gatilho não precisa ser chamável pela API.
revoke all on function public.estudos_dados_versionar() from public, anon, authenticated;

drop trigger if exists estudos_dados_versionar on public.estudos_dados;
create trigger estudos_dados_versionar
  before insert or update on public.estudos_dados
  for each row execute function public.estudos_dados_versionar();


-- -----------------------------------------------------------------------------
-- 3. Row Level Security
--    "enable" liga o RLS; "force" faz valer também para o dono da tabela.
--    (Papéis com BYPASSRLS, como service_role, continuam enxergando tudo —
--    por isso a chave service_role NUNCA vai para o app.)
--    Cada política vale só para o papel "authenticated" (usuário logado) e só
--    para as linhas cujo user_id é o do próprio usuário.
--    "(select auth.uid())" em vez de "auth.uid()" faz o Postgres calcular o id
--    uma vez por consulta, e não uma vez por linha (mais rápido).
-- -----------------------------------------------------------------------------
alter table public.estudos_dados enable row level security;
alter table public.estudos_dados force row level security;

-- Ler: só as próprias linhas.
drop policy if exists "estudos_dados_select_proprio" on public.estudos_dados;
create policy "estudos_dados_select_proprio" on public.estudos_dados
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Inserir: só linhas em nome de si mesmo.
drop policy if exists "estudos_dados_insert_proprio" on public.estudos_dados;
create policy "estudos_dados_insert_proprio" on public.estudos_dados
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Alterar: só as próprias linhas, e o resultado continua sendo do próprio usuário.
drop policy if exists "estudos_dados_update_proprio" on public.estudos_dados;
create policy "estudos_dados_update_proprio" on public.estudos_dados
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Apagar: só as próprias linhas.
drop policy if exists "estudos_dados_delete_proprio" on public.estudos_dados;
create policy "estudos_dados_delete_proprio" on public.estudos_dados
  for delete to authenticated
  using (user_id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- 4. Permissões
--    O Supabase dá "all" em tabelas novas para anon e authenticated por padrão.
--    Tiramos tudo (inclusive TRUNCATE, que ignora o RLS) e devolvemos ao
--    usuário logado só as 4 operações cobertas pelas políticas acima.
--    O papel anon (visitante sem login) não acessa a tabela.
-- -----------------------------------------------------------------------------
revoke all on table public.estudos_dados from public, anon, authenticated;
grant select, insert, update, delete on table public.estudos_dados to authenticated;
