
CREATE TABLE public.weekly_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  preset text NOT NULL DEFAULT 'conservative',
  reach_outs integer NOT NULL DEFAULT 35,
  bookings integer NOT NULL DEFAULT 4,
  sharings integer NOT NULL DEFAULT 2,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_goals ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX weekly_goals_user_id_idx ON public.weekly_goals(user_id);

CREATE POLICY "Users can view own weekly goals"
  ON public.weekly_goals FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own weekly goals"
  ON public.weekly_goals FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own weekly goals"
  ON public.weekly_goals FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
