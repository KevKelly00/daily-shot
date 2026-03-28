-- Run this in Supabase → SQL Editor
-- Updates coffee_logs to the latte art focused schema

alter table public.coffee_logs
  drop column if exists title,
  drop column if exists brew_method,
  drop column if exists rating,
  add column if not exists beans        text,
  add column if not exists milk         text,
  add column if not exists art_style    text,
  add column if not exists art_rating     numeric(2,1) check (art_rating     >= 1.0 and art_rating     <= 5.0),
  add column if not exists flavour_rating numeric(2,1) check (flavour_rating >= 1.0 and flavour_rating <= 5.0);
