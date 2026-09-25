import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate, getTodayDate } from '../lib/formatters';
import { storage } from '../lib/storage';
import { TreasuryMovement } from '../types';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Minus,
  Calendar,
  Filter,
  X,
  Info,
  User,
  History,
  AlertTriangle,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { StatCard } from './ui/StatCard';
import { Modal } from './ui/Modal';
import { BottomSheet } from './ui/BottomSheet';

export const TreasuryView: React.FC = () => {
  const { treasuryMovements, treasuryBalance, currentUser, refreshData, showToast } = useApp();

  const [selectedDate, setSelectedDate] = useState<string>(getTodayDate());
  const [filterMode, setFilterMode] = useState<'day' | 'all'>('day');
  const [typeFilter, setTypeFilter] = useState<'all' | 'in' | 'out'>('all');
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState<boolean>(false);

  // Manual Transfer modal (إيداع / سحب)
  const [manualModalOpen, setManualModalOpen] = useState<boolean>(false);
  const [manualType, setManualType] = useState<'manual_deposit' | 'manual_withdraw'>('manual_deposit');
  const [manualAmount, setManualAmount] = useState<number>(0);
  const [manualNotes, setManualNotes] = useState<string>('');

  // Movement details modal
  const [selectedMovement, setSelectedMovement] = useState<TreasuryMovement | null>(null);

  // Guard: Cashier cannot access TreasuryView
  if (currentUser.role === 'cashier') {
    return (
      <div className="p-4 max-w-lg mx-auto mt-12 text-center">
        <Card className="p-8 space-y-4 border-rose-500/30 bg-white dark:bg-zinc-900/90 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-500">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">لا تملك صلاحية الوصول</h2>
          <p className="text-sm text-slate-600 dark:text-zinc-400">
            شاشة الخزينة وحركاتها النقدية متاحة فقط للمديرين والمحاسبين المعتمدين.
          </p>
        </Card>
      </div>
    );
  }

  // Daily Summary calculations (Opening, Day In, Day Out, Closing)
  const dailyData = useMemo(() => {
    return storage.getTreasuryDailySummary(selectedDate);
  }, [selectedDate, treasuryMovements]);

  // Overall totals
  const overallTotals = useMemo(() => {
    let inSum = 0;
    let outSum = 0;
    treasuryMovements.forEach((m) => {
      inSum += Number(m.amount_in || 0);
      outSum += Number(m.amount_out || 0);
    });
    return { inSum, outSum, count: treasuryMovements.length };
  }, [treasuryMovements]);

  // Movements to display
  const displayMovements = useMemo(() => {
    let list =
      filterMode === 'day'
        ? dailyData.movements
        : [...treasuryMovements].sort(
            (a, b) =>
              new Date(b.date).getTime() - new Date(a.date).getTime() ||
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );

    if (typeFilter === 'in') {
      list = list.filter((m) => m.amount_in > 0);
    } else if (typeFilter === 'out') {
      list = list.filter((m) => m.amount_out > 0);
    }

    return list;
  }, [filterMode, dailyData, treasuryMovements, typeFilter]);

  const handleSaveManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualAmount <= 0) {
      showToast('error', 'خطأ في المبلغ', 'يجب إدخال مبلغ أكبر من صفر');
      return;
    }
    if (!manualNotes.trim()) {
      showToast('error', 'بيان المعاملة مطلوب', 'يرجى كتابة سبب الإيداع أو السحب');
      return;
    }

    if (manualType === 'manual_withdraw' && manualAmount > treasuryBalance) {
      showToast('error', 'عجز في الخزينة', 'المبلغ المطلوب سحبه أكبر من الرصيد المتوفر حالياً في الخزينة');
      return;
    }

    try {
      storage.saveTreasuryManualTransfer(
        {
          type: manualType,
          amount: Number(manualAmount),
          notes: manualNotes,
          date: selectedDate,
        },
        currentUser
      );

      refreshData();
      setManualModalOpen(false);
      setManualAmount(0);
      setManualNotes('');
      showToast(
        'success',
        manualType === 'manual_deposit' ? 'تم الإيداع بنجاح' : 'تم السحب بنجاح',
        `تم تسجيل حركة نقدية بمبلغ ${formatCurrency(manualAmount)}`
      );
    } catch (err: any) {
      showToast('error', 'تعذر حفظ الحركة', err.message);
    }
  };

  const movementLabels: Record<string, { label: string; color: 'emerald' | 'rose' | 'blue' | 'amber' | 'zinc' }> = {
    sales_cash: { label: 'مبيعات نقدية', color: 'emerald' },
    purchase_cash: { label: 'مشتريات نقدية', color: 'rose' },
    customer_receipt: { label: 'سند قبض من عميل', color: 'emerald' },
    supplier_payment: { label: 'سند صرف لمورد', color: 'rose' },
    expense: { label: 'مصروفات تشغيلية', color: 'rose' },
    manual_deposit: { label: 'إيداع يدوي', color: 'emerald' },
    manual_withdraw: { label: 'سحب يدوي', color: 'rose' },
    initial_balance: { label: 'رصيد افتتاحي', color: 'zinc' },
    sale_return: { label: 'مرتجع مبيعات', color: 'rose' },
    purchase_return: { label: 'مرتجع مشتريات', color: 'emerald' },
    cancellation: { label: 'إلغاء مستند', color: 'amber' },
  };

  return (
    <div className="p-3 sm:p-5 w-full max-w-full 2xl:max-w-[1920px] mx-auto space-y-4 pb-28 md:pb-8 text-slate-900 dark:text-zinc-100">
      {/* Top Stat Cards (Daily or Overall) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="رصيد الخزينة اللحظي"
          value={formatCurrency(treasuryBalance)}
          subtitle="النقدية المتوفرة في الدرج الآن"
          icon={<Wallet className="w-5 h-5" />}
          variant={treasuryBalance < 0 ? 'rose' : 'amber'}
        />

        <StatCard
          title={filterMode === 'day' ? 'وارد اليوم' : 'إجمالي الوارد'}
          value={`+${formatCurrency(filterMode === 'day' ? dailyData.totalIn : overallTotals.inSum)}`}
          subtitle="مبيعات، مقبوضات، إيداعات"
          icon={<ArrowDownLeft className="w-5 h-5" />}
          variant="emerald"
        />

        <StatCard
          title={filterMode === 'day' ? 'منصرف اليوم' : 'إجمالي المنصرف'}
          value={`-${formatCurrency(filterMode === 'day' ? dailyData.totalOut : overallTotals.outSum)}`}
          subtitle="مشتريات، مصروفات، مسحوبات"
          icon={<ArrowUpRight className="w-5 h-5" />}
          variant="rose"
        />

        <StatCard
          title={filterMode === 'day' ? 'صافي تدفق اليوم' : 'رصيد أول المدة'}
          value={
            filterMode === 'day'
              ? formatCurrency(dailyData.totalIn - dailyData.totalOut)
              : formatCurrency(dailyData.openingBalance)
          }
          subtitle={filterMode === 'day' ? 'الوارد ناقص المنصرف اليوم' : 'قبل بداية اليوم المختار'}
          icon={<History className="w-5 h-5" />}
          variant="zinc"
        />
      </div>

      {/* Control Strip & Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 p-3 sm:p-4 rounded-2xl shadow-xs">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode Switcher */}
          <div className="flex bg-slate-100 dark:bg-zinc-950 p-1 rounded-xl border border-slate-200 dark:border-zinc-800">
            <button
              onClick={() => setFilterMode('day')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filterMode === 'day'
                  ? 'bg-amber-500 text-zinc-950 font-black shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              عرض اليوم المحدد
            </button>
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-amber-500 text-zinc-950 font-black shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              كل الحركات
            </button>
          </div>

          {filterMode === 'day' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          )}

          {/* Type Filter Chips */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                typeFilter === 'all'
                  ? 'bg-slate-200 dark:bg-zinc-800 text-slate-900 dark:text-white font-bold'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-300'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setTypeFilter('in')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                typeFilter === 'in'
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-300'
              }`}
            >
              الوارد فقط
            </button>
            <button
              onClick={() => setTypeFilter('out')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                typeFilter === 'out'
                  ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-300'
              }`}
            >
              المنصرف فقط
            </button>
          </div>
        </div>

        {/* Action Buttons: إيداع / سحب يدوي */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            icon={<ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
            onClick={() => {
              setManualType('manual_deposit');
              setManualAmount(0);
              setManualNotes('');
              setManualModalOpen(true);
            }}
          >
            إيداع يدوي
          </Button>

          <Button
            variant="secondary"
            size="md"
            icon={<ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />}
            onClick={() => {
              setManualType('manual_withdraw');
              setManualAmount(0);
              setManualNotes('');
              setManualModalOpen(true);
            }}
          >
            سحب يدوي
          </Button>
        </div>
      </div>

      {/* Movements Table / Cards */}
      <Card padding="none" className="overflow-hidden shadow-xs">
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 dark:text-white">
            حركات الخزينة ({displayMovements.length} حركة)
          </h3>
          {filterMode === 'day' && (
            <span className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
              رصيد إغلاق اليوم: <strong className="text-amber-600 dark:text-amber-400">{formatCurrency(dailyData.closingBalance)}</strong>
            </span>
          )}
        </div>

        {displayMovements.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-zinc-400 text-xs">
            لا توجد حركات نقدية مسجلة في هذا اليوم / الفلتر.
          </div>
        ) : (
          <>
            {/* Mobile Card List (No horizontal scrolling on phones) */}
            <div className="block sm:hidden divide-y divide-slate-200 dark:divide-zinc-800">
              {displayMovements.map((m) => {
                const labelInfo = movementLabels[m.movement_type] || { label: m.doc_type || m.movement_type, color: 'zinc' };
                const isIn = m.amount_in > 0;

                return (
                  <div key={m.id} className="p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={labelInfo.color} size="sm">
                          {labelInfo.label}
                        </Badge>
                        {m.doc_number && (
                          <span className="font-mono text-cyan-600 dark:text-cyan-400 text-xs font-bold">
                            #{m.doc_number}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                        {formatDate(m.date)}
                      </span>
                    </div>

                    <div className="text-xs text-slate-900 dark:text-white font-medium">
                      {m.notes || 'بدون بيان'}
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-zinc-800/80">
                      <span className="text-[11px] text-slate-500 dark:text-zinc-400">بواسطة: {m.created_by}</span>
                      <span className={`text-base font-black font-mono tabular-nums ${isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {isIn ? `+${formatCurrency(m.amount_in)}` : `-${formatCurrency(m.amount_out)}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop & Tablet Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 dark:bg-zinc-950/80 text-slate-700 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800 font-bold">
                  <tr>
                    <th className="p-3">التاريخ والوقت</th>
                    <th className="p-3">نوع الحركة</th>
                    <th className="p-3">البيان / الوصف</th>
                    <th className="p-3">المستند</th>
                    <th className="p-3 text-center">وارد (+)</th>
                    <th className="p-3 text-center">منصرف (-)</th>
                    <th className="p-3 text-left">المستخدم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60">
                  {displayMovements.map((m) => {
                    const labelInfo = movementLabels[m.movement_type] || { label: m.doc_type || m.movement_type, color: 'zinc' };

                    return (
                      <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-zinc-850/60 transition-colors">
                        <td className="p-3 font-mono text-slate-600 dark:text-zinc-300">{formatDate(m.date)}</td>
                        <td className="p-3">
                          <Badge variant={labelInfo.color} size="sm">
                            {labelInfo.label}
                          </Badge>
                        </td>
                        <td className="p-3 text-slate-900 dark:text-white font-medium">{m.notes || '-'}</td>
                        <td className="p-3 font-mono text-cyan-600 dark:text-cyan-400 font-bold">{m.doc_number || '-'}</td>
                        <td className="p-3 text-center font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          {m.amount_in > 0 ? `+${formatCurrency(m.amount_in)}` : '-'}
                        </td>
                        <td className="p-3 text-center font-bold font-mono text-rose-600 dark:text-rose-400">
                          {m.amount_out > 0 ? `-${formatCurrency(m.amount_out)}` : '-'}
                        </td>
                        <td className="p-3 text-left font-mono text-slate-500 dark:text-zinc-400">{m.created_by}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Manual Deposit / Withdraw Modal */}
      <Modal
        isOpen={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        maxWidth="md"
        title={manualType === 'manual_deposit' ? 'إيداع نقدي في الخزينة' : 'سحب نقدي من الخزينة'}
      >
        <form onSubmit={handleSaveManual} className="space-y-4">
          <div className="p-3 rounded-xl bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 flex justify-between items-center text-xs">
            <span className="text-slate-600 dark:text-zinc-400">الرصيد المتاح حالياً بالخزينة:</span>
            <span className="text-base font-black font-mono text-amber-600 dark:text-amber-400">
              {formatCurrency(treasuryBalance)}
            </span>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">المبلغ (ج.م):</label>
            <input
              type="number"
              step="5"
              required
              value={isNaN(manualAmount) ? '' : (manualAmount || '')}
              onChange={(e) => setManualAmount(Number(e.target.value) || 0)}
              placeholder="0.00"
              className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-base text-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">البيان / سبب العملية (إجباري):</label>
            <input
              type="text"
              required
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder={manualType === 'manual_deposit' ? 'مثال: تغذية الخزينة من الحساب البنكي...' : 'مثال: مسحوبات شخصية، سداد فاتورة كهرباء...'}
              className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
            <Button
              variant={manualType === 'manual_deposit' ? 'primary' : 'danger'}
              type="submit"
              className="flex-1"
            >
              {manualType === 'manual_deposit' ? 'تأكيد الإيداع' : 'تأكيد السحب'}
            </Button>
            <Button variant="secondary" type="button" onClick={() => setManualModalOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
