import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { storage } from '../lib/storage';
import { formatCurrency } from '../lib/formatters';
import { FitNumber } from './ui/FitNumber';
import {
  RotateCcw,
  Search,
  ShoppingCart,
  ShoppingBag,
  History,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Plus,
  Minus,
  FileText,
  Download,
  Trash2,
  ArrowRight,
  Info,
  Calendar,
  Layers,
  Wallet,
  Users2,
  X,
  Sparkles,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';
import { Badge } from './ui/Badge';
import { ReturnRecord, SalesInvoice, PurchaseInvoice } from '../types';

export const ReturnsView: React.FC = () => {
  const {
    currentUser,
    salesInvoices,
    purchaseInvoices,
    returns,
    customers,
    suppliers,
    treasuryBalance,
    showToast,
    refreshData,
    setPrintDoc,
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'sale_return' | 'purchase_return' | 'log'>('sale_return');

  // Wizard Step State (1: Select Invoice, 2: Select Items, 3: Settlement & Reason, 4: Confirm)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Invoice selection state
  const [searchInvoiceQuery, setSearchInvoiceQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | PurchaseInvoice | null>(null);
  const [isFreeReturnWithoutInvoice, setIsFreeReturnWithoutInvoice] = useState(false);
  const [freeReturnPartyId, setFreeReturnPartyId] = useState('');
  const [freeReturnPartyName, setFreeReturnPartyName] = useState('');

  // Items selection state: item_id -> { quantity: number, unit_price: number, maxAllowed: number, restock: boolean }
  const [selectedItemsMap, setSelectedItemsMap] = useState<
    Record<
      string,
      {
        item_id: string;
        item_name: string;
        part_number?: string;
        quantity: number;
        unit_price: number;
        cost_price?: number;
        maxAllowed: number;
        originalQty: number;
        alreadyReturned: number;
        restock: boolean;
      }
    >
  >({});

  // Settlement & reason state
  const [settlementMethod, setSettlementMethod] = useState<'cash' | 'account' | 'split'>('cash');
  const [refundCashAmount, setRefundCashAmount] = useState<number>(0);
  const [creditAccountAmount, setCreditAccountAmount] = useState<number>(0);
  const [returnReason, setReturnReason] = useState<string>('عيب مصنعي / تالف');
  const [customReasonText, setCustomReasonText] = useState<string>('');
  const [returnNotes, setReturnNotes] = useState<string>('');

  // Created return for success screen
  const [createdReturnRecord, setCreatedReturnRecord] = useState<ReturnRecord | null>(null);

  // Log filter and details state
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logTypeFilter, setLogTypeFilter] = useState<'all' | 'sale_return' | 'purchase_return'>('all');
  const [selectedReturnForDetails, setSelectedReturnForDetails] = useState<ReturnRecord | null>(null);
  const [returnToCancel, setReturnToCancel] = useState<ReturnRecord | null>(null);
  const [cancelReasonText, setCancelReasonText] = useState('');

  // -------------------------------------------------------------
  // Invoice Search & Filter
  // -------------------------------------------------------------
  const invoicesList = useMemo<(SalesInvoice | PurchaseInvoice)[]>(() => {
    if (activeSubTab === 'sale_return') {
      return salesInvoices.filter((inv) => inv.status !== 'cancelled');
    }
    return purchaseInvoices.filter((inv) => inv.status !== 'cancelled');
  }, [activeSubTab, salesInvoices, purchaseInvoices]);

  const filteredInvoices = useMemo<(SalesInvoice | PurchaseInvoice)[]>(() => {
    let list: (SalesInvoice | PurchaseInvoice)[] = invoicesList;
    if (searchInvoiceQuery.trim()) {
      const q = searchInvoiceQuery.trim().toLowerCase();
      list = list.filter((inv) => {
        const num = inv.invoice_number.toLowerCase();
        const party = ('customer_name' in inv ? inv.customer_name : (inv as PurchaseInvoice).supplier_name).toLowerCase();
        const hasItem = inv.lines.some((l: any) =>
          l.item_name.toLowerCase().includes(q) ||
          ((l.item_code || l.oem_number || '') && (l.item_code || l.oem_number).toLowerCase().includes(q))
        );
        return num.includes(q) || party.includes(q) || hasItem;
      });
    }
    return list.slice(0, 20); // Top 20 for speed & clarity
  }, [invoicesList, searchInvoiceQuery]);

  // Compute what has already been returned for each invoice
  const returnedMapByInvoice = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    returns
      .filter((r) => r.status !== 'cancelled' && r.original_doc_id)
      .forEach((r) => {
        const invId = r.original_doc_id!;
        if (!map.has(invId)) map.set(invId, new Map());
        const itemMap = map.get(invId)!;
        r.lines.forEach((l) => {
          itemMap.set(l.item_id, (itemMap.get(l.item_id) || 0) + l.quantity);
        });
      });
    return map;
  }, [returns]);

  // Handle invoice selection
  const handleSelectInvoice = (inv: SalesInvoice | PurchaseInvoice) => {
    setSelectedInvoice(inv);
    setIsFreeReturnWithoutInvoice(false);

    // Compute lines with available to return
    const prevReturned = returnedMapByInvoice.get(inv.id) || new Map();
    const map: typeof selectedItemsMap = {};

    inv.lines.forEach((line: any) => {
      const returnedQty = prevReturned.get(line.item_id) || 0;
      const maxAllowed = Math.max(0, line.quantity - returnedQty);
      if (maxAllowed > 0) {
        // Compute distributed discount unit price
        let netUnitPrice = Number(line.unit_price) || 0;
        if (inv.subtotal > 0 && inv.final_total < inv.subtotal) {
          const ratio = inv.final_total / inv.subtotal;
          if (!isNaN(ratio) && isFinite(ratio)) {
            netUnitPrice = Math.round(netUnitPrice * ratio * 100) / 100;
          }
        }

        map[line.item_id] = {
          item_id: line.item_id,
          item_name: line.item_name,
          part_number: line.oem_number || line.item_code || '',
          quantity: 0,
          unit_price: netUnitPrice,
          cost_price: line.cost_price ?? line.unit_price,
          maxAllowed,
          originalQty: line.quantity,
          alreadyReturned: returnedQty,
          restock: true,
        };
      }
    });

    setSelectedItemsMap(map);

    // Smart default settlement
    const isCashPaidFull = inv.paid_cash >= inv.final_total;
    const isZeroCash = inv.paid_cash <= 0;
    if (isCashPaidFull) {
      setSettlementMethod('cash');
    } else if (isZeroCash) {
      setSettlementMethod('account');
    } else {
      setSettlementMethod('cash');
    }

    setStep(2);
  };

  // Switch tabs
  const handleTabChange = (tab: 'sale_return' | 'purchase_return' | 'log') => {
    setActiveSubTab(tab);
    setStep(1);
    setSelectedInvoice(null);
    setSelectedItemsMap({});
    setCreatedReturnRecord(null);
  };

  // Step 2 item quantity handlers
  const handleItemQtyChange = (itemId: string, newQty: number) => {
    setSelectedItemsMap((prev) => {
      const item = prev[itemId];
      if (!item) return prev;
      const clamped = Math.max(0, Math.min(item.maxAllowed, newQty));
      return {
        ...prev,
        [itemId]: { ...item, quantity: clamped },
      };
    });
  };

  const handleReturnAllItems = () => {
    setSelectedItemsMap((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((id) => {
        updated[id] = { ...updated[id], quantity: updated[id].maxAllowed };
      });
      return updated;
    });
  };

  // Summary computations
  const activeSelectedItems = useMemo(() => {
    return Object.values(selectedItemsMap).filter((it) => it.quantity > 0);
  }, [selectedItemsMap]);

  const totalReturnAmount = useMemo(() => {
    const sum = activeSelectedItems.reduce((acc, it) => {
      const q = isNaN(it.quantity) ? 0 : it.quantity;
      const p = isNaN(it.unit_price) ? 0 : it.unit_price;
      return acc + q * p;
    }, 0);
    return isNaN(sum) ? 0 : sum;
  }, [activeSelectedItems]);

  // Adjust settlement amounts when total changes or method changes
  React.useEffect(() => {
    const validTotal = isNaN(totalReturnAmount) ? 0 : totalReturnAmount;
    if (settlementMethod === 'cash') {
      setRefundCashAmount(validTotal);
      setCreditAccountAmount(0);
    } else if (settlementMethod === 'account') {
      setRefundCashAmount(0);
      setCreditAccountAmount(validTotal);
    } else if (settlementMethod === 'split') {
      setRefundCashAmount((prev) => Math.min(isNaN(prev) ? 0 : prev, validTotal));
      setCreditAccountAmount((prev) => Math.max(0, validTotal - (isNaN(refundCashAmount) ? 0 : refundCashAmount)));
    }
  }, [totalReturnAmount, settlementMethod]);

  // Step 3 Reason check
  const handleReasonChange = (r: string) => {
    setReturnReason(r);
    // If defective, default uncheck restock for safety
    if (r.includes('تالف') || r.includes('عيب مصنعي')) {
      setSelectedItemsMap((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          next[k] = { ...next[k], restock: false };
        });
        return next;
      });
    } else {
      setSelectedItemsMap((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          next[k] = { ...next[k], restock: true };
        });
        return next;
      });
    }
  };

  // Submit return
  const handleSubmitReturn = () => {
    if (activeSelectedItems.length === 0) {
      showToast('error', 'تنبيه', 'يجب اختيار صنف واحد على الأقل وتحديد كمية الإرجاع.');
      return;
    }

    if (totalReturnAmount <= 0) {
      showToast('error', 'تنبيه', 'إجمالي مبلغ المرتجع غير صالح.');
      return;
    }

    if (Math.abs(refundCashAmount + creditAccountAmount - totalReturnAmount) > 0.05) {
      showToast('error', 'خطأ في التوزيع', 'مجموع المبلغ النقدي والمقيد بالحساب يجب أن يساوي إجمالي المرتجع.');
      return;
    }

    if (activeSubTab === 'sale_return' && refundCashAmount > treasuryBalance) {
      showToast('error', 'رصيد الخزينة غير كافٍ', `رصيد الخزينة الحالي (${formatCurrency(treasuryBalance)}) أقل من المبلغ المطلوب رده نقداً (${formatCurrency(refundCashAmount)}).`);
      return;
    }

    const partyId = selectedInvoice
      ? 'customer_id' in selectedInvoice
        ? selectedInvoice.customer_id
        : (selectedInvoice as PurchaseInvoice).supplier_id
      : freeReturnPartyId;

    const partyName = selectedInvoice
      ? 'customer_name' in selectedInvoice
        ? selectedInvoice.customer_name
        : (selectedInvoice as PurchaseInvoice).supplier_name
      : freeReturnPartyName || 'مرتجع عام';

    const fullReason = returnReason === 'أخرى' && customReasonText.trim() ? customReasonText.trim() : returnReason;

    try {
      const saved = storage.saveReturn(
        {
          return_type: activeSubTab === 'log' ? 'sale_return' : activeSubTab,
          original_doc_id: selectedInvoice ? selectedInvoice.id : undefined,
          original_doc_number: selectedInvoice ? selectedInvoice.invoice_number : undefined,
          party_id: partyId || undefined,
          party_name: partyName,
          date: new Date().toISOString().split('T')[0],
          lines: activeSelectedItems.map((it) => ({
            item_id: it.item_id,
            item_name: it.item_name,
            quantity: it.quantity,
            unit_price: it.unit_price,
            total: it.quantity * it.unit_price,
          })),
          total_amount: totalReturnAmount,
          refunded_cash: refundCashAmount,
          credited_to_account: creditAccountAmount,
          notes: `${fullReason} | ${returnNotes}`.trim(),
        },
        currentUser
      );

      setCreatedReturnRecord(saved);
      refreshData();
      showToast('success', 'تم حفظ المرتجع بنجاح', `رقم المرتجع: ${saved.return_number}`);
    } catch (err: any) {
      showToast('error', 'فشل حفظ المرتجع', err.message);
    }
  };

  // Reset wizard for new return
  const handleStartNewReturn = () => {
    setStep(1);
    setSelectedInvoice(null);
    setSelectedItemsMap({});
    setRefundCashAmount(0);
    setCreditAccountAmount(0);
    setReturnNotes('');
    setCreatedReturnRecord(null);
  };

  // Print return receipt
  const handlePrintReturn = (rec: ReturnRecord) => {
    setPrintDoc({
      type: 'return',
      format: 'thermal',
      data: {
        id: rec.id,
        docNumber: rec.return_number,
        partyName: rec.party_name,
        date: rec.date,
        totalAmount: rec.total_amount,
        paidAmount: rec.refunded_cash,
        remainingAmount: rec.credited_to_account,
        lines: rec.lines.map((l: any) => ({
          itemName: l.item_name,
          partNumber: l.part_number || l.oem_number || l.item_code || '',
          quantity: l.quantity,
          unitPrice: l.unit_price,
          subtotal: l.total || l.quantity * l.unit_price,
        })),
        notes: rec.notes,
        cashierName: rec.created_by,
        isCancelled: rec.status === 'cancelled',
      },
    });
  };

  // Cancel return action
  const handleConfirmCancelReturn = () => {
    if (!returnToCancel) return;
    if (currentUser.role !== 'admin') {
      showToast('error', 'صلاحية مرفوضة', 'إلغاء المرتجعات يتطلب صلاحية مدير النظام فقط.');
      return;
    }
    if (!cancelReasonText.trim()) {
      showToast('error', 'سبب الإلغاء مطلوب', 'يرجى كتابة سبب صريح لإلغاء المرتجع.');
      return;
    }

    try {
      storage.cancelReturn(returnToCancel.id, cancelReasonText.trim(), currentUser);
      refreshData();
      showToast('success', 'تم إلغاء المرتجع وعكس الحركات', `تم إلغاء ${returnToCancel.return_number} بنجاح.`);
      setReturnToCancel(null);
      setCancelReasonText('');
    } catch (err: any) {
      showToast('error', 'خطأ في الإلغاء', err.message);
    }
  };

  // Export returns CSV
  const handleExportReturnsCSV = () => {
    if (returns.length === 0) {
      showToast('error', 'تنبيه', 'لا توجد مرتجعات لتصديرها.');
      return;
    }
    const headers = ['رقم المرتجع', 'النوع', 'الفاتورة الأصلية', 'الطرف', 'التاريخ', 'إجمالي المبلغ', 'نقدي مسترد', 'مقيد بالحساب', 'الحالة', 'المسؤول'];
    const rows = returns.map((r) => [
      r.return_number,
      r.return_type === 'sale_return' ? 'مرتجع مبيعات' : 'مرتجع مشتريات',
      r.original_doc_number || 'بدون فاتورة',
      r.party_name,
      r.date,
      r.total_amount,
      r.refunded_cash,
      r.credited_to_account,
      r.status === 'completed' ? 'سليم' : 'ملغي',
      r.created_by,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `سجل_المرتجعات_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('success', 'تصدير ناجح', 'تم تصدير سجل المرتجعات كملف CSV');
  };

  return (
    <div className="p-3 sm:p-5 w-full max-w-full 2xl:max-w-[1920px] mx-auto space-y-4 pb-28 md:pb-8 text-slate-900 dark:text-zinc-100">
      {/* Top Header & Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-xl">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">إدارة المرتجعات والتسويات</h1>
              <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">
                معالج متكامل لإرجاع بنود المبيعات والمشتريات وتحديث المخزون والخزينة وحسابات الأطراف آلياً
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-1 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => handleTabChange('sale_return')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeSubTab === 'sale_return'
                ? 'bg-amber-500 text-zinc-950 shadow-md font-black'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            مرتجع مبيعات
          </button>
          <button
            onClick={() => handleTabChange('purchase_return')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeSubTab === 'purchase_return'
                ? 'bg-amber-500 text-zinc-950 shadow-md font-black'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            مرتجع مشتريات
          </button>
          <button
            onClick={() => handleTabChange('log')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeSubTab === 'log'
                ? 'bg-amber-500 text-zinc-950 shadow-md font-black'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <History className="w-4 h-4" />
            سجل المرتجعات
            {returns.length > 0 && (
              <span className="px-1.5 py-0.2 bg-slate-200 dark:bg-zinc-800 text-slate-800 dark:text-zinc-300 rounded-full text-[10px]">
                {returns.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4-Step Return Wizard (Sale or Purchase) */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab !== 'log' && (
        <div className="space-y-6">
          {/* Wizard Step Indicator */}
          {!createdReturnRecord && (
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              {[
                { s: 1, label: 'اختيار الفاتورة' },
                { s: 2, label: 'الأصناف والكميات' },
                { s: 3, label: 'التسوية والسبب' },
                { s: 4, label: 'المراجعة والحفظ' },
              ].map((stepObj) => (
                <div
                  key={stepObj.s}
                  onClick={() => {
                    if (step > stepObj.s) setStep(stepObj.s as any);
                  }}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                    step === stepObj.s
                      ? 'bg-amber-500/10 border-amber-500 text-amber-700 dark:text-amber-400 font-bold shadow-xs'
                      : step > stepObj.s
                      ? 'bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 text-slate-800 dark:text-zinc-300'
                      : 'bg-slate-100 dark:bg-zinc-950 border-slate-200 dark:border-zinc-900 text-slate-400 dark:text-zinc-600'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold">
                      {stepObj.s}
                    </span>
                    <span className="hidden sm:inline">{stepObj.label}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Success Screen after Saving */}
          {createdReturnRecord && (
            <Card className="p-8 text-center bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 space-y-6 max-w-xl mx-auto shadow-sm">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/40">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">تم تسجيل المرتجع بنجاح!</h2>
                <p className="text-slate-600 dark:text-zinc-400 text-sm">
                  رقم المرتجع: <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">{createdReturnRecord.return_number}</span>
                </p>
              </div>

              <div className="p-4 bg-zinc-950/80 rounded-xl border border-zinc-800 text-sm text-right space-y-2">
                <div className="flex justify-between">
                  <span className="text-zinc-400">الطرف:</span>
                  <span className="font-bold text-white">{createdReturnRecord.party_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">إجمالي قيمة المرتجع:</span>
                  <FitNumber value={createdReturnRecord.total_amount} currency className="text-amber-400 font-bold" />
                </div>
                {createdReturnRecord.refunded_cash > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>مسترد نقداً من الخزينة:</span>
                    <FitNumber value={createdReturnRecord.refunded_cash} currency />
                  </div>
                )}
                {createdReturnRecord.credited_to_account > 0 && (
                  <div className="flex justify-between text-blue-400">
                    <span>مقيد في كشف الحساب:</span>
                    <FitNumber value={createdReturnRecord.credited_to_account} currency />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <Button
                  variant="primary"
                  onClick={() => handlePrintReturn(createdReturnRecord)}
                  className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold px-6"
                >
                  <Printer className="w-4 h-4" />
                  طباعة إيصال المرتجع
                </Button>
                <Button variant="outline" onClick={handleStartNewReturn} className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" />
                  تسجيل مرتجع جديد
                </Button>
              </div>
            </Card>
          )}

          {/* STEP 1: Select Invoice */}
          {step === 1 && !createdReturnRecord && (
            <div className="space-y-4">
              <Card className="p-4 bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 space-y-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchInvoiceQuery}
                      onChange={(e) => setSearchInvoiceQuery(e.target.value)}
                      placeholder={
                        activeSubTab === 'sale_return'
                          ? 'ابحث برقم فاتورة المبيعات، اسم العميل، أو الصنف...'
                          : 'ابحث برقم فاتورة المشتريات، اسم المورد، أو الصنف...'
                      }
                      className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl pr-9 pl-4 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {(currentUser.role === 'admin' || currentUser.role === 'accountant') && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsFreeReturnWithoutInvoice(true);
                        setStep(2);
                      }}
                      className="text-xs border-dashed border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:border-amber-500 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      مرتجع حر (بدون فاتورة أصلية)
                    </Button>
                  )}
                </div>

                {/* Quick 20 Invoices Grid */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-600 dark:text-zinc-400 flex items-center justify-between">
                    <span>آخر الفواتير القابلة للإرجاع ({filteredInvoices.length})</span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-500">اضغط على أي فاتورة لبدء إرجاع أصنافها</span>
                  </div>

                  {filteredInvoices.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 dark:text-zinc-500 text-sm">
                      لا توجد فواتير مطابقة للبحث
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filteredInvoices.map((inv) => {
                        const party = 'customer_name' in inv ? inv.customer_name : inv.supplier_name;
                        const prevRet = returnedMapByInvoice.get(inv.id);
                        const hasReturnBefore = Boolean(prevRet && prevRet.size > 0);

                        return (
                          <div
                            key={inv.id}
                            onClick={() => handleSelectInvoice(inv)}
                            className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/80 hover:border-amber-500/50 hover:bg-slate-100/80 dark:hover:bg-zinc-900/60 transition-all cursor-pointer space-y-2 group"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400 group-hover:text-amber-500">
                                {inv.invoice_number}
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-zinc-500">{inv.invoice_date}</span>
                            </div>

                            <div className="flex items-center justify-between text-sm">
                              <span className="font-bold text-slate-900 dark:text-white wrap-text min-w-0">{party}</span>
                              <FitNumber value={inv.final_total} currency className="text-slate-900 dark:text-zinc-200 font-bold" />
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 pt-1 border-t border-slate-200 dark:border-zinc-800/60">
                              <span>عدد الأصناف: {inv.lines.length}</span>
                              {hasReturnBefore && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                                  له مرتجع سابق
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* STEP 2: Select Items & Quantities */}
          {step === 2 && !createdReturnRecord && (
            <Card className="p-4 sm:p-6 bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 space-y-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-zinc-800 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>تحديد البنود والكميات المرتجعة</span>
                    {selectedInvoice && (
                      <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono rounded font-bold">
                        {selectedInvoice.invoice_number}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">
                    الطرف: {selectedInvoice ? ('customer_name' in selectedInvoice ? selectedInvoice.customer_name : selectedInvoice.supplier_name) : 'مرتجع حر'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleReturnAllItems} className="text-xs">
                    إرجاع كل المتاح
                  </Button>
                </div>
              </div>

              {/* Items Table - desktop */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-right text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 font-bold bg-slate-50 dark:bg-zinc-950/50">
                      <th className="py-2.5 pr-2">الصنف</th>
                      <th className="py-2.5 text-center">الكمية الأصلية</th>
                      <th className="py-2.5 text-center">المرتجع سابقاً</th>
                      <th className="py-2.5 text-center">المتاح للإرجاع</th>
                      <th className="py-2.5 text-center">كمية الإرجاع</th>
                      <th className="py-2.5 text-center">سعر الوحدة</th>
                      <th className="py-2.5 pl-2 text-left">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60">
                    {Object.values(selectedItemsMap).map((it) => {
                      const isSelected = it.quantity > 0;
                      return (
                        <tr key={it.item_id} className={`transition-colors ${isSelected ? 'bg-amber-500/10 dark:bg-amber-500/5' : 'hover:bg-slate-50 dark:hover:bg-zinc-800/40'}`}>
                          <td className="py-3 pr-2 min-w-0">
                            <div className="font-bold text-slate-900 dark:text-white wrap-text">{it.item_name}</div>
                            {it.part_number && <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">{it.part_number}</div>}
                          </td>
                          <td className="py-3 text-center font-mono text-slate-700 dark:text-zinc-300">{it.originalQty}</td>
                          <td className="py-3 text-center font-mono text-slate-500 dark:text-zinc-400">{it.alreadyReturned}</td>
                          <td className="py-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">{it.maxAllowed}</td>
                          <td className="py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => handleItemQtyChange(it.item_id, it.quantity - 1)} disabled={it.quantity <= 0} className="w-9 h-9 rounded bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 disabled:opacity-30 flex items-center justify-center text-slate-700 dark:text-zinc-200 border border-slate-300 dark:border-zinc-700 cursor-pointer"><Minus className="w-3.5 h-3.5" /></button>
                              <input type="number" min={0} max={it.maxAllowed} value={isNaN(it.quantity) ? 0 : it.quantity} onChange={(e) => { const val = parseInt(e.target.value, 10); handleItemQtyChange(it.item_id, isNaN(val) ? 0 : val); }} className="w-14 h-9 text-center bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded py-1 font-mono font-bold text-slate-900 dark:text-white text-xs focus:ring-1 focus:ring-amber-500" />
                              <button onClick={() => handleItemQtyChange(it.item_id, it.quantity + 1)} disabled={it.quantity >= it.maxAllowed} className="w-9 h-9 rounded bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 disabled:opacity-30 flex items-center justify-center text-slate-700 dark:text-zinc-200 border border-slate-300 dark:border-zinc-700 cursor-pointer"><Plus className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                          <td className="py-3 text-center"><FitNumber value={it.unit_price} currency className="text-slate-800 dark:text-zinc-300 font-mono" /></td>
                          <td className="py-3 pl-2 text-left"><FitNumber value={it.quantity * it.unit_price} currency className="font-bold text-amber-600 dark:text-amber-400 font-mono" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Items Cards - mobile */}
              <div className="sm:hidden space-y-3">
                {Object.values(selectedItemsMap).map((it) => {
                  const isSelected = it.quantity > 0;
                  return (
                    <div key={it.item_id} className={`rounded-2xl border p-3 space-y-3 ${isSelected ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-black text-sm text-slate-900 dark:text-white wrap-text">{it.item_name}</div>
                          {it.part_number && <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 mt-0.5">{it.part_number}</div>}
                        </div>
                        <FitNumber value={it.quantity * it.unit_price} currency className="shrink-0 font-black text-amber-600 dark:text-amber-400 font-mono" />
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <div className="rounded-xl bg-white/70 dark:bg-zinc-900 p-2 text-center border border-slate-200 dark:border-zinc-800">
                          <div className="text-slate-500 dark:text-zinc-500">الأصلية</div>
                          <div className="font-black font-mono mt-0.5">{it.originalQty}</div>
                        </div>
                        <div className="rounded-xl bg-white/70 dark:bg-zinc-900 p-2 text-center border border-slate-200 dark:border-zinc-800">
                          <div className="text-slate-500 dark:text-zinc-500">مرتجع سابق</div>
                          <div className="font-black font-mono mt-0.5">{it.alreadyReturned}</div>
                        </div>
                        <div className="rounded-xl bg-emerald-500/10 p-2 text-center border border-emerald-500/20">
                          <div className="text-emerald-700 dark:text-emerald-400">المتاح</div>
                          <div className="font-black font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">{it.maxAllowed}</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-zinc-800">
                        <div>
                          <div className="text-[11px] text-slate-500 dark:text-zinc-500">سعر الوحدة</div>
                          <FitNumber value={it.unit_price} currency className="font-bold font-mono text-slate-800 dark:text-zinc-300" />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleItemQtyChange(it.item_id, it.quantity - 1)} disabled={it.quantity <= 0} className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 disabled:opacity-30 flex items-center justify-center border border-slate-300 dark:border-zinc-700"><Minus className="w-4 h-4" /></button>
                          <input type="number" min={0} max={it.maxAllowed} value={isNaN(it.quantity) ? 0 : it.quantity} onChange={(e) => { const val = parseInt(e.target.value, 10); handleItemQtyChange(it.item_id, isNaN(val) ? 0 : val); }} className="w-14 h-10 text-center bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl font-mono font-black text-sm" />
                          <button onClick={() => handleItemQtyChange(it.item_id, it.quantity + 1)} disabled={it.quantity >= it.maxAllowed} className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 disabled:opacity-30 flex items-center justify-center border border-slate-300 dark:border-zinc-700"><Plus className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total & Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 dark:text-zinc-400">إجمالي المرتجع المحدد:</span>
                  <FitNumber value={totalReturnAmount} currency className="text-lg font-black text-amber-600 dark:text-amber-400" />
                  <span className="text-xs text-slate-500 dark:text-zinc-500">({activeSelectedItems.length} بنود مختارة)</span>
                </div>

                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    العودة لاختيار الفاتورة
                  </Button>
                  <Button
                    variant="primary"
                    disabled={activeSelectedItems.length === 0}
                    onClick={() => setStep(3)}
                    className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold"
                  >
                    التالي: طريقة التسوية والسبب
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* STEP 3: Settlement & Reason */}
          {step === 3 && !createdReturnRecord && (
            <Card className="p-6 bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 space-y-6 max-w-2xl mx-auto shadow-xs">
              <div className="border-b border-slate-200 dark:border-zinc-800 pb-3">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">طريقة التسوية المالية وسبب الإرجاع</h2>
                <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">
                  حدد كيف سيتم رد قيمة المرتجع ({formatCurrency(totalReturnAmount)}) للطرف
                </p>
              </div>

              {/* Settlement Options */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block">طريقة التسوية</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettlementMethod('cash')}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                      settlementMethod === 'cash'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300 font-bold'
                        : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <Wallet className="w-5 h-5 mx-auto mb-1 text-amber-500" />
                    <div className="text-xs font-bold">نقدي فوري</div>
                    <div className="text-[10px] text-slate-500 dark:text-zinc-500">يُصرف من الخزينة</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettlementMethod('account')}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                      settlementMethod === 'account'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300 font-bold'
                        : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <Users2 className="w-5 h-5 mx-auto mb-1 text-blue-500" />
                    <div className="text-xs font-bold">خصم من الحساب</div>
                    <div className="text-[10px] text-slate-500 dark:text-zinc-500">تخفيض المديونية</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettlementMethod('split')}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                      settlementMethod === 'split'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300 font-bold'
                        : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <Layers className="w-5 h-5 mx-auto mb-1 text-purple-500" />
                    <div className="text-xs font-bold">تجزئة (مختلط)</div>
                    <div className="text-[10px] text-slate-500 dark:text-zinc-500">جزء كاش وجزء رصيد</div>
                  </button>
                </div>

                {/* Split inputs if selected */}
                {settlementMethod === 'split' && (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800">
                    <div>
                      <label className="text-[11px] text-slate-600 dark:text-zinc-400 block mb-1">المبلغ المسترد نقداً</label>
                      <input
                        type="number"
                        value={isNaN(refundCashAmount) ? 0 : refundCashAmount}
                        onChange={(e) => {
                          const cash = Math.max(0, parseFloat(e.target.value) || 0);
                          setRefundCashAmount(cash);
                          setCreditAccountAmount(Math.max(0, (isNaN(totalReturnAmount) ? 0 : totalReturnAmount) - cash));
                        }}
                        className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded p-2 text-slate-900 dark:text-white font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-600 dark:text-zinc-400 block mb-1">المقيد بالحساب</label>
                      <input
                        type="number"
                        value={isNaN(creditAccountAmount) ? 0 : creditAccountAmount}
                        readOnly
                        className="w-full bg-slate-100 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded p-2 text-slate-500 dark:text-zinc-400 font-mono text-sm cursor-not-allowed"
                      />
                    </div>
                  </div>
                )}

                {/* Treasury Warning */}
                {refundCashAmount > treasuryBalance && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-xl flex items-center gap-2 text-red-700 dark:text-red-300 text-xs">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    <span>
                      تنبيه: رصيد الخزينة الحالي ({formatCurrency(treasuryBalance)}) أقل من المبلغ المطلوب رده نقداً ({formatCurrency(refundCashAmount)})!
                    </span>
                  </div>
                )}
              </div>

              {/* Reason Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block">سبب الإرجاع</label>
                <select
                  value={returnReason}
                  onChange={(e) => handleReasonChange(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl p-2.5 text-sm text-slate-900 dark:text-white focus:border-amber-500"
                >
                  <option value="عيب مصنعي / تالف">عيب مصنعي / تالف (لا يُعاد للمخزون تلقائياً)</option>
                  <option value="صنف غير مطابق للطلب / خطأ">صنف غير مطابق للطلب / خطأ</option>
                  <option value="زائد عن الحاجة">زائد عن الحاجة</option>
                  <option value="استرجاع العميل للسيارة">استرجاع العميل للسيارة</option>
                  <option value="أخرى">أخرى (كتابة يدوية)</option>
                </select>

                {returnReason === 'أخرى' && (
                  <input
                    type="text"
                    value={customReasonText}
                    onChange={(e) => setCustomReasonText(e.target.value)}
                    placeholder="يرجى توضيح سبب الإرجاع بالتفصيل..."
                    className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl p-2.5 text-sm text-slate-900 dark:text-white mt-2"
                  />
                )}
              </div>

              {/* Restock Checkbox */}
              <div className="p-3 bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">إعادة الأصناف للمخزون</div>
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                    تفعيل هذا الخيار يعيد الكميات إلى رصيد المخزن تلقائياً
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={Object.values(selectedItemsMap).some((it) => it.restock)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSelectedItemsMap((prev) => {
                      const next = { ...prev };
                      Object.keys(next).forEach((k) => {
                        next[k] = { ...next[k], restock: checked };
                      });
                      return next;
                    });
                  }}
                  className="w-4 h-4 accent-amber-500 rounded"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">ملاحظات إضافية</label>
                <textarea
                  rows={2}
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="أي تفاصيل أخرى للمرتجع..."
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl p-2.5 text-sm text-slate-900 dark:text-white"
                />
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-zinc-800">
                <Button variant="outline" onClick={() => setStep(2)}>
                  العودة للأصناف
                </Button>
                <Button
                  variant="primary"
                  onClick={() => setStep(4)}
                  className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold"
                >
                  التالي: مراجعة وتأكيد الحفظ
                </Button>
              </div>
            </Card>
          )}

          {/* STEP 4: Confirm & Impact Summary */}
          {step === 4 && !createdReturnRecord && (
            <Card className="p-6 bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 space-y-6 max-w-2xl mx-auto shadow-xs">
              <div className="border-b border-slate-200 dark:border-zinc-800 pb-3">
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  مراجعة الأثر المحاسبي وتأكيد حفظ المرتجع
                </h2>
                <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">
                  يرجى التأكد من البيانات قبل الترحيل النهائي لقاعدة البيانات
                </p>
              </div>

              {/* Impact Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-center space-y-1">
                  <div className="text-xs text-slate-600 dark:text-zinc-400">الأثر على المخزون</div>
                  <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    +{activeSelectedItems.reduce((acc, it) => acc + (it.restock ? it.quantity : 0), 0)} قطعة
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-500">تدخل المخزن فوراً</div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-center space-y-1">
                  <div className="text-xs text-slate-600 dark:text-zinc-400">الأثر على حساب الطرف</div>
                  <div className="text-base font-bold text-blue-600 dark:text-blue-400 font-mono">
                    -{formatCurrency(creditAccountAmount)}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-500">تخفيض مديونية</div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-center space-y-1">
                  <div className="text-xs text-slate-600 dark:text-zinc-400">الأثر على الخزينة</div>
                  <div className="text-base font-bold text-rose-600 dark:text-red-400 font-mono">
                    -{formatCurrency(refundCashAmount)}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-500">صرف نقدي فوري</div>
                </div>
              </div>

              {/* Lines Overview */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-600 dark:text-zinc-400">البنود المشمولة بالمرتجع:</div>
                <div className="p-3 bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800 divide-y divide-slate-200 dark:divide-zinc-850">
                  {activeSelectedItems.map((it) => (
                    <div key={it.item_id} className="py-2 first:pt-0 last:pb-0 flex justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white">{it.item_name}</span>
                        <span className="text-slate-500 dark:text-zinc-500 mr-2 font-mono">({it.quantity} قطعة × {formatCurrency(it.unit_price)})</span>
                      </div>
                      <FitNumber value={it.quantity * it.unit_price} currency className="font-bold text-amber-600 dark:text-amber-400" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Total & Confirmation */}
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-700 dark:text-zinc-300">صافي قيمة المرتجع الإجمالية:</span>
                  <div className="text-xl font-black text-amber-600 dark:text-amber-400">
                    {formatCurrency(totalReturnAmount)}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={() => setStep(3)}>
                    تعديل
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSubmitReturn}
                    className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold px-6 shadow-lg shadow-amber-500/20"
                  >
                    تأكيد وحفظ المرتجع
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Returns History Log (سجل المرتجعات) */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'log' && (
        <div className="space-y-4">
          <Card className="p-4 bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  placeholder="ابحث برقم المرتجع، اسم العميل، أو المورد..."
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl pr-9 pl-4 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={logTypeFilter}
                  onChange={(e) => setLogTypeFilter(e.target.value as any)}
                  className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-200 focus:border-amber-500 font-bold"
                >
                  <option value="all">كل المرتجعات</option>
                  <option value="sale_return">مرتجع مبيعات</option>
                  <option value="purchase_return">مرتجع مشتريات</option>
                </select>

                <Button
                  variant="outline"
                  onClick={handleExportReturnsCSV}
                  className="text-xs flex items-center gap-1.5 shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  تصدير CSV
                </Button>
              </div>
            </div>

            {/* Returns Table & Mobile Cards */}
            {/* Mobile Cards (No horizontal scroll) */}
            <div className="block sm:hidden divide-y divide-slate-200 dark:divide-zinc-800">
              {returns
                .filter((r) => {
                  if (logTypeFilter !== 'all' && r.return_type !== logTypeFilter) return false;
                  if (logSearchQuery.trim()) {
                    const q = logSearchQuery.trim().toLowerCase();
                    return (
                      r.return_number.toLowerCase().includes(q) ||
                      r.party_name.toLowerCase().includes(q) ||
                      (r.original_doc_number && r.original_doc_number.toLowerCase().includes(q))
                    );
                  }
                  return true;
                })
                .map((rec) => {
                  const isCancelled = rec.status === 'cancelled';
                  return (
                    <div key={rec.id} className={`p-3.5 space-y-2.5 ${isCancelled ? 'opacity-50 line-through' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-xs">
                            #{rec.return_number}
                          </span>
                          <Badge variant={rec.return_type === 'sale_return' ? 'amber' : 'blue'}>
                            {rec.return_type === 'sale_return' ? 'مبيعات' : 'مشتريات'}
                          </Badge>
                        </div>
                        <Badge variant={isCancelled ? 'rose' : 'emerald'}>
                          {isCancelled ? 'ملغي' : 'مكتمل'}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {rec.party_name}
                        </span>
                        <span className="text-base font-black font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                          <FitNumber value={rec.total_amount} currency />
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                        <span>{rec.date} · {rec.lines.length} صنف</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handlePrintReturn(rec)}
                            title="طباعة إيصال المرتجع"
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white cursor-pointer"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setSelectedReturnForDetails(rec)}
                            title="عرض التفاصيل"
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white cursor-pointer"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          {!isCancelled && currentUser.role === 'admin' && (
                            <button
                              onClick={() => setReturnToCancel(rec)}
                              title="إلغاء المرتجع"
                              className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-500 dark:text-red-400 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-right text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 font-bold bg-slate-50 dark:bg-zinc-950/50">
                    <th className="py-2.5 pr-2">رقم المرتجع</th>
                    <th className="py-2.5">النوع</th>
                    <th className="py-2.5">الطرف</th>
                    <th className="py-2.5">التاريخ</th>
                    <th className="py-2.5 text-center">البنود</th>
                    <th className="py-2.5 text-center">الإجمالي</th>
                    <th className="py-2.5 text-center">الحالة</th>
                    <th className="py-2.5 pl-2 text-left">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60">
                  {returns
                    .filter((r) => {
                      if (logTypeFilter !== 'all' && r.return_type !== logTypeFilter) return false;
                      if (logSearchQuery.trim()) {
                        const q = logSearchQuery.trim().toLowerCase();
                        return (
                          r.return_number.toLowerCase().includes(q) ||
                          r.party_name.toLowerCase().includes(q) ||
                          (r.original_doc_number && r.original_doc_number.toLowerCase().includes(q))
                        );
                      }
                      return true;
                    })
                    .map((rec) => {
                      const isCancelled = rec.status === 'cancelled';
                      return (
                        <tr key={rec.id} className={`transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800/40 ${isCancelled ? 'opacity-50 line-through' : ''}`}>
                          <td className="py-3 pr-2 font-mono font-bold text-amber-600 dark:text-amber-400">{rec.return_number}</td>
                          <td className="py-3">
                            <Badge variant={rec.return_type === 'sale_return' ? 'amber' : 'blue'}>
                              {rec.return_type === 'sale_return' ? 'مبيعات' : 'مشتريات'}
                            </Badge>
                          </td>
                          <td className="py-3 font-bold text-slate-900 dark:text-white wrap-text min-w-0">{rec.party_name}</td>
                          <td className="py-3 text-slate-500 dark:text-zinc-400 text-xs">{rec.date}</td>
                          <td className="py-3 text-center font-mono text-slate-700 dark:text-zinc-300">{rec.lines.length}</td>
                          <td className="py-3 text-center font-bold text-slate-900 dark:text-zinc-100 font-mono">
                            <FitNumber value={rec.total_amount} currency />
                          </td>
                          <td className="py-3 text-center">
                            <Badge variant={isCancelled ? 'rose' : 'emerald'}>
                              {isCancelled ? 'ملغي' : 'مكتمل'}
                            </Badge>
                          </td>
                          <td className="py-3 pl-2 text-left">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handlePrintReturn(rec)}
                                title="طباعة إيصال المرتجع"
                                className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white cursor-pointer"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setSelectedReturnForDetails(rec)}
                                title="عرض التفاصيل"
                                className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white cursor-pointer"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                              {!isCancelled && currentUser.role === 'admin' && (
                                <button
                                  onClick={() => setReturnToCancel(rec)}
                                  title="إلغاء المرتجع وعكس الحركات"
                                  className="p-1.5 rounded hover:bg-red-500/20 text-red-500 dark:text-red-400 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>

              {returns.length === 0 && (
                <div className="p-12 text-center text-slate-400 dark:text-zinc-500 text-sm">
                  لا توجد أي مرتجعات مسجلة في النظام حتى الآن
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Details Modal */}
      {selectedReturnForDetails && (
        <Modal
          isOpen={Boolean(selectedReturnForDetails)}
          onClose={() => setSelectedReturnForDetails(null)}
          title={`تفاصيل المرتجع: ${selectedReturnForDetails.return_number}`}
        >
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs p-3 bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800">
              <div>
                <span className="text-slate-500 dark:text-zinc-500">الطرف:</span>{' '}
                <span className="font-bold text-slate-900 dark:text-white">{selectedReturnForDetails.party_name}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-zinc-500">التاريخ:</span>{' '}
                <span className="text-slate-700 dark:text-zinc-300">{selectedReturnForDetails.date}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-zinc-500">الفاتورة الأصلية:</span>{' '}
                <span className="text-amber-600 dark:text-amber-400 font-mono font-bold">
                  {selectedReturnForDetails.original_doc_number || 'بدون فاتورة أصلية'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-zinc-500">المسؤول:</span>{' '}
                <span className="text-slate-700 dark:text-zinc-300">{selectedReturnForDetails.created_by}</span>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 dark:bg-zinc-950 text-slate-700 dark:text-zinc-400 font-bold">
                  <tr>
                    <th className="p-2">الصنف</th>
                    <th className="p-2 text-center">الكمية</th>
                    <th className="p-2 text-center">سعر الوحدة</th>
                    <th className="p-2 text-left">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                  {selectedReturnForDetails.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="p-2 text-slate-900 dark:text-white">{l.item_name}</td>
                      <td className="p-2 text-center font-mono text-slate-800 dark:text-zinc-200">{l.quantity}</td>
                      <td className="p-2 text-center font-mono text-slate-800 dark:text-zinc-200">{formatCurrency(l.unit_price)}</td>
                      <td className="p-2 text-left font-bold text-amber-600 dark:text-amber-400">{formatCurrency(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-zinc-400">إجمالي المرتجع:</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">{formatCurrency(selectedReturnForDetails.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">مسترد نقداً:</span>
                <span className="text-emerald-400 font-mono">{formatCurrency(selectedReturnForDetails.refunded_cash)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">مقيد بالحساب:</span>
                <span className="text-blue-400 font-mono">{formatCurrency(selectedReturnForDetails.credited_to_account)}</span>
              </div>
              {selectedReturnForDetails.notes && (
                <div className="pt-2 border-t border-zinc-800/80 text-zinc-400">
                  <span className="font-bold text-zinc-300">البيان:</span> {selectedReturnForDetails.notes}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSelectedReturnForDetails(null)}>
                إغلاق
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  handlePrintReturn(selectedReturnForDetails);
                  setSelectedReturnForDetails(null);
                }}
                className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold"
              >
                <Printer className="w-4 h-4 mr-1" />
                طباعة الإيصال
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Cancel Return Modal */}
      {returnToCancel && (
        <Modal
          isOpen={Boolean(returnToCancel)}
          onClose={() => setReturnToCancel(null)}
          title={`إلغاء المرتجع: ${returnToCancel.return_number}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-red-200 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                تنبيه أمان للمدير:
              </div>
              <div>
                إلغاء المرتجع سيقوم آلياً بعكس كافة الحركات المخزنية والنقدية وحساب الطرف بدقة لتعود الأرصدة كما كانت قبل المرتجع.
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1">
                سبب الإلغاء (إجباري للتسجيل في سجل التدقيق)
              </label>
              <input
                type="text"
                value={cancelReasonText}
                onChange={(e) => setCancelReasonText(e.target.value)}
                placeholder="اكتب سبب إلغاء هذا المرتجع..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-sm text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setReturnToCancel(null)}>
                تراجع
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmCancelReturn}
                className="bg-red-600 hover:bg-red-500 text-white font-bold"
              >
                تأكيد الإلغاء وعكس الحركات
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
