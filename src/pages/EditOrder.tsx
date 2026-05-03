// EditOrder is now a thin wrapper around AddOrder so that the New Order
// and Edit Order experiences stay 1:1 in layout, formatting, and behavior.
// AddOrder detects edit mode via the :id route param.
import AddOrder from "./AddOrder";

export default function EditOrder() {
  return <AddOrder />;
}
