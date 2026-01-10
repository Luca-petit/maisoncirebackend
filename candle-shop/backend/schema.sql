-- ============================================================
-- MaisonCire — Schema Supabase (Carts + Orders + Notify + Auth Roles)
-- ✅ Rejouable (IF NOT EXISTS / DO blocks)
-- ✅ Auth: profile auto créé sur inscription (role=user)
-- ✅ Admin role: tu modifies manuellement profiles.role = 'admin'
-- ============================================================

-- 0) Extensions
create extension if not exists pgcrypto;

-- ============================================================
-- 1) CARTS (panier server-side via session_id)
-- ============================================================
create table if not exists public.carts (
  session_id text primary key,
  cart jsonb not null default '{"skus":{}, "packs":[], "giftcards":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists carts_updated_at_idx
  on public.carts(updated_at);

-- ============================================================
-- 2) ORDERS
-- ============================================================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),

  session_id text not null,
  email text not null,

  phone text,
  delivery_mode text not null default 'pickup',
  payment_mode text not null default 'transfer',
  delivery_fee numeric(10,2) not null default 0,
  address jsonb,

  cart jsonb not null,
  total numeric(10,2) not null default 0,

  status text not null default 'preparation',
  created_at timestamptz not null default now()
);

-- Contraintes propres (drop + recreate)
alter table public.orders
  drop constraint if exists orders_delivery_mode_check;
alter table public.orders
  add constraint orders_delivery_mode_check
  check (delivery_mode in ('pickup','shipping'));

alter table public.orders
  drop constraint if exists orders_payment_mode_check;
alter table public.orders
  add constraint orders_payment_mode_check
  check (payment_mode in ('cash','transfer'));

alter table public.orders
  drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('preparation','transit','termine'));

-- Ex: cash uniquement pickup (si tu veux garder cette règle)
alter table public.orders
  drop constraint if exists orders_cash_only_pickup_check;
alter table public.orders
  add constraint orders_cash_only_pickup_check
  check (not (payment_mode = 'cash' and delivery_mode <> 'pickup'));

-- Index utiles
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_session_id_idx on public.orders(session_id);
create index if not exists orders_email_idx      on public.orders(email);
create index if not exists orders_status_idx     on public.orders(status);

-- ============================================================
-- 3) NOTIFY SUBSCRIPTIONS (alerte stock)
-- ============================================================
create table if not exists public.notify_subscriptions (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  email text not null,
  created_at timestamptz not null default now(),
  unique(product_id, email)
);

-- FK vers products si la table existe
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'products'
  ) then
    begin
      alter table public.notify_subscriptions
        drop constraint if exists notify_subscriptions_product_id_fkey;

      alter table public.notify_subscriptions
        add constraint notify_subscriptions_product_id_fkey
        foreign key (product_id)
        references public.products(id)
        on delete cascade;
    exception when others then
      -- ignore si déjà ok
      null;
    end;
  end if;
end $$;

create index if not exists notify_subscriptions_product_id_idx
  on public.notify_subscriptions(product_id);

create index if not exists notify_subscriptions_email_idx
  on public.notify_subscriptions(email);

-- ============================================================
-- 4) STORAGE policies (bucket 'products')
-- ⚠️: upload public = ok pour démo, mais en prod mieux: auth only/admin only
-- ============================================================
drop policy if exists "Public upload products images" on storage.objects;
drop policy if exists "Public read products images" on storage.objects;

create policy "Public upload products images"
on storage.objects
for insert
to public
with check (bucket_id = 'products');

create policy "Public read products images"
on storage.objects
for select
to public
using (bucket_id = 'products');

-- ============================================================
-- 5) AUTH / ROLES (profiles)
-- ✅ chaque user inscrit => profiles auto avec role='user'
-- ✅ toi: tu changes role='admin' dans la DB manuellement
-- ============================================================

-- Table profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contrainte role
alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user','admin'));

create index if not exists profiles_email_idx on public.profiles(email);

-- Auto update updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Trigger: à l’inscription, créer profiles (role=user)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user')
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ============================================================
-- 6) RLS (Row Level Security)
-- Tu peux laisser OFF si tout passe via ton backend (service role),
-- mais je te mets une config "safe" minimale.
-- ============================================================

-- Profiles : l’utilisateur peut lire/éditer son profil (pas le role)
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Optionnel: empêche update du role côté client (tu le fais à la main)
revoke update(role) on public.profiles from authenticated;

-- Orders / carts / notify : si ton app passe PAR TON BACKEND (service role),
-- tu peux laisser RLS désactivé pour éviter de casser.
-- (si tu veux activer RLS plus tard, on le fera ensemble proprement)

-- ============================================================
-- FIN
-- ============================================================
