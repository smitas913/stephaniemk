ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS ghl_contact_id text UNIQUE, ADD COLUMN IF NOT EXISTS ghl_synced_at timestamptz;

CREATE TABLE public.gbg_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  ghl_contact_id text,
  contact_name text,
  action text NOT NULL CHECK (action IN ('created','updated','skipped_not_client','skipped_ambiguous','error')),
  detail text,
  customer_id uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gbg_sync_log TO authenticated;
GRANT ALL ON public.gbg_sync_log TO service_role;
ALTER TABLE public.gbg_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner/admin view gbg log" ON public.gbg_sync_log FOR SELECT TO authenticated USING (has_any_active_role(auth.uid()));
CREATE POLICY "Owner/admin delete gbg log" ON public.gbg_sync_log FOR DELETE TO authenticated USING (has_any_active_role(auth.uid()));
CREATE INDEX gbg_sync_log_created_idx ON public.gbg_sync_log (created_at DESC);