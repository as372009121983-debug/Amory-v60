import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatNumber, formatDate, getTodayDate } from '../lib/formatters';
import {
  TrendingUp,
  ShoppingCart,
  Wallet,
  AlertTriangle,
  PlusCircle,
  Receipt as ReceiptIcon,
  CreditCard,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Clock,
  Printer,
  FileText,
  Boxes,
  ShieldCheck,
} from 'lucide-react';
import { StatCard } from './ui/StatCard';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

export const DashboardView: React.FC = () => {
  const {
    currentUser,
    setActiveTab,
    salesInvoices,
    purchaseInvoices,
    returns,
    receipts,
    expenses,
    treasuryBalance,
    settings,
    items,
    itemStockMap,
    canViewProfits,
    canViewTreasuryBalance,
    setPrintDoc,
  } = useApp();

  const today = getTodayDate();

  // 0. فحص النسخ الاحتياطي (تذكير أسبوعي للمدير)
  const showBackupReminder = useMemo(() => {
    if (currentUser.role !== 'admin') return false;
    if (!settings.last_backup_at) return true;
    const daysSince =
      (Date.now() - new Date(settings.last_backup_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= 7;
  }, [currentUser.role, settings.last_backup_at]);

  // 1. حسابات مبيعات اليوم ومرتجعات المبيعات
  const todaySalesInvoices = useMemo(() => {
    return salesInvoices.filter((inv) => inv.invoice_date === today && inv.status !== 'cancelled');
  }, [salesInvoices, today]);

  const todayGrossSalesTotal = useMemo(() => {
    return todaySalesInvoices.reduce((sum, inv) => sum + (inv.final_total || 0), 0);
  }, [todaySalesInvoices]);

  const todayReturns = useMemo(() => {
    return returns.filter(
      (r) => r.date === today && r.status !== 'cancelled' && r.return_type === 'sale_return'
    );
  }, [returns, today]);

  const todayReturnsTotal = useMemo(() => {
    return todayReturns.reduce((sum, r) => sum + (r.total_amount || 0), 0);
  }, [todayReturns]);

  // صافي المبيعات بعد خصم المرتجعات
  const todayNetSales = useMemo(() => {
    return Math.max(0, todayGrossSalesTotal - todayReturnsTotal);
  }, [todayGrossSalesTotal, todayReturnsTotal]);

  const todayCashCollected = useMemo(() => {
    return todaySalesInvoices.reduce((sum, inv) => sum + (inv.paid_cash || 0), 0);
  }, [todaySalesInvoices]);

  // 2. حسابات مشتريات ومصروفات وسندات اليوم
  const todayExpenses = useMemo(() => {
    return expenses.filter((e) => e.date === today);
  }, [expenses, today]);

  const todayExpensesTotal = useMemo(() => {
    return todayExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [todayExpenses]);

  // 3. أرباح اليوم بعد خصم تكلفة البضاعة والمرتجعات والمصروفات (للمدير والمحاسب فقط)
  const todayProfits = useMemo(() => {
    if (!canViewProfits) return 0;
    let costOfGoodsSold = 0;
    todaySalesInvoices.forEach((inv) => {
      inv.lines.forEach((l) => {
        costOfGoodsSold += (l.cost_price || 0) * (l.quantity || 0);
      });
    });

    let costOfReturns = 0;
    todayReturns.forEach((r) => {
      r.lines.forEach((l) => {
        const it = items.find((item) => item.id === l.item_id);
        costOfReturns += (l.quantity || 0) * (it?.cost_price || 0);
      });
    });

    const netSales = todayGrossSalesTotal - todayReturnsTotal;
    const netCOGS = Math.max(0, costOfGoodsSold - costOfReturns);
    const grossProfit = netSales - netCOGS;
    return grossProfit - todayExpensesTotal;
  }, [canViewProfits, todaySalesInvoices, todayGrossSalesTotal, todayReturns, todayReturnsTotal, items, todayExpensesTotal]);

  // 4. أصناف أوشكت على النفاد
  const lowStockItems = useMemo(() => {
    return items
      .map((item) => {
        const stock = itemStockMap.get(item.id) ?? (item.current_stock || 0);
        return { ...item, stock };
      })
      .filter((item) => item.stock <= item.min_stock)
      .slice(0, 8);
  }, [items, itemStockMap]);

  // 5. آخر النشاطات لليوم
  const recentTransactions = useMemo(() => {
    return [...todaySalesInvoices]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6);
  }, [todaySalesInvoices]);

  return (
    <div className="p-3 sm:p-6 space-y-6 w-full max-w-full 2xl:max-w-[1920px] mx-auto text-slate-900 dark:text-zinc-100">
      {/* Weekly Backup Reminder Banner (for admin) */}
      {showBackupReminder && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-900 dark:text-white">تذكير بالنسخ الاحتياطي الدوري</h4>
              <p className="text-xs text-slate-700 dark:text-zinc-300">
                {settings.last_backup_at
                  ? `مر أكثر من أسبوع على آخر نسخة احتياطية (${new Date(settings.last_backup_at).toLocaleDateString('ar-EG')}). يُنصح بتنزيل نسخة احتياطية الآن للحفاظ على بيانات المحل.`
                  : 'لم تقم بتنزيل نسخة احتياطية من بيانات المحل بعد. احرص على حفظ نسخة أسبوعية لتأمين حساباتك ومخزونك.'}
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setActiveTab('users_settings')}
            className="shrink-0"
          >
            إدارة النسخ الاحتياطي
          </Button>
        </div>
      )}

      {/* Top Banner / Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-sm relative overflow-hidden transition-colors">
        <div className="space-y-1.5 relative z-10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-400 border border-amber-500/30">
              وردية اليوم
            </span>
            <span className="text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-1 font-mono">
              <Calendar className="w-3.5 h-3.5 text-amber-500" />
              {formatDate(today)}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            أهلاً بك، {currentUser.full_name}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400">
            {currentUser.role === 'admin'
              ? 'لوحة الإشراف المالي ومتابعة المبيعات والمخزن لحظياً'
              : currentUser.role === 'accountant'
              ? 'متابعة قيود اليومية والحركات المالية والخزينة'
              : 'شاشة المبيعات السريعة وتسجيل الفواتير'}
          </p>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2.5 relative z-10">
          <Button
            variant="primary"
            size="lg"
            icon={<ShoppingCart className="w-5 h-5" />}
            onClick={() => setActiveTab('sales_invoice')}
            className="mobile-dashboard-primary-action shadow-lg shadow-amber-500/20 font-black cursor-pointer"
          >
            فاتورة مبيعات جديدة (F2)
          </Button>
        </div>
      </div>

      {/* Primary KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Sales Today (Net of returns) */}
        <StatCard
          title={todayReturnsTotal > 0 ? 'صافي مبيعات اليوم' : 'مبيعات اليوم'}
          value={formatCurrency(todayNetSales)}
          subtitle={
            todayReturnsTotal > 0
              ? `${todaySalesInvoices.length} فواتير (مرتجع: -${formatCurrency(todayReturnsTotal)})`
              : `${todaySalesInvoices.length} فواتير مباعة`
          }
          icon={<ShoppingCart className="w-5 h-5" />}
          variant="amber"
          onClick={() => setActiveTab('sales_invoice')}
        />

        {/* Treasury Balance or Cash Collected (Hidden for Cashier) */}
        {canViewTreasuryBalance ? (
          <StatCard
            title="رصيد الخزينة الحالي"
            value={formatCurrency(treasuryBalance)}
            subtitle={`محصل اليوم: ${formatCurrency(todayCashCollected)}`}
            icon={<Wallet className="w-5 h-5" />}
            variant="emerald"
            onClick={() => setActiveTab('treasury')}
          />
        ) : (
          <StatCard
            title="تحصيل اليوم (كاش)"
            value={formatCurrency(todayCashCollected)}
            subtitle={`${todaySalesInvoices.length} فواتير مسددة`}
            icon={<Wallet className="w-5 h-5" />}
            variant="emerald"
          />
        )}

        {/* Profits (Hidden for cashier) */}
        {canViewProfits ? (
          <StatCard
            title="أرباح اليوم التقريبية"
            value={formatCurrency(todayProfits)}
            subtitle={`بعد خصم المرتجعات والمصاريف (${formatCurrency(todayExpensesTotal)})`}
            icon={<TrendingUp className="w-5 h-5" />}
            variant={todayProfits >= 0 ? 'emerald' : 'rose'}
            onClick={() => setActiveTab('reports')}
          />
        ) : (
          <StatCard
            title="إجمالي المصروفات اليوم"
            value={formatCurrency(todayExpensesTotal)}
            subtitle={`${todayExpenses.length} بنود صرف`}
            icon={<CreditCard className="w-5 h-5" />}
            variant="rose"
            onClick={() => setActiveTab('expenses')}
          />
        )}

        {/* Low Stock Warning */}
        <StatCard
          title="نواقص المخزون"
          value={lowStockItems.length}
          subtitle="أصناف وصلت للحد الأدنى"
          icon={<AlertTriangle className="w-5 h-5" />}
          variant={lowStockItems.length > 0 ? 'rose' : 'zinc'}
          onClick={() => setActiveTab('items')}
        />
      </div>

      {/* Quick Launchpad Buttons */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-black tracking-wider text-zinc-500 dark:text-zinc-400 uppercase">
          إجراءات سريعة
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <button
            onClick={() => setActiveTab('sales_invoice')}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-amber-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-all text-right group cursor-pointer shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-zinc-900 dark:text-white truncate">فاتورة بيع</div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">سريع (F2)</div>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('purchase_invoice')}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-blue-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-all text-right group cursor-pointer shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-zinc-900 dark:text-white truncate">فاتورة شراء</div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">توريد بضاعة</div>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('receipts')}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-all text-right group cursor-pointer shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <ReceiptIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-zinc-900 dark:text-white truncate">سند قبض / صرف</div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">عميل أو مورد</div>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('expenses')}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-rose-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-all text-right group cursor-pointer shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <CreditCard className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-zinc-900 dark:text-white truncate">تسجيل مصروف</div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">كهرباء، إيجار، عمالة</div>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('inventory_audit')}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-purple-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-all text-right group cursor-pointer col-span-2 sm:col-span-1 shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Boxes className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-zinc-900 dark:text-white truncate">جرد المخزن</div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">تسوية فروقات</div>
            </div>
          </button>
        </div>
      </div>

      {/* Main Grid: Recent Invoices & Low Stock Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent Invoices Today */}
        <Card className="space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-black text-slate-900 dark:text-white">آخر فواتير المبيعات اليوم</h3>
            </div>
            <button
              onClick={() => setActiveTab('sales_invoice')}
              className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
            >
              عرض الكل
            </button>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-zinc-400 text-xs">
              لم يتم إصدار فواتير بيع حتى الآن اليوم. ابدأ أول عملية بيع بالضغط على "فاتورة بيع جديدة".
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentTransactions.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800/80 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{inv.customer_name}</span>
                      <span className="text-[10px] font-mono bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400 px-1.5 py-0.5 rounded border border-slate-200 dark:border-zinc-700">
                        {inv.invoice_number}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {inv.lines.length} صنف · {inv.remaining_debt > 0 ? 'آجل جزئي' : 'كاش بالكامل'}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-left">
                      <div className="text-xs font-black font-mono text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(inv.final_total)}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                        المدفوع: {formatCurrency(inv.paid_cash)}
                      </div>
                    </div>
                    <button
                      onClick={() => setPrintDoc({ type: 'sales_invoice', data: inv, format: 'thermal' })}
                      className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 flex items-center justify-center text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                      title="طباعة إيصال"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Low Stock Items Alert */}
        <Card className="space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              <h3 className="text-sm font-black text-slate-900 dark:text-white">تنبيهات نواقص المخزون</h3>
            </div>
            <button
              onClick={() => setActiveTab('items')}
              className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
            >
              عرض الأصناف
            </button>
          </div>

          {lowStockItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-zinc-400 text-xs flex flex-col items-center justify-center gap-2">
              <span className="w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                ✓
              </span>
              <span>المخزون ممتاز! لا توجد أصناف تحت حد الأمان حالياً.</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {lowStockItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800/80 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors"
                >
                  <div className="space-y-0.5 min-w-0 pr-1">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{item.name}</div>
                    <div className="text-[10px] text-slate-500 dark:text-zinc-400 flex items-center gap-2">
                      <span>كود: {item.code}</span>
                      <span>·</span>
                      <span>الرف: {item.shelf_location || '-'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={item.stock === 0 ? 'rose' : 'amber'}>
                      {item.stock} {item.unit}
                    </Badge>
                    <button
                      onClick={() => setActiveTab('purchase_invoice')}
                      className="text-[10px] font-bold px-2 py-1 rounded bg-cyan-600/15 text-cyan-700 dark:text-cyan-400 border border-cyan-500/30 hover:bg-cyan-600/25 transition-colors cursor-pointer"
                    >
                      طلب شراء
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
