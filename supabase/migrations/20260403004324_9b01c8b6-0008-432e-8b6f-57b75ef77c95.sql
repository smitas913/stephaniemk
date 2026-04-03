ALTER TABLE public.events
ADD COLUMN hostess_next_action text DEFAULT NULL,
ADD COLUMN hostess_next_action_date date DEFAULT NULL;