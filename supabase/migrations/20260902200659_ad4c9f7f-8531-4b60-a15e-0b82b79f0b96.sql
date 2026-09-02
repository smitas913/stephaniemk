DROP POLICY IF EXISTS "Signed-in users manage projects" ON public.projects;
DROP POLICY IF EXISTS "Signed-in users manage content feedback" ON public.content_feedback;
DROP POLICY IF EXISTS "Signed-in users manage habit log" ON public.habit_log;

CREATE POLICY "Internal users manage projects" ON public.projects
  FOR ALL TO authenticated
  USING (public.is_internal_user(auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users manage content feedback" ON public.content_feedback
  FOR ALL TO authenticated
  USING (public.is_internal_user(auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users manage habit log" ON public.habit_log
  FOR ALL TO authenticated
  USING (public.is_internal_user(auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()));