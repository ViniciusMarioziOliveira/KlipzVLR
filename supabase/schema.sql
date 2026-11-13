-- =====================================================================
--  KlipzVLR · estrutura do banco no Supabase
--
--  COMO USAR: painel do Supabase > SQL Editor > New query >
--             cole ESTE ARQUIVO INTEIRO > Run.
--
--  Pode rodar de novo quando quiser: o script é idempotente
--  (não duplica nada e não apaga clipes já postados).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. PERFIS · um por usuário, guarda o nick público
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null check (username ~ '^[A-Za-z0-9_.]{3,20}$'),
  created_at timestamptz not null default now()
);

-- nick único sem diferenciar maiúsculas/minúsculas (dkT1 = DKT1)
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));


-- ---------------------------------------------------------------------
-- 2. CLIPES
-- ---------------------------------------------------------------------
create table if not exists public.clips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 3 and 80),
  description text check (char_length(description) <= 500),
  agent       text check (char_length(agent) <= 40),
  map         text check (char_length(map) <= 40),
  highlight   text check (char_length(highlight) <= 20),
  video_path  text not null,   -- arquivo no Storage: <user_id>/<id>.<ext>
  thumb_path  text,            -- capa gerada no navegador: <user_id>/<id>.jpg
  duration    real,            -- duração em segundos
  created_at  timestamptz not null default now()
);

create index if not exists clips_created_at_idx on public.clips (created_at desc);
create index if not exists clips_user_id_idx    on public.clips (user_id);
create index if not exists clips_agent_idx      on public.clips (agent);
create index if not exists clips_map_idx        on public.clips (map);


-- ---------------------------------------------------------------------
-- 3. SEGURANÇA (RLS) · quem pode ler e escrever o quê
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.clips    enable row level security;

-- perfis: qualquer um vê; cada usuário só cria o próprio
drop policy if exists "perfis_leitura_publica" on public.profiles;
create policy "perfis_leitura_publica" on public.profiles
  for select to anon, authenticated
  using (true);

drop policy if exists "perfis_dono_cria" on public.profiles;
create policy "perfis_dono_cria" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

-- clipes: qualquer um assiste; só quem está logado posta
-- (e só apontando para arquivos da própria pasta); só o dono apaga
drop policy if exists "clipes_leitura_publica" on public.clips;
create policy "clipes_leitura_publica" on public.clips
  for select to anon, authenticated
  using (true);

drop policy if exists "clipes_logado_posta" on public.clips;
create policy "clipes_logado_posta" on public.clips
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and split_part(video_path, '/', 1) = (select auth.uid())::text
    and (thumb_path is null or split_part(thumb_path, '/', 1) = (select auth.uid())::text)
  );

drop policy if exists "clipes_dono_apaga" on public.clips;
create policy "clipes_dono_apaga" on public.clips
  for delete to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------
-- 4. PERMISSÕES DA API
--    Projetos novos do Supabase NÃO liberam tabelas novas para a API
--    automaticamente, então estes GRANTs são obrigatórios.
--    (o RLS acima continua decidindo QUAIS linhas cada um acessa)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

revoke all on public.profiles from anon, authenticated;
revoke all on public.clips    from anon, authenticated;

grant select         on public.profiles to anon, authenticated;
grant insert         on public.profiles to authenticated;
grant select         on public.clips    to anon, authenticated;
grant insert, delete on public.clips    to authenticated;


-- ---------------------------------------------------------------------
-- 5. PERFIL AUTOMÁTICO NO CADASTRO
--    Usa o nick enviado pelo site; se já existir, ganha um sufixo.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base      text;
  candidate text;
begin
  base := regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '[^A-Za-z0-9_.]', '', 'g');
  if char_length(base) < 3 then
    base := 'agente_' || substr(md5(new.id::text), 1, 4);
  end if;
  base := left(base, 20);
  candidate := base;

  while exists (select 1 from public.profiles p where lower(p.username) = lower(candidate)) loop
    candidate := left(base, 15) || '_' || substr(md5(random()::text), 1, 4);
  end loop;

  insert into public.profiles (id, username) values (new.id, candidate);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- 6. "ESSE NICK ESTÁ LIVRE?" · usado na tela de cadastro
-- ---------------------------------------------------------------------
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles p
    where lower(p.username) = lower(trim(p_username))
  );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 7. STORAGE · bucket "clips" (vídeos + capas), público para assistir
--    50 MB por arquivo = limite máximo do plano Free
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clips', 'clips', true, 52428800,
  array[
    'video/mp4', 'video/x-m4v', 'video/quicktime', 'video/webm',
    'video/x-matroska', 'video/ogg', 'image/jpeg', 'image/webp'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- cada usuário só mexe na própria pasta: clips/<user_id>/arquivo
drop policy if exists "clips_dono_le" on storage.objects;
create policy "clips_dono_le" on storage.objects
  for select to authenticated
  using (bucket_id = 'clips' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "clips_dono_envia" on storage.objects;
create policy "clips_dono_envia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'clips' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "clips_dono_apaga" on storage.objects;
create policy "clips_dono_apaga" on storage.objects
  for delete to authenticated
  using (bucket_id = 'clips' and (storage.foldername(name))[1] = (select auth.uid())::text);


-- avisa a API do Supabase para recarregar a estrutura nova
notify pgrst, 'reload schema';
