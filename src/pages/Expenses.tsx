import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchExpenses,
  createExpense,
  deleteExpense,
  updateExpense,
  uploadReceiptImage,
  getReceiptSignedUrl,
  fetchExpenseMerchantRules,
  upsertExpenseMerchantRules,
  createExpensesBulk,
  parseStatementPdf,
  scanReceiptPhoto,
  normalizeMerchantKey,
  buildImportFingerprint,
  buildIncomeFingerprint,
  createIncomeBulk,
  fetchIncome,
  fetchOrders,
} from "@/lib/queries";
import { EXPENSE_CATEGORIES, EXPENSE_EVENT_TYPES, INCOME_CATEGORIES } from "@/lib/types";
import Layout from "@/components/Layout";
import { usePhotoCapture } from "@/components/CameraCapture";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Plus, Trash2, DollarSign, Upload, Image, X, Pencil, FileUp, Paperclip, Camera, ReceiptText, ImageIcon, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatDateOnly, toLocalDateKey, parseLocalDate } from "@/lib/dateOnly";
import { assignMatches, matchesForReceipt, type MatchKind } from "@/lib/receiptMatching";

const CATEGORY_COLORS: Record<string, string> = {
  Inventory: "bg-blue-100 text-blue-700",
  Supplies: "bg-green-100 text-green-700",
  Marketing: "bg-purple-100 text-purple-700",
  Events: "bg-orange-100 text-orange-700",
  Tools: "bg-yellow-100 text-yellow-700",
  "Admin / Office Help": "bg-pink-100 text-pink-700",
  Accounting: "bg-teal-100 text-teal-700",
  Meals: "bg-amber-100 text-amber-700",
  Travel: "bg-indigo-100 text-indigo-700",
  Networking: "bg-rose-100 text-rose-700",
};

const RECEIPT_ACCEPT = "image/*,application/pdf";
const IMPORT_CATEGORIES = EXPENSE_CATEGORIES.filter((c) => c !== "Personal Use");

type MatchedReceipt = {
  id: string;
  path: string;
  merchant: string;
  date: string;
  amount: number;
  category: string;
};

type ImportRow = {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  category: string;
  checked: boolean;
  remembered: boolean;
  duplicate: boolean;
  merchantKey: string;
  fingerprint: string;
  matchKind: MatchKind | null;
  matchedReceipt: MatchedReceipt | null;
};

type DepositRow = {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  category: string;
  checked: boolean;
  remembered: boolean;
  duplicate: boolean;
  matchesOrder: boolean;
  merchantKey: string;
  fingerprint: string;
};

const STATEMENT_TYPE_KEY = "expenses_statement_type";

const readStatementType = (): "bank" | "credit_card" => {
  try {
    return localStorage.getItem(STATEMENT_TYPE_KEY) === "credit_card" ? "credit_card" : "bank";
  } catch {
    return "bank";
  }
};

const writeStatementType = (v: "bank" | "credit_card") => {
  try {
    localStorage.setItem(STATEMENT_TYPE_KEY, v);
  } catch { /* ignore */ }
};

type ScanReview = {
  file: File;
  previewUrl: string;
  date: string;
  merchant: string;
  amount: string;
  category: string;
  remembered: boolean;
  readable: boolean;
  mode: "attach" | "create";
  targetId: string | null;
  exactMatches: any[];
  nearMatches: any[];
  /** One clear match — show the compact confirm card instead of the full form. */
  fast: boolean;
};

const isPdfReceipt = (path: string) => /\.pdf(\?|$)/i.test(path);

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });

/** Shrinks a phone photo so uploads stay quick on cell data. */
const downscalePhoto = async (file: File, maxSide = 1600, quality = 0.85): Promise<File> => {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) return file;
    return new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
};

const daysApart = (a: string, b: string) =>
  Math.abs(
    Math.round((parseLocalDate(a).getTime() - parseLocalDate(b).getTime()) / 86_400_000),
  );


