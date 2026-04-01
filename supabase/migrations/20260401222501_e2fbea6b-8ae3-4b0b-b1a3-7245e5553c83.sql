
-- Products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  current_stock INTEGER NOT NULL DEFAULT 0,
  price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to products" ON public.products FOR ALL USING (true) WITH CHECK (true);

-- Function to deduct stock when order_items are inserted
CREATE OR REPLACE FUNCTION public.deduct_stock_on_order_item()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.products
  SET current_stock = current_stock - NEW.quantity
  WHERE name = NEW.product_name;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER deduct_stock_trigger
AFTER INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.deduct_stock_on_order_item();

-- Restore stock when order_items are deleted
CREATE OR REPLACE FUNCTION public.restore_stock_on_order_item_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.products
  SET current_stock = current_stock + OLD.quantity
  WHERE name = OLD.product_name;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER restore_stock_trigger
AFTER DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.restore_stock_on_order_item_delete();
