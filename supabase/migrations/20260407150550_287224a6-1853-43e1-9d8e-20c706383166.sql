ALTER TABLE public.notes ADD COLUMN is_booking_attempt boolean NOT NULL DEFAULT false;
ALTER TABLE public.notes ADD COLUMN is_follow_up boolean NOT NULL DEFAULT false;