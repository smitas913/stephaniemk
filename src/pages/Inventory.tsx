import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchProducts, createProduct, updateProduct, deleteProduct } from "@/lib/queries";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Search, AlertTriangle, Package } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const LOW_STOCK_THRESHOLD = 5;

export default function Inventory() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", current_stock: "", price: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", current_stock: "", price: "" });

  const { data: products = [], isLoading } = useQuery({ queryKey: ["products"], queryFn: fetchProducts });

  const addMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setForm({ name: "", current_stock: "", price: "" });
      toast.success("Product added!");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; current_stock: number; price: number }) => updateProduct(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setEditingId(null);
      toast.success("Product updated!");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product deleted");
    },
  });

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const lowStockCount = products.filter((p) => p.current_stock < LOW_STOCK_THRESHOLD).length;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Inventory</h2>
            <p className="text-sm text-muted-foreground">{products.length} products</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" />Add</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Product</DialogTitle></DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addMutation.mutate({
                    name: form.name,
                    current_stock: parseInt(form.current_stock) || 0,
                    price: parseFloat(form.price) || 0,
                  });
                }}
                className="space-y-4"
              >
                <Input placeholder="Product Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="h-11 text-base" />
                <Input placeholder="Stock Quantity" type="number" value={form.current_stock} onChange={(e) => setForm({ ...form, current_stock: e.target.value })} className="h-11 text-base" inputMode="numeric" min={0} />
                <Input placeholder="Price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="h-11 text-base" inputMode="decimal" min={0} step={0.01} />
                <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={addMutation.isPending}>
                  {addMutation.isPending ? "Adding..." : "Add Product"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Low stock alert */}
        {lowStockCount > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <p className="text-sm font-medium text-destructive">
              {lowStockCount} product{lowStockCount > 1 ? "s" : ""} low on stock (below {LOW_STOCK_THRESHOLD} units)
            </p>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-11 text-base" />
        </div>

        {/* List */}
        {isLoading ? (
          <p className="text-muted-foreground text-center py-12">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No products found.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {filtered.map((p) => {
              const isLow = p.current_stock < LOW_STOCK_THRESHOLD;
              const isEditing = editingId === p.id;

              if (isEditing) {
                return (
                  <Card key={p.id} className="border-primary/30 shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="h-10 text-base font-medium" />
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-[10px] uppercase text-muted-foreground">Stock</label>
                          <Input type="number" value={editForm.current_stock} onChange={(e) => setEditForm({ ...editForm, current_stock: e.target.value })} className="h-10" inputMode="numeric" min={0} />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] uppercase text-muted-foreground">Price</label>
                          <Input type="number" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} className="h-10" inputMode="decimal" step={0.01} min={0} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => updateMutation.mutate({
                            id: p.id,
                            name: editForm.name,
                            current_stock: parseInt(editForm.current_stock) || 0,
                            price: parseFloat(editForm.price) || 0,
                          })}
                          disabled={updateMutation.isPending}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              }

              return (
                <Card
                  key={p.id}
                  className={cn(
                    "border-border/50 shadow-sm cursor-pointer hover:shadow-md active:scale-[0.99] transition-all",
                    isLow && "border-destructive/30 bg-destructive/5"
                  )}
                  onClick={() => {
                    setEditingId(p.id);
                    setEditForm({ name: p.name, current_stock: p.current_stock.toString(), price: p.price.toString() });
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {isLow && <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />}
                          <p className="font-semibold text-foreground truncate">{p.name}</p>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">${Number(p.price).toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className={cn("text-lg font-bold", isLow ? "text-destructive" : "text-foreground")}>
                            {p.current_stock}
                          </p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">in stock</p>
                          {isLow && (
                            <span className="text-[10px] font-semibold text-destructive uppercase">Low Stock</span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(p.id); }}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
