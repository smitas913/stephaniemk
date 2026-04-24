CREATE TABLE public.completed_birthdays (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  person_id uuid NOT NULL,
  person_type text NOT NULL DEFAULT 'customer',
  birthday_year integer NOT NULL,
  completed_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, person_id, birthday_year)
);

ALTER TABLE public.completed_birthdays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own completed birthdays"
  ON public.completed_birthdays
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own completed birthdays"
  ON public.completed_birthdays
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own completed birthdays"
  ON public.completed_birthdays
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_completed_birthdays_user_year ON public.completed_birthdays (user_id, birthday_year);