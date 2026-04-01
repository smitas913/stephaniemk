
-- 1. Create the role enum
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'staff');

-- 2. Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role app_role NOT NULL DEFAULT 'staff',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Security definer functions (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role = _role AND is_active = true
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_active_role(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND is_active = true AND role IN ('owner', 'admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles
  WHERE id = _user_id AND is_active = true
  LIMIT 1
$$;

-- 4. Profiles RLS policies
-- Everyone authenticated can read their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Owners can see all profiles
CREATE POLICY "Owners can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

-- Owners can insert profiles (for inviting users)
CREATE POLICY "Owners can insert profiles"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- Owners can update any profile
CREATE POLICY "Owners can update profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- Owners can delete profiles
CREATE POLICY "Owners can delete profiles"
  ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

-- 5. Update existing table policies to require owner or admin role
-- Customers
DROP POLICY IF EXISTS "Authenticated users can view customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can update customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can delete customers" ON public.customers;

CREATE POLICY "Active owner/admin can view customers"
  ON public.customers FOR SELECT TO authenticated
  USING (public.has_any_active_role(auth.uid()));
CREATE POLICY "Active owner/admin can insert customers"
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (public.has_any_active_role(auth.uid()));
CREATE POLICY "Active owner/admin can update customers"
  ON public.customers FOR UPDATE TO authenticated
  USING (public.has_any_active_role(auth.uid()))
  WITH CHECK (public.has_any_active_role(auth.uid()));
CREATE POLICY "Active owner/admin can delete customers"
  ON public.customers FOR DELETE TO authenticated
  USING (public.has_any_active_role(auth.uid()));

-- Orders
DROP POLICY IF EXISTS "Authenticated users can view orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can delete orders" ON public.orders;

CREATE POLICY "Active owner/admin can view orders"
  ON public.orders FOR SELECT TO authenticated
  USING (public.has_any_active_role(auth.uid()));
CREATE POLICY "Active owner/admin can insert orders"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (public.has_any_active_role(auth.uid()));
CREATE POLICY "Active owner/admin can update orders"
  ON public.orders FOR UPDATE TO authenticated
  USING (public.has_any_active_role(auth.uid()))
  WITH CHECK (public.has_any_active_role(auth.uid()));
CREATE POLICY "Active owner/admin can delete orders"
  ON public.orders FOR DELETE TO authenticated
  USING (public.has_any_active_role(auth.uid()));

-- Order items
DROP POLICY IF EXISTS "Authenticated users can view order_items" ON public.order_items;
DROP POLICY IF EXISTS "Authenticated users can insert order_items" ON public.order_items;
DROP POLICY IF EXISTS "Authenticated users can update order_items" ON public.order_items;
DROP POLICY IF EXISTS "Authenticated users can delete order_items" ON public.order_items;

CREATE POLICY "Active owner/admin can view order_items"
  ON public.order_items FOR SELECT TO authenticated
  USING (public.has_any_active_role(auth.uid()));
CREATE POLICY "Active owner/admin can insert order_items"
  ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (public.has_any_active_role(auth.uid()));
CREATE POLICY "Active owner/admin can update order_items"
  ON public.order_items FOR UPDATE TO authenticated
  USING (public.has_any_active_role(auth.uid()))
  WITH CHECK (public.has_any_active_role(auth.uid()));
CREATE POLICY "Active owner/admin can delete order_items"
  ON public.order_items FOR DELETE TO authenticated
  USING (public.has_any_active_role(auth.uid()));

-- Payments
DROP POLICY IF EXISTS "Authenticated users can view payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated users can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated users can update payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated users can delete payments" ON public.payments;

CREATE POLICY "Active owner/admin can view payments"
  ON public.payments FOR SELECT TO authenticated
  USING (public.has_any_active_role(auth.uid()));
CREATE POLICY "Active owner/admin can insert payments"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (public.has_any_active_role(auth.uid()));
CREATE POLICY "Active owner/admin can update payments"
  ON public.payments FOR UPDATE TO authenticated
  USING (public.has_any_active_role(auth.uid()))
  WITH CHECK (public.has_any_active_role(auth.uid()));
CREATE POLICY "Active owner/admin can delete payments"
  ON public.payments FOR DELETE TO authenticated
  USING (public.has_any_active_role(auth.uid()));

-- Products
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can insert products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can update products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can delete products" ON public.products;

CREATE POLICY "Active owner/admin can view products"
  ON public.products FOR SELECT TO authenticated
  USING (public.has_any_active_role(auth.uid()));
CREATE POLICY "Active owner/admin can insert products"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.has_any_active_role(auth.uid()));
CREATE POLICY "Active owner/admin can update products"
  ON public.products FOR UPDATE TO authenticated
  USING (public.has_any_active_role(auth.uid()))
  WITH CHECK (public.has_any_active_role(auth.uid()));
CREATE POLICY "Active owner/admin can delete products"
  ON public.products FOR DELETE TO authenticated
  USING (public.has_any_active_role(auth.uid()));
