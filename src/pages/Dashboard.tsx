import { useQuery } from "@tanstack/react-query";
import { fetchCustomers, fetchOrders } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ShoppingBag, DollarSign, TrendingUp } from "lucide-react";
import Layout from "@/components/Layout";

export default function Dashboard() {
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });

  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const unpaidOrders = orders.filter((o) => o.payment_status !== "Paid").length;

  const stats = [
    { label: "Customers", value: customers.length, icon: Users, color: "text-primary" },
    { label: "Orders", value: orders.length, icon: ShoppingBag, color: "text-primary" },
    { label: "Revenue", value: `$${totalRevenue.toFixed(2)}`, icon: DollarSign, color: "text-primary" },
    { label: "Unpaid", value: unpaidOrders, icon: TrendingUp, color: "text-destructive" },
  ];

  const recentOrders = orders.slice(0, 5);

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h2>
          <p className="text-muted-foreground mt-1">Welcome back, Director! ✨</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label} className="border-border/50 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{s.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-foreground">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className="text-muted-foreground text-sm">No orders yet. Start by adding a customer!</p>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-foreground">{(order as any).customers?.name}</p>
                      <p className="text-sm text-muted-foreground">{order.order_date}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-foreground">${Number(order.total_amount).toFixed(2)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        order.payment_status === "Paid" ? "bg-green-100 text-green-700" :
                        order.payment_status === "Partial" ? "bg-yellow-100 text-yellow-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        {order.payment_status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
