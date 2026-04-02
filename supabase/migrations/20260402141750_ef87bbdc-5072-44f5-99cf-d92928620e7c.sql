
-- 1. customer_summary view
CREATE OR REPLACE VIEW public.customer_summary AS
SELECT
  c.id,
  c.full_name AS name,
  c.phone,
  c.email,
  c.relationship_status,
  c.customer_source,
  c.last_order_date_order_log AS last_order_effective,
  CASE WHEN c.last_order_date_order_log IS NOT NULL
    THEN (CURRENT_DATE - c.last_order_date_order_log)::integer
    ELSE NULL
  END AS days_since_last_order,
  c.next_follow_up_date,
  c.last_contacted AS last_contact_date,
  COALESCE(os.total_orders, 0) AS total_orders,
  COALESCE(os.lifetime_sales, 0) AS lifetime_sales,
  CASE
    WHEN os.total_orders IS NULL OR os.total_orders = 0 THEN 'No Orders'
    WHEN c.last_order_date_order_log >= CURRENT_DATE - 30 THEN 'New'
    WHEN c.last_order_date_order_log >= CURRENT_DATE - 90 THEN 'Active'
    WHEN c.last_order_date_order_log >= CURRENT_DATE - 179 THEN 'Warm'
    ELSE 'Dormant'
  END AS activity_status,
  CASE
    WHEN COALESCE(vip.order_count_365, 0) >= 3 AND COALESCE(vip.sales_365, 0) >= 300 THEN true
    ELSE false
  END AS is_vip,
  CASE
    WHEN COALESCE(vip.order_count_365, 0) >= 3 AND COALESCE(vip.sales_365, 0) >= 300 THEN 'VIP'
    ELSE NULL
  END AS vip_display,
  ln.latest_note_preview,
  c.is_active,
  c.archived_at,
  c.owner_user_id
FROM public.customers c
LEFT JOIN LATERAL (
  SELECT COUNT(*)::integer AS total_orders, SUM(retail_amount) AS lifetime_sales
  FROM public.orders WHERE customer_id = c.id
) os ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*)::integer AS order_count_365, SUM(retail_amount) AS sales_365
  FROM public.orders WHERE customer_id = c.id AND order_date >= CURRENT_DATE - 365
) vip ON true
LEFT JOIN LATERAL (
  SELECT LEFT(note_body, 60) AS latest_note_preview
  FROM public.notes WHERE customer_id = c.id AND entity_type = 'Customer'
  ORDER BY created_at DESC LIMIT 1
) ln ON true;

-- 2. event_summary view
CREATE OR REPLACE VIEW public.event_summary AS
SELECT
  e.id,
  e.event_id,
  e.event_type,
  e.event_date,
  e.hostess_name,
  e.guest_count,
  e.ordering_guest_count,
  e.future_bookings_count,
  e.sharing_appointments_count,
  COALESCE(os.total_sales, 0) AS total_sales,
  COALESCE(os.order_count, 0) AS order_count,
  CASE
    WHEN COALESCE(e.guest_count, 0) > 0
    THEN ROUND((COALESCE(e.ordering_guest_count, 0)::numeric / e.guest_count) * 100, 1)
    ELSE 0
  END AS conversion_rate,
  e.notes,
  e.owner_user_id
FROM public.events e
LEFT JOIN LATERAL (
  SELECT SUM(retail_amount) AS total_sales, COUNT(*)::integer AS order_count
  FROM public.orders WHERE event_id = e.event_id OR parent_event_id = e.event_id
) os ON true;

-- 3. order_financials view
CREATE OR REPLACE VIEW public.order_financials AS
SELECT
  o.id,
  o.customer_id,
  c.full_name AS customer_name,
  o.event_id,
  o.order_date,
  o.retail_amount,
  o.wholesale_amount,
  o.payout_amount,
  o.payment_type,
  o.order_type,
  CASE
    WHEN o.payment_type = 'MyShop' THEN COALESCE(o.payout_amount, 0)
    ELSE o.retail_amount - COALESCE(o.wholesale_amount, 0)
  END AS calculated_profit,
  o.notes,
  o.owner_user_id
FROM public.orders o
LEFT JOIN public.customers c ON c.id = o.customer_id;

-- 4. follow_up_queue view
CREATE OR REPLACE VIEW public.follow_up_queue AS
SELECT
  'Customer' AS entity_type,
  cs.id AS entity_id,
  cs.name,
  cs.phone,
  cs.email,
  cs.next_follow_up_date,
  CASE
    WHEN cs.next_follow_up_date < CURRENT_DATE THEN 'Overdue'
    WHEN cs.next_follow_up_date = CURRENT_DATE THEN 'Due Today'
    ELSE 'Upcoming'
  END AS overdue_status,
  CASE
    WHEN cs.next_follow_up_date < CURRENT_DATE THEN (CURRENT_DATE - cs.next_follow_up_date)::integer
    ELSE 0
  END AS days_overdue,
  CASE
    WHEN cs.activity_status = 'New' AND cs.customer_source IS NOT NULL THEN 'New - ' || cs.customer_source
    WHEN cs.activity_status = 'New' THEN 'New - First Follow-Up'
    WHEN cs.days_since_last_order >= 90 THEN '90+ Day Reorder'
    WHEN cs.days_since_last_order BETWEEN 75 AND 89 THEN '90 Day Cycle'
    ELSE 'Customer Follow-Up'
  END AS follow_up_reason,
  cs.latest_note_preview AS note_preview,
  cs.activity_status,
  cs.days_since_last_order,
  cs.relationship_status,
  cs.is_vip,
  cs.vip_display
FROM public.customer_summary cs
WHERE cs.next_follow_up_date IS NOT NULL
  AND cs.next_follow_up_date <= CURRENT_DATE
  AND cs.is_active = true
  AND cs.archived_at IS NULL

UNION ALL

SELECT
  'Prospect' AS entity_type,
  p.id AS entity_id,
  p.name,
  p.phone,
  p.email,
  p.next_follow_up_date,
  CASE
    WHEN p.next_follow_up_date < CURRENT_DATE THEN 'Overdue'
    WHEN p.next_follow_up_date = CURRENT_DATE THEN 'Due Today'
    ELSE 'Upcoming'
  END AS overdue_status,
  CASE
    WHEN p.next_follow_up_date < CURRENT_DATE THEN (CURRENT_DATE - p.next_follow_up_date)::integer
    ELSE 0
  END AS days_overdue,
  CASE
    WHEN p.opportunity_status = 'New' THEN 'New Prospect'
    WHEN p.opportunity_status = 'Shared' THEN 'Shared Opportunity'
    WHEN p.opportunity_status = 'Interested' THEN 'Interested - Needs Follow-Up'
    ELSE 'Prospect Follow-Up'
  END AS follow_up_reason,
  LEFT(p.notes, 60) AS note_preview,
  NULL AS activity_status,
  NULL::integer AS days_since_last_order,
  NULL AS relationship_status,
  false AS is_vip,
  NULL AS vip_display
FROM public.prospects p
WHERE p.next_follow_up_date IS NOT NULL
  AND p.next_follow_up_date <= CURRENT_DATE

ORDER BY
  overdue_status ASC,
  days_overdue DESC,
  next_follow_up_date ASC;
