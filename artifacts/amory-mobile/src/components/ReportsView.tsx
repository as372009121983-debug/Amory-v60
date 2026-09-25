import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatNumber, formatDate } from '../lib/formatters';
import {
  TrendingUp,
  Download,
  Printer,
  Calendar,
  DollarSign,
  AlertTriangle,
  Award,
  Package,
  FileSpreadsheet,
  PieChart,
  ShieldAlert,
  ArrowUpRight,
  TrendingDown,
  RotateCcw,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { StatCard } from './ui/StatCard';

export const ReportsView: React.FC = () => {
  const { salesInvoices, returns, expenses, items, customers, canViewProfits, customerBalanceMap } = useApp();

  const [activeReportTab, setActiveReportTab] = useState<'profitability' | 'top_items' | 'aging_debts'>('profitability');
  const [startDate, setStartDate] = useState<string>('2026-01-01');
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Restricted Access Guard
  if (!canViewProfits) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-3">
        <ShieldAlert className="w-16 h-16 text-rose-500 mx-auto" />
        <h3 className="text-lg font-black text-slate-900 dark:text-white">صلاحيات غير كافية</h3>
        <p className="text-xs text-slate-600 dark:text-zinc-400">
          تقارير الأرباح والتحليلات المالية والديون مخصصة للمدير والمحاسب فقط.
        </p>
      </div>
    );
  }

  // Filtered sales in period (excluding cancelled)
  const periodSales = useMemo(() => {
    return salesInvoices.filter(
      (inv) =>
        inv.invoice_date >= startDate &&
        inv.invoice_date <= endDate &&
        inv.status !== 'cancelled'
    );
  }, [salesInvoices, startDate, endDate]);

  // Filtered returns in period (sale returns only, excluding cancelled)
  const periodReturns = useMemo(() => {
    return returns.filter(
      (r) =>
        r.date >= startDate &&
        r.date <= endDate &&
        r.status !== 'cancelled' &&
        r.return_type === 'sale_return'
    );
  }, [returns, startDate, endDate]);

  // Filtered expenses in period
  const periodExpenses = useMemo(() => {
    return expenses.filter((e) => e.date >= startDate && e.date <= endDate);
  }, [expenses, startDate, endDate]);

  // Profitability metrics
  const profitMetrics = useMemo(() => {
    let grossSalesRevenue = 0;
    let grossCostOfGoodsSold = 0;
    let invoiceProfits: Array<{
      id: string;
      invoice_number: string;
      customer_name: string;
      date: string;
      revenue: number;
      cost: number;
      grossProfit: number;
      marginPercent: number;
    }> = [];

    const itemProfitMap: {
      [itemId: string]: {
        name: string;
        code: string;
        qtySold: number;
        revenue: number;
        cost: number;
        profit: number;
      };
    } = {};

    periodSales.forEach((inv) => {
      let invRevenue = inv.final_total;
      let invCost = 0;

      inv.lines.forEach((line) => {
        const lineCost = line.quantity * (line.cost_price || 0);
        invCost += lineCost;

        if (!itemProfitMap[line.item_id]) {
          itemProfitMap[line.item_id] = {
            name: line.item_name,
            code: line.item_code,
            qtySold: 0,
            revenue: 0,
            cost: 0,
            profit: 0,
          };
        }

        itemProfitMap[line.item_id].qtySold += line.quantity;
        itemProfitMap[line.item_id].revenue += line.total;
        itemProfitMap[line.item_id].cost += lineCost;
        itemProfitMap[line.item_id].profit += line.total - lineCost;
      });

      const invProfit = invRevenue - invCost;
      const margin = invRevenue > 0 ? (invProfit / invRevenue) * 100 : 0;

      grossSalesRevenue += invRevenue;
      grossCostOfGoodsSold += invCost;

      invoiceProfits.push({
        id: inv.id,
        invoice_number: inv.invoice_number,
        customer_name: inv.customer_name,
        date: inv.invoice_date,
        revenue: invRevenue,
        cost: invCost,
        grossProfit: invProfit,
        marginPercent: margin,
      });
    });

    // Deduct returns
    let totalReturnsAmount = 0;
    let totalReturnsCost = 0;
    periodReturns.forEach((ret) => {
      totalReturnsAmount += ret.total_amount;
      ret.lines.forEach((line) => {
        const item = items.find((it) => it.id === line.item_id);
        const lineCost = line.quantity * (item?.cost_price || 0);
        totalReturnsCost += lineCost;

        if (itemProfitMap[line.item_id]) {
          itemProfitMap[line.item_id].qtySold -= line.quantity;
          itemProfitMap[line.item_id].revenue -= line.total;
          itemProfitMap[line.item_id].cost -= lineCost;
          itemProfitMap[line.item_id].profit -= (line.total - lineCost);
        }
      });
    });

    const netSalesRevenue = Math.max(0, grossSalesRevenue - totalReturnsAmount);
    const netCostOfGoodsSold = Math.max(0, grossCostOfGoodsSold - totalReturnsCost);
    const totalExpensesAmount = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalGrossProfit = netSalesRevenue - netCostOfGoodsSold;
    const netProfit = totalGrossProfit - totalExpensesAmount;

    return {
      grossSalesRevenue,
      totalReturnsAmount,
      totalReturnsCost,
      netSalesRevenue,
      netCostOfGoodsSold,
      totalGrossProfit,
      totalExpensesAmount,
      netProfit,
      invoiceProfits,
      itemProfitMap,
    };
  }, [periodSales, periodReturns, periodExpenses, items]);

  // Top selling list sorted by qty sold
  const topSellingList = useMemo(() => {
    return Object.values(profitMetrics.itemProfitMap).sort((a, b) => b.qtySold - a.qtySold);
  }, [profitMetrics.itemProfitMap]);

  // Debt Aging list (الأرصدة المدينة للعملاء)
  const debtsList = useMemo(() => {
    return customers
      .map((c) => {
        const bal = customerBalanceMap.get(c.id) ?? (c.current_balance || 0);
        return {
          ...c,
          current_balance: bal,
        };
      })
      .filter((c) => c.current_balance > 0)
      .sort((a, b) => b.current_balance - a.current_balance);
  }, [customers, customerBalanceMap]);

  return (
    <div className="p-3 sm:p-5 w-full max-w-full 2xl:max-w-[1920px] mx-auto space-y-4 pb-28 md:pb-8 text-slate-900 dark:text-zinc-100">
      {/* Top Filter & Report Switcher */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 p-3 sm:p-4 rounded-2xl shadow-xs">
        <div className="flex bg-slate-100 dark:bg-zinc-950 p-1 rounded-xl border border-slate-200 dark:border-zinc-800 flex-wrap">
          <button
            onClick={() => setActiveReportTab('profitability')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeReportTab === 'profitability'
                ? 'bg-amber-500 text-zinc-950 shadow-xs font-black'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            تقرير الأرباح والربحية
          </button>
          <button
            onClick={() => setActiveReportTab('top_items')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeReportTab === 'top_items'
                ? 'bg-amber-500 text-zinc-950 shadow-xs font-black'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            الأصناف الأكثر مبيعاً
          </button>
          <button
            onClick={() => setActiveReportTab('aging_debts')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeReportTab === 'aging_debts'
                ? 'bg-amber-500 text-zinc-950 shadow-xs font-black'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            كشف مديونيات العملاء
          </button>
        </div>

        {activeReportTab !== 'aging_debts' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <span className="text-slate-500 dark:text-zinc-500 text-xs">إلى</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        )}
      </div>

      {/* Tab 1: Profitability */}
      {activeReportTab === 'profitability' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <StatCard
              title="إجمالي المبيعات"
              value={formatCurrency(profitMetrics.grossSalesRevenue)}
              subtitle={`${periodSales.length} فاتورة بيع`}
              icon={<DollarSign className="w-5 h-5" />}
              variant="emerald"
            />

            <StatCard
              title="مرتجعات المبيعات"
              value={formatCurrency(profitMetrics.totalReturnsAmount)}
              subtitle={`${periodReturns.length} حركة إرجاع`}
              icon={<RotateCcw className="w-5 h-5" />}
              variant={profitMetrics.totalReturnsAmount > 0 ? 'rose' : 'zinc'}
            />

            <StatCard
              title="صافي المبيعات"
              value={formatCurrency(profitMetrics.netSalesRevenue)}
              subtitle={`تكلفة المباع: ${formatCurrency(profitMetrics.netCostOfGoodsSold)}`}
              icon={<Package className="w-5 h-5" />}
              variant="blue"
            />

            <StatCard
              title="مجمل الربح (Gross)"
              value={formatCurrency(profitMetrics.totalGrossProfit)}
              subtitle={`الهامش: ${
                profitMetrics.netSalesRevenue > 0
                  ? ((profitMetrics.totalGrossProfit / profitMetrics.netSalesRevenue) * 100).toFixed(1)
                  : 0
              }%`}
              icon={<TrendingUp className="w-5 h-5" />}
              variant="amber"
            />

            <StatCard
              title="صافي الربح الفعلي"
              value={formatCurrency(profitMetrics.netProfit)}
              subtitle={`بعد المصروفات (${formatCurrency(profitMetrics.totalExpensesAmount)})`}
              icon={<Award className="w-5 h-5" />}
              variant={profitMetrics.netProfit >= 0 ? 'emerald' : 'rose'}
            />
          </div>

          {/* Invoices Breakdown Table */}
          <Card padding="none" className="overflow-hidden shadow-xs">
            <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                تفاصيل ربحية فواتير الفترة ({profitMetrics.invoiceProfits.length})
              </h3>
            </div>

            {/* Mobile Card List */}
            <div className="block sm:hidden divide-y divide-slate-200 dark:divide-zinc-800">
              {profitMetrics.invoiceProfits.map((inv) => (
                <div key={inv.id} className="p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-xs">
                      #{inv.invoice_number}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                      {formatDate(inv.date)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {inv.customer_name}
                    </span>
                    <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                      +{formatCurrency(inv.grossProfit)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 pt-1 border-t border-slate-100 dark:border-zinc-800/80">
                    <span>مبيعات: {formatCurrency(inv.revenue)}</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">هامش: {inv.marginPercent.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 dark:bg-zinc-950/80 text-slate-700 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800 font-bold">
                  <tr>
                    <th className="p-3">رقم الفاتورة</th>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">العميل</th>
                    <th className="p-3 text-left">قيمة البيع</th>
                    <th className="p-3 text-left">التكلفة</th>
                    <th className="p-3 text-left font-black">الربح</th>
                    <th className="p-3 text-center">النسبة %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60">
                  {profitMetrics.invoiceProfits.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-zinc-850/60 transition-colors">
                      <td className="p-3 font-mono font-bold text-amber-600 dark:text-amber-400">{inv.invoice_number}</td>
                      <td className="p-3 font-mono text-slate-600 dark:text-zinc-300">{formatDate(inv.date)}</td>
                      <td className="p-3 text-slate-900 dark:text-white font-medium">{inv.customer_name}</td>
                      <td className="p-3 text-left font-mono text-slate-700 dark:text-zinc-200">{formatCurrency(inv.revenue)}</td>
                      <td className="p-3 text-left font-mono text-slate-500 dark:text-zinc-400">{formatCurrency(inv.cost)}</td>
                      <td className="p-3 text-left font-mono font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatCurrency(inv.grossProfit)}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-amber-600 dark:text-amber-400">
                        {inv.marginPercent.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Top Selling Items */}
      {activeReportTab === 'top_items' && (
        <Card padding="none" className="overflow-hidden shadow-xs">
          <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              الأصناف الأكثر مبيعاً خلال الفترة ({topSellingList.length} صنف)
            </h3>
          </div>

          {/* Mobile Card List */}
          <div className="block sm:hidden divide-y divide-slate-200 dark:divide-zinc-800">
            {topSellingList.map((item, idx) => (
              <div key={item.code} className="p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold text-xs flex items-center justify-center font-mono">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      {item.name}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg">
                    {item.qtySold} قطعة
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100 dark:border-zinc-800/80">
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400 block">إجمالي المبيعات</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-zinc-200">
                      {formatCurrency(item.revenue)}
                    </span>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400 block">صافي الربح</span>
                    <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                      +{formatCurrency(item.profit)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 dark:bg-zinc-950/80 text-slate-700 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800 font-bold">
                <tr>
                  <th className="p-3">الترتيب</th>
                  <th className="p-3">الصنف</th>
                  <th className="p-3">الكود</th>
                  <th className="p-3 text-center">الكمية المباعة</th>
                  <th className="p-3 text-left">إجمالي المبيعات</th>
                  <th className="p-3 text-left">التكلفة الإجمالية</th>
                  <th className="p-3 text-left font-black">صافي ربح الصنف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60">
                {topSellingList.map((item, idx) => (
                  <tr key={item.code} className="hover:bg-slate-50 dark:hover:bg-zinc-850/60 transition-colors">
                    <td className="p-3 font-mono text-slate-500 dark:text-zinc-400 font-bold">#{idx + 1}</td>
                    <td className="p-3 text-slate-900 dark:text-white font-black">{item.name}</td>
                    <td className="p-3 font-mono text-slate-500 dark:text-zinc-400">{item.code}</td>
                    <td className="p-3 text-center font-mono font-black text-amber-600 dark:text-amber-400 text-sm">
                      {item.qtySold}
                    </td>
                    <td className="p-3 text-left font-mono text-slate-700 dark:text-zinc-200">{formatCurrency(item.revenue)}</td>
                    <td className="p-3 text-left font-mono text-slate-500 dark:text-zinc-400">{formatCurrency(item.cost)}</td>
                    <td className="p-3 text-left font-mono font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {formatCurrency(item.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 3: Debt Aging */}
      {activeReportTab === 'aging_debts' && (
        <Card padding="none" className="overflow-hidden shadow-xs">
          <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              كشف الديون غير المسددة على العملاء ({debtsList.length} عميل مدين)
            </h3>
          </div>

          {/* Mobile Card List */}
          <div className="block sm:hidden divide-y divide-slate-200 dark:divide-zinc-800">
            {debtsList.map((c) => {
              const overLimit = c.credit_limit && c.credit_limit > 0 && c.current_balance > c.credit_limit;

              return (
                <div key={c.id} className="p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-sm text-slate-900 dark:text-white truncate">
                      {c.name}
                    </span>
                    {overLimit ? (
                      <Badge variant="rose" size="sm">
                        متجاوز للحد
                      </Badge>
                    ) : (
                      <Badge variant="zinc" size="sm">
                        ضمن الحد
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-500 dark:text-zinc-400">
                      {c.phone || 'بدون هاتف'}
                    </span>
                    <span className="font-mono font-black text-rose-600 dark:text-rose-400 text-base tabular-nums">
                      {formatCurrency(c.current_balance)}
                    </span>
                  </div>

                  {c.credit_limit && c.credit_limit > 0 ? (
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400 pt-1 border-t border-slate-100 dark:border-zinc-800/80">
                      الحد الائتماني المسموح: <strong className="font-mono text-slate-700 dark:text-zinc-300">{formatCurrency(c.credit_limit)}</strong>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Desktop Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 dark:bg-zinc-950/80 text-slate-700 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800 font-bold">
                <tr>
                  <th className="p-3">العميل</th>
                  <th className="p-3">رقم الهاتف</th>
                  <th className="p-3">العنوان</th>
                  <th className="p-3 text-left font-black">المديونية الحالية</th>
                  <th className="p-3 text-center">الحد الائتماني</th>
                  <th className="p-3 text-left">حالة الائتمان</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60">
                {debtsList.map((c) => {
                  const overLimit = c.credit_limit && c.credit_limit > 0 && c.current_balance > c.credit_limit;

                  return (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-zinc-850/60 transition-colors">
                      <td className="p-3 text-slate-900 dark:text-white font-black">{c.name}</td>
                      <td className="p-3 font-mono text-slate-600 dark:text-zinc-300">{c.phone || '-'}</td>
                      <td className="p-3 text-slate-500 dark:text-zinc-400">{c.address || '-'}</td>
                      <td className="p-3 text-left font-mono font-black text-rose-600 dark:text-rose-400 text-sm tabular-nums">
                        {formatCurrency(c.current_balance)}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-600 dark:text-zinc-300">
                        {c.credit_limit ? formatCurrency(c.credit_limit) : '-'}
                      </td>
                      <td className="p-3 text-left">
                        {overLimit ? (
                          <Badge variant="rose" size="sm">
                            متجاوز للحد
                          </Badge>
                        ) : (
                          <Badge variant="zinc" size="sm">
                            ضمن الحد
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
