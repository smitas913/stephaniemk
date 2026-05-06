CREATE TABLE IF NOT EXISTS public.todos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text text NOT NULL,
  done boolean DEFAULT false,
  todo_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own todos" ON public.todos;
CREATE POLICY "Users manage own todos" ON public.todos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);