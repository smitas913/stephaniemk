
-- 1. Restrict policies to authenticated role
DROP POLICY IF EXISTS "Users manage own event referrals" ON public.event_referrals;
CREATE POLICY "Users manage own event referrals"
ON public.event_referrals
FOR ALL
TO authenticated
USING (auth.uid() = owner_user_id)
WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Users manage own hostess coaching tasks" ON public.hostess_coaching_tasks;
CREATE POLICY "Users manage own hostess coaching tasks"
ON public.hostess_coaching_tasks
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2. Harden check_profile_update_safe to compare NEW values against currently stored values,
-- ignoring trust in the passed-in parameters' relationship to the stored row.
CREATE OR REPLACE FUNCTION public.check_profile_update_safe(_user_id uuid, _role app_role, _is_active boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _current_role app_role;
  _current_is_active boolean;
BEGIN
  SELECT role, is_active
    INTO _current_role, _current_is_active
  FROM public.profiles
  WHERE id = _user_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- The NEW row's role and is_active must match the currently stored values.
  -- Users cannot elevate their own role or reactivate themselves through this policy.
  RETURN _role = _current_role AND _is_active = _current_is_active;
END;
$function$;
