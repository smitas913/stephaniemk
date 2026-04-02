-- ============ CUSTOMERS ============
-- Drop broad consultant policy
DROP POLICY IF EXISTS "Consultants can view customers" ON public.customers;

-- Add consultant scoped policy
CREATE POLICY "Consultants can view own customers"
ON public.customers FOR SELECT TO authenticated
USING (
  has_any_active_role(auth.uid())
  OR (has_role(auth.uid(), 'consultant'::app_role) AND owner_user_id = auth.uid())
);

-- Add consultant insert (own data only)
CREATE POLICY "Consultants can insert own customers"
ON public.customers FOR INSERT TO authenticated
WITH CHECK (
  has_any_active_role(auth.uid())
  OR (has_role(auth.uid(), 'consultant'::app_role) AND owner_user_id = auth.uid())
);

-- Add consultant update (own data only)
CREATE POLICY "Consultants can update own customers"
ON public.customers FOR UPDATE TO authenticated
USING (
  has_any_active_role(auth.uid())
  OR (has_role(auth.uid(), 'consultant'::app_role) AND owner_user_id = auth.uid())
)
WITH CHECK (
  has_any_active_role(auth.uid())
  OR (has_role(auth.uid(), 'consultant'::app_role) AND owner_user_id = auth.uid())
);

-- Now drop the old admin-only policies and keep the new combined ones
DROP POLICY IF EXISTS "Owner/admin can view customers" ON public.customers;
DROP POLICY IF EXISTS "Owner/admin can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Owner/admin can update customers" ON public.customers;

-- ============ ORDERS ============
DROP POLICY IF EXISTS "Consultants can view orders" ON public.orders;

CREATE POLICY "Consultants can view own orders"
ON public.orders FOR SELECT TO authenticated
USING (
  has_any_active_role(auth.uid())
  OR (has_role(auth.uid(), 'consultant'::app_role) AND owner_user_id = auth.uid())
);

CREATE POLICY "Consultants can insert own orders"
ON public.orders FOR INSERT TO authenticated
WITH CHECK (
  has_any_active_role(auth.uid())
  OR (has_role(auth.uid(), 'consultant'::app_role) AND owner_user_id = auth.uid())
);

CREATE POLICY "Consultants can update own orders"
ON public.orders FOR UPDATE TO authenticated
USING (
  has_any_active_role(auth.uid())
  OR (has_role(auth.uid(), 'consultant'::app_role) AND owner_user_id = auth.uid())
)
WITH CHECK (
  has_any_active_role(auth.uid())
  OR (has_role(auth.uid(), 'consultant'::app_role) AND owner_user_id = auth.uid())
);

DROP POLICY IF EXISTS "Owner/admin can view orders" ON public.orders;
DROP POLICY IF EXISTS "Owner/admin can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Owner/admin can update orders" ON public.orders;

-- ============ ORDER_ITEMS ============
DROP POLICY IF EXISTS "Consultants can view order_items" ON public.order_items;

-- ============ PRODUCTS ============
DROP POLICY IF EXISTS "Consultants can view products" ON public.products;

-- Allow consultants read-only on products (shared catalog)
CREATE POLICY "Consultants can view products"
ON public.products FOR SELECT TO authenticated
USING (
  has_any_active_role(auth.uid())
  OR has_role(auth.uid(), 'consultant'::app_role)
);

DROP POLICY IF EXISTS "Owner/admin can view products" ON public.products;

-- ============ PAYMENTS ============
-- No consultant access to payments (already correct)