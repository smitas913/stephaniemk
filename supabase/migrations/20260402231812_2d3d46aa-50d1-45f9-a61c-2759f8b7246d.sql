
-- Team Consultants table
CREATE TABLE public.team_consultants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  join_date date DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'Active',
  last_order_date date,
  next_coaching_date date,
  notes text,
  prospect_id uuid REFERENCES public.prospects(id) ON DELETE SET NULL,
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.team_consultants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view team consultants" ON public.team_consultants
  FOR SELECT TO authenticated USING (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can insert team consultants" ON public.team_consultants
  FOR INSERT TO authenticated WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can update team consultants" ON public.team_consultants
  FOR UPDATE TO authenticated USING (is_internal_user(auth.uid())) WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can delete team consultants" ON public.team_consultants
  FOR DELETE TO authenticated USING (is_internal_user(auth.uid()));

-- Leadership Members table
CREATE TABLE public.leadership_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  current_title text,
  goal text,
  unit_members integer DEFAULT 0,
  personal_production numeric DEFAULT 0,
  unit_production numeric DEFAULT 0,
  next_coaching_date date,
  notes text,
  consultant_id uuid REFERENCES public.team_consultants(id) ON DELETE SET NULL,
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.leadership_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view leadership members" ON public.leadership_members
  FOR SELECT TO authenticated USING (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can insert leadership members" ON public.leadership_members
  FOR INSERT TO authenticated WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can update leadership members" ON public.leadership_members
  FOR UPDATE TO authenticated USING (is_internal_user(auth.uid())) WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can delete leadership members" ON public.leadership_members
  FOR DELETE TO authenticated USING (is_internal_user(auth.uid()));
