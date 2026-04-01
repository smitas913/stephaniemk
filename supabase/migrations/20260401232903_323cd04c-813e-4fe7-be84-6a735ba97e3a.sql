
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _account_type text;
  _role app_role;
  _is_active boolean;
  _consultant_status consultant_status;
BEGIN
  _account_type := COALESCE(NEW.raw_user_meta_data ->> 'account_type', 'customer');

  IF _account_type = 'consultant' THEN
    _role := 'consultant';
    _is_active := false;
    _consultant_status := 'pending';
  ELSE
    _role := 'customer';
    _is_active := true;
    _consultant_status := 'none';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, phone, role, is_active, consultant_status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data ->> 'phone',
    _role,
    _is_active,
    _consultant_status
  );
  RETURN NEW;
END;
$$;
