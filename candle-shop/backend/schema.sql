-- Maison Cire (Supabase) schema
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

-- Products
create table if not exists public.products (
  id text primary key,
  name text not null,
  price numeric(10,2) not null default 0,
  stock int not null default 0,
  desc text,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_updated_at_idx on public.products(updated_at);

-- Reviews
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  name text not null,
  rating int not null check (rating between 1 and 5),
  text text,
  created_at timestamptz not null default now()
);

create index if not exists reviews_product_id_created_at_idx on public.reviews(product_id, created_at desc);

-- Notify subscriptions (per product, per email)
create table if not exists public.notify_subscriptions (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique(product_id, email)
);

create index if not exists notify_product_id_idx on public.notify_subscriptions(product_id);

-- Carts (one per session)
create table if not exists public.carts (
  session_id uuid primary key,
  cart jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  email text not null,
  cart jsonb not null,
  total numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists orders_created_at_idx on public.orders(created_at desc);

-- (Optionnel) désactiver RLS pour démo serveur-side
alter table public.products disable row level security;
alter table public.reviews disable row level security;
alter table public.notify_subscriptions disable row level security;
alter table public.carts disable row level security;
alter table public.orders disable row level security;
