import React, { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatNumber, getTodayDate, formatDate } from '../lib/formatters';
import { storage } from '../lib/storage';
import { InvoiceLine, SalesInvoice, Item, Customer } from '../types';
import { normalizeArabicText, playBeep } from '../lib/security';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  FileText,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Calendar,
  DollarSign,
  Barcode,
  History,
  X,
  ChevronDown,
  Car,
  Package,
  Layers,
  PauseCircle,
  PlayCircle,
  HelpCircle,
  Sparkles,
  Calculator,
  UserCheck,
  Tag,
  Share2,
  Download,
  MessageCircle,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';
import { ConfirmDialog } from './ui/ConfirmDialog';

interface HeldInvoice {
  id: string;
  heldAt: string;
  customerName: string;
  customerId: string | null;
  lines: InvoiceLine[];
  paidCash: number;
  discountValue: number;
  discountType: 'fixed' | 'percentage';
  notes?: string;
  subtotal: number;
}

export const SalesInvoiceView: React.FC = () => {
  const {
    items,
    customers,
    currentUser,
    salesInvoices,
    returns,
    saveReturn,
    cancelReturn,
    treasuryBalance,
    refreshData,
    showToast,
    setPrintDoc,
    canDeleteInvoices,
    canViewCosts,
    registerSaveTrigger,
    searchFocusSignal,
    itemStockMap,
    customerBalanceMap,
    settings,
    cancelSalesInvoice,
  } = useApp();

  // History & Returns Tabs
  const [historyTab, setHistoryTab] = useState<'invoices' | 'returns'>('invoices');
  const [returnModalInvoice, setReturnModalInvoice] = useState<SalesInvoice | null>(null);
  const [returnLines, setReturnLines] = useState<
    Array<{
      itemId: string;
      itemName: string;
      itemCode: string;
      originalQty: number;
      maxReturnable: number;
      returnQty: number;
      unitPrice: number;
    }>
  >([]);
  const [refundedCash, setRefundedCash] = useState<number>(0);
  const [returnNotes, setReturnNotes] = useState<string>('');
  const [cancelReturnModalItem, setCancelReturnModalItem] = useState<any | null>(null);
  const [cancelReturnReason, setCancelReturnReason] = useState<string>('');

  // Invoice Header State
  const defaultCashId = settings.default_cash_customer_id || 'cust-4';
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(defaultCashId);
  const [customerName, setCustomerName] = useState<string>('عميل نقدي (شباك البيع)');
  const [invoiceDate, setInvoiceDate] = useState<string>(getTodayDate());
  const [notes, setNotes] = useState<string>('');
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [paidCash, setPaidCash] = useState<number>(0);
  const [extraPaidAsCredit, setExtraPaidAsCredit] = useState<boolean>(false);
  const [defaultPriceType, setDefaultPriceType] = useState<'retail' | 'wholesale'>('retail');

  // Invoice lines state
  const [lines, setLines] = useState<InvoiceLine[]>([]);

  // Barcode quick scan field
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Search State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<'all' | 'car_model' | 'brand' | 'shelf'>('all');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Held Invoices (تعليق الفواتير)
  const [heldInvoices, setHeldInvoices] = useState<HeldInvoice[]>(() => {
    try {
      const saved = localStorage.getItem('autoparts_held_sales_invoices');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isHeldModalOpen, setIsHeldModalOpen] = useState<boolean>(false);

  // Share & Export State
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [shareTargetInvoice, setShareTargetInvoice] = useState<SalesInvoice | null>(null);
  const [copiedInvoiceText, setCopiedInvoiceText] = useState<boolean>(false);

  // Invoices History / Returns Modal
  const [viewHistoryModal, setViewHistoryModal] = useState<boolean>(false);
  const [cancelModalInvoice, setCancelModalInvoice] = useState<SalesInvoice | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');

  // Duplicate Check State
  const [duplicateConfirmOpen, setDuplicateConfirmOpen] = useState<boolean>(false);
  const lastSavedRef = useRef<{ customer: string; total: number; timestamp: number } | null>(null);

  // Calculate live customer balance
  const previousBalance = useMemo(() => {
    if (!selectedCustomerId || selectedCustomerId === defaultCashId) return 0;
    return customerBalanceMap.get(selectedCustomerId) ?? 0;
  }, [selectedCustomerId, defaultCashId, customerBalanceMap]);

  // Selected customer object
  const activeCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId);
  }, [selectedCustomerId, customers]);

  // Calculations
  const subtotal = useMemo(() => {
    return lines.reduce((sum, line) => sum + (line.total || 0), 0);
  }, [lines]);

  const invoiceDiscountAmount = useMemo(() => {
    if (discountType === 'percentage') {
      return (subtotal * (discountValue || 0)) / 100;
    }
    return discountValue || 0;
  }, [subtotal, discountType, discountValue]);

  const finalTotal = useMemo(() => {
    return Math.max(0, subtotal - invoiceDiscountAmount);
  }, [subtotal, invoiceDiscountAmount]);

  const totalRequired = useMemo(() => {
    return previousBalance + finalTotal;
  }, [previousBalance, finalTotal]);

  const changeDue = useMemo(() => {
    return Math.max(0, paidCash - finalTotal);
  }, [paidCash, finalTotal]);

  const remainingDebt = useMemo(() => {
    return Math.max(0, finalTotal - paidCash);
  }, [finalTotal, paidCash]);

  const balanceAfter = useMemo(() => {
    if (extraPaidAsCredit && changeDue > 0) {
      return previousBalance - changeDue;
    }
    return previousBalance + remainingDebt;
  }, [previousBalance, remainingDebt, extraPaidAsCredit, changeDue]);

  // Validation status for invoice lines (Stock check only when negative stock is disabled)
  const lineValidationErrors = useMemo(() => {
    const errors: Array<{ lineIndex: number; itemId: string; itemName: string; type: 'stock'; message: string }> = [];

    if (!settings.allow_negative_stock) {
      lines.forEach((line, index) => {
        const item = items.find((i) => i.id === line.item_id);
        const availableStock = itemStockMap.get(line.item_id) ?? item?.initial_stock ?? 0;
        if (line.quantity > availableStock) {
          errors.push({
            lineIndex: index,
            itemId: line.item_id,
            itemName: line.item_name,
            type: 'stock',
            message: `كمية الصنف "${line.item_name}" (${line.quantity} قطعة) أكبر من الرصيد المتوفر في المخزن (${availableStock} قطعة).`,
          });
        }
      });
    }

    return errors;
  }, [lines, items, itemStockMap, settings.allow_negative_stock]);

  const hasValidationErrors = lineValidationErrors.length > 0;

  // Auto-fill paidCash for cash customer
  useEffect(() => {
    if (selectedCustomerId === defaultCashId || customerName.includes('نقدي')) {
      setPaidCash(finalTotal);
    }
  }, [finalTotal, selectedCustomerId, customerName, defaultCashId]);

  // Save held invoices to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('autoparts_held_sales_invoices', JSON.stringify(heldInvoices));
    } catch {}
  }, [heldInvoices]);

  // Shortcut listeners (F3 for item search)
  useEffect(() => {
    if (searchFocusSignal > 0) {
      setIsSearchModalOpen(true);
      setTimeout(() => searchInputRef.current?.focus(), 150);
    }
  }, [searchFocusSignal]);

  // Handle Customer Selection
  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const found = customers.find((c) => c.id === customerId);
    if (found) {
      setCustomerName(found.name);
      if (customerId === defaultCashId) {
        setPaidCash(finalTotal);
      } else {
        setPaidCash(0);
      }
    }
  };

  // Add Item to lines (Increments qty if already present)
  const handleAddItem = (item: Item, forcedPriceType?: 'retail' | 'wholesale') => {
    const priceType = forcedPriceType || defaultPriceType;
    const unitPrice = priceType === 'wholesale' ? item.wholesale_price : item.retail_price;
    const availableStock = itemStockMap.get(item.id) ?? item.initial_stock ?? 0;

    const existingIndex = lines.findIndex((l) => l.item_id === item.id);
    if (existingIndex !== -1) {
      const updated = [...lines];
      const newQty = updated[existingIndex].quantity + 1;
      if (newQty > availableStock) {
        showToast(
          'warning',
          'تحذير تجاوز المخزون',
          `الكمية المطلوبة (${newQty}) أكبر من الرصيد المتوفر بالمخزن (${availableStock}) للصنف "${item.name}". لن يمكن إتمام الفاتورة حتى ضبط الكمية.`
        );
      }
      updated[existingIndex].quantity = newQty;
      updated[existingIndex].total = newQty * updated[existingIndex].unit_price - updated[existingIndex].discount;
      setLines(updated);
    } else {
      if (1 > availableStock) {
        showToast(
          'warning',
          'تحذير تجاوز المخزون',
          `رصيد الصنف "${item.name}" الحالي بالمخزن (${availableStock}) غير كافٍ. لن يمكن إتمام الفاتورة حتى ضبط الكميات.`
        );
      }
      const newLine: InvoiceLine = {
        id: `line-${Date.now()}-${item.id}`,
        item_id: item.id,
        item_code: item.code,
        item_name: item.name,
        brand: item.brand,
        oem_number: item.oem_number,
        quantity: 1,
        unit_price: unitPrice,
        cost_price: item.cost_price,
        discount: 0,
        total: unitPrice,
      };
      setLines([...lines, newLine]);
    }

    playBeep(true);
    showToast('info', 'تمت الإضافة', `تم إضافة (${item.name})`);
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

  // Continuous Barcode Reader
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

    // Keep focus on barcode input
    setTimeout(() => barcodeRef.current?.focus(), 50);
  };

  // Stepper quantity update (+1 / -1)
  const handleQtyChange = (index: number, delta: number) => {
    const updated = [...lines];
    const current = updated[index];
    const currentQty = Number(current.quantity) || 1;
    const newQty = Math.max(1, currentQty + delta);
    const item = items.find((i) => i.id === current.item_id);
    const availableStock = itemStockMap.get(current.item_id) ?? item?.initial_stock ?? 0;
    if (!settings.allow_negative_stock && newQty > availableStock) {
      showToast(
        'warning',
        'تنبيه المخزون',
        `الكمية المطلوبة (${newQty}) أكبر من الرصيد المتوفر بالمخزن (${availableStock}) للصنف "${current.item_name}".`
      );
    }
    current.quantity = newQty;
    const price = Number(current.unit_price) || 0;
    const disc = Number(current.discount) || 0;
    current.total = Math.max(0, newQty * price - disc);
    updated[index] = current;
    setLines(updated);
  };

  // Update line details (with proper number coercion)
  const handleUpdateLine = (index: number, field: keyof InvoiceLine, value: any) => {
    const updated = [...lines];
    const line = { ...updated[index] };
    if (field === 'quantity') {
      const v = typeof value === 'string' ? (value === '' ? '' : Math.max(1, Number(value))) : Math.max(1, Number(value));
      line.quantity = v as any;
    } else if (field === 'unit_price') {
      const v = typeof value === 'string' ? (value === '' ? '' : Math.max(0, Number(value))) : Math.max(0, Number(value));
      line.unit_price = v as any;
    } else if (field === 'discount') {
      const v = typeof value === 'string' ? (value === '' ? 0 : Math.max(0, Number(value))) : Math.max(0, Number(value));
      line.discount = v as any;
    } else {
      (line as any)[field] = value;
    }

    const qty = Number(line.quantity) || 0;
    const price = Number(line.unit_price) || 0;
    const disc = Number(line.discount) || 0;
    line.total = Math.max(0, qty * price - disc);
    updated[index] = line;
    setLines(updated);
  };

  // Toggle Price Type for a line (قطاعي / جملة)
  const handleToggleLinePriceType = (index: number) => {
    const line = lines[index];
    const item = items.find((i) => i.id === line.item_id);
    if (!item) return;

    const isCurrentRetail = Number(line.unit_price) === Number(item.retail_price);
    const newPrice = isCurrentRetail ? item.wholesale_price : item.retail_price;
    handleUpdateLine(index, 'unit_price', newPrice);
  };

  // Remove Line
  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  // Generate formatted Arabic text receipt for WhatsApp / Clipboard
  const generateWhatsAppMessage = (invData?: any): string => {
    const store = settings.store_name || 'العموري لقطع غيار السيارات';
    const isSaved = Boolean(invData);
    const num = isSaved ? invData.invoice_number : 'فاتورة مبدئية';
    const date = isSaved ? formatDate(invData.invoice_date) : formatDate(invoiceDate);
    const cust = isSaved ? invData.customer_name : customerName;
    const targetLines = isSaved ? invData.lines : lines;
    const sTotal = isSaved ? invData.subtotal : subtotal;
    const dVal = isSaved ? invData.discount_value : discountValue;
    const fTotal = isSaved ? invData.final_total : finalTotal;
    const pCash = isSaved ? invData.paid_cash : paidCash;
    const rDebt = isSaved ? invData.remaining_debt : remainingDebt;

    const itemsText = targetLines
      .map(
        (l: any, i: number) =>
          `${i + 1}. ${l.item_name} ${l.brand ? `(${l.brand})` : ''}\n   الكمية: ${l.quantity} × ${formatNumber(l.unit_price)} ج.م = ${formatCurrency(l.total || l.quantity * l.unit_price)}`
      )
      .join('\n');

    return `🧾 *${store}*
📋 *فاتورة مبيعات*
🔢 رقم الفاتورة: ${num}
📅 التاريخ: ${date}
👤 العميل: ${cust}
--------------------------------
${itemsText}
--------------------------------
💰 الإجمالي: ${formatCurrency(sTotal)}
${dVal > 0 ? `🔻 الخصم: -${formatCurrency(dVal)}\n` : ''}💵 صافي الفاتورة: ${formatCurrency(fTotal)}
💳 المدفوع نقداً: ${formatCurrency(pCash)}
${rDebt > 0 ? `⚠️ المتبقي آجل: ${formatCurrency(rDebt)}\n` : ''}--------------------------------
${settings.phone ? `📞 خدمة العملاء: ${settings.phone}\n` : ''}${settings.address ? `📍 العنوان: ${settings.address}\n` : ''}شكراً لتعاملكم معنا!`;
  };

  // Share via WhatsApp
  const handleShareWhatsApp = (invData?: any) => {
    const text = generateWhatsAppMessage(invData);
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  // Share via Native Share or copy
  const handleShareNative = async (invData?: any) => {
    const text = generateWhatsAppMessage(invData);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `فاتورة مبيعات - ${settings.store_name || 'العموري'}`,
          text,
        });
        return;
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          // fallback to clipboard
        }
      }
    }
    navigator.clipboard.writeText(text);
    setCopiedInvoiceText(true);
    showToast('success', 'تم النسخ', 'تم نسخ تفاصيل الفاتورة للحافظة للمشاركة');
    setTimeout(() => setCopiedInvoiceText(false), 2500);
  };

  // Download standalone printable HTML file
  const handleDownloadInvoiceHtml = (invData?: any) => {
    const isSaved = Boolean(invData);
    const num = isSaved ? invData.invoice_number : `INV-${Date.now()}`;
    const date = isSaved ? formatDate(invData.invoice_date) : formatDate(invoiceDate);
    const cust = isSaved ? invData.customer_name : customerName;
    const targetLines = isSaved ? invData.lines : lines;
    const sTotal = isSaved ? invData.subtotal : subtotal;
    const dVal = isSaved ? invData.discount_value : discountValue;
    const fTotal = isSaved ? invData.final_total : finalTotal;
    const pCash = isSaved ? invData.paid_cash : paidCash;
    const rDebt = isSaved ? invData.remaining_debt : remainingDebt;
    const prevBal = isSaved ? (invData.previous_balance || 0) : previousBalance;
    const balAfter = isSaved ? (invData.balance_after || 0) : balanceAfter;

    const rowsHtml = targetLines
      .map(
        (l: any, i: number) => `
      <tr>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold; text-align: center;">${i + 1}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0;">
          <div style="font-weight: 800; font-size: 14px; color: #0f172a;">${l.item_name}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
            ${l.brand ? `<span style="margin-left: 8px;">ماركة: ${l.brand}</span>` : ''}
            ${l.part_number || l.oem_number ? `<span style="font-family: monospace; color: #0284c7;">OEM: ${l.part_number || l.oem_number}</span>` : ''}
          </div>
        </td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-size: 14px; font-weight: bold;">${l.quantity}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-size: 13px;">${formatNumber(l.unit_price)} ج.م</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; font-family: monospace; font-weight: 900; font-size: 14px; color: #16a34a;">${formatCurrency(l.total || l.quantity * l.unit_price)}</td>
      </tr>`
      )
      .join('');

    const htmlDoc = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>فاتورة مبيعات - ${num}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; font-family: 'Cairo', Arial, sans-serif; }
    body { background: #f8fafc; margin: 0; padding: 24px; color: #0f172a; direction: rtl; }
    .invoice-card { max-width: 820px; margin: 0 auto; background: #fff; padding: 36px; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 24px; gap: 16px; }
    .title { font-size: 22px; font-weight: 900; color: #0f172a; margin: 0; }
    .subtitle { font-size: 12px; color: #64748b; margin-top: 3px; }
    .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px 18px; border-radius: 14px; font-size: 12px; min-width: 250px; }
    .meta-row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
    .meta-row:last-child { margin-bottom: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
    th { background: #f8fafc; padding: 12px 8px; font-weight: 800; text-align: right; border-bottom: 2px solid #cbd5e1; color: #475569; }
    .totals-area { display: flex; justify-content: flex-end; margin-top: 24px; }
    .totals-table { width: 340px; font-size: 13px; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #e2e8f0; }
    .totals-row.final { font-size: 17px; font-weight: 900; color: #d97706; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; padding: 12px 0; margin-top: 8px; }
    .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 36px; border-top: 1px solid #f1f5f9; padding-top: 16px; }
    @media print {
      body { background: #fff; padding: 0; }
      .invoice-card { box-shadow: none; border: none; max-width: 100%; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="invoice-card">
    <div class="header">
      <div>
        <h1 class="title">${settings.store_name || 'العموري لقطع غيار السيارات'}</h1>
        <div class="subtitle">تويوتا · هيونداي · كيا · ميتسوبيشي · نيسان</div>
        ${settings.phone ? `<div class="subtitle">هاتف: ${settings.phone}</div>` : ''}
        ${settings.address ? `<div class="subtitle">${settings.address}</div>` : ''}
      </div>
      <div class="meta-box">
        <div class="meta-row"><span>رقم الفاتورة:</span> <strong>${num}</strong></div>
        <div class="meta-row"><span>التاريخ:</span> <strong>${date}</strong></div>
        <div class="meta-row"><span>العميل:</span> <strong>${cust}</strong></div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 45px; text-align: center;">#</th>
          <th>الصنف والبيان</th>
          <th style="text-align: center; width: 85px;">الكمية</th>
          <th style="text-align: center; width: 120px;">السعر</th>
          <th style="text-align: left; width: 130px;">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="totals-area">
      <div class="totals-table">
        <div class="totals-row"><span>إجمالي الأصناف:</span> <strong>${formatCurrency(sTotal)}</strong></div>
        ${dVal > 0 ? `<div class="totals-row" style="color: #dc2626;"><span>الخصم:</span> <strong>-${formatCurrency(dVal)}</strong></div>` : ''}
        <div class="totals-row final"><span>صافي الفاتورة:</span> <span>${formatCurrency(fTotal)}</span></div>
        <div class="totals-row"><span>المدفوع نقداً:</span> <strong style="color: #16a34a;">${formatCurrency(pCash)}</strong></div>
        ${rDebt > 0 ? `<div class="totals-row" style="color: #dc2626;"><span>المتبقي آجل:</span> <strong>${formatCurrency(rDebt)}</strong></div>` : ''}
        ${prevBal ? `<div class="totals-row"><span>حساب سابق:</span> <strong>${formatCurrency(prevBal)}</strong></div>` : ''}
        ${balAfter !== undefined ? `<div class="totals-row" style="font-weight: 800;"><span>الرصيد بعد الفاتورة:</span> <strong>${formatCurrency(balAfter)}</strong></div>` : ''}
      </div>
    </div>

    <div class="footer">
      <p>البضاعة المباعة ترد أو تستبدل خلال 14 يوماً بحالتها الأصلية مع أصل الفاتورة.</p>
      <p><strong>شكراً لتعاملكم مع العموري لقطع الغيار</strong></p>
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `فاتورة_${num}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('success', 'تم التنزيل', 'تم تنزيل الفاتورة بنجاح كملف HTML للطباعة والحفظ');
  };

  // Hold Current Invoice
  const handleHoldInvoice = () => {
    if (lines.length === 0) {
      showToast('warning', 'فاتورة فارغة', 'لا توجد بنود لتعليقها');
      return;
    }

    const newHold: HeldInvoice = {
      id: `hold-${Date.now()}`,
      heldAt: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      customerName,
      customerId: selectedCustomerId,
      lines,
      paidCash,
      discountValue,
      discountType,
      notes,
      subtotal,
    };

    setHeldInvoices([newHold, ...heldInvoices]);
    // Reset form
    setLines([]);
    setDiscountValue(0);
    setNotes('');
    setPaidCash(0);
    setSelectedCustomerId(defaultCashId);
    setCustomerName('عميل نقدي (شباك البيع)');
    showToast('success', 'تم تعليق الفاتورة', 'يمكنك استدعاؤها في أي وقت من زر الفواتير المعلقة');
  };

  // Restore Held Invoice
  const handleRestoreHeld = (held: HeldInvoice) => {
    setLines(held.lines);
    setSelectedCustomerId(held.customerId || defaultCashId);
    setCustomerName(held.customerName);
    setPaidCash(held.paidCash);
    setDiscountValue(held.discountValue);
    setDiscountType(held.discountType);
    setNotes(held.notes || '');
    setHeldInvoices(heldInvoices.filter((h) => h.id !== held.id));
    setIsHeldModalOpen(false);
    showToast('info', 'تم استدعاء الفاتورة', `استعادة فاتورة: ${held.customerName}`);
  };

  // Save Sales Invoice Execution
  const executeSave = (andPrint: boolean = false) => {
    try {
      const isCash = selectedCustomerId === defaultCashId || customerName.includes('نقدي');

      // Ensure clean finite numbers for all lines
      const cleanLines = lines.map((l) => ({
        ...l,
        quantity: Math.max(1, Number(l.quantity) || 1),
        unit_price: Math.max(0, Number(l.unit_price) || 0),
        discount: Math.max(0, Number(l.discount) || 0),
        total: Math.max(0, (Math.max(1, Number(l.quantity) || 1) * Math.max(0, Number(l.unit_price) || 0)) - Math.max(0, Number(l.discount) || 0)),
      }));

      const cleanSubtotal = cleanLines.reduce((acc, l) => acc + l.total, 0);
      let cleanFinal = cleanSubtotal;
      if (discountType === 'percentage') {
        cleanFinal = cleanSubtotal * (1 - (discountValue || 0) / 100);
      } else {
        cleanFinal = cleanSubtotal - (discountValue || 0);
      }

      const saved = storage.saveSalesInvoice(
        {
          customer_id: isCash ? null : selectedCustomerId,
          customer_name: customerName,
          invoice_date: invoiceDate,
          lines: cleanLines,
          subtotal: cleanSubtotal,
          discount_type: discountType,
          discount_value: discountValue,
          final_total: cleanFinal,
          paid_cash: isCash ? cleanFinal : paidCash,
          notes,
          extra_paid_as_credit: extraPaidAsCredit,
        },
        currentUser
      );

      // Record for duplicate detection
      lastSavedRef.current = {
        customer: customerName,
        total: cleanFinal,
        timestamp: Date.now(),
      };

      refreshData();
      showToast('success', 'تم حفظ الفاتورة بنجاح', `رقم الفاتورة: ${saved.invoice_number}`);

      if (andPrint) {
        setPrintDoc({
          type: 'sales_invoice',
          data: saved,
          format: 'thermal',
        });
      }

      // Reset
      setLines([]);
      setDiscountValue(0);
      setNotes('');
      setPaidCash(0);
      setExtraPaidAsCredit(false);
      setSelectedCustomerId(defaultCashId);
      setCustomerName('عميل نقدي (شباك البيع)');
    } catch (e: any) {
      showToast('error', 'تعذر حفظ الفاتورة', e.message || 'حدث خطأ غير متوقع');
    }
  };

  // Pre-save validations & duplicate check
  const handleSaveInvoice = (andPrint: boolean = false) => {
    if (lines.length === 0) {
      showToast('error', 'فاتورة فارغة', 'يرجى إضافة صنف واحد على الأقل قبل الحفظ');
      return;
    }

    // Stock check only when negative stock is disallowed
    if (!settings.allow_negative_stock) {
      for (const line of lines) {
        const item = items.find((i) => i.id === line.item_id);
        const availableStock = itemStockMap.get(line.item_id) ?? item?.initial_stock ?? 0;
        if (Number(line.quantity) > availableStock) {
          showToast(
            'error',
            'تحذير مخزون: كمية غير متوفرة',
            `كمية الصنف "${line.item_name}" المطلوبة (${line.quantity}) أكبر من الرصيد المتوفر في المخزن (${availableStock}).`
          );
          return;
        }
      }
    }

    // Check duplicate within 2 minutes
    if (lastSavedRef.current) {
      const timeDiff = Date.now() - lastSavedRef.current.timestamp;
      if (
        timeDiff < 120000 &&
        lastSavedRef.current.customer === customerName &&
        lastSavedRef.current.total === finalTotal
      ) {
        setDuplicateConfirmOpen(true);
        return;
      }
    }

    executeSave(andPrint);
  };

  // Register Global F2 Shortcut
  useEffect(() => {
    return registerSaveTrigger(() => {
      handleSaveInvoice(false);
    });
  }, [
    lines,
    selectedCustomerId,
    customerName,
    paidCash,
    discountValue,
    discountType,
    notes,
    finalTotal,
    extraPaidAsCredit,
  ]);

  // Cancel Invoice (Void)
  const handleConfirmCancelInvoice = () => {
    if (!cancelModalInvoice) return;
    if (!cancelReason.trim()) {
      showToast('error', 'تنبيه', 'يرجى كتابة سبب الإلغاء');
      return;
    }

    const success = cancelSalesInvoice(cancelModalInvoice.id, cancelReason);
    if (success) {
      setCancelModalInvoice(null);
      setCancelReason('');
    }
  };

  // Open Return Modal for an Invoice
  const handleOpenReturnModal = (inv: SalesInvoice) => {
    if (inv.status === 'cancelled') {
      showToast('error', 'فاتورة ملغاة', 'لا يمكن عمل مرتجع على فاتورة مبيعات ملغاة.');
      return;
    }

    // Previous active returns on this invoice
    const prevReturns = returns.filter(
      (r) => (r.original_doc_id === inv.id || r.original_doc_number === inv.invoice_number) && r.status !== 'cancelled'
    );
    const returnedQtyMap = new Map<string, number>();
    prevReturns.forEach((pr) => {
      pr.lines.forEach((l) => {
        returnedQtyMap.set(l.item_id, (returnedQtyMap.get(l.item_id) || 0) + l.quantity);
      });
    });

    const linesData = inv.lines.map((l) => {
      const prevQty = returnedQtyMap.get(l.item_id) || 0;
      const maxRet = Math.max(0, l.quantity - prevQty);
      return {
        itemId: l.item_id,
        itemName: l.item_name,
        itemCode: l.item_code,
        originalQty: l.quantity,
        maxReturnable: maxRet,
        returnQty: 0,
        unitPrice: l.unit_price,
      };
    });

    const hasReturnable = linesData.some((l) => l.maxReturnable > 0);
    if (!hasReturnable) {
      showToast('warning', 'الكميات مسترجعة بالكامل', 'تم عمل مرتجع لكافة كميات أصناف هذه الفاتورة مسبقاً.');
      return;
    }

    setReturnModalInvoice(inv);
    setReturnLines(linesData);
    setRefundedCash(0);
    setReturnNotes('');
  };

  // Submit Return Record
  const handleSubmitReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnModalInvoice) return;

    const itemsToReturn = returnLines.filter((l) => l.returnQty > 0);
    if (itemsToReturn.length === 0) {
      showToast('error', 'بيانات ناقصة', 'يرجى تحديد كمية صنف واحد على الأقل للإرجاع');
      return;
    }

    for (const line of itemsToReturn) {
      if (line.returnQty > line.maxReturnable) {
        showToast(
          'error',
          'كمية غير صالحة',
          `الكمية المرتجعة من "${line.itemName}" تتجاوز المتبقي المتاح للإرجاع (${line.maxReturnable})`
        );
        return;
      }
    }

    const totalReturnAmount = itemsToReturn.reduce((sum, l) => sum + l.returnQty * l.unitPrice, 0);
    const isCashCustomer = !returnModalInvoice.customer_id || returnModalInvoice.customer_id === defaultCashId;

    let cashRefund = Number(refundedCash) || 0;
    let creditRefund = totalReturnAmount - cashRefund;

    if (isCashCustomer) {
      // Cash customer must receive 100% cash refund
      cashRefund = totalReturnAmount;
      creditRefund = 0;
    }

    if (cashRefund > returnModalInvoice.paid_cash) {
      showToast(
        'error',
        'مبلغ الكاش كبير',
        `المبلغ المسترد نقداً (${cashRefund} ج.م) لا يمكن أن يتجاوز المدفوع نقداً في الفاتورة الأصلية (${returnModalInvoice.paid_cash} ج.م).`
      );
      return;
    }

    if (cashRefund > treasuryBalance) {
      showToast(
        'error',
        'عجز بالخزينة',
        `رصيد الخزينة الحالي (${treasuryBalance} ج.م) لا يكفي لرد المبلغ المطلوب نقداً (${cashRefund} ج.م).`
      );
      return;
    }

    try {
      saveReturn({
        return_type: 'sale_return',
        original_doc_id: returnModalInvoice.id,
        original_doc_number: returnModalInvoice.invoice_number,
        party_id: returnModalInvoice.customer_id || undefined,
        party_name: returnModalInvoice.customer_name,
        date: getTodayDate(),
        lines: itemsToReturn.map((l) => ({
          item_id: l.itemId,
          item_code: l.itemCode,
          item_name: l.itemName,
          quantity: l.returnQty,
          unit_price: l.unitPrice,
          total: l.returnQty * l.unitPrice,
        })),
        total_amount: totalReturnAmount,
        refunded_cash: cashRefund,
        credited_to_account: creditRefund,
        notes: returnNotes || `مرتجع مبيعات على فاتورة ${returnModalInvoice.invoice_number}`,
      });

      setReturnModalInvoice(null);
      refreshData();
    } catch (err: any) {
      // toast shown by saveReturn
    }
  };

  // Confirm Cancel Return
  const handleConfirmCancelReturn = () => {
    if (!cancelReturnModalItem) return;
    if (!cancelReturnReason.trim()) {
      showToast('error', 'تنبيه', 'يرجى كتابة سبب صريح لإلغاء المرتجع');
      return;
    }

    const success = cancelReturn(cancelReturnModalItem.id, cancelReturnReason);
    if (success) {
      setCancelReturnModalItem(null);
      setCancelReturnReason('');
      refreshData();
    }
  };

  // Precomputed search index for sales invoice item search modal
  const salesSearchIndex = useMemo(() => {
    return items.map((item) => ({
      item,
      searchToken: normalizeArabicText(
        `${item.name} ${item.code} ${item.barcode || ''} ${item.oem_number || ''} ${item.car_model || ''} ${item.brand || ''} ${item.shelf_location || ''}`
      ),
      carToken: normalizeArabicText(item.car_model || ''),
      brandToken: normalizeArabicText(item.brand || ''),
      shelfToken: normalizeArabicText(item.shelf_location || ''),
    }));
  }, [items]);

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const normalizedQuery = useMemo(() => normalizeArabicText(deferredSearchTerm), [deferredSearchTerm]);

  const searchResults = useMemo(() => {
    if (!normalizedQuery) {
      return items.slice(0, 30);
    }
    const results: Item[] = [];
    for (let i = 0; i < salesSearchIndex.length; i++) {
      const entry = salesSearchIndex[i];
      let matches = false;
      if (searchFilter === 'car_model') {
        matches = entry.carToken.includes(normalizedQuery);
      } else if (searchFilter === 'brand') {
        matches = entry.brandToken.includes(normalizedQuery);
      } else if (searchFilter === 'shelf') {
        matches = entry.shelfToken.includes(normalizedQuery);
      } else {
        matches = entry.searchToken.includes(normalizedQuery);
      }

      if (matches) {
        results.push(entry.item);
        if (results.length >= 40) break; // Fast cut-off for instant render
      }
    }
    return results;
  }, [salesSearchIndex, normalizedQuery, searchFilter, items]);

  return (
    <div className="p-3 sm:p-5 w-full max-w-full 2xl:max-w-[1920px] mx-auto space-y-5 pb-32 md:pb-12 text-slate-900 dark:text-zinc-100 transition-colors">
      {/* ========================================================================= */}
      {/* 1. TOP TOOLBAR: Quick Barcode, Actions (Share, Download, History, Held)   */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 p-3 sm:p-4 rounded-3xl shadow-sm">
        {/* Fast Barcode Input (Auto-refocusing) */}
        <form onSubmit={handleBarcodeSubmit} className="flex-1 max-w-lg relative">
          <div className="relative flex items-center">
            <Barcode className="w-5 h-5 absolute start-3 text-amber-500 pointer-events-none" />
            <input
              ref={barcodeRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="امسح الباركود أو اكتب الكود ثم اضغط Enter..."
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700/80 hover:border-amber-500/50 rounded-2xl ps-10 pe-24 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-mono tracking-wide transition-all"
            />
            <button
              type="submit"
              className="absolute end-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-zinc-950 text-xs font-black rounded-xl transition-all shadow-xs cursor-pointer active:scale-95"
            >
              إضافة
            </button>
          </div>
        </form>

        {/* Action Buttons Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Download Invoice HTML / PDF */}
          <button
            type="button"
            onClick={() => handleDownloadInvoiceHtml()}
            disabled={lines.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-400 border border-sky-500/30 text-xs font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
            title="تنزيل الفاتورة كملف للطباعة والحفظ"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">تنزيل</span>
          </button>

          {/* Invoices History */}
          <button
            type="button"
            onClick={() => setViewHistoryModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer"
            title="عرض فواتير المبيعات السابقة والطباعة والمرتجع"
          >
            <History className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span className="hidden sm:inline">سجل الفواتير</span>
          </button>

          {/* Held invoices button */}
          <button
            type="button"
            onClick={() => setIsHeldModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer relative"
          >
            <PauseCircle className="w-4 h-4 text-amber-500" />
            <span>معلقة</span>
            {heldInvoices.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-zinc-950 font-black text-[10px] flex items-center justify-center">
                {heldInvoices.length}
              </span>
            )}
          </button>

          {/* Hold current invoice */}
          <button
            type="button"
            onClick={handleHoldInvoice}
            disabled={lines.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-bold border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="تعليق هذه الفاتورة مؤقتاً لخدمة زبون آخر"
          >
            <PauseCircle className="w-4 h-4 text-zinc-400" />
            <span className="hidden md:inline">تعليق الحالية</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. CUSTOMER & FINANCIAL SUMMARY STRIP (Spacious & Clean Layout)           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Customer Selector Card */}
        <Card className="lg:col-span-2 space-y-3.5 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 block mb-1.5">
                العميل:
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-2xl px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all cursor-pointer"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.id !== defaultCashId && c.current_balance ? `(${formatCurrency(c.current_balance)})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
              <div>
                <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 block mb-1.5">
                  التاريخ:
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-2xl px-2.5 sm:px-3 py-2 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 block mb-1.5">
                  نوع التسعير:
                </label>
                <div className="flex bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setDefaultPriceType('retail')}
                    className={`flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      defaultPriceType === 'retail'
                        ? 'bg-amber-500 text-zinc-950 shadow-xs font-black'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    قطاعي
                  </button>
                  <button
                    type="button"
                    onClick={() => setDefaultPriceType('wholesale')}
                    className={`flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      defaultPriceType === 'wholesale'
                        ? 'bg-amber-500 text-zinc-950 shadow-xs font-black'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    جملة
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Customer Credit Limit & Notes Banner */}
          {activeCustomer && selectedCustomerId !== defaultCashId && (
            <div className="flex flex-wrap items-center justify-between text-xs pt-3 border-t border-zinc-200 dark:border-zinc-800 gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-zinc-500 dark:text-zinc-400">الهاتف: <strong className="text-zinc-900 dark:text-zinc-200 font-mono">{activeCustomer.phone || '-'}</strong></span>
                <span className="text-zinc-500 dark:text-zinc-400">العنوان: <strong className="text-zinc-900 dark:text-zinc-200">{activeCustomer.address || '-'}</strong></span>
              </div>
              {activeCustomer.credit_limit && activeCustomer.credit_limit > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500 dark:text-zinc-400">الحد الائتماني:</span>
                  <span className={`font-black font-mono ${balanceAfter > activeCustomer.credit_limit ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {formatCurrency(activeCustomer.credit_limit)}
                  </span>
                  {balanceAfter > activeCustomer.credit_limit && (
                    <Badge variant="rose" size="sm">تجاوز الحد</Badge>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Compact 3-Box Financial Summary Card */}
        <Card className="flex flex-col justify-center p-4 sm:p-5">
          <div className="grid grid-cols-3 gap-2 text-center divide-x divide-x-reverse divide-zinc-200 dark:divide-zinc-800">
            <div className="p-1">
              <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 block mb-1">حساب سابق</span>
              <span className={`text-sm sm:text-base font-black font-mono tabular-nums ${previousBalance > 0 ? 'text-rose-600 dark:text-rose-400' : previousBalance < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                {formatCurrency(previousBalance)}
              </span>
            </div>
            <div className="p-1">
              <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 block mb-1">قيمة الفاتورة</span>
              <span className="text-sm sm:text-base font-black font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                {formatCurrency(finalTotal)}
              </span>
            </div>
            <div className="p-1">
              <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 block mb-1">الإجمالي المطلوب</span>
              <span className="text-sm sm:text-base font-black font-mono text-cyan-600 dark:text-cyan-400 tabular-nums">
                {formatCurrency(totalRequired)}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* ========================================================================= */}
      {/* 3. BIG "ADD ITEM" TOUCH BUTTON                                            */}
      {/* ========================================================================= */}
      <Button
        variant="primary"
        size="lg"
        icon={<Plus className="w-5 h-5" />}
        onClick={() => setIsSearchModalOpen(true)}
        className="w-full shadow-md shadow-amber-500/10 font-black text-base py-3 sm:py-3.5 cursor-pointer rounded-2xl"
      >
        إضافة صنف من القائمة (F3)
      </Button>

      {/* ========================================================================= */}
      {/* 4. INVOICE LINES: Spacious Professional Cards with zero overlap           */}
      {/* ========================================================================= */}
      {lines.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-zinc-300 dark:border-zinc-800 rounded-3xl bg-zinc-50 dark:bg-zinc-900/40">
          <Package className="w-14 h-14 text-zinc-400 dark:text-zinc-600 mb-3" />
          <h4 className="text-base font-black text-zinc-800 dark:text-zinc-200 mb-1">الفاتورة فارغة</h4>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mb-4 leading-relaxed">
            امسح الباركود سريعاً من الشريط العلوي، أو اضغط زر "إضافة صنف" للبحث بالاسم أو الكود.
          </p>
          <Button variant="secondary" size="md" onClick={() => setIsSearchModalOpen(true)}>
            فتح شاشة البحث
          </Button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {lines.map((line, index) => {
            const originalItem = items.find((i) => i.id === line.item_id);
            const isWholesale = originalItem && line.unit_price === originalItem.wholesale_price;
            const availableStock = itemStockMap.get(line.item_id) ?? originalItem?.initial_stock ?? 0;
            const isStockExceeded = !settings.allow_negative_stock && line.quantity > availableStock;

            const officialRetail = Number(originalItem?.retail_price) || 0;
            const officialWholesale = Number(originalItem?.wholesale_price) || 0;
            const linePrice = Number(line.unit_price) || 0;
            const isCustomPrice = originalItem && (
              (officialRetail > 0 && Math.abs(linePrice - officialRetail) > 0.01) &&
              (officialWholesale > 0 && Math.abs(linePrice - officialWholesale) > 0.01)
            );

            return (
              <div
                key={line.id}
                className={`border rounded-3xl p-4 sm:p-5 shadow-sm space-y-3.5 transition-all ${
                  isStockExceeded
                    ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-300 dark:border-rose-700/80 shadow-rose-950/10'
                    : 'bg-white dark:bg-zinc-900/90 border-zinc-200 dark:border-zinc-800/80 hover:border-amber-500/50'
                }`}
              >
                {/* Line Top: Item Title, Badges, and Remove button */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>
                      <h4 className="text-base sm:text-lg font-black text-zinc-900 dark:text-white wrap-text leading-relaxed">
                        {line.item_name}
                      </h4>
                      {originalItem?.brand && (
                        <span className="text-[11px] px-2.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-full border border-zinc-200 dark:border-zinc-700 font-medium">
                          {originalItem.brand}
                        </span>
                      )}
                      {originalItem?.oem_number && (
                        <span className="text-[11px] font-mono font-bold text-sky-700 dark:text-cyan-400 bg-sky-50 dark:bg-sky-950/40 px-2 py-0.5 rounded-full border border-sky-200 dark:border-sky-800/50">
                          OEM: {originalItem.oem_number}
                        </span>
                      )}
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full border font-bold ${
                          availableStock <= 0
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                        }`}
                      >
                        المتاح: {availableStock}
                      </span>
                      {isCustomPrice && (
                        <span className="text-[10px] px-2 py-0.5 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded-full font-bold flex items-center gap-1">
                          سعر مخصص
                          {officialRetail > 0 && (
                            <button
                              type="button"
                              onClick={() => handleUpdateLine(index, 'unit_price', officialRetail)}
                              className="text-[10px] underline hover:text-amber-900 dark:hover:text-white"
                              title="استعادة السعر الأصلي"
                            >
                              (استعادة {officialRetail})
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2 flex-wrap">
                      <span>كود: <strong className="font-mono text-zinc-700 dark:text-zinc-300">{line.item_code}</strong></span>
                      {originalItem?.shelf_location && (
                        <>
                          <span>·</span>
                          <span>الرف: <strong className="text-zinc-700 dark:text-zinc-300">{originalItem.shelf_location}</strong></span>
                        </>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveLine(index)}
                    className="w-9 h-9 rounded-2xl bg-zinc-100 hover:bg-rose-100 dark:bg-zinc-800/80 dark:hover:bg-rose-900/30 text-zinc-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 flex items-center justify-center transition-all cursor-pointer shrink-0"
                    title="حذف البند"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Line Controls: Quantity Stepper, Price Input, Total */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
                  {/* Stepper (+ -) */}
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400 shrink-0">الكمية:</span>
                    <div className={`flex items-center bg-zinc-50 dark:bg-zinc-950 border rounded-2xl overflow-hidden shadow-xs ${
                      isStockExceeded ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-zinc-300 dark:border-zinc-700'
                    }`}>
                      <button
                        type="button"
                        onClick={() => handleQtyChange(index, -1)}
                        className="w-10 h-10 flex items-center justify-center text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 active:scale-95 transition-all cursor-pointer"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={(line.quantity as any) === '' ? '' : line.quantity}
                        onChange={(e) => handleUpdateLine(index, 'quantity', e.target.value)}
                        onBlur={(e) => {
                          if (e.target.value === '' || Number(e.target.value) <= 0) {
                            handleUpdateLine(index, 'quantity', 1);
                          }
                        }}
                        className={`w-16 text-center text-sm font-black font-mono bg-transparent focus:outline-none ${
                          isStockExceeded ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-white'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => handleQtyChange(index, 1)}
                        className="w-10 h-10 flex items-center justify-center text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 active:scale-95 transition-all cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Price input + Wholesale toggle */}
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400 shrink-0">سعر الوحدة:</span>
                    <div className="relative flex-1 flex items-center">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={(line.unit_price as any) === '' ? '' : line.unit_price}
                        onChange={(e) => handleUpdateLine(index, 'unit_price', e.target.value)}
                        onBlur={(e) => {
                          if (e.target.value === '' || Number(e.target.value) < 0) {
                            handleUpdateLine(index, 'unit_price', 0);
                          }
                        }}
                        className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-2xl px-3 py-2 text-sm font-mono font-bold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all shadow-xs"
                      />
                      <span className="text-xs text-zinc-400 dark:text-zinc-500 ms-1.5 shrink-0 font-medium">ج.م</span>
                      {originalItem && (
                        <button
                          type="button"
                          onClick={() => handleToggleLinePriceType(index)}
                          className={`ms-2 px-2.5 py-1.5 text-xs font-bold rounded-xl border transition-all shrink-0 cursor-pointer ${
                            isWholesale
                              ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/40'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700'
                          }`}
                          title="تبديل بين قطاعي وجملة"
                        >
                          {isWholesale ? 'جملة' : 'قطاعي'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Line Total */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 text-left">
                    <span className="sm:hidden text-xs text-zinc-500 dark:text-zinc-400 font-bold">الإجمالي:</span>
                    <div className="text-left">
                      <span className="text-base sm:text-lg font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatCurrency(line.total)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stock Warning Banner (Only if negative stock disallowed) */}
                {isStockExceeded && (
                  <div className="flex items-center gap-2 p-3 bg-rose-100/80 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-700/80 rounded-2xl text-rose-800 dark:text-rose-300 text-xs font-bold">
                    <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <span>تحذير مخزون: الكمية المطلوبة ({line.quantity}) أكبر من الرصيد المتوفر في المخزن ({availableStock} قطعة).</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. DISCOUNT, PAYMENT, AND CHANGE CALCULATOR                               */}
      {/* ========================================================================= */}
      {lines.length > 0 && (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Discount */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">الخصم:</label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  min="0"
                  value={isNaN(discountValue) ? '' : (discountValue || '')}
                  onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-2xl px-3 py-2 text-sm font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setDiscountType(discountType === 'fixed' ? 'percentage' : 'fixed')}
                  className="px-3.5 py-2 bg-zinc-100 dark:bg-zinc-800 text-xs font-bold text-amber-600 dark:text-amber-400 rounded-2xl border border-zinc-300 dark:border-zinc-700 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  {discountType === 'fixed' ? 'ج.م' : '%'}
                </button>
              </div>
            </div>

            {/* Paid Cash */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">المدفوع نقداً:</label>
                <button
                  type="button"
                  onClick={() => setPaidCash(finalTotal)}
                  className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline font-black cursor-pointer"
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
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-2xl px-3 py-2 text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all"
              />
            </div>

            {/* Change Calculator */}
            <div className="space-y-1.5 bg-zinc-50 dark:bg-zinc-950/80 p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-zinc-600 dark:text-zinc-400">الباقي للعميل:</span>
                <Calculator className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <div className="text-xl font-black font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                {formatCurrency(changeDue)}
              </div>
              {changeDue > 0 && selectedCustomerId !== defaultCashId && (
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-700 dark:text-zinc-300 mt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={extraPaidAsCredit}
                    onChange={(e) => setExtraPaidAsCredit(e.target.checked)}
                    className="rounded accent-amber-500"
                  />
                  <span>قيد الباقي كرصيد دائن على حسابه</span>
                </label>
              )}
            </div>

            {/* Remaining Debt */}
            <div className="space-y-1.5 bg-zinc-50 dark:bg-zinc-950/80 p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400 block">المتبقي آجل (دين):</span>
              <div className={`text-xl font-black font-mono tabular-nums ${remainingDebt > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                {formatCurrency(remainingDebt)}
              </div>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block">
                الرصيد النهائي: {formatCurrency(balanceAfter)}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات على الفاتورة (اختياري)..."
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-2xl px-3.5 py-2 text-xs text-zinc-800 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
            />
          </div>
        </Card>
      )}

      {/* Mandatory Validation Warning Alert Banner (Only when negative stock disallowed) */}
      {hasValidationErrors && (
        <div className="p-4 bg-rose-100 dark:bg-rose-950/90 border-2 border-rose-500 dark:border-rose-600 rounded-3xl flex items-start gap-3 text-rose-900 dark:text-rose-200 text-xs font-bold shadow-lg">
          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <span className="block font-black text-sm">
              تنبيه المخزون: ({lineValidationErrors.length}) خطأ بحاجة للمعالجة:
            </span>
            <ul className="list-disc list-inside space-y-1 text-xs text-rose-800 dark:text-rose-300">
              {lineValidationErrors.map((err, idx) => (
                <li key={idx}>{err.message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. FIXED BOTTOM ACTION BAR (Total + Print + Save)      */}
      {/* ========================================================================= */}
{!isSearchModalOpen && (
      <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:bottom-0 left-0 right-0 md:mr-20 lg:mr-64 z-30 mobile-action-bar bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 p-2.5 sm:p-3 sm:px-6 flex items-center justify-between gap-2.5 sm:gap-3 shadow-2xl no-print">
        {/* Total Price Ticket */}
        <div className="mobile-total flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="space-y-0.5 min-w-0">
            <span className="mobile-total-label text-[10px] font-bold text-zinc-500 dark:text-zinc-400 block">الإجمالي النهائي</span>
            <div className="mobile-total-amount text-lg sm:text-2xl font-black font-mono text-amber-600 dark:text-amber-400 tracking-tight tabular-nums">
              {formatCurrency(finalTotal)}
            </div>
          </div>
          {lines.length > 0 && (
            <Badge variant="zinc" size="sm" className="hidden sm:inline-flex font-mono">
              {lines.length} صنف
            </Badge>
          )}
        </div>

        {/* Save & Print Action Buttons */}
        <div className="mobile-action-buttons flex items-center gap-1.5 sm:gap-2">
          {/* Quick Download from bottom bar */}
          <Button
            variant="secondary"
            size="md"
            icon={<Download className="w-4 h-4 text-sky-600 dark:text-sky-400" />}
            disabled={lines.length === 0}
            onClick={() => handleDownloadInvoiceHtml()}
            className="hidden sm:inline-flex cursor-pointer"
            title="تنزيل الفاتورة للطباعة"
          >
            تنزيل
          </Button>

          <Button
            variant="secondary"
            size="md"
            icon={<Printer className="w-4 h-4" />}
            disabled={lines.length === 0}
            onClick={() => handleSaveInvoice(true)}
            className={`cursor-pointer px-2.5 sm:px-4 ${hasValidationErrors ? 'opacity-60 border-rose-800' : ''}`}
            title="حفظ وطباعة الفاتورة"
          >
            <span className="hidden sm:inline">حفظ و</span>طباعة
          </Button>

          <Button
            variant={hasValidationErrors ? 'danger' : 'primary'}
            size="md"
            icon={<CheckCircle2 className="w-4 h-4" />}
            disabled={lines.length === 0}
            onClick={() => handleSaveInvoice(false)}
            className={`font-black px-4 sm:px-7 shadow-md cursor-pointer ${
              hasValidationErrors
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
                : 'shadow-amber-500/20'
            }`}
            title="حفظ الفاتورة (F2)"
          >
            <span>حفظ</span>
            <span className="hidden sm:inline"> (F2)</span>
          </Button>
        </div>
      </div>
      )}

      {/* ========================================================================= */}
      {/* 7. FULL-SCREEN ITEM SEARCH MODAL (Requirement 4)                          */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        maxWidth="4xl"
        className="invoice-item-picker-modal"
        title={
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-amber-400" />
            <span>البحث الذكي وإضافة الأصناف</span>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Top Search Input with Autofocus */}
          <div className="relative flex items-center">
            <Search className="w-5 h-5 absolute start-3.5 text-amber-500 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالاسم، كود الصنف، الباركود، رقم OEM، أو موديل السيارة..."
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/80 rounded-2xl ps-11 pe-4 py-3.5 text-base text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all shadow-xs"
              autoFocus
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute end-3 p-1 text-zinc-400 hover:text-zinc-800 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <button
              onClick={() => setSearchFilter('all')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                searchFilter === 'all'
                  ? 'bg-amber-500 text-zinc-950 font-black shadow-xs'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setSearchFilter('car_model')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                searchFilter === 'car_model'
                  ? 'bg-amber-500 text-zinc-950 font-black shadow-xs'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              موديل السيارة
            </button>
            <button
              onClick={() => setSearchFilter('brand')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                searchFilter === 'brand'
                  ? 'bg-amber-500 text-zinc-950 font-black shadow-xs'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              الماركة
            </button>
            <button
              onClick={() => setSearchFilter('shelf')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                searchFilter === 'shelf'
                  ? 'bg-amber-500 text-zinc-950 font-black shadow-xs'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              الرف
            </button>
          </div>

          {/* Search Results as Large Cards (Sequential clicks add successive items) */}
          <div className="invoice-picker-results grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto pr-1">
            {searchResults.length === 0 ? (
              <div className="col-span-2 p-10 text-center text-zinc-500 dark:text-zinc-400 text-xs">
                لم يتم العثور على أصناف مطابقة للبحث "{searchTerm}".
              </div>
            ) : (
              searchResults.map((item) => {
                const stock = itemStockMap.get(item.id) ?? (item.current_stock || 0);
                const isOutOfStock = stock <= 0;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleAddItem(item)}
                    aria-pressed={lines.some((line) => line.item_id === item.id)}
                    className={`p-3.5 rounded-2xl border transition-all text-right flex flex-col justify-between gap-3 group cursor-pointer shadow-xs ${lines.some((line) => line.item_id === item.id) ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 ring-2 ring-amber-500/30' : 'bg-white dark:bg-zinc-900/90 border-zinc-200 dark:border-zinc-800 hover:border-amber-500/60 hover:bg-zinc-50 dark:hover:bg-zinc-850'} active:scale-[0.98]`}
                  >
                    <div className="space-y-1 w-full">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-black text-zinc-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors wrap-text">
                          {item.name}
                        </span>
                        {lines.some((line) => line.item_id === item.id) && (
                          <Badge variant="emerald" size="sm">مضاف ✓</Badge>
                        )}
                        <Badge
                          variant={isOutOfStock ? 'rose' : stock <= item.min_stock ? 'amber' : 'emerald'}
                          size="sm"
                        >
                          المتاح: {stock} {item.unit}
                        </Badge>
                      </div>

                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                        {item.car_model || 'عام'}
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400 flex-wrap pt-0.5">
                        <span className="font-mono text-zinc-700 dark:text-zinc-300">كود: {item.code}</span>
                        {item.brand && <span>· {item.brand}</span>}
                        {item.shelf_location && <span>· الرف: {item.shelf_location}</span>}
                      </div>
                    </div>

                    <div className="flex items-center justify-between w-full pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {formatCurrency(item.retail_price)}
                        </span>
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                          (جملة: {formatCurrency(item.wholesale_price)})
                        </span>
                      </div>
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                        <span>إضافة</span>
                        <Plus className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Modal Bottom: Done Button */}
          <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              يمكنك النقر على عدة أصناف للإضافة المتتالية
            </span>
            <Button variant="primary" size="md" onClick={() => setIsSearchModalOpen(false)}>
              تم والعودة للفاتورة ({lines.length} صنف)
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 8. HELD INVOICES MODAL                                                    */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isHeldModalOpen}
        onClose={() => setIsHeldModalOpen(false)}
        maxWidth="lg"
        title="الفواتير المعلقة"
      >
        <div className="space-y-3">
          {heldInvoices.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 dark:text-zinc-400 text-xs">
              لا توجد فواتير معلقة حالياً.
            </div>
          ) : (
            heldInvoices.map((held) => (
              <div
                key={held.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs"
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-black text-zinc-900 dark:text-white">{held.customerName}</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {held.lines.length} صنف · عُلقت في {held.heldAt}
                  </div>
                  <div className="text-xs font-black font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                    {formatCurrency(held.subtotal)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleRestoreHeld(held)}
                  >
                    استدعاء
                  </Button>
                  <button
                    onClick={() => setHeldInvoices(heldInvoices.filter((h) => h.id !== held.id))}
                    className="p-2 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                    title="حذف الفاتورة المعلقة"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 8. SHARE & DOWNLOAD MODAL                                                 */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        maxWidth="md"
        title="مشاركة وتنزيل الفاتورة"
      >
        <div className="space-y-4 p-1">
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">العميل:</span>
              <strong className="text-zinc-900 dark:text-white font-bold">{customerName}</strong>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">عدد الأصناف:</span>
              <strong className="text-zinc-900 dark:text-white font-mono">{lines.length} صنف</strong>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">الإجمالي النهائي:</span>
              <strong className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(finalTotal)}</strong>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* WhatsApp Direct Share */}
            <button
              type="button"
              onClick={() => {
                handleShareWhatsApp();
                setIsShareModalOpen(false);
              }}
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-md cursor-pointer active:scale-95"
            >
              <MessageCircle className="w-5 h-5 shrink-0" />
              <div className="text-right flex-1">
                <div className="font-black text-sm">إرسال عبر واتساب</div>
                <div className="text-[10px] opacity-90">مشاركة نصية منسقة للعميل</div>
              </div>
            </button>

            {/* Native Web Share API */}
            <button
              type="button"
              onClick={() => {
                handleShareNative();
                setIsShareModalOpen(false);
              }}
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 font-bold text-xs transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <Share2 className="w-5 h-5 text-amber-500 shrink-0" />
              <div className="text-right flex-1">
                <div className="font-black text-sm">مشاركة عامة</div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">تطبيقات الهاتف أو الحافظة</div>
              </div>
            </button>

            {/* Download Standalone HTML */}
            <button
              type="button"
              onClick={() => {
                handleDownloadInvoiceHtml();
                setIsShareModalOpen(false);
              }}
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 font-bold text-xs transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <Download className="w-5 h-5 text-sky-500 shrink-0" />
              <div className="text-right flex-1">
                <div className="font-black text-sm">تنزيل ملف الفاتورة</div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">ملف HTML جاهز للحفظ والطباعة</div>
              </div>
            </button>

            {/* Print / Save as PDF */}
            <button
              type="button"
              onClick={() => {
                setPrintDoc({
                  type: 'sales_invoice',
                  data: {
                    invoice_number: `INV-PREVIEW-${Date.now().toString().slice(-4)}`,
                    invoice_date: invoiceDate,
                    customer_name: customerName,
                    customer_id: selectedCustomerId,
                    lines,
                    subtotal,
                    discount_type: discountType,
                    discount_value: discountValue,
                    final_total: finalTotal,
                    paid_cash: paidCash,
                    remaining_debt: remainingDebt,
                    previous_balance: previousBalance,
                    balance_after: balanceAfter,
                    notes,
                  },
                  format: 'a4',
                });
                setIsShareModalOpen(false);
              }}
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/40 font-bold text-xs transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <Printer className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="text-right flex-1">
                <div className="font-black text-sm">معاينة وطباعة</div>
                <div className="text-[10px] opacity-80">ورق A4 أو إيصال حراري</div>
              </div>
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 9. INVOICE HISTORY & RETURNS & VOID MODAL                                 */}
      {/* ========================================================================= */}
      <Modal
        isOpen={viewHistoryModal}
        onClose={() => setViewHistoryModal(false)}
        maxWidth="2xl"
        title="سجل المبيعات والمرتجعات"
      >
        <div className="space-y-4">
          {/* Sub-tabs for Invoices vs Returns */}
          <div className="flex border-b border-zinc-200 dark:border-zinc-800 pb-2 gap-2">
            <button
              onClick={() => setHistoryTab('invoices')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                historyTab === 'invoices'
                  ? 'bg-amber-500 text-zinc-950 shadow-xs font-black'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              فواتير المبيعات ({salesInvoices.length})
            </button>
            <button
              onClick={() => setHistoryTab('returns')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                historyTab === 'returns'
                  ? 'bg-amber-500 text-zinc-950 shadow-xs font-black'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              سجل المرتجعات ({returns.filter((r) => r.return_type === 'sale_return').length})
            </button>
          </div>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {historyTab === 'invoices' ? (
              salesInvoices.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 dark:text-zinc-400 text-xs">
                  لا توجد فواتير مسجلة حتى الآن.
                </div>
              ) : (
                salesInvoices.map((inv) => {
                  const isCancelled = inv.status === 'cancelled';

                  return (
                    <div
                      key={inv.id}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        isCancelled
                          ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-500/30 opacity-75'
                          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-amber-500/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-zinc-900 dark:text-white">{inv.customer_name}</span>
                            <span className="text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 font-bold">
                              {inv.invoice_number}
                            </span>
                            {isCancelled && <Badge variant="rose" size="sm">ملغاة</Badge>}
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            {formatDate(inv.invoice_date)} · {inv.lines.length} صنف · بواسطة: {inv.created_by}
                          </div>
                          {isCancelled && inv.cancellation_reason && (
                            <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                              سبب الإلغاء: {inv.cancellation_reason}
                            </div>
                          )}
                        </div>

                        <div className="text-left space-y-1">
                          <div
                            className={`text-sm font-black font-mono tabular-nums ${
                              isCancelled ? 'line-through text-zinc-400' : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {formatCurrency(inv.final_total)}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            {/* Share button */}
                            <button
                              type="button"
                              onClick={() => handleShareWhatsApp(inv)}
                              className="w-7 h-7 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center cursor-pointer border border-emerald-500/20"
                              title="مشاركة عبر واتساب"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>

                            {/* Download HTML button */}
                            <button
                              type="button"
                              onClick={() => handleDownloadInvoiceHtml(inv)}
                              className="w-7 h-7 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center cursor-pointer border border-sky-500/20"
                              title="تنزيل الفاتورة HTML"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setPrintDoc({ type: 'sales_invoice', data: inv, format: 'thermal' })}
                              className="w-7 h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 flex items-center justify-center cursor-pointer border border-zinc-200 dark:border-zinc-700"
                              title="طباعة حرارية"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPrintDoc({ type: 'sales_invoice', data: inv, format: 'a4' })}
                              className="w-7 h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 flex items-center justify-center cursor-pointer border border-zinc-200 dark:border-zinc-700"
                              title="طباعة A4"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                            {!isCancelled && (
                              <button
                                type="button"
                                onClick={() => handleOpenReturnModal(inv)}
                                className="px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                title="عمل مرتجع مبيعات على هذه الفاتورة"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>مرتجع</span>
                              </button>
                            )}
                            {canDeleteInvoices && !isCancelled && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCancelModalInvoice(inv);
                                  setCancelReason('');
                                }}
                                className="px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-bold cursor-pointer"
                                title="إلغاء الفاتورة وعكس حركاتها"
                              >
                                إلغاء
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            ) : (
              // Tab: Returns
              (() => {
                const saleReturns = returns.filter((r) => r.return_type === 'sale_return');
                if (saleReturns.length === 0) {
                  return (
                    <div className="p-8 text-center text-zinc-400 text-xs">
                      لا توجد سجلات مرتجعات مبيعات حتى الآن.
                    </div>
                  );
                }

                return saleReturns.map((ret) => {
                  const isRetCancelled = ret.status === 'cancelled';

                  return (
                    <div
                      key={ret.id}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        isRetCancelled
                          ? 'bg-rose-950/20 border-rose-500/30 opacity-75'
                          : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-white">{ret.party_name}</span>
                            <span className="text-[10px] font-mono bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-zinc-700">
                              {ret.return_number}
                            </span>
                            {ret.original_doc_number && (
                              <span className="text-[10px] text-zinc-400">
                                (فاتورة: {ret.original_doc_number})
                              </span>
                            )}
                            {isRetCancelled ? (
                              <Badge variant="rose" size="sm">ملغى</Badge>
                            ) : (
                              <Badge variant="blue" size="sm">مكتمل</Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            {formatDate(ret.date)} · {ret.lines.length} صنف · بواسطة: {ret.created_by}
                          </div>
                          {ret.refunded_cash > 0 && (
                            <div className="text-[11px] text-zinc-400">
                              المسترد نقداً: {formatCurrency(ret.refunded_cash)}
                              {ret.credited_to_account > 0 && ` · مقيد بالحساب: ${formatCurrency(ret.credited_to_account)}`}
                            </div>
                          )}
                          {isRetCancelled && ret.cancellation_reason && (
                            <div className="text-[11px] text-rose-400 font-medium">
                              سبب الإلغاء: {ret.cancellation_reason}
                            </div>
                          )}
                        </div>

                        <div className="text-left space-y-1">
                          <div
                            className={`text-sm font-black font-mono tabular-nums ${
                              isRetCancelled ? 'line-through text-zinc-500' : 'text-rose-400'
                            }`}
                          >
                            -{formatCurrency(ret.total_amount)}
                          </div>
                          {canDeleteInvoices && !isRetCancelled && (
                            <button
                              onClick={() => {
                                setCancelReturnModalItem(ret);
                                setCancelReturnReason('');
                              }}
                              className="px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-[10px] font-bold cursor-pointer"
                              title="إلغاء المرتجع وعكس حركاته للمخزن والخزينة"
                            >
                              إلغاء المرتجع
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()
            )}
          </div>
        </div>
      </Modal>

      {/* Return Creation Modal */}
      <Modal
        isOpen={Boolean(returnModalInvoice)}
        onClose={() => setReturnModalInvoice(null)}
        maxWidth="lg"
        title={`تسجيل مرتجع مبيعات - فاتورة ${returnModalInvoice?.invoice_number || ''}`}
      >
        {returnModalInvoice && (
          <form onSubmit={handleSubmitReturn} className="space-y-4">
            <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs flex justify-between items-center">
              <div>
                <span className="text-zinc-400">العميل: </span>
                <span className="font-bold text-white">{returnModalInvoice.customer_name}</span>
              </div>
              <div>
                <span className="text-zinc-400">المدفوع نقداً بالفاتورة: </span>
                <span className="font-bold text-emerald-400 font-mono">
                  {formatCurrency(returnModalInvoice.paid_cash)}
                </span>
              </div>
            </div>

            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              <label className="text-xs font-bold text-zinc-300 block">حدد كميات الأصناف المرتجعة:</label>
              {returnLines.map((line, idx) => (
                <div
                  key={line.itemId}
                  className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex-1">
                    <div className="font-bold text-white">{line.itemName}</div>
                    <div className="text-[10px] text-zinc-400">
                      الكود: {line.itemCode} · سعر البيع: {formatCurrency(line.unitPrice)} · متاح للإرجاع: ({line.maxReturnable})
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-400">كمية الإرجاع:</span>
                    <input
                      type="number"
                      min="0"
                      max={line.maxReturnable}
                      value={isNaN(line.returnQty) ? 0 : line.returnQty}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(line.maxReturnable, Number(e.target.value) || 0));
                        const updated = [...returnLines];
                        updated[idx].returnQty = val;
                        setReturnLines(updated);
                      }}
                      className="w-16 bg-zinc-900 border border-zinc-700 rounded-lg p-1.5 text-center text-xs font-mono font-bold text-white focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Total Return Calculations */}
            {(() => {
              const totalAmount = returnLines.reduce((sum, l) => sum + (isNaN(l.returnQty) ? 0 : l.returnQty) * (isNaN(l.unitPrice) ? 0 : l.unitPrice), 0);
              const isCash =
                !returnModalInvoice.customer_id ||
                returnModalInvoice.customer_id === defaultCashId;

              return (
                <div className="space-y-3 pt-2 border-t border-zinc-800">
                  <div className="flex justify-between items-center text-sm font-bold">
                    <span className="text-zinc-300">إجمالي قيمة المرتجع:</span>
                    <span className="text-amber-400 font-mono">{formatCurrency(totalAmount)}</span>
                  </div>

                  {isCash ? (
                    <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs">
                      العميل نقدي: سيتم رد كامل قيمة المرتجع ({formatCurrency(totalAmount)}) نقداً من الخزينة.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-zinc-400 block mb-1">
                          المسترد نقداً (من الخزينة):
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={Math.min(totalAmount, returnModalInvoice.paid_cash, treasuryBalance)}
                          value={isNaN(refundedCash) ? 0 : refundedCash}
                          onChange={(e) => setRefundedCash(Number(e.target.value) || 0)}
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-2 text-xs font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-zinc-400 block mb-1">
                          المقيد بحساب العميل:
                        </label>
                        <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-emerald-400 font-bold">
                          {formatCurrency(Math.max(0, totalAmount - (Number(refundedCash) || 0)))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-bold text-zinc-400 block mb-1">ملاحظات المرتجع:</label>
                    <input
                      type="text"
                      value={returnNotes}
                      onChange={(e) => setReturnNotes(e.target.value)}
                      placeholder="سبب الإرجاع أو حالة البضاعة..."
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-2 text-xs text-white"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={() => setReturnModalInvoice(null)}>
                      إلغاء
                    </Button>
                    <Button type="submit" variant="primary" disabled={totalAmount <= 0}>
                      تأكيد وحفظ المرتجع
                    </Button>
                  </div>
                </div>
              );
            })()}
          </form>
        )}
      </Modal>

      {/* Cancel Return Confirmation Modal */}
      <Modal
        isOpen={Boolean(cancelReturnModalItem)}
        onClose={() => setCancelReturnModalItem(null)}
        maxWidth="sm"
        title="إلغاء إشعار المرتجع"
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
            سيتم وسم المرتجع كـ "ملغى" وعكس حركة إدخال البضاعة للمخزن ورد النقدية للخزينة وتعديل حساب العميل.
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1">
              سبب إلغاء المرتجع (إجباري):
            </label>
            <textarea
              value={cancelReturnReason}
              onChange={(e) => setCancelReturnReason(e.target.value)}
              placeholder="اكتب سبب إلغاء هذا المرتجع لتوثيقه في سجل التدقيق..."
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelReturnModalItem(null)}>
              تراجع
            </Button>
            <Button variant="danger" onClick={handleConfirmCancelReturn}>
              تأكيد إلغاء المرتجع
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancellation Reason Modal */}
      <Modal
        isOpen={Boolean(cancelModalInvoice)}
        onClose={() => setCancelModalInvoice(null)}
        maxWidth="sm"
        title="إلغاء فاتورة مبيعات (Void)"
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
            سيتم وسم الفاتورة كـ "ملغاة" وعكس حركات المخزون والخزينة وحساب العميل بأمان وتوثيق العملية في سجل التدقيق.
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1">
              سبب إلغاء الفاتورة (إجباري):
            </label>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="مثال: خطأ في البنود، تراجع العميل عن الشراء..."
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              disabled={!cancelReason.trim()}
              onClick={handleConfirmCancelInvoice}
            >
              تأكيد إلغاء الفاتورة
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

      {/* Duplicate Warning Confirm Dialog */}
      <ConfirmDialog
        isOpen={duplicateConfirmOpen}
        onClose={() => setDuplicateConfirmOpen(false)}
        onConfirm={() => {
          setDuplicateConfirmOpen(false);
          executeSave(false);
        }}
        title="تحذير: احتمالية تكرار الفاتورة"
        message={`تم حفظ فاتورة لنفس العميل (${customerName}) بنفس القيمة (${formatCurrency(finalTotal)}) منذ أقل من دقيقتين. هل أنت متأكد من حفظ هذه الفاتورة مرة أخرى؟`}
        confirmText="نعم، احفظها مجدداً"
        cancelText="إلغاء وتدقيق الفاتورة"
        variant="warning"
      />
    </div>
  );
};
