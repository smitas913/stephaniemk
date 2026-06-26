
CREATE TABLE public.event_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  referred_by text,
  out_of_town boolean NOT NULL DEFAULT false,
  added_to_leads boolean NOT NULL DEFAULT false,
  owner_user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_referrals TO authenticated;
GRANT ALL ON public.event_referrals TO service_role;
ALTER TABLE public.event_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own event referrals"
  ON public.event_referrals FOR ALL
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);
CREATE INDEX event_referrals_event_idx ON public.event_referrals(event_id);
CREATE INDEX event_referrals_owner_idx ON public.event_referrals(owner_user_id);

CREATE TABLE public.hostess_coaching_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  event_id text NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
  hostess_name text NOT NULL DEFAULT 'your hostess',
  step smallint NOT NULL CHECK (step BETWEEN 1 AND 4),
  text text NOT NULL,
  due_date date NOT NULL,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hostess_coaching_tasks TO authenticated;
GRANT ALL ON public.hostess_coaching_tasks TO service_role;
ALTER TABLE public.hostess_coaching_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own hostess coaching tasks"
  ON public.hostess_coaching_tasks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX hostess_coaching_tasks_user_due_idx ON public.hostess_coaching_tasks(user_id, due_date) WHERE done = false;
CREATE INDEX hostess_coaching_tasks_event_idx ON public.hostess_coaching_tasks(event_id);
CREATE UNIQUE INDEX hostess_coaching_tasks_event_step_uidx ON public.hostess_coaching_tasks(event_id, step);
