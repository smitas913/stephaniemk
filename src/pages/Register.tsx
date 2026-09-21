import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchExpenses,
  fetchIncome,
  fetchOrders,
  createIncome,
  updateIncome,
  deleteIncome,
} from "@/lib/queries";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/types";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, Download, Image as ImageIcon, Pencil, Trash2, ExternalLink } from "lucide-react";
import { formatDateOnly, toLocalDateKey, getLocalToday } from "@/lib/dateOnly";
import { fetchFinancialSettings } from "@/lib/financialSettings";

export const ORDER_SALES_CATEGORY = "Product Sales (Orders)";
export const MYSHOP_SALES_CATEGORY = "Product Sales (MyShop)";
export const MYSHOP_COST_CATEGORY = "MyShop Product Cost";
export const ORDER_FEES_CATEGORY = "Payment Processing Fees";
export const CDS_SHIPPING_CATEGORY = "Shipping / Postage";
const FEES_TOGGLE_KEY = "register_include_order_fees";
const CDS_TOGGLE_KEY = "register_include_cds_shipping";

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (nums: number[]) => round2(nums.reduce((s, n) => s + (Number(n) || 0), 0));
const money = (n: number) => `$${round2(n).toFixed(2)}`;

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type RowSource = "Manual" | "Statement" | "Order" | "Receipt scan";

type LedgerRow = {
  id: string;
  date: string;
  description: string;
  category: string;
  moneyIn: number;
  moneyOut: number;
  source: RowSource;
  kind: "expense" | "income" | "order" | "fee" | "myshopCost" | "cds";
  notes: string;
  hasReceipt: boolean;
  needsReceipt: boolean;
  link: string | null;
  raw?: any;
};

type PeriodKey = "month" | "quarter" | "year" | "lastYear" | "custom";

const lastDayOfMonth = (year: number, monthIndex: number) => {
  const d = new Date(year, monthIndex + 1, 0);
  return toLocalDateKey(d);
};

const readFeesToggle = () => {
  try {
    return localStorage.getItem(FEES_TOGGLE_KEY) !== "off";
  } catch {
    return true;
  }
};

const writeFeesToggle = (on: boolean) => {
  try {
    localStorage.setItem(FEES_TOGGLE_KEY, on ? "on" : "off");
  } catch { /* ignore */ }
};

const readCdsToggle = () => {
  try {
    return localStorage.getItem(CDS_TOGGLE_KEY) !== "off";
  } catch {
    return true;
  }
};

const writeCdsToggle = (on: boolean) => {
  try {
    localStorage.setItem(CDS_TOGGLE_KEY, on ? "on" : "off");
  } catch { /* ignore */ }
};

/** Cost Mary Kay keeps on a MyShop order (my payout is the rest). */
export const myShopOrderCost = (order: any, profitMarginRate: number): number => {
  if (order.wholesale_amount != null) return round2(order.wholesale_amount);
  const net = round2(Number(order.retail_amount || 0) - Number(order.discount_amount || 0));
  return round2(net * (1 - (Number(profitMarginRate) || 0) / 100));
};

/** One aggregated { month: total } map of MyShop product cost. */
export const myShopMonthlyCost = (orders: any[], profitMarginRate: number): Map<string, number> => {
  const byMonth = new Map<string, number>();
  for (const o of orders) {
    const cost = myShopOrderCost(o, profitMarginRate);
    if (!cost) continue;
    const ym = String(o.order_date).slice(0, 7);
    byMonth.set(ym, round2((byMonth.get(ym) || 0) + cost));
  }
  return byMonth;
};

