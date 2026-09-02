ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.projects FROM anon;
REVOKE ALL ON public.content_feedback FROM anon;
REVOKE ALL ON public.habit_log FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_feedback TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habit_log TO authenticated;
GRANT ALL ON public.projects TO service_role;
GRANT ALL ON public.content_feedback TO service_role;
GRANT ALL ON public.habit_log TO service_role;

CREATE POLICY "Signed-in users manage projects" ON public.projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Signed-in users manage content feedback" ON public.content_feedback FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Signed-in users manage habit log" ON public.habit_log FOR ALL TO authenticated USING (true) WITH CHECK (true);