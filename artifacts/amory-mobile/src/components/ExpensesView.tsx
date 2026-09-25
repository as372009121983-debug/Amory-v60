import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate, getTodayDate } from '../lib/formatters';
import { storage } from '../lib/storage';
import {
  CreditCard,
  Plus,
  Calendar,
  X,
  DollarSign,
  TrendingDown,
  PieChart,
  Receipt,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { StatCard } from './ui/StatCard';
import { Modal } from './ui/Modal';

export const ExpensesView: React.FC = () => {
  const { expenses, expenseCategories, currentUser, refreshData, showToast, treasuryBalance } = useApp();

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(expenseCategories[0]?.id || '');
  const [amount, setAmount] = useState<number>(0);
  const [expenseDate, setExpenseDate] = useState<string>(getTodayDate());
  const [notes, setNotes] = useState<string>('');

  // Total expenses
  const totalExpenses = useMemo(() => {
    return expenses.reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  // Grouped expenses by category
  const categoryStats = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((e) => {
      const current = map.get(e.category_name) || 0;
      map.set(e.category_name, current + e.amount);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      showToast('error', 'خطأ في المبلغ', 'يرجى إدخال مبلغ أكبر من صفر');
      return;
    }

    const cat = expenseCategories.find((c) => c.id === selectedCategoryId);
    if (!cat) {
      showToast('error', 'خطأ', 'يرجى اختيار تصنيف المصروف');
      return;
    }

    if (amount > treasuryBalance) {
      showToast('warning', 'تنبيه الخزينة', 'المصروف يتجاوز رصيد الخزينة الحالي، سيصبح الرصيد سالباً.');
    }

    try {
      storage.saveExpense(
        {
          category_id: cat.id,
          category_name: cat.name,
          amount: Number(amount),
          date: expenseDate,
          notes: notes || undefined,
        },
        currentUser
      );

      refreshData();
      setIsModalOpen(false);
      setAmount(0);
      setNotes('');
      showToast(
        'success',
        'تم تسجيل المصروف',
        `تم تسجيل ${formatCurrency(amount)} وخصمها من الخزينة بنجاح`
      );
    } catch (err: any) {
      showToast('error', 'خطأ في الحفظ', err.message);
    }
  };

  return (
    <div className="p-3 sm:p-5 w-full max-w-full 2xl:max-w-[1920px] mx-auto space-y-4 pb-28 md:pb-8 text-slate-900 dark:text-zinc-100">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          title="إجمالي المصروفات التشغيلية"
          value={formatCurrency(totalExpenses)}
          subtitle="إيجارات، كهرباء، صيانة، يوميات"
          icon={<TrendingDown className="w-5 h-5" />}
          variant="rose"
        />

        <StatCard
          title="عدد أذونات الصرف"
          value={expenses.length}
          subtitle="حركة مصروف مسجلة بالدفاتر"
          icon={<Receipt className="w-5 h-5" />}
          variant="zinc"
        />

        <StatCard
          title="أعلى بند مصروفات"
          value={categoryStats[0] ? categoryStats[0][0] : '-'}
          subtitle={categoryStats[0] ? formatCurrency(categoryStats[0][1]) : '-'}
          icon={<PieChart className="w-5 h-5" />}
          variant="amber"
        />
      </div>

      {/* Action Strip */}
      <div className="flex items-center justify-between bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 p-3 sm:p-4 rounded-2xl shadow-xs">
        <span className="text-xs font-bold text-slate-800 dark:text-zinc-300">
          سجل أذونات صرف المصروفات العامة
        </span>

        <Button
          variant="danger"
          size="md"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            setSelectedCategoryId(expenseCategories[0]?.id || '');
            setAmount(0);
            setNotes('');
            setExpenseDate(getTodayDate());
            setIsModalOpen(true);
          }}
          className="font-black shadow-md shadow-rose-500/20"
        >
          تسجيل مصروف جديد
        </Button>
      </div>

      {/* Expenses Table */}
      <Card padding="none" className="overflow-hidden shadow-xs">
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 dark:text-white">سجل المصروفات</h3>
        </div>

        {expenses.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-zinc-400 text-xs">
            لا توجد مصروفات مسجلة حتى الآن.
          </div>
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="block sm:hidden divide-y divide-slate-200 dark:divide-zinc-800">
              {expenses.map((e) => (
                <div key={e.id} className="p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="rose" size="sm">
                      {e.category_name}
                    </Badge>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                      {formatDate(e.date)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-900 dark:text-white font-medium truncate">
                      {e.notes || 'بدون بيان'}
                    </span>
                    <span className="text-base font-black font-mono text-rose-600 dark:text-rose-400 tabular-nums shrink-0">
                      -{formatCurrency(e.amount)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 pt-1 border-t border-slate-100 dark:border-zinc-800/80">
                    <span>مسجل الصرف: {e.created_by}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 dark:bg-zinc-950/80 text-slate-700 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800 font-bold">
                  <tr>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">بند المصروف</th>
                    <th className="p-3 text-center">المبلغ</th>
                    <th className="p-3">البيان / التفاصيل</th>
                    <th className="p-3 text-left">المستخدم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60">
                  {expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-zinc-850/60 transition-colors">
                      <td className="p-3 font-mono text-slate-600 dark:text-zinc-300">{formatDate(e.date)}</td>
                      <td className="p-3">
                        <Badge variant="rose" size="sm">
                          {e.category_name}
                        </Badge>
                      </td>
                      <td className="p-3 text-center font-mono font-black text-rose-600 dark:text-rose-400 tabular-nums">
                        {formatCurrency(e.amount)}
                      </td>
                      <td className="p-3 text-slate-900 dark:text-white font-medium">{e.notes || '-'}</td>
                      <td className="p-3 text-left font-mono text-slate-500 dark:text-zinc-400">{e.created_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Add Expense Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        maxWidth="md"
        title="تسجيل إذن صرف مصروف من الخزينة"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">بند / تصنيف المصروف:</label>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
                className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-base text-rose-600 dark:text-rose-400 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">التاريخ:</label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">البيان / تفاصيل الصرف:</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: فاتورة كهرباء شهر سبتمبر، شاي وسكر..."
              className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
            <Button variant="danger" type="submit" className="flex-1">
              خصم وصرف من الخزينة
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
