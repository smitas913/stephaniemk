DELETE FROM public.momentum_goals
WHERE metric_key IN (
  'booking_conversations',
  'appointments_held',
  'new_bookings',
  'follow_ups',
  'new_customers',
  'active_skincare_customers'
);