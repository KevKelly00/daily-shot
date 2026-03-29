CREATE TABLE public.ratings (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  log_id     uuid REFERENCES public.coffee_logs ON DELETE CASCADE NOT NULL,
  score      numeric(2,1) CHECK (score >= 0.5 AND score <= 5.0) NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, log_id)
);
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can view ratings"  ON ratings FOR SELECT USING (is_approved());
CREATE POLICY "Approved users can rate"          ON ratings FOR INSERT WITH CHECK (auth.uid() = user_id AND is_approved());
CREATE POLICY "Users can update own rating"      ON ratings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own rating"      ON ratings FOR DELETE USING (auth.uid() = user_id);
