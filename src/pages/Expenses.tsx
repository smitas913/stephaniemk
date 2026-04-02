import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchExpenses, createExpense, deleteExpense } from "@/lib/queries";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Plus, Trash2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const CATEGORY_COLORS: Record<string, string> = {
  Inventory: "bg-blue-100 text-blue-700",
  Supplies: "bg-green-100 text-green-700",
  Marketing: "bg-purple-100 text-purple-700",
  Events: "bg-orange-100 text-orange-700",
  Tools: "bg-yellow-100 text-yellow-700",
  Other: "bg-muted text-muted-foreground",
};

export default function Expenses() {
  const queryClient = useQueryClient();
  const { data: expenses = [], isLoading } = useQuery({ queryKey: ["expenses"], queryFn: fetchExpenses });

  const [showAdd, setShowAdd] = useState(false);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [formDate, setFormDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [formAmount, setFormAmount] = useState("");
  const [formCategory, setFormCategory] = useState<string>("Other");
  const [formNotes, setFormNotes] = useState("");

  const filtered = useMemo(() => {
    if (filterCat === "all") return expenses;
    return expenses.filter((e) => e.category === filterCat);
  }, [expenses, filterCat]);

  const totalFiltered = useMemo(() => filtered.reduce((s, e) => s + Number(e.amount), 0), [filtered]);

  const createMut = useMutation({
    mutationFn: () => createExpense({
      expense_date: formDate,
      amount: parseFloat(formAmount) || 0,
      category: formCategory,
      notes: formNotes || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setShowAdd(false);
      setFormAmount("");
      setFormNotes("");
      setFormCategory("Other");
      toast.success("Expense added!");
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense deleted");
    },
  });

  return (
    <Layout>
      <div className="space-y-5 pb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Expenses</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{expenses.length} total · ${totalFiltered.toFixed(2)} shown</p>
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Expense</Button>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-1.5">
          <Button variant={filterCat === "all" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setFilterCat("all")}>
            All
          </Button>
          {EXPENSE_CATEGORIES.map((c) => (
            <Button key={c} variant={filterCat === c ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setFilterCat(c)}>
              {c}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">No expenses found</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((e) => (
              <Card key={e.id} className="border-border/50 shadow-sm">
                <CardContent className="p-3 flex items-center gap-3">
                  <DollarSign className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">${Number(e.amount).toFixed(2)}</p>
                      <Badge variant="secondary" className={cn("text-[10px]", CATEGORY_COLORS[e.category] || "")}>{e.category}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {new Date(e.expense_date).toLocaleDateString()}
                      {e.notes && ` — ${e.notes}`}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => deleteMut.mutate(e.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add Dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">Add Expense</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
              <Input type="number" step="0.01" placeholder="Amount *" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} />
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Textarea placeholder="Notes (optional)" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} className="min-h-[60px]" />
              <Button className="w-full" onClick={() => createMut.mutate()} disabled={!formAmount || createMut.isPending}>
                {createMut.isPending ? "Adding..." : "Add Expense"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
