
ALTER VIEW public.customer_summary SET (security_invoker = on);
ALTER VIEW public.event_summary SET (security_invoker = on);
ALTER VIEW public.order_financials SET (security_invoker = on);
ALTER VIEW public.follow_up_queue SET (security_invoker = on);
