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
  check (status in ('en attente du virement','preparation','transit','termine'));

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
  email      text,
  role       text not null default 'user',
  first_name text,
  last_name  text,
  phone      text,
  address    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration : ajouter les colonnes si elles n'existent pas déjà
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name  text;
alter table public.profiles add column if not exists phone      text;
alter table public.profiles add column if not exists address    text;

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
-- 7) TESTIMONIALS (avis généraux carrousel)
-- ============================================================
create table if not exists public.testimonials (
  id          uuid       primary key default gen_random_uuid(),
  name        text       not null,
  rating      smallint   not null check (rating between 1 and 5),
  body        text       not null,
  date_label  text       not null default '',
  approved    boolean    not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists testimonials_approved_idx
  on public.testimonials(approved, created_at desc);

-- Seed : 8 avis pré-approuvés
insert into public.testimonials (name, rating, body, date_label, approved) values
  ('Sofia M.',   5, 'La bougie Santal est absolument divine — ça sent le luxe à prix accessible. Je recommande les yeux fermés !', 'Avril 2025', true),
  ('Lucas R.',   5, 'J''ai offert le Pack 3 à ma femme pour son anniversaire, elle a adoré. La présentation est super soignée.', 'Mars 2025', true),
  ('Emma D.',    5, 'La bougie Vanille est tellement cocooning ! Elle dure longtemps et la maison sent trop bon. J''en ai commandé 3.', 'Avril 2025', true),
  ('Thomas B.',  4, 'Livraison rapide, produits de qualité. La bougie Ambre est devenue mon coup de cœur. Le pack 5 est une vraie bonne affaire.', 'Mars 2025', true),
  ('Chloé L.',   5, 'Ça fait 3 commandes chez Maison Cire, jamais déçue. La carte cadeau est super pratique pour les cadeaux de dernière minute.', 'Février 2025', true),
  ('Nathan V.',  5, 'Qualité premium, parfums qui durent vraiment longtemps. La bougie Coton est parfaite pour le bureau, subtile et fraîche.', 'Janvier 2025', true),
  ('Inès K.',    5, 'Packaging soigné, odeurs incroyables. La Bougie Figue est une révélation. Je reviendrai sans hésiter.', 'Mars 2025', true),
  ('Romain T.',  5, 'Très belle découverte ! Le pack 3 est un excellent rapport qualité-prix. Les bougies brûlent proprement et l''odeur tient bien.', 'Février 2025', true)
on conflict do nothing;

-- ============================================================
-- 8) GIFT CARDS
-- ============================================================
create table if not exists public.gift_cards (
  id              uuid         primary key default gen_random_uuid(),
  code            text         unique not null,

  initial_amount  numeric(10,2) not null,
  balance         numeric(10,2) not null,

  sender_email    text         not null,
  recipient_email text         not null,
  from_name       text         not null default '',
  message         text         not null default '',
  color           text         not null default 'ambre',

  send_date           date,
  sent_at             timestamptz,
  payment_confirmed   boolean      not null default false,

  is_active           boolean      not null default true,
  order_id        uuid         references public.orders(id) on delete set null,
  created_at      timestamptz  not null default now()
);

create index if not exists gift_cards_code_idx
  on public.gift_cards(code);
create index if not exists gift_cards_recipient_idx
  on public.gift_cards(recipient_email);
create index if not exists gift_cards_sender_idx
  on public.gift_cards(sender_email);
create index if not exists gift_cards_pending_idx
  on public.gift_cards(send_date, sent_at) where sent_at is null;

-- ============================================================
-- FIN
-- ============================================================
