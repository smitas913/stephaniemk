-- Hide non-core metrics in both weekly and monthly views
UPDATE public.momentum_goals
SET is_visible = false
WHERE metric_key IN ('booking_conversations', 'appointments_held', 'follow_ups', 'new_bookings', 'new_customers');

-- Ensure core metrics are visible
UPDATE public.momentum_goals
SET is_visible = true
WHERE metric_key IN ('faces', 'career_chats', 'new_team_members', 'new_skincare_customers');

-- Add weekly New Team Members for any user that doesn't have one
INSERT INTO public.momentum_goals (user_id, metric_key, metric_label, period, goal_value, sort_order, is_visible)
SELECT DISTINCT user_id, 'new_team_members', 'New Team Members', 'weekly', 1, 97, true
FROM public.momentum_goals
WHERE period = 'weekly'
  AND user_id NOT IN (SELECT user_id FROM public.momentum_goals WHERE metric_key = 'new_team_members' AND period = 'weekly');

-- Add weekly New Skincare Customers for any user that doesn't have one
INSERT INTO public.momentum_goals (user_id, metric_key, metric_label, period, goal_value, sort_order, is_visible)
SELECT DISTINCT user_id, 'new_skincare_customers', 'New Skincare Customers', 'weekly', 1, 99, true
FROM public.momentum_goals
WHERE period = 'weekly'
  AND user_id NOT IN (SELECT user_id FROM public.momentum_goals WHERE metric_key = 'new_skincare_customers' AND period = 'weekly');