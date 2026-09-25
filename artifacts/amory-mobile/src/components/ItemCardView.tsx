import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatNumber, formatDate } from '../lib/formatters';
import {
  Search,
  Printer,
  Download,
  Calendar,
  Layers,
  MapPin,
  Car,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { StatCard } from './ui/StatCard';

export const ItemCardView: React.FC = () => {
  const { items, stockMovements, selectedItemIdForCard, setPrintDoc } = useApp();

  const [selectedItemId, setSelectedItemId] = useState<string>(
    selectedItemIdForCard || items[0]?.id || ''
  );
  const [startDate, setStartDate] = useState<string>('2026-01-01');
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const selectedItem = useMemo(() => {
    return items.find((i) => i.id === selectedItemId) || items[0];
  }, [items, selectedItemId]);

  const itemMovements = useMemo(() => {
    if (!selectedItem) return [];
    return stockMovements
      .filter((m) => m.item_id === selectedItem.id)
      .sort(
        (a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime() ||
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
  }, [stockMovements, selectedItem]);

  const { periodMovements, openingStock, totalInPeriod, totalOutPeriod, closingStock } =
    useMemo(() => {
      let opening = 0;
      const periodList: typeof itemMovements = [];
      let sumIn = 0;
      let sumOut = 0;

      itemMovements.forEach((m) => {
        const qIn = Number(m.quantity_in || 0);
        const qOut = Number(m.quantity_out || 0);

        if (m.date < startDate) {
          opening += qIn - qOut;
        } else if (m.date <= endDate) {
          periodList.push(m);
          sumIn += qIn;
          sumOut += qOut;
        }
      });

      const closing = opening + sumIn - sumOut;

      return {
        periodMovements: periodList,
        openingStock: opening,
        totalInPeriod: sumIn,
        totalOutPeriod: sumOut,
        closingStock: closing,
      };
    }, [itemMovements, startDate, endDate]);

  const movementsWithRunning = useMemo(() => {
    let current = openingStock;
    return periodMovements.map((m) => {
      const qIn = Number(m.quantity_in || 0);
      const qOut = Number(m.quantity_out || 0);
      current = current + qIn - qOut;
      return {
        ...m,
        calculatedBalance: current,
      };
    });
  }, [periodMovements, openingStock]);

  const handleExportCSV = () => {
    if (!selectedItem) return;
    const headers = [
      'التاريخ',
      'نوع المستند',
      'رقم المستند',
      'الطرف',
      'وارد',
      'منصرف',
      'السعر',
      'الرصيد الجاري',
    ];
    const rows = movementsWithRunning.map((m) => [
      m.date,
      m.doc_type,
      m.doc_number,
      m.party_name || '-',
      m.quantity_in,
      m.quantity_out,
      m.unit_price || 0,
      m.calculatedBalance,
    ]);

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `item_card_${selectedItem.code}_${startDate}_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const docTypeLabels: Record<string, { label: string; color: 'emerald' | 'amber' | 'rose' | 'blue' | 'zinc' }> = {
    sale: { label: 'فاتورة بيع', color: 'rose' },
    purchase: { label: 'فاتورة شراء', color: 'emerald' },
    sale_return: { label: 'مرتجع بيع', color: 'blue' },
    purchase_return: { label: 'مرتجع شراء', color: 'amber' },
    adjustment_in: { label: 'تسوية جرد (زيادة)', color: 'emerald' },
    adjustment_out: { label: 'تسوية جرد (عجز)', color: 'rose' },
    initial_stock: { label: 'رصيد أول مدة', color: 'zinc' },
    cancellation: { label: 'إلغاء مستند', color: 'amber' },
  };

  if (!selectedItem) {
    return <div className="p-8 text-center text-zinc-400">لا توجد أصناف لعرض كارت الحركة</div>;
  }

  return (
    <div className="p-3 sm:p-5 w-full max-w-full 2xl:max-w-[1920px] mx-auto space-y-4 pb-24 md:pb-8 text-slate-900 dark:text-zinc-100">
      {/* Top Filter & Item Picker Strip */}
      <Card className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1">
            <label className="text-xs font-bold text-slate-600 dark:text-zinc-400 block mb-1">اختر الصنف:</label>
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.code}) - الرف: {i.shelf_location || '-'}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-zinc-400 block mb-1">من تاريخ:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-2.5 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-zinc-400 block mb-1">إلى تاريخ:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-2.5 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Selected Item Info Badges */}
        <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-200 dark:border-zinc-800 text-xs gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-300 px-2 py-0.5 rounded border border-slate-200 dark:border-zinc-700">
              كود: {selectedItem.code}
            </span>
            {selectedItem.brand && (
              <span className="font-bold text-slate-800 dark:text-zinc-200">{selectedItem.brand}</span>
            )}
            {selectedItem.oem_number && (
              <span className="font-mono text-cyan-600 dark:text-cyan-400">OEM: {selectedItem.oem_number}</span>
            )}
            {selectedItem.shelf_location && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                <MapPin className="w-3.5 h-3.5" />
                الرف: {selectedItem.shelf_location}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Download className="w-3.5 h-3.5" />}
              onClick={handleExportCSV}
            >
              تصدير كشف Excel
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Printer className="w-3.5 h-3.5" />}
              onClick={() =>
                setPrintDoc({
                  type: 'item_card',
                  data: {
                    item: selectedItem,
                    movements: movementsWithRunning,
                    openingStock,
                    closingStock,
                    startDate,
                    endDate,
                  },
                  format: 'a4',
                })
              }
            >
              طباعة كارت الصنف
            </Button>
          </div>
        </div>
      </Card>

      {/* KPI Cards: Opening, In, Out, Closing */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="رصيد أول المدة"
          value={`${openingStock} ${selectedItem.unit}`}
          subtitle={`قبل تاريخ ${formatDate(startDate)}`}
          icon={<Layers className="w-5 h-5" />}
          variant="zinc"
        />

        <StatCard
          title="إجمالي الوارد (مشتريات/مرتجع)"
          value={`+${totalInPeriod} ${selectedItem.unit}`}
          subtitle="خلال الفترة المحددة"
          icon={<ArrowDownLeft className="w-5 h-5" />}
          variant="emerald"
        />

        <StatCard
          title="إجمالي المنصرف (مبيعات)"
          value={`-${totalOutPeriod} ${selectedItem.unit}`}
          subtitle="خلال الفترة المحددة"
          icon={<ArrowUpRight className="w-5 h-5" />}
          variant="rose"
        />

        <StatCard
          title="الرصيد الختامي الحالي"
          value={`${closingStock} ${selectedItem.unit}`}
          subtitle={`في تاريخ ${formatDate(endDate)}`}
          icon={<Package className="w-5 h-5" />}
          variant={closingStock <= selectedItem.min_stock ? 'amber' : 'emerald'}
        />
      </div>

      {/* Movements Table / Cards (Responsive) */}
      <Card padding="none" className="overflow-hidden shadow-xs">
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 dark:text-white">
            سجل حركات الصنف ({movementsWithRunning.length} حركة)
          </h3>
        </div>

        {movementsWithRunning.length === 0 ? (
          <div className="p-10 text-center text-slate-500 dark:text-zinc-400 text-xs">
            لا توجد حركات مسجلة لهذا الصنف خلال الفترة المحددة.
          </div>
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="block sm:hidden divide-y divide-slate-200 dark:divide-zinc-800">
              {movementsWithRunning.map((m) => {
                const typeInfo = docTypeLabels[m.doc_type] || {
                  label: m.doc_type,
                  color: 'zinc',
                };
                const isIn = m.quantity_in > 0;

                return (
                  <div key={m.id} className="p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={typeInfo.color} size="sm">
                          {typeInfo.label}
                        </Badge>
                        <span className="font-mono text-cyan-600 dark:text-cyan-400 text-xs font-bold">
                          #{m.doc_number}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                        {formatDate(m.date)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-800 dark:text-zinc-200 font-bold truncate">
                        {m.party_name || 'بدون طرف'}
                      </span>
                      <span className={`font-mono font-black text-sm tabular-nums ${isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {isIn ? `+${m.quantity_in}` : `-${m.quantity_out}`} {selectedItem.unit}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-zinc-800/80">
                      <span className="text-slate-500 dark:text-zinc-400 font-mono">
                        {m.unit_price ? `السعر: ${formatCurrency(m.unit_price)}` : ''}
                      </span>
                      <span className="font-bold text-amber-600 dark:text-amber-400 font-mono">
                        الرصيد: {m.calculatedBalance} {selectedItem.unit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 dark:bg-zinc-950/80 text-slate-700 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800 font-bold">
                  <tr>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">نوع الحركة</th>
                    <th className="p-3">رقم المستند</th>
                    <th className="p-3">الطرف</th>
                    <th className="p-3 text-center">وارد (+)</th>
                    <th className="p-3 text-center">منصرف (-)</th>
                    <th className="p-3 text-left">السعر</th>
                    <th className="p-3 text-left font-black">الرصيد بعد الحركة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60">
                  {movementsWithRunning.map((m) => {
                    const typeInfo = docTypeLabels[m.doc_type] || {
                      label: m.doc_type,
                      color: 'zinc',
                    };

                    return (
                      <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors">
                        <td className="p-3 font-mono text-slate-700 dark:text-zinc-300">{formatDate(m.date)}</td>
                        <td className="p-3">
                          <Badge variant={typeInfo.color} size="sm">
                            {typeInfo.label}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono text-slate-700 dark:text-zinc-300">{m.doc_number}</td>
                        <td className="p-3 text-slate-900 dark:text-zinc-200 font-bold">{m.party_name || '-'}</td>
                        <td className="p-3 text-center font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          {m.quantity_in > 0 ? `+${m.quantity_in}` : '-'}
                        </td>
                        <td className="p-3 text-center font-bold font-mono text-rose-600 dark:text-rose-400">
                          {m.quantity_out > 0 ? `-${m.quantity_out}` : '-'}
                        </td>
                        <td className="p-3 text-left font-mono text-slate-700 dark:text-zinc-300">
                          {m.unit_price ? formatCurrency(m.unit_price) : '-'}
                        </td>
                        <td className="p-3 text-left font-black font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                          {m.calculatedBalance} {selectedItem.unit}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};
