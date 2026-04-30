UPDATE public.focus_item_configs
SET label = 'Custom Focus',
    auto_track_key = NULL
WHERE sort_order = 5
  AND (label ILIKE '%personal appoint%' OR auto_track_key = 'personal_appointments');