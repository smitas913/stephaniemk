
-- Add virtual event fields to events table
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS zoom_id text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS zoom_password text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS zoom_link text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS virtual_platform text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS virtual_platform_link text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS virtual_notes text;

-- Create zoom defaults settings table
CREATE TABLE public.zoom_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  zoom_id text,
  zoom_password text,
  zoom_link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.zoom_defaults ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX zoom_defaults_user_id_idx ON public.zoom_defaults (user_id);

CREATE POLICY "Users can view own zoom defaults" ON public.zoom_defaults FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own zoom defaults" ON public.zoom_defaults FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own zoom defaults" ON public.zoom_defaults FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
