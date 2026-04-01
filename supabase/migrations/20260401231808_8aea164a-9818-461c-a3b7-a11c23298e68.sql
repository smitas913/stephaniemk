
-- Drop all existing policies on all tables first
DROP POLICY IF EXISTS "Active owner/admin can view order_items" ON public.order_items;
DROP POLICY IF EXISTS "Active owner/admin can insert order_items" ON public.order_items;
DROP POLICY IF EXISTS "Active owner/admin can update order_items" ON public.order_items;
DROP POLICY IF EXISTS "Active owner/admin can delete order_items" ON public.order_items;

DROP POLICY IF EXISTS "Active owner/admin can view payments" ON public.payments;
DROP POLICY IF EXISTS "Active owner/admin can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Active owner/admin can update payments" ON public.payments;
DROP POLICY IF EXISTS "Active owner/admin can delete payments" ON public.payments;

DROP POLICY IF EXISTS "Active owner/admin can view orders" ON public.orders;
DROP POLICY IF EXISTS "Active owner/admin can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Active owner/admin can update orders" ON public.orders;
DROP POLICY IF EXISTS "Active owner/admin can delete orders" ON public.orders;

DROP POLICY IF EXISTS "Active owner/admin can view customers" ON public.customers;
DROP POLICY IF EXISTS "Active owner/admin can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Active owner/admin can update customers" ON public.customers;
DROP POLICY IF EXISTS "Active owner/admin can delete customers" ON public.customers;

DROP POLICY IF EXISTS "Active owner/admin can view products" ON public.products;
DROP POLICY IF EXISTS "Active owner/admin can insert products" ON public.products;
DROP POLICY IF EXISTS "Active owner/admin can update products" ON public.products;
DROP POLICY IF EXISTS "Active owner/admin can delete products" ON public.products;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Owners can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Owners can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Owners can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Owners can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own name" ON public.profiles;

-- Helper function: check if user is owner, admin, or consultant (active)
CREATE OR REPLACE FUNCTION public.is_internal_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND is_active = true AND role IN ('owner', 'admin', 'consultant')
  )
$$;

-- ============================================================
-- PROFILES TABLE POLICIES
-- ============================================================

-- Any authenticated user can read their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Owner/admin can view all profiles
CREATE POLICY "Owner/admin can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (has_any_active_role(auth.uid()));

-- Users can update their own profile (name, phone, consultant request fields)
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Owner/admin can update any profile (role changes, activation, etc.)
CREATE POLICY "Owner/admin can update any profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (has_any_active_role(auth.uid()))
  WITH CHECK (has_any_active_role(auth.uid()));

-- Owner/admin can insert profiles (for manual user creation)
CREATE POLICY "Owner/admin can insert profiles"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (has_any_active_role(auth.uid()));

-- Owner/admin can delete profiles
CREATE POLICY "Owner/admin can delete profiles"
  ON public.profiles FOR DELETE TO authenticated
  USING (has_any_active_role(auth.uid()));

-- ============================================================
-- CUSTOMERS TABLE POLICIES
-- ============================================================

-- Owner/admin full access
CREATE POLICY "Owner/admin can view customers"
  ON public.customers FOR SELECT TO authenticated
  USING (has_any_active_role(auth.uid()));

CREATE POLICY "Owner/admin can insert customers"
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (has_any_active_role(auth.uid()));

CREATE POLICY "Owner/admin can update customers"
  ON public.customers FOR UPDATE TO authenticated
  USING (has_any_active_role(auth.uid()))
  WITH CHECK (has_any_active_role(auth.uid()));

CREATE POLICY "Owner/admin can delete customers"
  ON public.customers FOR DELETE TO authenticated
  USING (has_any_active_role(auth.uid()));

-- Consultants can view customers (read-only for now)
CREATE POLICY "Consultants can view customers"
  ON public.customers FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'consultant'::app_role));

-- ============================================================
-- ORDERS TABLE POLICIES
-- ============================================================

CREATE POLICY "Owner/admin can view orders"
  ON public.orders FOR SELECT TO authenticated
  USING (has_any_active_role(auth.uid()));

CREATE POLICY "Owner/admin can insert orders"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (has_any_active_role(auth.uid()));

CREATE POLICY "Owner/admin can update orders"
  ON public.orders FOR UPDATE TO authenticated
  USING (has_any_active_role(auth.uid()))
  WITH CHECK (has_any_active_role(auth.uid()));

CREATE POLICY "Owner/admin can delete orders"
  ON public.orders FOR DELETE TO authenticated
  USING (has_any_active_role(auth.uid()));

-- Consultants can view orders (read-only for now)
CREATE POLICY "Consultants can view orders"
  ON public.orders FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'consultant'::app_role));

-- ============================================================
-- ORDER_ITEMS TABLE POLICIES
-- ============================================================

CREATE POLICY "Owner/admin can view order_items"
  ON public.order_items FOR SELECT TO authenticated
  USING (has_any_active_role(auth.uid()));

CREATE POLICY "Owner/admin can insert order_items"
  ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (has_any_active_role(auth.uid()));

CREATE POLICY "Owner/admin can update order_items"
  ON public.order_items FOR UPDATE TO authenticated
  USING (has_any_active_role(auth.uid()))
  WITH CHECK (has_any_active_role(auth.uid()));

CREATE POLICY "Owner/admin can delete order_items"
  ON public.order_items FOR DELETE TO authenticated
  USING (has_any_active_role(auth.uid()));

-- Consultants can view order items (read-only)
CREATE POLICY "Consultants can view order_items"
  ON public.order_items FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'consultant'::app_role));

-- ============================================================
-- PAYMENTS TABLE POLICIES
-- ============================================================

CREATE POLICY "Owner/admin can view payments"
  ON public.payments FOR SELECT TO authenticated
  USING (has_any_active_role(auth.uid()));

CREATE POLICY "Owner/admin can insert payments"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (has_any_active_role(auth.uid()));

CREATE POLICY "Owner/admin can update payments"
  ON public.payments FOR UPDATE TO authenticated
  USING (has_any_active_role(auth.uid()))
  WITH CHECK (has_any_active_role(auth.uid()));

CREATE POLICY "Owner/admin can delete payments"
  ON public.payments FOR DELETE TO authenticated
  USING (has_any_active_role(auth.uid()));

-- ============================================================
-- PRODUCTS TABLE POLICIES
-- ============================================================

-- Owner/admin full access
CREATE POLICY "Owner/admin can view products"
  ON public.products FOR SELECT TO authenticated
  USING (has_any_active_role(auth.uid()));

CREATE POLICY "Owner/admin can insert products"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (has_any_active_role(auth.uid()));

CREATE POLICY "Owner/admin can update products"
  ON public.products FOR UPDATE TO authenticated
  USING (has_any_active_role(auth.uid()))
  WITH CHECK (has_any_active_role(auth.uid()));

CREATE POLICY "Owner/admin can delete products"
  ON public.products FOR DELETE TO authenticated
  USING (has_any_active_role(auth.uid()));

-- Consultants can view products (read-only)
CREATE POLICY "Consultants can view products"
  ON public.products FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'consultant'::app_role));
