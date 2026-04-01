import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCustomers, createCustomer, deleteCustomer } from "@/lib/queries";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Phone, Search, ArrowUpDown, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SortMode = "recent" | "value" | "name";

export default function Customers() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });

  const { data: customers = [], isLoading } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });

  const addMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setOpen(false);
      setForm({ name: "", phone: "", email: "", notes: "" });
      toast.success("Customer added!");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Customer deleted");
    },
  });

  const sorted = useMemo(() => {
    const filtered = customers.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search)
    );
    return [...filtered].sort((a, b) => {
      if (sort === "value") return Number(b.total_spent) - Number(a.total_spent);
      if (sort === "recent") {
        const da = a.last_order_date ? new Date(a.last_order_date).getTime() : 0;
        const db = b.last_order_date ? new Date(b.last_order_date).getTime() : 0;
        return db - da;
      }
      return a.name.localeCompare(b.name);
    });
  }, [customers, search, sort]);

  const sortOptions: { key: SortMode; label: string }[] = [
    { key: "recent", label: "Recent" },
    { key: "value", label: "Top Value" },
    { key: "name", label: "A–Z" },
  ];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Customers</h2>
            <p className="text-sm text-muted-foreground">{customers.length} total</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" />Add</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
              <form
                onSubmit={(e) => { e.preventDefault(); addMutation.mutate(form); }}
                className="space-y-4"
              >
                <Input placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="h-11 text-base" />
                <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-11 text-base" type="tel" />
                <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11 text-base" />
                <Textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={addMutation.isPending}>
                  {addMutation.isPending ? "Adding..." : "Add Customer"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11 text-base"
          />
        </div>

        {/* Sort chips */}
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground mr-1" />
          {sortOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSort(opt.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95",
                sort === opt.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <p className="text-muted-foreground text-center py-12">Loading...</p>
        ) : sorted.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No customers found.</p>
        ) : (
          <div className="grid gap-2">
            {sorted.map((c) => (
              <Card
                key={c.id}
                className="border-border/50 shadow-sm cursor-pointer hover:shadow-md active:scale-[0.99] transition-all"
                onClick={() => navigate(`/customers/${c.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate">{c.name}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-sm text-muted-foreground">
                        {c.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 shrink-0" />{c.phone}
                          </span>
                        )}
                        {c.last_order_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 shrink-0" />
                            {new Date(c.last_order_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p className="font-bold text-foreground">${Number(c.total_spent).toFixed(2)}</p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">lifetime</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(c.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
