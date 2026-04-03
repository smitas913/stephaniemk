
CREATE TABLE public.event_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id text NOT NULL,
  task_name text NOT NULL,
  task_type text NOT NULL,
  due_date date,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamp with time zone,
  owner_user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.event_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view event tasks" ON public.event_tasks FOR SELECT TO authenticated USING (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can insert event tasks" ON public.event_tasks FOR INSERT TO authenticated WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can update event tasks" ON public.event_tasks FOR UPDATE TO authenticated USING (is_internal_user(auth.uid())) WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can delete event tasks" ON public.event_tasks FOR DELETE TO authenticated USING (is_internal_user(auth.uid()));
