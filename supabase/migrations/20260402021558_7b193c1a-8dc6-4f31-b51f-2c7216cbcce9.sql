-- Create a security definer function to check profile update safety
CREATE OR REPLACE FUNCTION public.check_profile_update_safe(_user_id uuid, _role app_role, _is_active boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND role = _role
      AND is_active = _is_active
  )
$$;

-- Drop existing self-update policy
DROP POLICY IF EXISTS "Users can update own profile safe fields" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Re-create with security definer function
CREATE POLICY "Users can update own profile safe fields"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND public.check_profile_update_safe(auth.uid(), role, is_active)
);