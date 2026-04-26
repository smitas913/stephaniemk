-- 1. Add optional result_type tag to notes (Face | Career Chat | Booking Conversation)
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS result_type text;

ALTER TABLE public.notes
  DROP CONSTRAINT IF EXISTS notes_result_type_check;

ALTER TABLE public.notes
  ADD CONSTRAINT notes_result_type_check
  CHECK (result_type IS NULL OR result_type IN ('Face', 'Career Chat', 'Booking Conversation'));

CREATE INDEX IF NOT EXISTS idx_notes_result_type
  ON public.notes (owner_user_id, result_type, note_date)
  WHERE result_type IS NOT NULL;

-- 2. Momentum goals table (per-user, per-metric, per-period)
CREATE TABLE IF NOT EXISTS public.momentum_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  metric_key text NOT NULL,
  metric_label text NOT NULL,
  period text NOT NULL CHECK (period IN ('weekly', 'monthly')),
  goal_value integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, metric_key, period)
);

ALTER TABLE public.momentum_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own momentum goals"
  ON public.momentum_goals FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own momentum goals"
  ON public.momentum_goals FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own momentum goals"
  ON public.momentum_goals FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own momentum goals"
  ON public.momentum_goals FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_momentum_goals_updated_at
  BEFORE UPDATE ON public.momentum_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
