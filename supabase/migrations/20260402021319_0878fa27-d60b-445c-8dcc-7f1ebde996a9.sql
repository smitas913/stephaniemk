-- Drop the overly permissive self-update policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Re-create with restriction: users cannot change their own role or is_active
CREATE POLICY "Users can update own profile safe fields"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  AND is_active = (SELECT p.is_active FROM public.profiles p WHERE p.id = auth.uid())
);