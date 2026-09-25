import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate, getTodayDate } from '../lib/formatters';
import { storage } from '../lib/storage';
import { Receipt } from '../types';
import {
  ReceiptText,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Printer,
  Calendar,
  X,
  User,
  Building,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { StatCard } from './ui/StatCard';
import { Modal } from './ui/Modal';

export const ReceiptsView: React.FC = () => {
  const {
    receipts,
    customers,
    suppliers,
    salesInvoices,
    currentUser,
    refreshData,
    showToast,
    setPrintDoc,
    customerBalanceMap,
    supplierBalanceMap,
  } = useApp();

  const [activeType, setActiveType] = useState<'customer_receipt' | 'supplier_payment'>('customer_receipt');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [linkedInvoiceId, setLinkedInvoiceId] = useState<string>('');
  const [receiptDate, setReceiptDate] = useState<string>(getTodayDate());
  const [notes, setNotes] = useState<string>('');

  const currentPartyList = activeType === 'customer_receipt' ? customers : suppliers;

  const handleOpenModal = (type: 'customer_receipt' | 'supplier_payment') => {
    setActiveType(type);
    const firstParty = (type === 'customer_receipt' ? customers : suppliers)[0];
    setSelectedPartyId(firstParty?.id || '');
    setAmount(0);
    setLinkedInvoiceId('');
    setReceiptDate(getTodayDate());
    setNotes('');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      showToast('error', 'خطأ في المبلغ', 'يرجى إدخال مبلغ أكبر من صفر');
      return;
    }

    const party = currentPartyList.find((p) => p.id === selectedPartyId);
    if (!party) {
      showToast('error', 'خطأ', 'يرجى اختيار العميل أو المورد');
      return;
    }

    let invoiceNumber = '';
    if (linkedInvoiceId) {
      const inv = salesInvoices.find((i) => i.id === linkedInvoiceId);
      if (inv) invoiceNumber = inv.invoice_number;
    }

    try {
      const saved = storage.saveReceipt(
        {
          receipt_type: activeType,
          party_id: party.id,
          party_name: party.name,
          amount: Number(amount),
          linked_invoice_id: linkedInvoiceId || undefined,
          linked_invoice_number: invoiceNumber || undefined,
          date: receiptDate,
          notes: notes || undefined,
        },
        currentUser
      );

      refreshData();
      setIsModalOpen(false);
      showToast(
        'success',
        activeType === 'customer_receipt' ? 'سند قبض' : 'سند صرف',
        `تم حفظ السند رقم ${saved.receipt_number} بمبلغ ${formatCurrency(saved.amount)} بنجاح`
      );

      // Offer instant print
      setPrintDoc({
        type: 'receipt',
        data: saved,
        format: 'thermal',
      });
    } catch (err: any) {
      showToast('error', 'خطأ في الحفظ', err.message);
    }
  };

  // Filtered receipts
  const filteredReceipts = receipts.filter((r) => r.receipt_type === activeType);

  // Totals
  const { totalCustomerReceipts, totalSupplierPayments } = useMemo(() => {
    let custSum = 0;
    let suppSum = 0;
    receipts.forEach((r) => {
      if (r.receipt_type === 'customer_receipt') custSum += r.amount;
      else suppSum += r.amount;
    });
    return { totalCustomerReceipts: custSum, totalSupplierPayments: suppSum };
  }, [receipts]);

  // Selected party balance preview
  const selectedPartyBalance = useMemo(() => {
    if (!selectedPartyId) return 0;
    if (activeType === 'customer_receipt') {
      return customerBalanceMap.get(selectedPartyId) ?? 0;
    } else {
      return supplierBalanceMap.get(selectedPartyId) ?? 0;
    }
  }, [selectedPartyId, activeType, customerBalanceMap, supplierBalanceMap]);

  return (
    <div className="p-3 sm:p-5 w-full max-w-full 2xl:max-w-[1920px] mx-auto space-y-4 pb-28 md:pb-8 text-slate-900 dark:text-zinc-100">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <StatCard
          title="إجمالي سندات القبض (من العملاء)"
          value={formatCurrency(totalCustomerReceipts)}
          subtitle="مقبوضات مسددة في الخزينة"
          icon={<ArrowDownLeft className="w-5 h-5" />}
          variant="emerald"
        />

        <StatCard
          title="إجمالي سندات الصرف (للموردين)"
          value={formatCurrency(totalSupplierPayments)}
          subtitle="مدفوعات منصرفة من الخزينة"
          icon={<ArrowUpRight className="w-5 h-5" />}
          variant="rose"
        />
      </div>

      {/* Control Strip & Subtab Switcher */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 p-3 sm:p-4 rounded-2xl shadow-xs">
        <div className="flex bg-slate-100 dark:bg-zinc-950 p-1 rounded-xl border border-slate-200 dark:border-zinc-800">
          <button
            onClick={() => setActiveType('customer_receipt')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeType === 'customer_receipt'
                ? 'bg-amber-500 text-zinc-950 shadow-xs font-black'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>سندات قبض (عملاء)</span>
          </button>
          <button
            onClick={() => setActiveType('supplier_payment')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeType === 'supplier_payment'
                ? 'bg-amber-500 text-zinc-950 shadow-xs font-black'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            <span>سندات صرف (موردين)</span>
          </button>
        </div>

        <Button
          variant="primary"
          size="md"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => handleOpenModal(activeType)}
          className="font-black shadow-md shadow-amber-500/20"
        >
          {activeType === 'customer_receipt' ? 'تحرير سند قبض جديد' : 'تحرير سند صرف جديد'}
        </Button>
      </div>

      {/* Receipts List */}
      <Card padding="none" className="overflow-hidden shadow-xs">
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 dark:text-white">
            {activeType === 'customer_receipt' ? 'سجل سندات القبض' : 'سجل سندات الصرف'} ({filteredReceipts.length} سند)
          </h3>
        </div>

        {filteredReceipts.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-zinc-400 text-xs">
            لا توجد سندات مسجلة في هذا القسم حتى الآن.
          </div>
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="block sm:hidden divide-y divide-slate-200 dark:divide-zinc-800">
              {filteredReceipts.map((r) => (
                <div key={r.id} className="p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-xs">
                        #{r.receipt_number}
                      </span>
                      {r.linked_invoice_number && (
                        <span className="font-mono text-cyan-600 dark:text-cyan-400 text-[11px]">
                          (فاتورة: {r.linked_invoice_number})
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                      {formatDate(r.date)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {r.party_name}
                    </span>
                    <span className={`text-base font-black font-mono tabular-nums ${activeType === 'customer_receipt' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {formatCurrency(r.amount)}
                    </span>
                  </div>

                  {r.notes && (
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                      {r.notes}
                    </div>
                  )}

                  <div className="flex items-center justify-end pt-1 border-t border-slate-100 dark:border-zinc-800/80">
                    <button
                      onClick={() => setPrintDoc({ type: 'receipt', data: r, format: 'thermal' })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-xs font-bold transition-colors cursor-pointer border border-slate-200 dark:border-zinc-700"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>طباعة إيصال</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 dark:bg-zinc-950/80 text-slate-700 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800 font-bold">
                  <tr>
                    <th className="p-3">رقم السند</th>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">{activeType === 'customer_receipt' ? 'العميل' : 'المورد'}</th>
                    <th className="p-3 text-center">المبلغ</th>
                    <th className="p-3">الفاتورة المرتبطة</th>
                    <th className="p-3">ملاحظات</th>
                    <th className="p-3 text-left">طباعة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60">
                  {filteredReceipts.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-zinc-850/60 transition-colors">
                      <td className="p-3 font-mono font-bold text-amber-600 dark:text-amber-400">{r.receipt_number}</td>
                      <td className="p-3 font-mono text-slate-600 dark:text-zinc-300">{formatDate(r.date)}</td>
                      <td className="p-3 text-slate-900 dark:text-white font-bold">{r.party_name}</td>
                      <td className="p-3 text-center font-mono font-black text-sm">
                        <span className={activeType === 'customer_receipt' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {formatCurrency(r.amount)}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-cyan-600 dark:text-cyan-400 font-bold">{r.linked_invoice_number || '-'}</td>
                      <td className="p-3 text-slate-500 dark:text-zinc-400">{r.notes || '-'}</td>
                      <td className="p-3 text-left">
                        <button
                          onClick={() => setPrintDoc({ type: 'receipt', data: r, format: 'thermal' })}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white transition-colors cursor-pointer border border-slate-200 dark:border-zinc-700"
                          title="طباعة السند"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Add Receipt Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        maxWidth="md"
        title={activeType === 'customer_receipt' ? 'تحرير سند قبض نقدية من عميل' : 'تحرير سند صرف نقدية لمورد'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
              {activeType === 'customer_receipt' ? 'العميل:' : 'المورد:'}
            </label>
            <select
              value={selectedPartyId}
              onChange={(e) => setSelectedPartyId(e.target.value)}
              className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {currentPartyList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 rounded-xl bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 flex justify-between items-center text-xs">
            <span className="text-slate-600 dark:text-zinc-400">الرصيد الحالي للطرف:</span>
            <span
              className={`text-sm font-black font-mono ${
                selectedPartyBalance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {formatCurrency(selectedPartyBalance)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">المبلغ (ج.م):</label>
              <input
                type="number"
                step="5"
                required
                value={isNaN(amount) ? '' : (amount || '')}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-base text-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">تاريخ السند:</label>
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">البيان / ملاحظات:</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="سداد دفعة، شيك رقم..."
              className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
            <Button variant="primary" type="submit" className="flex-1">
              حفظ وطباعة السند
            </Button>
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