export default function Register() {
  const queryClient = useQueryClient();
  const { data: expenses = [], isLoading: loadingExpenses } = useQuery({ queryKey: ["expenses"], queryFn: fetchExpenses });
  const { data: income = [], isLoading: loadingIncome } = useQuery({ queryKey: ["income"], queryFn: fetchIncome });
  const { data: orders = [], isLoading: loadingOrders } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: financialSettings } = useQuery({ queryKey: ["financial-settings"], queryFn: fetchFinancialSettings });
  const profitMarginRate = financialSettings?.profit_margin_rate ?? 50;

  const isLoading = loadingExpenses || loadingIncome || loadingOrders;

  const today = getLocalToday();
  const thisYear = today.getFullYear();

  const [period, setPeriod] = useState<PeriodKey>("year");
  const [customStart, setCustomStart] = useState(`${thisYear}-01-01`);
  const [customEnd, setCustomEnd] = useState(toLocalDateKey(today));
  const [typeFilter, setTypeFilter] = useState<"all" | "in" | "out">("all");
  const [catFilter, setCatFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [missingReceiptsOnly, setMissingReceiptsOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [includeFees, setIncludeFees] = useState(readFeesToggle);
  const [includeCds, setIncludeCds] = useState(readCdsToggle);

  // Income form
  const [showIncomeDialog, setShowIncomeDialog] = useState(false);
  const [editingIncome, setEditingIncome] = useState<any | null>(null);
  const [incDate, setIncDate] = useState(toLocalDateKey(today));
  const [incAmount, setIncAmount] = useState("");
  const [incCategory, setIncCategory] = useState<string>("Commission");
  const [incSource, setIncSource] = useState("");
  const [incNotes, setIncNotes] = useState("");

  const range = useMemo(() => {
    const y = thisYear;
    const m = today.getMonth();
    if (period === "month") return { start: `${y}-${String(m + 1).padStart(2, "0")}-01`, end: lastDayOfMonth(y, m) };
    if (period === "quarter") {
      const qStart = Math.floor(m / 3) * 3;
      return { start: `${y}-${String(qStart + 1).padStart(2, "0")}-01`, end: lastDayOfMonth(y, qStart + 2) };
    }
    if (period === "year") return { start: `${y}-01-01`, end: `${y}-12-31` };
    if (period === "lastYear") return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` };
    const start = customStart || `${y}-01-01`;
    const end = customEnd || `${y}-12-31`;
    return start <= end ? { start, end } : { start: end, end: start };
  }, [period, customStart, customEnd, thisYear, today]);

  const isFullYear = useMemo(() => {
    const sy = range.start.slice(0, 4);
    return range.start === `${sy}-01-01` && range.end === `${sy}-12-31`;
  }, [range]);

  const selectedYear = Number(range.start.slice(0, 4));

  // ---- Build the combined ledger ----

  const allRows = useMemo<LedgerRow[]>(() => {
    const rows: LedgerRow[] = [];

    for (const e of expenses as any[]) {
      const src: RowSource = e.source === "statement" ? "Statement" : e.source === "receipt_scan" ? "Receipt scan" : "Manual";
      const needs = !e.receipt_url && !e.receipt_not_required && e.category !== "Personal Use";
      rows.push({
        id: `exp-${e.id}`,
        date: String(e.expense_date || "").slice(0, 10),
        description: e.notes || e.category,
        category: e.category,
        moneyIn: 0,
        moneyOut: round2(e.amount),
        source: src,
        kind: "expense",
        notes: e.notes || "",
        hasReceipt: !!e.receipt_url,
        needsReceipt: needs,
        link: "/expenses",
        raw: e,
      });
    }

    for (const i of income as any[]) {
      rows.push({
        id: `inc-${i.id}`,
        date: String(i.income_date || "").slice(0, 10),
        description: i.source || i.notes || i.category,
        category: i.category,
        moneyIn: round2(i.amount),
        moneyOut: 0,
        source: i.entry_source === "statement" ? "Statement" : "Manual",
        kind: "income",
        notes: i.notes || "",
        hasReceipt: false,
        needsReceipt: false,
        link: null,
        raw: i,
      });
    }

    // All paid orders count as retail sales. MyShop orders are retail too —
    // Mary Kay ships them and deposits the profit — so they get their own
    // sales line plus a monthly product-cost line below.
    const qualifying = (orders as any[]).filter((o) => o.payment_status === "Paid" && o.order_date);
    const isMyShop = (o: any) => o.payment_type === "MyShop" || !!o.is_myshop_order;
    const myShopOrders = qualifying.filter(isMyShop);

    for (const o of qualifying) {
      const net = round2(Number(o.retail_amount || 0) - Number(o.discount_amount || 0));
      rows.push({
        id: `ord-${o.id}`,
        date: String(o.order_date).slice(0, 10),
        description: o.customers?.full_name || o.customer_name || "Order",
        category: isMyShop(o) ? MYSHOP_SALES_CATEGORY : ORDER_SALES_CATEGORY,
        moneyIn: net,
        moneyOut: 0,
        source: "Order",
        kind: "order",
        notes: o.notes || "",
        hasReceipt: false,
        needsReceipt: false,
        link: `/orders/${o.id}/edit`,
        raw: o,
      });
    }

    if (includeFees) {
      const byMonth = new Map<string, number>();
      for (const o of qualifying) {
        const fee = Number(o.cc_fee_amount || 0);
        if (!fee) continue;
        const ym = String(o.order_date).slice(0, 7);
        byMonth.set(ym, (byMonth.get(ym) || 0) + fee);
      }
      for (const [ym, total] of byMonth.entries()) {
        const y = Number(ym.slice(0, 4));
        const mIdx = Number(ym.slice(5, 7)) - 1;
        rows.push({
          id: `fee-${ym}`,
          date: lastDayOfMonth(y, mIdx),
          description: `Payment processing fees (Orders) — ${MONTH_NAMES[mIdx]} ${y}`,
          category: ORDER_FEES_CATEGORY,
          moneyIn: 0,
          moneyOut: round2(total),
          source: "Order",
          kind: "fee",
          notes: "",
          hasReceipt: false,
          needsReceipt: false,
          link: null,
        });
      }
    }

    // MyShop product cost — always on, otherwise profit would be overstated.
    for (const [ym, total] of myShopMonthlyCost(myShopOrders, profitMarginRate).entries()) {
      const y = Number(ym.slice(0, 4));
      const mIdx = Number(ym.slice(5, 7)) - 1;
      rows.push({
        id: `mysc-${ym}`,
        date: lastDayOfMonth(y, mIdx),
        description: `MyShop product cost (Orders) — ${MONTH_NAMES[mIdx]} ${y}`,
        category: MYSHOP_COST_CATEGORY,
        moneyIn: 0,
        moneyOut: round2(total),
        source: "Order",
        kind: "myshopCost",
        notes: "",
        hasReceipt: false,
        needsReceipt: false,
        link: null,
      });
    }

    if (includeCds) {
      const byMonth = new Map<string, number>();
      for (const o of orders as any[]) {
        if (!o.is_cds || !o.order_date) continue;
        const cost = round2(o.cds_shipping_cost);
        if (cost <= 0) continue;
        const ym = String(o.order_date).slice(0, 7);
        byMonth.set(ym, round2((byMonth.get(ym) || 0) + cost));
      }
      for (const [ym, total] of byMonth.entries()) {
        const y = Number(ym.slice(0, 4));
        const mIdx = Number(ym.slice(5, 7)) - 1;
        rows.push({
          id: `cds-${ym}`,
          date: lastDayOfMonth(y, mIdx),
          description: `CDS shipping (Orders) — ${MONTH_NAMES[mIdx]} ${y}`,
          category: CDS_SHIPPING_CATEGORY,
          moneyIn: 0,
          moneyOut: round2(total),
          source: "Order",
          kind: "cds",
          notes: "",
          hasReceipt: false,
          needsReceipt: false,
          link: null,
        });
      }
    }

    return rows.filter((r) => r.date).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [expenses, income, orders, includeFees, includeCds, profitMarginRate]);

  const periodRows = useMemo(
    () => allRows.filter((r) => r.date >= range.start && r.date <= range.end),
    [allRows, range],
  );

  const categoryOptions = useMemo(() => {
    const set = new Set<string>(periodRows.map((r) => r.category).filter(Boolean));
    return Array.from(set).sort();
  }, [periodRows]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return periodRows.filter((r) => {
      if (typeFilter === "in" && r.moneyIn <= 0) return false;
      if (typeFilter === "out" && r.moneyOut <= 0) return false;
      if (catFilter !== "all" && r.category !== catFilter) return false;
      if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
      if (missingReceiptsOnly && !r.needsReceipt) return false;
      if (q && !(`${r.description} ${r.notes}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [periodRows, typeFilter, catFilter, sourceFilter, missingReceiptsOnly, search]);

  // ---- Totals (business totals exclude Personal Use) ----

  const totals = useMemo(() => {
    const business = periodRows.filter((r) => r.category !== "Personal Use");
    const totalIn = sum(business.map((r) => r.moneyIn));
    const totalOut = sum(business.map((r) => r.moneyOut));
    const personal = sum(periodRows.filter((r) => r.category === "Personal Use").map((r) => r.moneyOut));
    const needReceipts = periodRows.filter((r) => r.needsReceipt).length;
    return { totalIn, totalOut, net: round2(totalIn - totalOut), personal, needReceipts };
  }, [periodRows]);

  // ---- Month-by-month for the selected year ----

  const monthly = useMemo(() => {
    const yearRows = allRows.filter((r) => r.date.slice(0, 4) === String(selectedYear) && r.category !== "Personal Use");
    return MONTH_NAMES.map((name, idx) => {
      const mm = String(idx + 1).padStart(2, "0");
      const rows = yearRows.filter((r) => r.date.slice(5, 7) === mm);
      const incomeTotal = sum(rows.map((r) => r.moneyIn));
      const expenseTotal = sum(rows.map((r) => r.moneyOut));
      return { name, income: incomeTotal, expenses: expenseTotal, net: round2(incomeTotal - expenseTotal) };
    });
  }, [allRows, selectedYear]);

  const monthlyTotals = useMemo(() => {
    const incomeTotal = sum(monthly.map((m) => m.income));
    const expenseTotal = sum(monthly.map((m) => m.expenses));
    return { income: incomeTotal, expenses: expenseTotal, net: round2(incomeTotal - expenseTotal) };
  }, [monthly]);

  // ---- Profit & Loss ----

  const quarterOf = (date: string) => Math.floor((Number(date.slice(5, 7)) - 1) / 3);

  const pnl = useMemo(() => {
    const business = periodRows.filter((r) => r.category !== "Personal Use");
    const buckets = (rows: LedgerRow[], pick: (r: LedgerRow) => number) => {
      const cols = [0, 0, 0, 0];
      let total = 0;
      for (const r of rows) {
        const v = pick(r);
        if (!v) continue;
        cols[quarterOf(r.date)] += v;
        total += v;
      }
      return { cols: cols.map(round2), total: round2(total) };
    };

    const incomeLines: { label: string; cols: number[]; total: number }[] = [];
    const orderLine = buckets(business.filter((r) => r.category === ORDER_SALES_CATEGORY), (r) => r.moneyIn);
    if (orderLine.total !== 0) incomeLines.push({ label: ORDER_SALES_CATEGORY, ...orderLine });
    const myShopLine = buckets(business.filter((r) => r.category === MYSHOP_SALES_CATEGORY), (r) => r.moneyIn);
    if (myShopLine.total !== 0) incomeLines.push({ label: MYSHOP_SALES_CATEGORY, ...myShopLine });

    for (const c of INCOME_CATEGORIES) {
      const line = buckets(business.filter((r) => r.kind === "income" && r.category === c), (r) => r.moneyIn);
      if (line.total !== 0) incomeLines.push({ label: c, ...line });
    }

    const expenseLines: { label: string; cols: number[]; total: number }[] = [];
    for (const c of EXPENSE_CATEGORIES) {
      if (c === "Personal Use") continue;
      const line = buckets(
        business.filter((r) => (r.kind === "expense" || r.kind === "cds") && r.category === c),
        (r) => r.moneyOut,
      );
      if (line.total !== 0) expenseLines.push({ label: c, ...line });
    }
    const myShopCostLine = buckets(business.filter((r) => r.kind === "myshopCost"), (r) => r.moneyOut);
    if (myShopCostLine.total !== 0) expenseLines.push({ label: `${MYSHOP_COST_CATEGORY} (Orders)`, ...myShopCostLine });
    const feeLine = buckets(business.filter((r) => r.kind === "fee"), (r) => r.moneyOut);
    if (feeLine.total !== 0) expenseLines.push({ label: `${ORDER_FEES_CATEGORY} (Orders)`, ...feeLine });

    const totalIncome = buckets(business, (r) => r.moneyIn);
    const totalExpenses = buckets(business, (r) => r.moneyOut);
    const netCols = totalIncome.cols.map((v, i) => round2(v - totalExpenses.cols[i]));

    return {
      incomeLines,
      expenseLines,
      totalIncome,
      totalExpenses,
      net: { cols: netCols, total: round2(totalIncome.total - totalExpenses.total) },
    };
  }, [periodRows]);

  // ---- Income add / edit ----

  const resetIncomeForm = () => {
    setEditingIncome(null);
    setIncDate(toLocalDateKey(today));
    setIncAmount("");
    setIncCategory("Commission");
    setIncSource("");
    setIncNotes("");
  };

  const openEditIncome = (row: any) => {
    setEditingIncome(row);
    setIncDate(String(row.income_date || "").slice(0, 10));
    setIncAmount(String(row.amount ?? ""));
    setIncCategory(row.category || "Commission");
    setIncSource(row.source || "");
    setIncNotes(row.notes || "");
    setShowIncomeDialog(true);
  };

  const saveIncomeMut = useMutation({
    mutationFn: async () => {
      const payload = {
        income_date: incDate,
        amount: round2(parseFloat(incAmount) || 0),
        category: incCategory,
        source: incSource || null,
        notes: incNotes || null,
      };
      if (editingIncome) await updateIncome(editingIncome.id, payload);
      else await createIncome(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["income"] });
      setShowIncomeDialog(false);
      resetIncomeForm();
      toast.success(editingIncome ? "Income updated" : "Income added");
    },
    onError: (e: any) => toast.error(e?.message || "Could not save that income"),
  });

  const deleteIncomeMut = useMutation({
    mutationFn: deleteIncome,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["income"] });
      toast.success("Income deleted");
    },
    onError: (e: any) => toast.error(e?.message || "Could not delete that income"),
  });

  // ---- Export ----

  const exportWorkbook = async () => {
    const registerSheet = visibleRows.map((r) => ({
      Date: r.date,
      Description: r.description,
      Category: r.category,
      "Money In": r.moneyIn || "",
      "Money Out": r.moneyOut || "",
      "Has Receipt": r.kind === "expense" ? (r.hasReceipt ? "Yes" : "No") : "",
      Source: r.source,
    }));

    const colLabels = isFullYear ? ["Q1", "Q2", "Q3", "Q4", "Total"] : ["Total"];
    const pnlRow = (label: string, line: { cols: number[]; total: number }) => {
      const row: Record<string, any> = { Line: label };
      if (isFullYear) line.cols.forEach((v, i) => { row[colLabels[i]] = v; });
      row.Total = line.total;
      return row;
    };
    const pnlSheet: Record<string, any>[] = [
      { Line: "INCOME" },
      ...pnl.incomeLines.map((l) => pnlRow(l.label, l)),
      pnlRow("Total Income", pnl.totalIncome),
      { Line: "" },
      { Line: "EXPENSES" },
      ...pnl.expenseLines.map((l) => pnlRow(l.label, l)),
      pnlRow("Total Expenses", pnl.totalExpenses),
      { Line: "" },
      pnlRow("Net Profit", pnl.net),
    ];

    const monthlySheet = [
      ...monthly.map((m) => ({ Month: m.name, Income: m.income, Expenses: m.expenses, Net: m.net })),
      { Month: `${selectedYear} Total`, Income: monthlyTotals.income, Expenses: monthlyTotals.expenses, Net: monthlyTotals.net },
    ];

    const fileBase = `MK-Register-${isFullYear ? selectedYear : `${range.start}_${range.end}`}`;

    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(registerSheet), "Register");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pnlSheet), "Profit & Loss");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlySheet), "Monthly");
      XLSX.writeFile(wb, `${fileBase}.xlsx`);
      toast.success("Workbook downloaded");
    } catch {
      const toCsv = (rows: Record<string, any>[]) => {
        if (rows.length === 0) return "";
        const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
        const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
      };
      const download = (name: string, csv: string) => {
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
      };
      download(`${fileBase}-Register.csv`, toCsv(registerSheet));
      download(`${fileBase}-Profit-and-Loss.csv`, toCsv(pnlSheet));
      download(`${fileBase}-Monthly.csv`, toCsv(monthlySheet));
      toast.success("CSV files downloaded");
    }
  };

  const periodLabel = `${formatDateOnly(range.start)} – ${formatDateOnly(range.end)}`;

  return (
    <Layout>
      <div className="space-y-5 pb-10">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Register</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{periodLabel}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={() => { resetIncomeForm(); setShowIncomeDialog(true); }}>
              <Plus className="w-4 h-4 mr-1" />Add Income
            </Button>
            <Button size="sm" variant="outline" onClick={() => void exportWorkbook()}>
              <Download className="w-4 h-4 mr-1" />Export
            </Button>
          </div>
        </div>

        {/* Period + filters */}
        <Card className="border-border/50">
          <CardContent className="p-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
                <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">This month</SelectItem>
                  <SelectItem value="quarter">This quarter</SelectItem>
                  <SelectItem value="year">This year</SelectItem>
                  <SelectItem value="lastYear">Last year</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
              {period === "custom" && (
                <>
                  <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-8 w-[145px] text-xs" />
                  <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-8 w-[145px] text-xs" />
                </>
              )}
              <div className="flex items-center gap-4 ml-auto flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Include order fees</span>
                  <Switch
                    checked={includeFees}
                    onCheckedChange={(v) => { setIncludeFees(v); writeFeesToggle(v); }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Include CDS shipping</span>
                  <Switch
                    checked={includeCds}
                    onCheckedChange={(v) => { setIncludeCds(v); writeCdsToggle(v); }}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(["all", "in", "out"] as const).map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={typeFilter === t ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setTypeFilter(t)}
                >
                  {t === "all" ? "All" : t === "in" ? "Income" : "Expenses"}
                </Button>
              ))}
              <Button
                size="sm"
                variant={missingReceiptsOnly ? "default" : "outline"}
                className={cn("h-7 text-xs", !missingReceiptsOnly && "border-amber-300 text-amber-700")}
                onClick={() => setMissingReceiptsOnly((v) => !v)}
              >
                Missing receipts ({totals.needReceipts})
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Select value={catFilter} onValueChange={setCatFilter}>
                <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="All categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="All sources" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="Manual">Manual</SelectItem>
                  <SelectItem value="Statement">Statement</SelectItem>
                  <SelectItem value="Order">Order</SelectItem>
                  <SelectItem value="Receipt scan">Receipt scan</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Search description or notes"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs flex-1 min-w-[160px]"
              />
            </div>
          </CardContent>
        </Card>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[
            { label: "Total Income", value: money(totals.totalIn), tone: "text-emerald-600" },
            { label: "Total Expenses", value: money(totals.totalOut), tone: "text-rose-600" },
            { label: "Net", value: money(totals.net), tone: totals.net >= 0 ? "text-emerald-600" : "text-rose-600" },
            { label: "Need receipts", value: String(totals.needReceipts), tone: totals.needReceipts > 0 ? "text-amber-600" : "text-muted-foreground" },
          ].map((c) => (
            <Card key={c.label} className="border-border/50">
              <CardContent className="p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
                <p className={cn("text-lg font-bold", c.tone)}>{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        {totals.personal > 0 && (
          <p className="text-xs text-muted-foreground">
            Business totals leave out {money(totals.personal)} of Personal Use spending.
          </p>
        )}

        <Tabs defaultValue="register">
          <TabsList>
            <TabsTrigger value="register">Register</TabsTrigger>
            <TabsTrigger value="pnl">Profit &amp; Loss</TabsTrigger>
          </TabsList>

          {/* ---------------- Register tab ---------------- */}
          <TabsContent value="register" className="space-y-4 mt-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : visibleRows.length === 0 ? (
              <p className="text-center text-muted-foreground py-12 text-sm">Nothing recorded for this period yet.</p>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block rounded-md border border-border/60 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="p-2 font-medium">Date</th>
                        <th className="p-2 font-medium">Description</th>
                        <th className="p-2 font-medium">Category</th>
                        <th className="p-2 font-medium text-right">Money In</th>
                        <th className="p-2 font-medium text-right">Money Out</th>
                        <th className="p-2 font-medium">Receipt</th>
                        <th className="p-2 font-medium">Source</th>
                        <th className="p-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((r) => (
                        <tr key={r.id} className="border-t border-border/50">
                          <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">{formatDateOnly(r.date)}</td>
                          <td className="p-2">
                            <span className="break-words">{r.description}</span>
                          </td>
                          <td className="p-2 text-xs text-muted-foreground">{r.category}</td>
                          <td className="p-2 text-right text-emerald-600">{r.moneyIn ? money(r.moneyIn) : ""}</td>
                          <td className="p-2 text-right text-rose-600">{r.moneyOut ? money(r.moneyOut) : ""}</td>
                          <td className="p-2">
                            {r.kind === "expense" && (r.hasReceipt ? (
                              <ImageIcon className="w-3.5 h-3.5 text-primary" />
                            ) : r.needsReceipt ? (
                              <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-700">Needs</Badge>
                            ) : null)}
                          </td>
                          <td className="p-2">
                            <Badge variant="secondary" className="text-[10px]">{r.source}</Badge>
                          </td>
                          <td className="p-2 text-right whitespace-nowrap">
                            {r.kind === "income" ? (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditIncome(r.raw)}>
                                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteIncomeMut.mutate(r.raw.id)}>
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                </Button>
                              </>
                            ) : r.link ? (
                              <Link to={r.link} className="text-xs text-primary inline-flex items-center gap-1">
                                {r.kind === "expense" ? "Expenses" : "Order"}
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-2">
                  {visibleRows.map((r) => (
                    <Card key={r.id} className="border-border/50">
                      <CardContent className="p-3 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium break-words flex-1">{r.description}</p>
                          <p className={cn("text-sm font-semibold whitespace-nowrap", r.moneyIn ? "text-emerald-600" : "text-rose-600")}>
                            {r.moneyIn ? `+${money(r.moneyIn)}` : `-${money(r.moneyOut)}`}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDateOnly(r.date)} · {r.category}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="secondary" className="text-[10px]">{r.source}</Badge>
                          {r.kind === "expense" && r.hasReceipt && <ImageIcon className="w-3.5 h-3.5 text-primary" />}
                          {r.needsReceipt && (
                            <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-700">Needs receipt</Badge>
                          )}
                          {r.kind === "income" && (
                            <>
                              <button className="text-[11px] underline text-muted-foreground" onClick={() => openEditIncome(r.raw)}>Edit</button>
                              <button className="text-[11px] underline text-destructive" onClick={() => deleteIncomeMut.mutate(r.raw.id)}>Delete</button>
                            </>
                          )}
                          {r.kind === "expense" && (
                            <Link to="/expenses" className="text-[11px] underline text-primary">View on Expenses page</Link>
                          )}
                          {r.kind === "order" && r.link && (
                            <Link to={r.link} className="text-[11px] underline text-primary">View order</Link>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {/* Month-by-month */}
            <Card className="border-border/50">
              <CardContent className="p-3">
                <p className="text-sm font-semibold mb-2">{selectedYear} month by month</p>
                <div className="overflow-hidden rounded-md border border-border/60">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr className="text-left">
                        <th className="p-2 font-medium">Month</th>
                        <th className="p-2 font-medium text-right">Income</th>
                        <th className="p-2 font-medium text-right">Expenses</th>
                        <th className="p-2 font-medium text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map((m) => (
                        <tr key={m.name} className="border-t border-border/50">
                          <td className="p-2">{m.name.slice(0, 3)}</td>
                          <td className="p-2 text-right">{m.income ? money(m.income) : "—"}</td>
                          <td className="p-2 text-right">{m.expenses ? money(m.expenses) : "—"}</td>
                          <td className={cn("p-2 text-right font-medium", m.net < 0 ? "text-rose-600" : "")}>
                            {m.income || m.expenses ? money(m.net) : "—"}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-border bg-muted/30 font-semibold">
                        <td className="p-2">Year total</td>
                        <td className="p-2 text-right">{money(monthlyTotals.income)}</td>
                        <td className="p-2 text-right">{money(monthlyTotals.expenses)}</td>
                        <td className={cn("p-2 text-right", monthlyTotals.net < 0 ? "text-rose-600" : "")}>{money(monthlyTotals.net)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- Profit & Loss tab ---------------- */}
          <TabsContent value="pnl" className="mt-3">
            <Card className="border-border/50">
              <CardContent className="p-3">
                <p className="text-sm font-semibold mb-2">Profit &amp; Loss · {periodLabel}</p>
                <div className="overflow-x-auto rounded-md border border-border/60">
                  <table className="w-full text-xs min-w-[420px]">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr className="text-left">
                        <th className="p-2 font-medium">Line</th>
                        {isFullYear && ["Q1", "Q2", "Q3", "Q4"].map((q) => (
                          <th key={q} className="p-2 font-medium text-right">{q}</th>
                        ))}
                        <th className="p-2 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-border/50 bg-muted/20">
                        <td className="p-2 font-semibold" colSpan={isFullYear ? 6 : 2}>Income</td>
                      </tr>
                      {pnl.incomeLines.length === 0 && (
                        <tr className="border-t border-border/50">
                          <td className="p-2 text-muted-foreground" colSpan={isFullYear ? 6 : 2}>No income in this period</td>
                        </tr>
                      )}
                      {pnl.incomeLines.map((l) => (
                        <tr key={`in-${l.label}`} className="border-t border-border/50">
                          <td className="p-2">{l.label}</td>
                          {isFullYear && l.cols.map((v, i) => <td key={i} className="p-2 text-right">{v ? money(v) : "—"}</td>)}
                          <td className="p-2 text-right font-medium">{money(l.total)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-border bg-muted/30 font-semibold">
                        <td className="p-2">Total Income</td>
                        {isFullYear && pnl.totalIncome.cols.map((v, i) => <td key={i} className="p-2 text-right">{money(v)}</td>)}
                        <td className="p-2 text-right">{money(pnl.totalIncome.total)}</td>
                      </tr>

                      <tr className="border-t border-border/50 bg-muted/20">
                        <td className="p-2 font-semibold" colSpan={isFullYear ? 6 : 2}>Expenses</td>
                      </tr>
                      {pnl.expenseLines.length === 0 && (
                        <tr className="border-t border-border/50">
                          <td className="p-2 text-muted-foreground" colSpan={isFullYear ? 6 : 2}>No expenses in this period</td>
                        </tr>
                      )}
                      {pnl.expenseLines.map((l) => (
                        <tr key={`out-${l.label}`} className="border-t border-border/50">
                          <td className="p-2">{l.label}</td>
                          {isFullYear && l.cols.map((v, i) => <td key={i} className="p-2 text-right">{v ? money(v) : "—"}</td>)}
                          <td className="p-2 text-right font-medium">{money(l.total)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-border bg-muted/30 font-semibold">
                        <td className="p-2">Total Expenses</td>
                        {isFullYear && pnl.totalExpenses.cols.map((v, i) => <td key={i} className="p-2 text-right">{money(v)}</td>)}
                        <td className="p-2 text-right">{money(pnl.totalExpenses.total)}</td>
                      </tr>

                      <tr className="border-t-2 border-border font-bold">
                        <td className="p-2">Net Profit</td>
                        {isFullYear && pnl.net.cols.map((v, i) => (
                          <td key={i} className={cn("p-2 text-right", v < 0 && "text-rose-600")}>{money(v)}</td>
                        ))}
                        <td className={cn("p-2 text-right", pnl.net.total < 0 && "text-rose-600")}>{money(pnl.net.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {totals.personal > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Personal Use spending ({money(totals.personal)}) is left out of these totals.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add / edit income */}
        <Dialog open={showIncomeDialog} onOpenChange={(open) => { setShowIncomeDialog(open); if (!open) resetIncomeForm(); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">{editingIncome ? "Edit Income" : "Add Income"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input type="date" value={incDate} onChange={(e) => setIncDate(e.target.value)} />
              <Input type="number" step="0.01" placeholder="Amount *" value={incAmount} onChange={(e) => setIncAmount(e.target.value)} />
              <Select value={incCategory} onValueChange={setIncCategory}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INCOME_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Source (e.g. Mary Kay commission)" value={incSource} onChange={(e) => setIncSource(e.target.value)} />
              <Textarea placeholder="Notes (optional)" value={incNotes} onChange={(e) => setIncNotes(e.target.value)} className="min-h-[60px]" />
              <Button
                className="w-full"
                disabled={!(parseFloat(incAmount) > 0) || saveIncomeMut.isPending}
                onClick={() => saveIncomeMut.mutate()}
              >
                {saveIncomeMut.isPending ? "Saving…" : editingIncome ? "Save Changes" : "Add Income"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
