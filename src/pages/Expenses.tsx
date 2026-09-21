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
} from "@/lib/queries";
import { EXPENSE_CATEGORIES, EXPENSE_EVENT_TYPES } from "@/lib/types";
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
import { Plus, Trash2, DollarSign, Upload, Image, X, Pencil, FileUp, Paperclip, Camera, ReceiptText, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatDateOnly, toLocalDateKey, parseLocalDate } from "@/lib/dateOnly";

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


  const SHOW_EVENT_FIELDS_FOR = ["Events", "Travel", "Meals"];
  const showEventFields = SHOW_EVENT_FIELDS_FOR.includes(formCategory);
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const needsReceipt = (e: any) =>
    !e.receipt_url && !e.receipt_not_required && e.category !== "Personal Use";

  const needsReceiptCount = useMemo(() => expenses.filter(needsReceipt).length, [expenses]);

  const filtered = useMemo(() => {
    if (filterCat === "all") return expenses;
    if (filterCat === "__needs_receipt") return expenses.filter(needsReceipt);
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
      const transactions = await parseStatementPdf(base64, file.type || "application/pdf", [...IMPORT_CATEGORIES]);
      if (transactions.length === 0) {
        toast.error("No transactions could be read from that statement. If it's a scan, try a clearer PDF.");
        return;
      }
      const ruleMap = new Map(merchantRules.map((r) => [r.merchant_key, r.category]));
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
        };
      });
      setImportRows(rows);
    } catch (err: any) {
      toast.error(err?.message || "The statement couldn't be read. Please try again.");
    } finally {
      setImporting(false);
    }
  };

  const checkedRows = importRows?.filter((r) => r.checked) ?? [];
  const checkedTotal = checkedRows.reduce((s, r) => s + r.amount, 0);

  const updateRow = (id: string, patch: Partial<ImportRow>) =>
    setImportRows((rows) => (rows ? rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) : rows));

  const saveImportMut = useMutation({
    mutationFn: async () => {
      const rows = checkedRows;
      await createExpensesBulk(
        rows.map((r) => ({
          expense_date: r.date,
          amount: r.amount,
          category: r.category,
          notes: r.merchant,
          import_fingerprint: r.fingerprint,
        })),
      );
      await upsertExpenseMerchantRules(rows.map((r) => ({ merchant_key: r.merchantKey, category: r.category })));
      return rows.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expense-merchant-rules"] });
      setImportRows(null);
      toast.success(`${count} expense${count === 1 ? "" : "s"} added`);
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

    const open = latest.filter(
      (e) => !e.receipt_url && !e.receipt_not_required && e.expense_date,
    );
    const withinWindow = total > 0
      ? open.filter((e) => daysApart(String(e.expense_date).slice(0, 10), date) <= 5)
      : [];
    const exactMatches = withinWindow
      .filter((e) => Math.abs(Number(e.amount) - total) <= 0.01)
      .sort((a, b) => daysApart(String(a.expense_date).slice(0, 10), date) - daysApart(String(b.expense_date).slice(0, 10), date));
    const nearMatches = exactMatches.length > 0
      ? []
      : withinWindow
          .filter((e) => Number(e.amount) > total && Number(e.amount) <= total * 1.3)
          .sort((a, b) => daysApart(String(a.expense_date).slice(0, 10), date) - daysApart(String(b.expense_date).slice(0, 10), date))
          .slice(0, 3);

    const best = exactMatches[0] || nearMatches[0] || null;
    return {
      file,
      previewUrl,
      date,
      merchant: scan.merchant || "",
      amount: total > 0 ? String(total.toFixed(2)) : "",
      category,
      remembered: !!rule,
      readable: scan.readable,
      mode: exactMatches.length > 0 ? "attach" : "create",
      targetId: exactMatches.length > 0 ? best?.id ?? null : null,
      exactMatches,
      nearMatches,
    };
  };

  const handleReceiptPhoto = async (raw: File) => {
    setScanning(true);
    const photo = await downscalePhoto(raw);
    const previewUrl = URL.createObjectURL(photo);
    try {
      const base64 = await fileToBase64(photo);
      const scan = await scanReceiptPhoto(base64, photo.type || "image/jpeg", [...IMPORT_CATEGORIES]);
      setScanReview(buildScanReview(photo, previewUrl, scan));
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
            {needsReceiptCount > 0 && (
              <p className="text-sm text-amber-600 mt-0.5">{needsReceiptCount} need receipts</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="w-full sm:w-auto" onClick={startReceiptScan} disabled={scanning}>
              <Camera className="w-4 h-4 mr-1" />
              {scanning ? "Reading…" : "Scan Receipt"}
            </Button>
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
        <Dialog open={!!importRows} onOpenChange={(open) => { if (!open) setImportRows(null); }}>
          <DialogContent className="max-w-3xl w-[96vw] max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-base">Review statement</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap border-b border-border pb-2">
              <p className="text-sm font-medium">
                {checkedRows.length} of {importRows?.length ?? 0} selected · ${checkedTotal.toFixed(2)}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  const allChecked = (importRows ?? []).every((r) => r.checked);
                  setImportRows((rows) => (rows ? rows.map((r) => ({ ...r, checked: !allChecked })) : rows));
                }}
              >
                {(importRows ?? []).every((r) => r.checked) ? "Select none" : "Select all"}
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 py-2">
              {(importRows ?? []).map((r) => (
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
            </div>
            <div className="border-t border-border pt-3">
              <Button
                className="w-full"
                disabled={checkedRows.length === 0 || saveImportMut.isPending}
                onClick={() => saveImportMut.mutate()}
              >
                {saveImportMut.isPending ? "Saving…" : `Save ${checkedRows.length} expense${checkedRows.length === 1 ? "" : "s"}`}
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
