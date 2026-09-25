import React, { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatNumber, getTodayDate, formatDate } from '../lib/formatters';
import { storage } from '../lib/storage';
import { PurchaseInvoiceLine, PurchaseInvoice, Item } from '../types';
import { normalizeArabicText, playBeep } from '../lib/security';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Calendar,
  DollarSign,
  Barcode,
  History,
  CheckCircle2,
  RotateCcw,
  ShoppingBag,
  Package,
  X,
  Printer,
  FileText,
  AlertTriangle,
  RefreshCw,
  Building2,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Modal } from './ui/Modal';

export const PurchaseInvoiceView: React.FC = () => {
  const {
    items,
    suppliers,
    currentUser,
    purchaseInvoices,
    refreshData,
    showToast,
    searchFocusSignal,
    setPrintDoc,
    itemStockMap,
    supplierBalanceMap,
    canDeleteInvoices,
    cancelPurchaseInvoice,
    registerSaveTrigger,
  } = useApp();

  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(suppliers[0]?.id || '');
  const [supplierName, setSupplierName] = useState<string>(suppliers[0]?.name || '');
  const [invoiceDate, setInvoiceDate] = useState<string>(getTodayDate());
  const [notes, setNotes] = useState<string>('');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [paidCash, setPaidCash] = useState<number>(0);
  const [updateCostPrice, setUpdateCostPrice] = useState<boolean>(true);

  // Lines
  const [lines, setLines] = useState<PurchaseInvoiceLine[]>([]);

  // Barcode quick scan
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Search Modal
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // History & Cancellation Modal
  const [viewHistoryModal, setViewHistoryModal] = useState<boolean>(false);
  const [cancelModalInvoice, setCancelModalInvoice] = useState<PurchaseInvoice | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');

  // Update supplier name when ID changes
  useEffect(() => {
    if (selectedSupplierId) {
      const s = suppliers.find((x) => x.id === selectedSupplierId);
      if (s) setSupplierName(s.name);
    }
  }, [selectedSupplierId, suppliers]);

  // Previous supplier balance (اللي له علينا)
  const previousBalance = useMemo(() => {
    if (!selectedSupplierId) return 0;
    return supplierBalanceMap.get(selectedSupplierId) ?? 0;
  }, [selectedSupplierId, supplierBalanceMap]);

  // Active supplier object
  const activeSupplier = useMemo(() => {
    return suppliers.find((s) => s.id === selectedSupplierId);
  }, [selectedSupplierId, suppliers]);

  // Calculations
  const subtotal = useMemo(() => {
    return lines.reduce((sum, line) => sum + (line.total || 0), 0);
  }, [lines]);

  const finalTotal = useMemo(() => {
    return Math.max(0, subtotal - (discountValue || 0));
  }, [subtotal, discountValue]);

  // إجمالي المستحق للمورد (حساب سابق + الفاتورة الحالية)
  const totalPayable = useMemo(() => {
    return previousBalance + finalTotal;
  }, [previousBalance, finalTotal]);

  // المتبقي كدين آجل للمورد
  const remainingDebt = useMemo(() => {
    return Math.max(0, finalTotal - paidCash);
  }, [finalTotal, paidCash]);

  // الرصيد بعد الفاتورة للمورد
  const balanceAfter = useMemo(() => {
    return previousBalance + remainingDebt;
  }, [previousBalance, remainingDebt]);

  // Shortcut listeners
  useEffect(() => {
    if (searchFocusSignal > 0) {
      setIsSearchModalOpen(true);
      setTimeout(() => searchInputRef.current?.focus(), 150);
    }
  }, [searchFocusSignal]);

  const handleAddItem = (item: Item) => {
    const existing = lines.findIndex((l) => l.item_id === item.id);
    if (existing !== -1) {
      const updated = [...lines];
      const newQty = updated[existing].quantity + 1;
      updated[existing].quantity = newQty;
      updated[existing].total = newQty * updated[existing].unit_price;
      setLines(updated);
    } else {
      const newLine: PurchaseInvoiceLine = {
        id: `pline-${Date.now()}-${item.id}`,
        item_id: item.id,
        item_code: item.code,
        item_name: item.name,
        quantity: 1,
        unit_price: item.cost_price,
        total: item.cost_price,
      };
      setLines([...lines, newLine]);
    }

    playBeep(true);
    showToast('info', 'تمت الإضافة', `تم إضافة (${item.name}) لفاتورة الشراء`);
  };

  // Fast O(1) Barcode & Code Lookup Map
  const barcodeToItemMap = useMemo(() => {
    const map = new Map<string, Item>();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.barcode) map.set(it.barcode.trim(), it);
      if (it.code) map.set(it.code.trim().toLowerCase(), it);
    }
    return map;
  }, [items]);

  // Barcode handler
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const clean = barcodeInput.trim();
    const found = barcodeToItemMap.get(clean) || barcodeToItemMap.get(clean.toLowerCase());

    if (found) {
      handleAddItem(found);
      setBarcodeInput('');
    } else {
      playBeep(false);
      showToast('error', 'الصنف غير مسجل', `لم يتم العثور على صنف بالباركود/الكود: ${clean}`);
    }

    setTimeout(() => barcodeRef.current?.focus(), 50);
  };

  // Quantity stepper
  const handleQtyChange = (index: number, delta: number) => {
    const updated = [...lines];
    const newQty = Math.max(1, updated[index].quantity + delta);
    updated[index].quantity = newQty;
    updated[index].total = newQty * updated[index].unit_price;
    setLines(updated);
  };

  // Update line unit price or quantity
  const handleUpdateLine = (index: number, field: keyof PurchaseInvoiceLine, value: any) => {
    const updated = [...lines];
    const line = { ...updated[index], [field]: value };
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unit_price) || 0;
    line.total = Math.max(0, qty * price);
    updated[index] = line;
    setLines(updated);
  };

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  // Save invoice
  const handleSaveInvoice = (andPrint: boolean = false) => {
    if (lines.length === 0) {
      showToast('error', 'فاتورة فارغة', 'يرجى إضافة صنف واحد على الأقل قبل الحفظ');
      return;
    }

    try {
      const saved = storage.savePurchaseInvoice(
        {
          supplier_id: selectedSupplierId || 'cash_supplier',
          supplier_name: supplierName,
          invoice_date: invoiceDate,
          lines,
          subtotal,
          discount_value: discountValue,
          final_total: finalTotal,
          paid_cash: paidCash,
          notes,
          update_cost_price: updateCostPrice,
        },
        currentUser
      );

      refreshData();
      showToast('success', 'تم حفظ فاتورة الشراء بنجاح', `رقم الفاتورة: ${saved.invoice_number}`);

      if (andPrint) {
        setPrintDoc({
          type: 'purchase_invoice',
          data: saved,
          format: 'thermal',
        });
      }

      // Reset form
      setLines([]);
      setDiscountValue(0);
      setNotes('');
      setPaidCash(0);
    } catch (e: any) {
      showToast('error', 'فشل حفظ الفاتورة', e.message || 'حدث خطأ');
    }
  };

  // Register Global F2 Shortcut
  useEffect(() => {
    return registerSaveTrigger(() => {
      handleSaveInvoice(false);
    });
  }, [lines, selectedSupplierId, supplierName, paidCash, discountValue, notes, finalTotal, updateCostPrice]);

  // Cancel Purchase Invoice
  const handleConfirmCancel = () => {
    if (!cancelModalInvoice) return;
    if (!cancelReason.trim()) {
      showToast('error', 'تنبيه', 'يرجى كتابة سبب الإلغاء');
      return;
    }

    const success = cancelPurchaseInvoice(cancelModalInvoice.id, cancelReason);
    if (success) {
      setCancelModalInvoice(null);
      setCancelReason('');
    }
  };

  // Precomputed search index for purchase modal
  const purchaseSearchIndex = useMemo(() => {
    return items.map((i) => ({
      item: i,
      token: normalizeArabicText(`${i.name} ${i.code} ${i.barcode || ''} ${i.oem_number || ''} ${i.brand || ''}`),
    }));
  }, [items]);

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const normalizedQuery = useMemo(() => normalizeArabicText(deferredSearchTerm), [deferredSearchTerm]);

  const searchResults = useMemo(() => {
    if (!normalizedQuery) return items.slice(0, 30);
    const results: Item[] = [];
    for (let idx = 0; idx < purchaseSearchIndex.length; idx++) {
      if (purchaseSearchIndex[idx].token.includes(normalizedQuery)) {
        results.push(purchaseSearchIndex[idx].item);
        if (results.length >= 36) break;
      }
    }
    return results;
  }, [purchaseSearchIndex, normalizedQuery, items]);

  return (
    <div className="p-3 sm:p-5 w-full max-w-full 2xl:max-w-[1920px] mx-auto space-y-4 pb-28 md:pb-8 text-slate-900 dark:text-zinc-100">
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-3 sm:p-4 rounded-2xl shadow-xs">
        {/* Fast Barcode Input */}
        <form onSubmit={handleBarcodeSubmit} className="flex-1 max-w-md relative">
          <div className="relative flex items-center">
            <Barcode className="w-5 h-5 absolute start-3 text-cyan-500 pointer-events-none" />
            <input
              ref={barcodeRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="امسح الباركود أو كود الصنف للتوريد السريع..."
              className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700/80 hover:border-cyan-500 rounded-xl ps-10 pe-20 py-2 text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 font-mono tracking-wide"
            />
            <button
              type="submit"
              className="absolute end-1.5 px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              إضافة
            </button>
          </div>
        </form>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewHistoryModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-bold border border-slate-300 dark:border-zinc-700 transition-colors cursor-pointer"
          >
            <History className="w-4 h-4 text-cyan-500" />
            <span>سجل فواتير المشتريات</span>
          </button>
        </div>
      </div>

      {/* Supplier Selection & Balance Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2 space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-slate-600 dark:text-zinc-400 block mb-1.5">
                المورد (شركة التوريد):
              </label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.current_balance ? `(${formatCurrency(s.current_balance)})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-zinc-400 block mb-1.5">
                  تاريخ الفاتورة:
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-zinc-800 text-xs">
            <label className="flex items-center gap-2 text-slate-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={updateCostPrice}
                onChange={(e) => setUpdateCostPrice(e.target.checked)}
                className="rounded accent-cyan-500"
              />
              <span className="font-bold">
                تحديث سعر التكلفة في كارت الصنف تلقائياً بسعر هذه الفاتورة
              </span>
            </label>
            {activeSupplier?.phone && (
              <span className="text-slate-500 dark:text-zinc-400">
                هاتف المورد: <strong className="text-slate-800 dark:text-zinc-200">{activeSupplier.phone}</strong>
              </span>
            )}
          </div>
        </Card>

        {/* 3-Box Financial Summary Card */}
        <Card className="flex flex-col justify-center">
          <div className="grid grid-cols-3 gap-2 text-center divide-x divide-x-reverse divide-slate-200 dark:divide-zinc-800">
            <div className="p-1">
              <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 block mb-1">له سابقاً</span>
              <span className="text-sm sm:text-base font-black font-mono text-slate-800 dark:text-zinc-300 tabular-nums">
                {formatCurrency(previousBalance)}
              </span>
            </div>
            <div className="p-1">
              <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 block mb-1">فاتورة الشراء</span>
              <span className="text-sm sm:text-base font-black font-mono text-cyan-600 dark:text-cyan-400 tabular-nums">
                {formatCurrency(finalTotal)}
              </span>
            </div>
            <div className="p-1">
              <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 block mb-1">الإجمالي المستحق</span>
              <span className="text-sm sm:text-base font-black font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                {formatCurrency(totalPayable)}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Big "Add Item" Button */}
      <Button
        variant="primary"
        size="lg"
        icon={<Plus className="w-5 h-5" />}
        onClick={() => setIsSearchModalOpen(true)}
        className="w-full shadow-lg shadow-amber-500/10 font-black text-base"
      >
        إضافة صنف للشراء (F3)
      </Button>

      {/* Invoice Lines */}
      {lines.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-300 dark:border-zinc-800 rounded-3xl bg-slate-50/70 dark:bg-zinc-900/30">
          <ShoppingBag className="w-14 h-14 text-slate-400 dark:text-zinc-600 mb-3" />
          <h4 className="text-base font-bold text-slate-800 dark:text-zinc-300 mb-1">لا توجد أصناف في فاتورة الشراء</h4>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mb-4">
            اضغط زر "إضافة صنف للشراء" لاختيار الأصناف الموردة وكمياتها وأسعار التكلفة.
          </p>
          <Button variant="secondary" size="md" onClick={() => setIsSearchModalOpen(true)}>
            اختيار الأصناف
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {lines.map((line, index) => {
            const originalItem = items.find((i) => i.id === line.item_id);

            return (
              <div
                key={line.id}
                className="bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800/80 hover:border-slate-300 dark:hover:border-zinc-700 rounded-2xl p-3 sm:p-4 shadow-sm space-y-3 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-slate-900 dark:text-white">{line.item_name}</span>
                      {originalItem?.brand && (
                        <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 rounded-full border border-slate-200 dark:border-zinc-700">
                          {originalItem.brand}
                        </span>
                      )}
                      {originalItem?.oem_number && (
                        <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 font-bold">
                          OEM: {originalItem.oem_number}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-2">
                      <span>كود: {line.item_code}</span>
                      {originalItem?.shelf_location && (
                        <>
                          <span>·</span>
                          <span>الرف: {originalItem.shelf_location}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoveLine(index)}
                    className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-zinc-800/60 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-slate-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    title="حذف البند"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center pt-2 border-t border-slate-200 dark:border-zinc-800/60">
                  {/* Stepper (+ -) */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-zinc-400 shrink-0">الكمية:</span>
                    <div className="flex items-center bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => handleQtyChange(index, -1)}
                        className="w-9 h-9 flex items-center justify-center text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-800 active:bg-slate-300 dark:active:bg-zinc-700 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={isNaN(line.quantity) ? '' : line.quantity}
                        onChange={(e) => handleUpdateLine(index, 'quantity', e.target.value)}
                        className="w-14 text-center text-sm font-black font-mono text-slate-900 dark:text-white bg-transparent focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleQtyChange(index, 1)}
                        className="w-9 h-9 flex items-center justify-center text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-800 active:bg-slate-300 dark:active:bg-zinc-700 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Unit Cost Price */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-zinc-400 shrink-0">سعر التكلفة:</span>
                    <input
                      type="number"
                      step="0.5"
                      value={isNaN(line.unit_price) ? '' : line.unit_price}
                      onChange={(e) => handleUpdateLine(index, 'unit_price', e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 text-sm font-mono font-bold text-cyan-700 dark:text-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>

                  {/* Line Total */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 text-left">
                    <span className="sm:hidden text-xs text-slate-500 dark:text-zinc-400 font-bold">الإجمالي:</span>
                    <span className="text-base font-black font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                      {formatCurrency(line.total)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Payment & Debt Controls */}
      {lines.length > 0 && (
        <Card className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Discount */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 dark:text-zinc-400">الخصم المكتسب من المورد:</label>
              <input
                type="number"
                min="0"
                value={isNaN(discountValue) ? '' : (discountValue || '')}
                onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>

            {/* Paid Cash */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-600 dark:text-zinc-400">المدفوع نقداً للمورد:</label>
                <button
                  type="button"
                  onClick={() => setPaidCash(finalTotal)}
                  className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline font-bold"
                >
                  سداد كامل
                </button>
              </div>
              <input
                type="number"
                step="5"
                value={isNaN(paidCash) ? '' : (paidCash || '')}
                onChange={(e) => setPaidCash(Number(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>

            {/* Remaining Debt */}
            <div className="space-y-1.5 bg-slate-50 dark:bg-zinc-950/80 p-3 rounded-2xl border border-slate-200 dark:border-zinc-800">
              <span className="text-xs font-bold text-slate-600 dark:text-zinc-400 block">المتبقي آجل للمورد:</span>
              <div className="text-xl font-black font-mono text-rose-600 dark:text-rose-400 tabular-nums">
                {formatCurrency(remainingDebt)}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-zinc-400 block">
                الرصيد النهائي له: {formatCurrency(balanceAfter)}
              </span>
            </div>
          </div>

          <div>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات على فاتورة التوريد (اختياري)..."
              className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-zinc-300 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
        </Card>
      )}

      {/* Fixed Bottom Action Bar */}
{!isSearchModalOpen && (
      <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:bottom-0 left-0 right-0 md:mr-20 lg:mr-64 z-30 mobile-action-bar bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-t border-slate-200 dark:border-zinc-800 p-2.5 sm:p-3 sm:px-6 flex items-center justify-between gap-3 shadow-2xl no-print">
        <div className="mobile-total flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="space-y-0.5 min-w-0">
            <span className="mobile-total-label text-[10px] font-bold text-slate-500 dark:text-zinc-400 block">إجمالي المشتريات</span>
            <div className="mobile-total-amount text-lg sm:text-2xl font-black font-mono text-cyan-600 dark:text-cyan-400 tracking-tight tabular-nums">
              {formatCurrency(finalTotal)}
            </div>
          </div>
          {lines.length > 0 && (
            <Badge variant="zinc" size="sm" className="hidden sm:inline-flex font-mono">
              {lines.length} صنف
            </Badge>
          )}
        </div>

        <div className="mobile-action-buttons flex items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            icon={<Printer className="w-4 h-4" />}
            disabled={lines.length === 0}
            onClick={() => handleSaveInvoice(true)}
            className="cursor-pointer px-2.5 sm:px-4"
          >
            <span className="hidden sm:inline">حفظ و</span>طباعة
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={<CheckCircle2 className="w-4 h-4" />}
            disabled={lines.length === 0}
            onClick={() => handleSaveInvoice(false)}
            className="font-black px-4 sm:px-6 shadow-md shadow-amber-500/20 cursor-pointer"
          >
            <span>حفظ</span>
            <span className="hidden sm:inline"> الفاتورة</span>
          </Button>
        </div>
      </div>
      )}

      {/* Item Search Modal */}
      <Modal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        maxWidth="4xl"
        className="invoice-item-picker-modal"
        title="اختيار الأصناف للتوريد"
      >
        <div className="space-y-4">
          <div className="relative flex items-center">
            <Search className="w-5 h-5 absolute start-3.5 text-cyan-600 dark:text-cyan-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالاسم، كود الصنف، الباركود، رقم OEM..."
              className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700/80 rounded-2xl ps-11 pe-4 py-3.5 text-base text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              autoFocus
            />
          </div>

          <div className="invoice-picker-results grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto pr-1">
            {searchResults.map((item) => {
              const stock = itemStockMap.get(item.id) ?? (item.current_stock || 0);

              return (
                <button
                  key={item.id}
                  onClick={() => handleAddItem(item)}
                  aria-pressed={lines.some((line) => line.item_id === item.id)}
                  className={`p-3.5 rounded-2xl border transition-all text-right flex flex-col justify-between gap-3 group cursor-pointer ${lines.some((line) => line.item_id === item.id) ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30 ring-2 ring-cyan-500/30' : 'bg-slate-50 dark:bg-zinc-900/90 border-slate-200 dark:border-zinc-800 hover:border-cyan-500/80 dark:hover:border-cyan-500/60 hover:bg-slate-100 dark:hover:bg-zinc-850'} active:scale-[0.98]`}
                >
                  <div className="space-y-1 w-full">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-black text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors wrap-text">
                        {item.name}
                      </span>
                      {lines.some((line) => line.item_id === item.id) && (
                        <Badge variant="emerald" size="sm">مضاف ✓</Badge>
                      )}
                      <Badge variant="zinc" size="sm">
                        رصيد المخزن: {stock}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      كود: {item.code} {item.brand && `· ${item.brand}`}
                    </div>
                  </div>

                  <div className="flex items-center justify-between w-full pt-2 border-t border-slate-200 dark:border-zinc-800/80">
                    <span className="text-sm font-black font-mono text-cyan-600 dark:text-cyan-400 tabular-nums">
                      التكلفة الحالية: {formatCurrency(item.cost_price)}
                    </span>
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <span>إضافة</span>
                      <Plus className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-zinc-800">
            <span className="text-xs text-slate-500 dark:text-zinc-400">
              يمكنك النقر على عدة أصناف للإضافة المتتالية
            </span>
            <Button variant="primary" size="md" onClick={() => setIsSearchModalOpen(false)}>
              تم ({lines.length} صنف)
            </Button>
          </div>
        </div>
      </Modal>

      {/* History & Cancellation Modal */}
      <Modal
        isOpen={viewHistoryModal}
        onClose={() => setViewHistoryModal(false)}
        maxWidth="2xl"
        title="سجل فواتير المشتريات"
      >
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {purchaseInvoices.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-zinc-400 text-xs">
              لا توجد فواتير مشتريات مسجلة حتى الآن.
            </div>
          ) : (
            purchaseInvoices.map((inv) => {
              const isCancelled = inv.status === 'cancelled';

              return (
                <div
                  key={inv.id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isCancelled
                      ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-500/30 opacity-75'
                      : 'bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900 dark:text-white">{inv.supplier_name}</span>
                        <span className="text-[10px] font-mono bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 px-2 py-0.5 rounded border border-slate-300 dark:border-zinc-700">
                          {inv.invoice_number}
                        </span>
                        {isCancelled && <Badge variant="rose" size="sm">ملغاة</Badge>}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                        {formatDate(inv.invoice_date)} · {inv.lines.length} صنف · بواسطة: {inv.created_by}
                      </div>
                      {isCancelled && inv.cancellation_reason && (
                        <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                          سبب الإلغاء: {inv.cancellation_reason}
                        </div>
                      )}
                    </div>

                    <div className="text-left space-y-1">
                      <div className={`text-sm font-black font-mono tabular-nums ${isCancelled ? 'line-through text-slate-400 dark:text-zinc-500' : 'text-cyan-600 dark:text-cyan-400'}`}>
                        {formatCurrency(inv.final_total)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setPrintDoc({ type: 'purchase_invoice', data: inv, format: 'a4' })}
                          className="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 flex items-center justify-center cursor-pointer"
                          title="طباعة A4"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        {canDeleteInvoices && !isCancelled && (
                          <button
                            onClick={() => {
                              setCancelModalInvoice(inv);
                              setCancelReason('');
                            }}
                            className="px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-bold cursor-pointer"
                          >
                            إلغاء الفاتورة
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Modal>

      {/* Cancellation Modal */}
      <Modal
        isOpen={Boolean(cancelModalInvoice)}
        onClose={() => setCancelModalInvoice(null)}
        maxWidth="sm"
        title="إلغاء فاتورة مشتريات (Void)"
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs">
            سيتم وسم الفاتورة كـ "ملغاة" ورد المخزون والخزينة وحساب المورد بأمان.
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
              سبب إلغاء الفاتورة (إجباري):
            </label>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="مثال: فاتورة مكررة، إرجاع الشحنة بالكامل..."
              className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              disabled={!cancelReason.trim()}
              onClick={handleConfirmCancel}
            >
              تأكيد الإلغاء
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setCancelModalInvoice(null)}
            >
              تراجع
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
