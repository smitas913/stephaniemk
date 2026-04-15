
CREATE TABLE public.scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Customer Follow-Up',
  script_text TEXT NOT NULL DEFAULT '',
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view scripts"
  ON public.scripts FOR SELECT TO authenticated
  USING (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can insert scripts"
  ON public.scripts FOR INSERT TO authenticated
  WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can update scripts"
  ON public.scripts FOR UPDATE TO authenticated
  USING (is_internal_user(auth.uid()))
  WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can delete scripts"
  ON public.scripts FOR DELETE TO authenticated
  USING (is_internal_user(auth.uid()));

CREATE TRIGGER update_scripts_updated_at
  BEFORE UPDATE ON public.scripts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
