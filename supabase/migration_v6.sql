-- Run in Supabase → SQL Editor

CREATE TABLE public.beans (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name       text NOT NULL,
  is_active  boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.beans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own beans"
  ON public.beans FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own beans"
  ON public.beans FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own beans"
  ON public.beans FOR UPDATE USING (auth.uid() = user_id);
