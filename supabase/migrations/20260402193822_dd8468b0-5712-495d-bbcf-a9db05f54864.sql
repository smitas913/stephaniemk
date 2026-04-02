
DROP TRIGGER IF EXISTS trg_update_customer_last_order ON public.orders;
DROP TRIGGER IF EXISTS trg_update_entity_on_note_insert ON public.notes;
DROP TRIGGER IF EXISTS trg_set_updated_at_customers ON public.customers;
DROP TRIGGER IF EXISTS trg_deduct_stock ON public.order_items;
DROP TRIGGER IF EXISTS trg_restore_stock ON public.order_items;

CREATE TRIGGER trg_update_customer_last_order
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_customer_last_order();

CREATE TRIGGER trg_update_entity_on_note_insert
  AFTER INSERT ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_entity_on_note_insert();

CREATE TRIGGER trg_set_updated_at_customers
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_deduct_stock
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.deduct_stock_on_order_item();

CREATE TRIGGER trg_restore_stock
  AFTER DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.restore_stock_on_order_item_delete();