export default function Expenses() {
  const queryClient = useQueryClient();
  const { data: expenses = [], isLoading } = useQuery({ queryKey: ["expenses"], queryFn: fetchExpenses });
  const { data: merchantRules = [] } = useQuery({ queryKey: ["expense-merchant-rules"], queryFn: fetchExpenseMerchantRules });

  const [showAdd, setShowAdd] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [formDate, setFormDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [formAmount, setFormAmount] = useState("");
  const [formCategory, setFormCategory] = useState<string>("Inventory");
  const [formNotes, setFormNotes] = useState("");
  const [formEventType, setFormEventType] = useState<string>("");
  const [formEventYear, setFormEventYear] = useState<string>("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<{ url: string; isPdf: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Statement import
  const statementInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [depositRows, setDepositRows] = useState<DepositRow[]>([]);
  const [statementType, setStatementType] = useState<"bank" | "credit_card">(readStatementType);
  const [confirmedMatches, setConfirmedMatches] = useState<Record<string, boolean>>({});

  // Attach-receipt-to-existing-expense
  const attachInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [attachTargetId, setAttachTargetId] = useState<string | null>(null);

  // Receipt scan
  const { takePhoto, chooseFromLibrary, cameraOverlay } = usePhotoCapture();
  const [scanning, setScanning] = useState(false);
  const [scanReview, setScanReview] = useState<ScanReview | null>(null);
  const [scanSavedCount, setScanSavedCount] = useState(0);
  const [showScanSaved, setShowScanSaved] = useState(false);
  const [batchAttachCount, setBatchAttachCount] = useState(0);
  // Signed thumbnails for receipts matched to statement lines, keyed by expense id.
  const [receiptThumbs, setReceiptThumbs] = useState<Record<string, string>>({});


  const SHOW_EVENT_FIELDS_FOR = ["Events", "Travel", "Meals"];
  const showEventFields = SHOW_EVENT_FIELDS_FOR.includes(formCategory);
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const needsReceipt = (e: any) =>
    !e.receipt_url && !e.receipt_not_required && e.category !== "Personal Use";

  /** Scanned receipt that hasn't been seen on a statement yet. */
  const awaitingStatement = (e: any) => e.source === "receipt_scan";

  /** Statement charge with its receipt attached — fully reconciled. */
  const isMatched = (e: any) => e.source === "statement" && !!e.receipt_url;

  const needsReceiptCount = useMemo(() => expenses.filter(needsReceipt).length, [expenses]);
  const awaitingStatementCount = useMemo(() => expenses.filter(awaitingStatement).length, [expenses]);

  const filtered = useMemo(() => {
    if (filterCat === "all") return expenses;
    if (filterCat === "__needs_receipt") return expenses.filter(needsReceipt);
    if (filterCat === "__awaiting_statement") return expenses.filter(awaitingStatement);
    return expenses.filter((e) => e.category === filterCat);
  }, [expenses, filterCat]);

  const totalFiltered = useMemo(() => filtered.reduce((s, e) => s + Number(e.amount), 0), [filtered]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    setReceiptPreview(file.type === "application/pdf" ? null : URL.createObjectURL(file));
  };

  const clearReceipt = () => {
    setReceiptFile(null);
    setReceiptPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetForm = () => {
    setFormAmount("");
    setFormNotes("");
    setFormCategory("Section 1 (Wholesale Products)");
    setFormEventType("");
    setFormEventYear("");
    setEditingExpense(null);
    clearReceipt();
  };

  const createMut = useMutation({
    mutationFn: async () => {
      setUploading(true);
      let receipt_url: string | null = null;
      if (receiptFile) {
        receipt_url = await uploadReceiptImage(receiptFile);
      }
      await createExpense({
        expense_date: formDate,
        amount: parseFloat(formAmount) || 0,
        category: formCategory,
        notes: formNotes || null,
        receipt_url,
        event_type: showEventFields && formEventType ? formEventType : null,
        event_year: showEventFields && formEventYear ? parseInt(formEventYear) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setShowAdd(false);
      resetForm();
      toast.success("Expense added!");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
    onSettled: () => setUploading(false),
  });

  const deleteMut = useMutation({
    mutationFn: deleteExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense deleted");
    },
  });

  const editMut = useMutation({
    mutationFn: async () => {
      if (!editingExpense) return;
      let receipt_url: string | null | undefined = undefined;
      if (receiptFile) {
        setUploading(true);
        receipt_url = await uploadReceiptImage(receiptFile);
      }
      await updateExpense(editingExpense.id, {
        amount: Number(formAmount),
        category: formCategory,
        notes: formNotes || null,
        expense_date: formDate,
        ...(receipt_url ? { receipt_url } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setEditingExpense(null);
      setShowAdd(false);
      resetForm();
      toast.success("Expense updated!");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update expense"),
    onSettled: () => setUploading(false),
  });

  const noReceiptNeededMut = useMutation({
    mutationFn: (id: string) => updateExpense(id, { receipt_not_required: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Marked as no receipt needed");
    },
    onError: (e: any) => toast.error(e?.message || "Could not update that expense"),
  });

  const attachMut = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const path = await uploadReceiptImage(file);
      await updateExpense(id, { receipt_url: path });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Receipt attached");
    },
    onError: (e: any) => toast.error(e?.message || "Could not attach that receipt"),
  });

  const openEdit = (expense: any) => {
    setEditingExpense(expense);
    setFormDate(expense.expense_date || format(new Date(), "yyyy-MM-dd"));
    setFormAmount(String(expense.amount || ""));
    setFormCategory(expense.category || "Section 1 (Wholesale Products)");
    setFormNotes(expense.notes || "");
    clearReceipt();
    setShowAdd(true);
  };

  const openReceipt = async (path: string) => {
    try {
      const url = await getReceiptSignedUrl(path);
      setViewingReceipt({ url, isPdf: isPdfReceipt(path) });
    } catch (err: any) {
      toast.error(err.message || "Could not open receipt");
    }
  };

  const loadReceiptThumbs = async (items: { id: string; path: string }[]) => {
    const entries = await Promise.all(
      items.map(async (i) => {
        try {
          return [i.id, await getReceiptSignedUrl(i.path)] as const;
        } catch {
          return null;
        }
      }),
    );
    const found = entries.filter(Boolean) as (readonly [string, string])[];
    if (found.length > 0) setReceiptThumbs((prev) => ({ ...prev, ...Object.fromEntries(found) }));
  };

  // ---- Statement import ----

  const handleStatementSelect = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (statementInputRef.current) statementInputRef.current.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      toast.error("Please pick a PDF statement");
      return;
    }
    setImporting(true);
    try {
      const base64 = await fileToBase64(file);
      const all = await parseStatementPdf(
        base64,
        file.type || "application/pdf",
        [...IMPORT_CATEGORIES],
        statementType,
        [...INCOME_CATEGORIES],
      );
      if (all.length === 0) {
        toast.error("No transactions could be read from that statement. If it's a scan, try a clearer PDF.");
        return;
      }
      const transactions = all.filter((t) => t.direction !== "in");
      const deposits = statementType === "bank" ? all.filter((t) => t.direction === "in") : [];
      const ruleMap = new Map(
        merchantRules.filter((r: any) => (r.kind || "expense") === "expense").map((r) => [r.merchant_key, r.category]),
      );
      const incomeRuleMap = new Map(
        merchantRules.filter((r: any) => r.kind === "income").map((r) => [r.merchant_key, r.category]),
      );
      const existingFingerprints = new Set(
        expenses.map((e: any) => e.import_fingerprint).filter(Boolean) as string[],
      );
      const existingDateAmount = new Set(
        expenses.map((e: any) => `${(e.expense_date || "").slice(0, 10)}|${Number(e.amount).toFixed(2)}`),
      );

      const rows: ImportRow[] = transactions.map((t, i) => {
        const merchantKey = normalizeMerchantKey(t.merchant);
        const fingerprint = buildImportFingerprint(t.date, t.amount, merchantKey);
        const remembered = ruleMap.has(merchantKey);
        const duplicate =
          existingFingerprints.has(fingerprint) ||
          existingDateAmount.has(`${t.date}|${Number(t.amount).toFixed(2)}`);
        let category = remembered ? (ruleMap.get(merchantKey) as string) : t.suggested_category;
        if (!EXPENSE_CATEGORIES.includes(category as any) || category === "Personal Use") category = "Supplies";
        return {
          id: `${i}-${fingerprint}`,
          date: t.date,
          merchant: t.merchant,
          amount: t.amount,
          category,
          checked: !duplicate,
          remembered,
          duplicate,
          merchantKey,
          fingerprint,
          matchKind: null,
          matchedReceipt: null,
        };
      });

      // Link statement charges to receipts she already scanned (direction A).
      const scannedReceipts = (expenses as any[]).filter(
        (e) => e.source === "receipt_scan" && e.receipt_url && e.expense_date && Number(e.amount) > 0,
      );
      if (scannedReceipts.length > 0 && rows.length > 0) {
        const assignments = assignMatches(
          scannedReceipts.map((e) => ({
            id: e.id,
            date: String(e.expense_date).slice(0, 10),
            amount: Number(e.amount),
            merchantKey: normalizeMerchantKey(e.notes || ""),
          })),
          rows.map((r) => ({ id: r.id, date: r.date, amount: r.amount, merchantKey: r.merchantKey })),
        );
        const byCharge = new Map(assignments.map((a) => [a.chargeId, a]));
        for (const row of rows) {
          const a = byCharge.get(row.id);
          if (!a) continue;
          const receipt = scannedReceipts.find((e) => e.id === a.receiptId);
          if (!receipt) continue;
          row.matchKind = a.kind;
          row.matchedReceipt = {
            id: receipt.id,
            path: receipt.receipt_url,
            merchant: receipt.notes || "",
            date: String(receipt.expense_date).slice(0, 10),
            amount: Number(receipt.amount),
            category: receipt.category,
          };
          // The matched line updates the existing expense instead of inserting a new one.
          row.checked = false;
          row.duplicate = false;
          row.category = receipt.category;
        }
        void loadReceiptThumbs(
          rows
            .filter((r) => r.matchedReceipt)
            .map((r) => ({ id: r.matchedReceipt!.id, path: r.matchedReceipt!.path })),
        );
      }
      // Deposits (bank statements only) — always start unchecked
      let depRows: DepositRow[] = [];
      if (deposits.length > 0) {
        const [incomeRows, orderRows] = await Promise.all([fetchIncome(), fetchOrders()]);
        const incomeFingerprints = new Set(
          (incomeRows as any[]).map((i) => i.import_fingerprint).filter(Boolean) as string[],
        );
        const incomeDateAmount = new Set(
          (incomeRows as any[]).map((i) => `${(i.income_date || "").slice(0, 10)}|${Number(i.amount).toFixed(2)}`),
        );
        const paidOrders = (orderRows as any[]).filter((o) => o.payment_status === "Paid" && o.order_date);

        depRows = deposits.map((t, i) => {
          const merchantKey = normalizeMerchantKey(t.merchant);
          const fingerprint = buildIncomeFingerprint(t.date, t.amount, merchantKey);
          const remembered = incomeRuleMap.has(merchantKey);
          const duplicate =
            incomeFingerprints.has(fingerprint) ||
            incomeDateAmount.has(`${t.date}|${Number(t.amount).toFixed(2)}`);
          const matchesOrder = paidOrders.some((o) => {
            if (daysApart(t.date, String(o.order_date).slice(0, 10)) > 7) return false;
            const candidates = [
              Number(o.net_received || 0),
              Number(o.retail_amount || 0) - Number(o.discount_amount || 0),
              Number(o.retail_amount || 0) - Number(o.discount_amount || 0) + Number(o.tax_amount || 0),
            ];
            return candidates.some((c) => Math.abs(c - t.amount) <= 0.01);
          });
          let category = remembered ? (incomeRuleMap.get(merchantKey) as string) : t.suggested_category;
          if (!INCOME_CATEGORIES.includes(category as any)) category = "Product Sales";
          return {
            id: `dep-${i}-${fingerprint}`,
            date: t.date,
            merchant: t.merchant,
            amount: t.amount,
            category,
            checked: false,
            remembered,
            duplicate,
            matchesOrder,
            merchantKey,
            fingerprint,
          };
        });
      }
      setDepositRows(depRows);
      setImportRows(rows);
    } catch (err: any) {
      toast.error(err?.message || "The statement couldn't be read. Please try again.");
    } finally {
      setImporting(false);
    }
  };

  const matchedRows = importRows?.filter((r) => r.matchedReceipt) ?? [];
  const plainRows = importRows?.filter((r) => !r.matchedReceipt) ?? [];
  const checkedRows = plainRows.filter((r) => r.checked);
  const checkedTotal = checkedRows.reduce((s, r) => s + r.amount, 0);

  const checkedDeposits = depositRows.filter((r) => r.checked);

  const updateRow = (id: string, patch: Partial<ImportRow>) =>
    setImportRows((rows) => (rows ? rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) : rows));

  /** "Not a match" — send the statement line back into the normal new-expense list. */
  const rejectMatch = (id: string) =>
    updateRow(id, { matchedReceipt: null, matchKind: null, checked: true });

  const updateDeposit = (id: string, patch: Partial<DepositRow>) =>
    setDepositRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const closeImport = () => {
    setImportRows(null);
    setDepositRows([]);
    setConfirmedMatches({});
    setReceiptThumbs({});
  };

  const saveImportMut = useMutation({
    mutationFn: async () => {
      const rows = checkedRows;
      const links = matchedRows;
      const deps = checkedDeposits;
      // Link each confirmed match onto the existing receipt-scanned expense.
      for (const r of links) {
        const rec = r.matchedReceipt!;
        const base = rec.merchant || r.merchant || null;
        const notes =
          Math.abs(rec.amount - r.amount) > 0.01
            ? `${base ? `${base} · ` : ""}Receipt total $${rec.amount.toFixed(2)}`
            : base;
        await updateExpense(rec.id, {
          expense_date: r.date,
          amount: r.amount,
          source: "statement",
          import_fingerprint: r.fingerprint,
          notes,
          ...(r.category !== rec.category ? { category: r.category } : {}),
        });
      }
      if (rows.length > 0) {
        await createExpensesBulk(
          rows.map((r) => ({
            expense_date: r.date,
            amount: r.amount,
            category: r.category,
            notes: r.merchant,
            import_fingerprint: r.fingerprint,
          })),
        );
      }
      if (deps.length > 0) {
        await createIncomeBulk(
          deps.map((r) => ({
            income_date: r.date,
            amount: r.amount,
            category: r.category,
            source: r.merchant,
            import_fingerprint: r.fingerprint,
          })),
        );
      }
      await upsertExpenseMerchantRules([
        ...rows.map((r) => ({ merchant_key: r.merchantKey, category: r.category, kind: "expense" })),
        ...deps.map((r) => ({ merchant_key: r.merchantKey, category: r.category, kind: "income" })),
      ]);
      return { expenses: rows.length, deposits: deps.length, linked: links.length };
    },
    onSuccess: ({ expenses: expCount, deposits: depCount, linked }) => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["income"] });
      queryClient.invalidateQueries({ queryKey: ["expense-merchant-rules"] });
      closeImport();
      const stillNeed = needsReceiptCount + expCount;
      const parts = [
        linked > 0 ? `Linked ${linked} receipt${linked === 1 ? "" : "s"}` : null,
        `${expCount} new expense${expCount === 1 ? "" : "s"}`,
        depCount > 0 ? `${depCount} deposit${depCount === 1 ? "" : "s"}` : null,
        stillNeed > 0 ? `${stillNeed} still need receipts` : null,
      ].filter(Boolean);
      toast.success(parts.join(" · "));
    },
    onError: (e: any) => toast.error(e?.message || "Could not save those expenses"),
  });

  // ---- Receipt scan ----

  const buildScanReview = (file: File, previewUrl: string, scan: {
    merchant: string; date: string | null; amount: number | null; suggested_category: string; readable: boolean;
  }): ScanReview => {
    const latest = (queryClient.getQueryData<any[]>(["expenses"]) || expenses) as any[];
    const rules = (queryClient.getQueryData<any[]>(["expense-merchant-rules"]) || merchantRules) as any[];
    const merchantKey = normalizeMerchantKey(scan.merchant || "");
    const rule = rules.find((r) => r.merchant_key === merchantKey);
    let category = rule?.category || scan.suggested_category;
    if (!EXPENSE_CATEGORIES.includes(category as any) || category === "Personal Use") category = "Supplies";

    const date = scan.date || toLocalDateKey();
    const total = scan.amount ?? 0;

    // Candidate charges: statement/manual expenses still missing a receipt.
    const open = latest.filter(
      (e) =>
        !e.receipt_url &&
        !e.receipt_not_required &&
        e.expense_date &&
        e.category !== "Personal Use" &&
        Number(e.amount) > 0,
    );
    const byId = new Map(open.map((e) => [e.id, e]));
    const candidates = total > 0
      ? matchesForReceipt(
          { id: "scan", date, amount: total, merchantKey },
          open.map((e) => ({
            id: e.id,
            date: String(e.expense_date).slice(0, 10),
            amount: Number(e.amount),
            merchantKey: normalizeMerchantKey(e.notes || ""),
          })),
        )
      : [];
    const exactMatches = candidates
      .filter((c) => c.kind === "strong")
      .map((c) => byId.get(c.chargeId))
      .filter(Boolean) as any[];
    const nearMatches = (exactMatches.length > 0
      ? []
      : candidates.map((c) => byId.get(c.chargeId)).filter(Boolean)) as any[];
    const trimmedNear = nearMatches.slice(0, 3);

    const best = exactMatches[0] || trimmedNear[0] || null;
    return {
      file,
      previewUrl,
      date,
      merchant: scan.merchant || "",
      amount: total > 0 ? String(total.toFixed(2)) : "",
      category,
      remembered: !!rule,
      readable: scan.readable,
      mode: best ? "attach" : "create",
      targetId: best?.id ?? null,
      exactMatches,
      nearMatches: trimmedNear,
      fast: false,
    };
  };

  const handleReceiptPhoto = async (raw: File) => {
    setScanning(true);
    const photo = await downscalePhoto(raw);
    const previewUrl = URL.createObjectURL(photo);
    try {
      const base64 = await fileToBase64(photo);
      const scan = await scanReceiptPhoto(base64, photo.type || "image/jpeg", [...IMPORT_CATEGORIES]);
      const review = buildScanReview(photo, previewUrl, scan);
      // Exactly one clear match → one-tap confirmation, no form.
      setScanReview({ ...review, fast: review.exactMatches.length === 1 && scan.readable });
      if (!scan.readable) {
        toast.error("That receipt was hard to read — check the details or retake the photo.");
      }
    } catch (err: any) {
      // Still let her fill it in by hand and keep the photo.
      setScanReview(
        buildScanReview(photo, previewUrl, {
          merchant: "",
          date: null,
          amount: null,
          suggested_category: "Supplies",
          readable: false,
        }),
      );
      toast.error(err?.message || "The receipt couldn't be read. Enter the details or retake the photo.");
    } finally {
      setScanning(false);
    }
  };

  const startReceiptScan = () => takePhoto((file) => { void handleReceiptPhoto(file); }, "Receipt");
  const startReceiptLibrary = () => chooseFromLibrary((file) => { void handleReceiptPhoto(file); });

  const updateScan = (patch: Partial<ScanReview>) =>
    setScanReview((s) => (s ? { ...s, ...patch } : s));

  const closeScanReview = () => {
    setScanReview((s) => {
      if (s) URL.revokeObjectURL(s.previewUrl);
      return null;
    });
  };

  const saveScanMut = useMutation({
    mutationFn: async () => {
      const s = scanReview;
      if (!s) return;
      const amount = parseFloat(s.amount) || 0;
      const path = await uploadReceiptImage(s.file);
      if (s.mode === "attach" && s.targetId) {
        const target = (queryClient.getQueryData<any[]>(["expenses"]) || expenses).find((e: any) => e.id === s.targetId);
        await updateExpense(s.targetId, {
          receipt_url: path,
          ...(target && target.category !== s.category ? { category: s.category } : {}),
        });
      } else {
        const merchantKey = normalizeMerchantKey(s.merchant);
        await createExpense({
          expense_date: s.date,
          amount,
          category: s.category,
          notes: s.merchant || null,
          receipt_url: path,
          source: "receipt_scan",
          import_fingerprint: buildImportFingerprint(s.date, amount, merchantKey),
        });
      }
      const merchantKey = normalizeMerchantKey(s.merchant);
      if (merchantKey) {
        await upsertExpenseMerchantRules([{ merchant_key: merchantKey, category: s.category }]);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expense-merchant-rules"] });
      closeScanReview();
      setScanSavedCount((n) => n + 1);
      setShowScanSaved(true);
    },
    onError: (e: any) => toast.error(e?.message || "Could not save that receipt"),
  });

  /** One-tap attach from the compact confirmation card, then straight back to the camera. */
  const fastAttachMut = useMutation({
    mutationFn: async () => {
      const s = scanReview;
      if (!s?.targetId) return;
      const path = await uploadReceiptImage(s.file);
      await updateExpense(s.targetId, { receipt_url: path });
      const merchantKey = normalizeMerchantKey(s.merchant);
      if (merchantKey) {
        await upsertExpenseMerchantRules([{ merchant_key: merchantKey, category: s.category }]);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expense-merchant-rules"] });
      closeScanReview();
      const next = batchAttachCount + 1;
      setBatchAttachCount(next);
      toast.success(`Attached · ${next} this session`);
      startReceiptScan();
    },
    onError: (e: any) => toast.error(e?.message || "Could not attach that receipt"),
  });

  const markNotOnStatementMut = useMutation({
    mutationFn: (id: string) => updateExpense(id, { source: "manual" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Marked as cash — no statement expected");
    },
    onError: (e: any) => toast.error(e?.message || "Could not update that expense"),
  });


  return (
    <Layout>
      {cameraOverlay}

      {/* Hidden inputs live outside dialogs so mobile file/camera pickers aren't blocked by focus traps */}
      <input ref={statementInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleStatementSelect} />
      <input
        ref={attachInputRef}
        type="file"
        accept={RECEIPT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file && attachTargetId) attachMut.mutate({ id: attachTargetId, file });
          setAttachTargetId(null);
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file && attachTargetId) attachMut.mutate({ id: attachTargetId, file });
          setAttachTargetId(null);
        }}
      />

      <div className="space-y-5 pb-8">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Expenses</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{expenses.length} total · ${totalFiltered.toFixed(2)} shown</p>
            {(needsReceiptCount > 0 || awaitingStatementCount > 0) && (
              <p className="text-sm text-amber-600 mt-0.5">
                {[
                  needsReceiptCount > 0 ? `${needsReceiptCount} need receipts` : null,
                  awaitingStatementCount > 0 ? `${awaitingStatementCount} awaiting statement` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="w-full sm:w-auto" onClick={() => { setBatchAttachCount(0); startReceiptScan(); }} disabled={scanning}>
              <Camera className="w-4 h-4 mr-1" />
              {scanning ? "Reading…" : "Scan Receipt"}
            </Button>
            <Select
              value={statementType}
              onValueChange={(v) => { setStatementType(v as "bank" | "credit_card"); writeStatementType(v as "bank" | "credit_card"); }}
            >
              <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">Bank account</SelectItem>
                <SelectItem value="credit_card">Credit card</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => statementInputRef.current?.click()} disabled={importing}>
              <FileUp className="w-4 h-4 mr-1" />
              {importing ? "Reading…" : "Import Statement"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Expense</Button>
          </div>

        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-1.5">
          <Button variant={filterCat === "all" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setFilterCat("all")}>
            All
          </Button>
          <Button
            variant={filterCat === "__needs_receipt" ? "default" : "outline"}
            size="sm"
            className={cn("h-7 text-xs", filterCat !== "__needs_receipt" && "border-amber-300 text-amber-700")}
            onClick={() => setFilterCat("__needs_receipt")}
          >
            Needs receipt ({needsReceiptCount})
          </Button>
          <Button
            variant={filterCat === "__awaiting_statement" ? "default" : "outline"}
            size="sm"
            className={cn("h-7 text-xs", filterCat !== "__awaiting_statement" && "border-sky-300 text-sky-700")}
            onClick={() => setFilterCat("__awaiting_statement")}
          >
            Awaiting statement ({awaitingStatementCount})
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">${Number(e.amount).toFixed(2)}</p>
                      <Badge variant="secondary" className={cn("text-[10px]", CATEGORY_COLORS[e.category] || "")}>{e.category}</Badge>
                      {needsReceipt(e) && (
                        <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-700">Needs receipt</Badge>
                      )}
                      {isMatched(e) && (
                        <Badge variant="outline" className="text-[10px] border-emerald-300 bg-emerald-50 text-emerald-700">
                          <CheckCircle2 className="w-3 h-3 mr-0.5" />Matched
                        </Badge>
                      )}
                      {awaitingStatement(e) && (
                        <Badge variant="outline" className="text-[10px] border-sky-300 bg-sky-50 text-sky-700">Awaiting statement</Badge>
                      )}
                      {e.receipt_url && (
                        <button
                          onClick={() => openReceipt(e.receipt_url!)}
                          className="text-primary hover:text-primary/80 transition-colors"
                          title="View receipt"
                        >
                          <Image className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {formatDateOnly(e.expense_date)}
                      {e.event_type && e.event_year && ` · ${e.event_type} ${e.event_year}`}
                      {e.notes && ` — ${e.notes}`}
                    </p>
                    {needsReceipt(e) && (
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          className="text-[11px] text-muted-foreground underline hover:text-foreground"
                          onClick={() => noReceiptNeededMut.mutate(e.id)}
                        >
                          No receipt needed
                        </button>
                        <button
                          className="text-[11px] text-muted-foreground underline hover:text-foreground sm:hidden"
                          onClick={() => { setAttachTargetId(e.id); cameraInputRef.current?.click(); }}
                        >
                          Take photo
                        </button>
                      </div>
                    )}
                    {awaitingStatement(e) && (
                      <button
                        className="text-[11px] text-muted-foreground underline hover:text-foreground mt-1"
                        onClick={() => markNotOnStatementMut.mutate(e.id)}
                      >
                        Not on a statement (cash)
                      </button>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    title="Attach receipt"
                    onClick={() => { setAttachTargetId(e.id); attachInputRef.current?.click(); }}
                  >
                    <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => openEdit(e)}>
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => deleteMut.mutate(e.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add / Edit Dialog */}
        <Dialog open={showAdd} onOpenChange={(open) => { setShowAdd(open); if (!open) resetForm(); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">{editingExpense ? "Edit Expense" : "Add Expense"}</DialogTitle>
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

              {showEventFields && (
                <div className="space-y-3 rounded-md border border-border p-3 bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground">Link to Event (optional)</p>
                  <Select value={formEventType} onValueChange={setFormEventType}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Event Type" /></SelectTrigger>
                    <SelectContent>
                      {EXPENSE_EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={formEventYear} onValueChange={setFormEventYear}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Event Year" /></SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Receipt upload */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={RECEIPT_ACCEPT}
                  className="hidden"
                  onChange={handleFileSelect}
                />
                {receiptFile ? (
                  <div className="relative rounded-md border border-border overflow-hidden">
                    {receiptPreview ? (
                      <img src={receiptPreview} alt="Receipt preview" className="w-full max-h-32 object-cover" />
                    ) : (
                      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                        <ReceiptText className="w-4 h-4" />
                        <span className="truncate">{receiptFile.name}</span>
                      </div>
                    )}
                    <button
                      onClick={clearReceipt}
                      className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 hover:bg-background transition-colors"
                    >
                      <X className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs text-muted-foreground"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="w-3.5 h-3.5 mr-1.5" />
                      {editingExpense ? "Attach Receipt" : "Attach Receipt (optional)"}
                    </Button>
                    {editingExpense && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs text-muted-foreground sm:hidden"
                        onClick={() => { setAttachTargetId(editingExpense.id); cameraInputRef.current?.click(); }}
                      >
                        <Camera className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <Button className="w-full" onClick={() => editingExpense ? editMut.mutate() : createMut.mutate()} disabled={!formAmount || createMut.isPending || editMut.isPending || uploading}>
                {uploading ? "Uploading..." : editingExpense ? (editMut.isPending ? "Saving..." : "Save Changes") : (createMut.isPending ? "Adding..." : "Add Expense")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Statement import review */}
        <Dialog open={!!importRows} onOpenChange={(open) => { if (!open) closeImport(); }}>
          <DialogContent className="max-w-3xl w-[96vw] max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-base">Review statement</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap border-b border-border pb-2">
              <p className="text-sm font-medium">
                {checkedRows.length} of {plainRows.length} selected · ${checkedTotal.toFixed(2)}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  const allChecked = plainRows.every((r) => r.checked);
                  setImportRows((rows) =>
                    rows ? rows.map((r) => (r.matchedReceipt ? r : { ...r, checked: !allChecked })) : rows,
                  );
                }}
              >
                {plainRows.every((r) => r.checked) ? "Select none" : "Select all"}
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 py-2">
              {matchedRows.length > 0 && (
                <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/40 p-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-emerald-800">
                      Matched to your receipts ({matchedRows.length})
                    </p>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        setConfirmedMatches(Object.fromEntries(matchedRows.map((r) => [r.id, true])))
                      }
                    >
                      Confirm all matches
                    </Button>
                  </div>
                  {matchedRows.map((r) => {
                    const rec = r.matchedReceipt!;
                    const needsLook = r.matchKind === "tip" && !confirmedMatches[r.id];
                    const thumb = receiptThumbs[rec.id];
                    return (
                      <div
                        key={r.id}
                        className={cn(
                          "rounded-md border p-2 space-y-2 bg-background",
                          needsLook ? "border-amber-300 bg-amber-50/60" : "border-emerald-200",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {thumb ? (
                            <button
                              type="button"
                              onClick={() => openReceipt(rec.path)}
                              className="shrink-0 rounded border border-border overflow-hidden"
                              title="View receipt"
                            >
                              <img src={thumb} alt="Receipt" className="w-12 h-12 object-cover" />
                            </button>
                          ) : (
                            <div className="w-12 h-12 shrink-0 rounded border border-border bg-muted/40 flex items-center justify-center">
                              <ReceiptText className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-muted-foreground">{formatDateOnly(r.date)}</span>
                              <span className="text-sm font-semibold">${r.amount.toFixed(2)}</span>
                              {needsLook ? (
                                <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-700">
                                  Possible match — confirm
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] border-emerald-300 bg-emerald-50 text-emerald-700">
                                  <CheckCircle2 className="w-3 h-3 mr-0.5" />Match
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground break-words">{r.merchant}</p>
                            <p className="text-[11px] text-muted-foreground">
                              Receipt: {rec.merchant || "receipt"} · {formatDateOnly(rec.date)} · ${rec.amount.toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            variant={needsLook ? "default" : "secondary"}
                            onClick={() => setConfirmedMatches((m) => ({ ...m, [r.id]: true }))}
                          >
                            Yes, same purchase
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => rejectMatch(r.id)}
                          >
                            Not a match
                          </Button>
                          <Select value={r.category} onValueChange={(v) => updateRow(r.id, { category: v })}>
                            <SelectTrigger className="h-7 text-xs w-[180px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {IMPORT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {plainRows.map((r) => (
                <div key={r.id} className="flex items-start gap-2 rounded-md border border-border/60 p-2">
                  <Checkbox
                    checked={r.checked}
                    onCheckedChange={(v) => updateRow(r.id, { checked: !!v })}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">{formatDateOnly(r.date)}</span>
                      <span className="text-sm font-semibold">${r.amount.toFixed(2)}</span>
                      {r.remembered && (
                        <Badge variant="secondary" className="text-[10px]">remembered</Badge>
                      )}
                      {r.duplicate && (
                        <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-700">Possible duplicate</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground break-words">{r.merchant}</p>
                    <Select value={r.category} onValueChange={(v) => updateRow(r.id, { category: v, remembered: false })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {IMPORT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}

              {depositRows.length > 0 && (
                <div className="pt-3 space-y-2">
                  <div className="border-t border-border pt-3">
                    <p className="text-sm font-semibold">Deposits (money in)</p>
                    <p className="text-[11px] text-muted-foreground">
                      Customer payments are already counted from Orders — only check deposits that are NOT already in Orders (like commission).
                    </p>
                  </div>
                  {depositRows.map((r) => (
                    <div key={r.id} className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50/40 p-2">
                      <Checkbox
                        checked={r.checked}
                        onCheckedChange={(v) => updateDeposit(r.id, { checked: !!v })}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">{formatDateOnly(r.date)}</span>
                          <span className="text-sm font-semibold text-emerald-700">${r.amount.toFixed(2)}</span>
                          {r.remembered && <Badge variant="secondary" className="text-[10px]">remembered</Badge>}
                          {r.matchesOrder && (
                            <Badge variant="outline" className="text-[10px] border-sky-300 bg-sky-50 text-sky-700">Matches an order</Badge>
                          )}
                          {r.duplicate && (
                            <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-700">Possible duplicate</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground break-words">{r.merchant}</p>
                        <Select value={r.category} onValueChange={(v) => updateDeposit(r.id, { category: v, remembered: false })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {INCOME_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-border pt-3">
              <Button
                className="w-full"
                disabled={(checkedRows.length === 0 && checkedDeposits.length === 0) || saveImportMut.isPending}
                onClick={() => saveImportMut.mutate()}
              >
                {saveImportMut.isPending
                  ? "Saving…"
                  : `Save ${checkedRows.length} expense${checkedRows.length === 1 ? "" : "s"}${checkedDeposits.length > 0 ? ` + ${checkedDeposits.length} deposit${checkedDeposits.length === 1 ? "" : "s"}` : ""}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* One clear match — one-tap confirmation */}
        <Dialog open={!!scanReview?.fast} onOpenChange={(open) => { if (!open) closeScanReview(); }}>
          <DialogContent className="max-w-xs w-[92vw]">
            <DialogHeader>
              <DialogTitle className="text-base">Found a match</DialogTitle>
            </DialogHeader>
            {scanReview?.fast && scanReview.exactMatches[0] && (
              <div className="space-y-3">
                <img
                  src={scanReview.previewUrl}
                  alt="Receipt photo"
                  className="w-full max-h-36 object-contain rounded-md border border-border bg-muted/30"
                />
                <p className="text-sm">
                  Attach to{" "}
                  <span className="font-semibold">
                    {scanReview.exactMatches[0].notes || scanReview.exactMatches[0].category}
                  </span>{" "}
                  · ${Number(scanReview.exactMatches[0].amount).toFixed(2)} ·{" "}
                  {formatDateOnly(scanReview.exactMatches[0].expense_date)}?
                </p>
                {batchAttachCount > 0 && (
                  <p className="text-xs text-muted-foreground">Attached · {batchAttachCount} this session</p>
                )}
                <Button className="w-full" disabled={fastAttachMut.isPending} onClick={() => fastAttachMut.mutate()}>
                  {fastAttachMut.isPending ? "Attaching…" : "Yes, attach"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setScanReview((s) => (s ? { ...s, fast: false } : s))}
                >
                  Change
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Receipt scan review */}
        <Dialog open={!!scanReview && !scanReview.fast} onOpenChange={(open) => { if (!open) closeScanReview(); }}>
          <DialogContent className="max-w-sm w-[95vw] max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">Review receipt</DialogTitle>
            </DialogHeader>
            {scanReview && (
              <div className="space-y-3">
                <img src={scanReview.previewUrl} alt="Receipt photo" className="w-full max-h-40 object-contain rounded-md border border-border bg-muted/30" />

                {!scanReview.readable && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                    That photo was hard to read. Fill in the details below, or retake the photo — the photo still gets saved.
                  </p>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => { closeScanReview(); startReceiptScan(); }}>
                    <Camera className="w-3.5 h-3.5 mr-1" />Retake
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => { closeScanReview(); startReceiptLibrary(); }}>
                    <ImageIcon className="w-3.5 h-3.5 mr-1" />Choose photo
                  </Button>
                </div>

                <Input type="date" value={scanReview.date} onChange={(e) => updateScan({ date: e.target.value })} />
                <Input placeholder="Merchant" value={scanReview.merchant} onChange={(e) => updateScan({ merchant: e.target.value })} />
                <Input type="number" step="0.01" placeholder="Amount" value={scanReview.amount} onChange={(e) => updateScan({ amount: e.target.value })} />
                <div className="space-y-1">
                  <Select value={scanReview.category} onValueChange={(v) => updateScan({ category: v, remembered: false })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {IMPORT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {scanReview.remembered && <Badge variant="secondary" className="text-[10px]">remembered</Badge>}
                </div>

                {(scanReview.exactMatches.length > 0 || scanReview.nearMatches.length > 0) && (
                  <div className="space-y-2 rounded-md border border-border p-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {scanReview.exactMatches.length > 0 ? "Attach to this expense" : "Possible match"}
                    </p>
                    {[...scanReview.exactMatches, ...scanReview.nearMatches].map((m: any) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => updateScan({ mode: "attach", targetId: m.id })}
                        className={cn(
                          "w-full text-left rounded-md border p-2 text-xs",
                          scanReview.mode === "attach" && scanReview.targetId === m.id
                            ? "border-primary bg-primary/5"
                            : "border-border/60 hover:bg-muted/50",
                        )}
                      >
                        <span className="font-semibold">${Number(m.amount).toFixed(2)}</span>{" "}
                        <span className="text-muted-foreground">
                          {formatDateOnly(m.expense_date)} · {m.category}
                          {m.notes ? ` — ${m.notes}` : ""}
                        </span>
                        {scanReview.exactMatches.length === 0 && (
                          <Badge variant="outline" className="ml-1 text-[10px] border-amber-300 bg-amber-50 text-amber-700">possible match</Badge>
                        )}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => updateScan({ mode: "create", targetId: null })}
                      className={cn(
                        "w-full text-left rounded-md border p-2 text-xs",
                        scanReview.mode === "create" ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/50",
                      )}
                    >
                      Create a new expense instead
                    </button>
                  </div>
                )}

                <Button
                  className="w-full"
                  disabled={
                    saveScanMut.isPending ||
                    (scanReview.mode === "create" && !(parseFloat(scanReview.amount) > 0))
                  }
                  onClick={() => saveScanMut.mutate()}
                >
                  {saveScanMut.isPending
                    ? "Saving…"
                    : scanReview.mode === "attach"
                      ? "Attach receipt"
                      : "Save expense"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Saved — scan another */}
        <Dialog open={showScanSaved} onOpenChange={(open) => { if (!open) setShowScanSaved(false); }}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle className="text-base">Receipt saved</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {scanSavedCount} receipt{scanSavedCount === 1 ? "" : "s"} saved this session
              </p>
              <Button className="w-full" onClick={() => { setShowScanSaved(false); startReceiptScan(); }}>
                <Camera className="w-4 h-4 mr-1" />Scan another
              </Button>
              <Button variant="outline" className="w-full" onClick={() => { setShowScanSaved(false); setScanSavedCount(0); }}>
                Done
              </Button>
            </div>
          </DialogContent>
        </Dialog>


        {/* Receipt viewer */}
        <Dialog open={!!viewingReceipt} onOpenChange={() => setViewingReceipt(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Receipt</DialogTitle>
            </DialogHeader>
            {viewingReceipt && (
              <div className="space-y-3">
                {viewingReceipt.isPdf ? (
                  <iframe src={viewingReceipt.url} title="Receipt" className="w-full h-[60vh] rounded-md border border-border" />
                ) : (
                  <img src={viewingReceipt.url} alt="Receipt" className="w-full rounded-md" />
                )}
                <a href={viewingReceipt.url} target="_blank" rel="noopener noreferrer" download>
                  <Button variant="outline" size="sm" className="w-full text-xs">
                    Download Receipt
                  </Button>
                </a>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
