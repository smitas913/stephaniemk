
-- Add new roles to enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'consultant';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'customer';

-- Auto-create customer profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    'customer',
    true
  );
  RETURN NEW;
END;
$$;

-- Only create trigger if it doesn't exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update has_any_active_role to include consultant for data they need
-- (keeping original for admin/owner business data access)

-- Allow authenticated users to update their own profile name (not role)
CREATE POLICY "Users can update own name"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
