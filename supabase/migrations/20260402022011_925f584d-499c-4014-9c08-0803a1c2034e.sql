-- Add owner_user_id to customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add owner_user_id to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_customers_owner_user_id ON public.customers(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_owner_user_id ON public.orders(owner_user_id);