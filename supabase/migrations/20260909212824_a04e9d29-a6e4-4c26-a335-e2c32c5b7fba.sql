INSERT INTO public.momentum_goals (user_id, metric_key, metric_label, period, goal_value, is_visible, sort_order)
SELECT DISTINCT g.user_id, v.metric_key, v.metric_label, v.period, v.goal_value, true, v.sort_order
FROM public.momentum_goals g
CROSS JOIN (VALUES
  ('unit_career_chats', 'Unit Career Chats', 'weekly', 5, 3),
  ('unit_career_chats', 'Unit Career Chats', 'monthly', 20, 3),
  ('new_unit_members', 'New Unit Members', 'weekly', 1, 98),
  ('new_unit_members', 'New Unit Members', 'monthly', 1, 9)
) AS v(metric_key, metric_label, period, goal_value, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.momentum_goals x
  WHERE x.user_id = g.user_id AND x.metric_key = v.metric_key AND x.period = v.period
);