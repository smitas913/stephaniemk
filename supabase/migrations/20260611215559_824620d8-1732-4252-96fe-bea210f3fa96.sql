
-- Remove duplicate public-role policies on todos (authenticated-role policies remain)
DROP POLICY IF EXISTS "Users can manage their own todos" ON public.todos;
DROP POLICY IF EXISTS "Users manage own todos" ON public.todos;

-- Scope order_items access for consultants via the parent order's owner_user_id.
-- Owners/admins retain full access (intentional in this single-unit CRM).
DROP POLICY IF EXISTS "Consultants can view own order_items" ON public.order_items;
DROP POLICY IF EXISTS "Consultants can insert own order_items" ON public.order_items;
DROP POLICY IF EXISTS "Consultants can update own order_items" ON public.order_items;
DROP POLICY IF EXISTS "Consultants can delete own order_items" ON public.order_items;

CREATE POLICY "Consultants can view own order_items"
ON public.order_items FOR SELECT
TO authenticated
USING (
  has_any_active_role(auth.uid())
  OR (
    has_role(auth.uid(), 'consultant'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.owner_user_id = auth.uid()
    )
  )
);

CREATE POLICY "Consultants can insert own order_items"
ON public.order_items FOR INSERT
TO authenticated
WITH CHECK (
  has_any_active_role(auth.uid())
  OR (
    has_role(auth.uid(), 'consultant'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.owner_user_id = auth.uid()
    )
  )
);

CREATE POLICY "Consultants can update own order_items"
ON public.order_items FOR UPDATE
TO authenticated
USING (
  has_any_active_role(auth.uid())
  OR (
    has_role(auth.uid(), 'consultant'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.owner_user_id = auth.uid()
    )
  )
)
WITH CHECK (
  has_any_active_role(auth.uid())
  OR (
    has_role(auth.uid(), 'consultant'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.owner_user_id = auth.uid()
    )
  )
);

CREATE POLICY "Consultants can delete own order_items"
ON public.order_items FOR DELETE
TO authenticated
USING (
  has_any_active_role(auth.uid())
  OR (
    has_role(auth.uid(), 'consultant'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.owner_user_id = auth.uid()
    )
  )
);
