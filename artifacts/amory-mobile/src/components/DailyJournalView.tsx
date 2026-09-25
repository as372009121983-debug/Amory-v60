import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate, getTodayDate } from '../lib/formatters';
import { storage } from '../lib/storage';
import {
  Calendar,
  Printer,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Wallet,
  FileText,
  Boxes,
  PieChart,
  RotateCcw,
  UserCheck,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { StatCard } from './ui/StatCard';

export const DailyJournalView: React.FC = () => {
  const {
    salesInvoices,
    purchaseInvoices,
    returns,
    receipts,
    expenses,
    items,
    currentUser,
    canViewProfits,
    canViewTreasuryBalance,
    setPrintDoc,
  } = useApp();

  const [selectedDate, setSelectedDate] = useState<string>(getTodayDate());
  const isCashier = currentUser.role === 'cashier';

  // Treasury daily summary (Admin/Accountant only)
  const treasuryDaily = useMemo(() => {
    if (isCashier) return null;
    return storage.getTreasuryDailySummary(selectedDate);
  }, [selectedDate, isCashier]);

  // Daily Sales (excluding cancelled) - filtered for cashier
  const dailySales = useMemo(() => {
    return salesInvoices.filter((i) => {
      if (i.invoice_date !== selectedDate || i.status === 'cancelled') return false;
      if (isCashier) {
        return (
          i.created_by === currentUser.full_name ||
          i.created_by === currentUser.username ||
          i.created_by === currentUser.name
        );
      }
      return true;
    });
  }, [salesInvoices, selectedDate, isCashier, currentUser]);

  // Daily Returns (sale returns) - filtered for cashier
  const dailyReturns = useMemo(() => {
    return returns.filter((r) => {
      if (r.date !== selectedDate || r.status === 'cancelled' || r.return_type !== 'sale_return') {
        return false;
      }
      if (isCashier) {
        return (
          r.created_by === currentUser.full_name ||
          r.created_by === currentUser.username ||
          r.created_by === currentUser.name
        );
      }
      return true;
    });
  }, [returns, selectedDate, isCashier, currentUser]);

  const returnsTotals = useMemo(() => {
    const totalAmount = dailyReturns.reduce((sum, r) => sum + (r.total_amount || 0), 0);
    let totalCost = 0;
    dailyReturns.forEach((r) => {
      r.lines.forEach((line) => {
        const item = items.find((it) => it.id === line.item_id);
        totalCost += (line.quantity || 0) * (item?.cost_price || 0);
      });
    });
    return { totalAmount, totalCost, count: dailyReturns.length };
  }, [dailyReturns, items]);

  const salesTotals = useMemo(() => {
    let grossSales = 0;
    let cashSales = 0;
    let creditSales = 0;
    let totalCost = 0;

    dailySales.forEach((inv) => {
      grossSales += inv.final_total;
      cashSales += inv.paid_cash;
      creditSales += inv.remaining_debt;

      inv.lines.forEach((line) => {
        totalCost += line.quantity * (line.cost_price || 0);
      });
    });

    const netSales = Math.max(0, grossSales - returnsTotals.totalAmount);
    const netCOGS = Math.max(0, totalCost - returnsTotals.totalCost);
    const grossProfit = netSales - netCOGS;
    return { grossSales, netSales, cashSales, creditSales, grossProfit };
  }, [dailySales, returnsTotals]);

  // Daily Purchases (excluding cancelled) - Admin & Accountant only
  const dailyPurchases = useMemo(() => {
    if (isCashier) return [];
    return purchaseInvoices.filter(
      (i) => i.invoice_date === selectedDate && i.status !== 'cancelled'
    );
  }, [purchaseInvoices, selectedDate, isCashier]);

  const purchaseTotals = useMemo(() => {
    return dailyPurchases.reduce((sum, p) => sum + p.final_total, 0);
  }, [dailyPurchases]);

  // Daily Receipts (Customer Collections)
  const dailyCustomerReceipts = useMemo(() => {
    if (isCashier) return 0;
    return receipts
      .filter((r) => r.date === selectedDate && r.receipt_type === 'customer_receipt')
      .reduce((sum, r) => sum + r.amount, 0);
  }, [receipts, selectedDate, isCashier]);

  // Daily Supplier Payments
  const dailySupplierPayments = useMemo(() => {
    if (isCashier) return 0;
    return receipts
      .filter((r) => r.date === selectedDate && r.receipt_type === 'supplier_payment')
      .reduce((sum, r) => sum + r.amount, 0);
  }, [receipts, selectedDate, isCashier]);

  // Daily Expenses
  const dailyExpensesTotal = useMemo(() => {
    if (isCashier) return 0;
    return expenses
      .filter((e) => e.date === selectedDate)
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses, selectedDate, isCashier]);

  // Net Profit for day (Sales Gross Profit - Expenses)
  const netDailyProfit = useMemo(() => {
    if (!canViewProfits) return 0;
    return salesTotals.grossProfit - dailyExpensesTotal;
  }, [salesTotals.grossProfit, dailyExpensesTotal, canViewProfits]);

  return (
    <div className="p-3 sm:p-5 w-full max-w-full 2xl:max-w-[1920px] mx-auto space-y-4 pb-28 md:pb-8 text-slate-900 dark:text-zinc-100">
      {/* Date Filter & Print Strip */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 p-3 sm:p-4 rounded-2xl shadow-xs">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              {isCashier ? 'يومية مبيعات الكاشير' : 'اليومية العامة للمحل'}
            </h2>
            <span className="text-xs text-slate-600 dark:text-zinc-400">
              {isCashier
                ? `ملخص فواتيرك ومبيعاتك لتاريخ ${formatDate(selectedDate)}`
                : 'ملخص العمليات والتدفق النقدي لتاريخ محدد'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
          />

          <Button
            variant="secondary"
            size="sm"
            icon={<Printer className="w-4 h-4" />}
            onClick={() => window.print()}
          >
            طباعة اليومية
          </Button>
        </div>
      </div>

      {/* Main KPI Strip for Cashier */}
      {isCashier ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            title="صافي مبيعاتك اليوم"
            value={formatCurrency(salesTotals.netSales)}
            subtitle={`${dailySales.length} فاتورة مسجلة باسمك`}
            icon={<ShoppingBag className="w-5 h-5" />}
            variant="emerald"
          />

          <StatCard
            title="المحصل نقداً منك"
            value={formatCurrency(salesTotals.cashSales)}
            subtitle="نقدية محصلة من الزبائن"
            icon={<Wallet className="w-5 h-5" />}
            variant="amber"
          />

          <StatCard
            title="المبيعات الآجلة"
            value={formatCurrency(salesTotals.creditSales)}
            subtitle="حسابات عملاء على الفواتير"
            icon={<DollarSign className="w-5 h-5" />}
            variant="zinc"
          />

          <StatCard
            title="مرتجعات مبيعاتك"
            value={formatCurrency(returnsTotals.totalAmount)}
            subtitle={`${returnsTotals.count} عملية مرتجع`}
            icon={<RotateCcw className="w-5 h-5" />}
            variant={returnsTotals.totalAmount > 0 ? 'rose' : 'zinc'}
          />
        </div>
      ) : (
        /* Main KPI Strip for Admin & Accountant */
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <StatCard
            title="صافي المبيعات"
            value={formatCurrency(salesTotals.netSales)}
            subtitle={`إجمالي: ${formatCurrency(salesTotals.grossSales)} (${dailySales.length} فاتورة)`}
            icon={<ShoppingBag className="w-5 h-5" />}
            variant="emerald"
          />

          <StatCard
            title="مرتجعات المبيعات"
            value={formatCurrency(returnsTotals.totalAmount)}
            subtitle={`${returnsTotals.count} حركة مرتجع`}
            icon={<RotateCcw className="w-5 h-5" />}
            variant={returnsTotals.totalAmount > 0 ? 'rose' : 'zinc'}
          />

          <StatCard
            title="مشتريات اليوم"
            value={formatCurrency(purchaseTotals)}
            subtitle={`${dailyPurchases.length} فاتورة توريد`}
            icon={<Boxes className="w-5 h-5" />}
            variant="blue"
          />

          <StatCard
            title="مصروفات اليوم"
            value={formatCurrency(dailyExpensesTotal)}
            subtitle="مصاريف تشغيلية ونثرية"
            icon={<ArrowUpRight className="w-5 h-5" />}
            variant="rose"
          />

          {canViewProfits && (
            <StatCard
              title="صافي ربح اليوم"
              value={formatCurrency(netDailyProfit)}
              subtitle={`مجمل الربح: ${formatCurrency(salesTotals.grossProfit)}`}
              icon={<TrendingUp className="w-5 h-5" />}
              variant={netDailyProfit >= 0 ? 'amber' : 'rose'}
            />
          )}
        </div>
      )}

      {/* Cash Flow Summary & Breakdown (Admin & Accountant only) */}
      {!isCashier && treasuryDaily && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Cash Flow Box */}
          <Card className="space-y-3 shadow-xs">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-200 dark:border-zinc-800 pb-2">
              <Wallet className="w-4 h-4 text-amber-500" />
              <span>حركة الخزينة والسيولة النقدية اليوم</span>
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/80">
                <span className="text-slate-600 dark:text-zinc-400">رصيد بداية اليوم (أول المدة):</span>
                <span className="font-mono font-bold text-slate-800 dark:text-zinc-200">
                  {formatCurrency(treasuryDaily.openingBalance)}
                </span>
              </div>

              <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/80">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">إجمالي المقبوضات النقدية:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  +{formatCurrency(treasuryDaily.totalIn)}
                </span>
              </div>

              <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/80">
                <span className="text-rose-600 dark:text-rose-400 font-bold">إجمالي المدفوعات النقدية:</span>
                <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                  -{formatCurrency(treasuryDaily.totalOut)}
                </span>
              </div>

              <div className="flex justify-between p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30">
                <span className="text-amber-800 dark:text-amber-400 font-black">رصيد نهاية اليوم (الختامي):</span>
                <span className="font-mono font-black text-amber-700 dark:text-amber-400 text-sm">
                  {formatCurrency(treasuryDaily.closingBalance)}
                </span>
              </div>
            </div>
          </Card>

          {/* Collections & Debts Box */}
          <Card className="space-y-3 shadow-xs">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-200 dark:border-zinc-800 pb-2">
              <PieChart className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>تحصيلات ومديونيات اليوم</span>
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/80">
                <span className="text-slate-600 dark:text-zinc-400">مبيعات آجلة لعملاء (ديون جديدة):</span>
                <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                  {formatCurrency(salesTotals.creditSales)}
                </span>
              </div>

              <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/80">
                <span className="text-slate-600 dark:text-zinc-400">تحصيلات من عملاء سابقين (سندات قبض):</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(dailyCustomerReceipts)}
                </span>
              </div>

              <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/80">
                <span className="text-slate-600 dark:text-zinc-400">سداد دفعات لموردين (سندات صرف):</span>
                <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                  {formatCurrency(dailySupplierPayments)}
                </span>
              </div>

              <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
                <span className="text-slate-700 dark:text-zinc-300 font-bold">إجمالي فواتير اليوم (بيع + شراء):</span>
                <span className="font-mono font-black text-slate-900 dark:text-white text-sm">
                  {dailySales.length + dailyPurchases.length} فاتورة
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Daily Invoices Table */}
      <Card padding="none" className="overflow-hidden shadow-xs">
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 dark:text-white">
            {isCashier
              ? `فواتيرك الصادرة اليوم (${dailySales.length})`
              : `فواتير المبيعات الصادرة اليوم (${dailySales.length})`}
          </h3>
        </div>

        {dailySales.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-zinc-400 text-xs">
            لم تسجل أي فواتير بيع في هذا التاريخ.
          </div>
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="block sm:hidden divide-y divide-slate-200 dark:divide-zinc-800">
              {dailySales.map((inv) => (
                <div key={inv.id} className="p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-xs">
                      #{inv.invoice_number}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                      {inv.lines.length} صنف
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {inv.customer_name}
                    </span>
                    <span className="text-base font-black font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                      {formatCurrency(inv.final_total)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100 dark:border-zinc-800/80">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500 dark:text-zinc-400">مدفوع:</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(inv.paid_cash)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500 dark:text-zinc-400">آجل:</span>
                      <span className={`font-mono font-bold ${inv.remaining_debt > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-zinc-500'}`}>
                        {inv.remaining_debt > 0 ? formatCurrency(inv.remaining_debt) : 'مسدد'}
                      </span>
                    </div>
                  </div>

                  {!isCashier && (
                    <div className="text-[10px] text-slate-400 dark:text-zinc-500 pt-0.5">
                      الكاشير: {inv.created_by}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 dark:bg-zinc-950/80 text-slate-700 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800 font-bold">
                  <tr>
                    <th className="p-3">رقم الفاتورة</th>
                    <th className="p-3">العميل</th>
                    <th className="p-3 text-center">عدد البنود</th>
                    <th className="p-3 text-left">قيمة الفاتورة</th>
                    <th className="p-3 text-left">المدفوع كاش</th>
                    <th className="p-3 text-left">المتبقي آجل</th>
                    {!isCashier && <th className="p-3 text-left">الكاشير</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60">
                  {dailySales.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-zinc-850/60 transition-colors">
                      <td className="p-3 font-mono font-bold text-amber-600 dark:text-amber-400">{inv.invoice_number}</td>
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{inv.customer_name}</td>
                      <td className="p-3 text-center font-mono text-slate-600 dark:text-zinc-400">{inv.lines.length}</td>
                      <td className="p-3 text-left font-mono font-black text-amber-600 dark:text-amber-400 tabular-nums">
                        {formatCurrency(inv.final_total)}
                      </td>
                      <td className="p-3 text-left font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatCurrency(inv.paid_cash)}
                      </td>
                      <td className="p-3 text-left font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                        {inv.remaining_debt > 0 ? formatCurrency(inv.remaining_debt) : '-'}
                      </td>
                      {!isCashier && (
                        <td className="p-3 text-left font-mono text-slate-500 dark:text-zinc-400">{inv.created_by}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};
