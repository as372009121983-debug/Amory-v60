import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatNumber, getTodayDate } from '../lib/formatters';
import { storage } from '../lib/storage';
import { ClipboardCheck, CheckCircle2, AlertCircle, RefreshCw, Layers, Check } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { StatCard } from './ui/StatCard';
import { ConfirmDialog } from './ui/ConfirmDialog';

export const InventoryAuditView: React.FC = () => {
  const { items, currentUser, refreshData, showToast, itemStockMap } = useApp();

  const [filterShelf, setFilterShelf] = useState<string>('all');
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [actualStockMap, setActualStockMap] = useState<{ [itemId: string]: number }>({});
  const [notesMap, setNotesMap] = useState<{ [itemId: string]: string }>({});

  // Bulk confirm dialog
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState<boolean>(false);

  // Unique shelves & brands
  const shelvesList = useMemo(() => {
    return Array.from(new Set(items.map((i) => i.shelf_location).filter(Boolean))) as string[];
  }, [items]);

  const brandsList = useMemo(() => {
    return Array.from(new Set(items.map((i) => i.brand).filter(Boolean))) as string[];
  }, [items]);

  // Filtered items for audit
  const auditItems = useMemo(() => {
    return items.filter((item) => {
      const matchShelf = filterShelf === 'all' || item.shelf_location === filterShelf;
      const matchBrand = filterBrand === 'all' || item.brand === filterBrand;
      return matchShelf && matchBrand;
    });
  }, [items, filterShelf, filterBrand]);

  // Handle actual stock change
  const handleActualStockChange = (itemId: string, val: number | undefined) => {
    setActualStockMap((prev) => {
      const next = { ...prev };
      if (val === undefined || isNaN(val)) {
        delete next[itemId];
      } else {
        next[itemId] = val;
      }
      return next;
    });
  };

  // Modified items count
  const modifiedItems = useMemo(() => {
    return auditItems.filter((i) => {
      const actual = actualStockMap[i.id];
      const currentStock = itemStockMap.get(i.id) ?? (i.current_stock || 0);
      return actual !== undefined && !isNaN(actual) && actual !== currentStock;
    });
  }, [auditItems, actualStockMap, itemStockMap]);

  // Execute settlement for a single item
  const handleSettleItem = (item: (typeof items)[0]) => {
    const actual = actualStockMap[item.id];
    if (actual === undefined || isNaN(actual)) {
      showToast('error', 'تنبيه', 'يرجى إدخال الرصيد الفعلي أولاً');
      return;
    }

    const currentStock = itemStockMap.get(item.id) ?? (item.current_stock || 0);
    const diff = actual - currentStock;

    if (diff === 0) {
      showToast('info', 'متطابق', 'الرصيد الفعلي مطابق للرصيد الدفتري، لا توجد فروقات');
      return;
    }

    const note = notesMap[item.id] || (diff < 0 ? 'عجز جرد مستودع' : 'زيادة جرد مستودع');

    try {
      storage.saveStockAdjustment(
        {
          item_id: item.id,
          item_name: item.name,
          adjustment_type: diff < 0 ? 'deficit' : 'surplus',
          quantity: Math.abs(diff),
          cost_price: item.cost_price,
          notes: note,
          date: getTodayDate(),
        },
        currentUser
      );

      refreshData();
      showToast(
        'success',
        'تمت تسوية الجرد',
        `تم تعديل رصيد (${item.name}) إلى ${formatNumber(actual)} ${item.unit} بنجاح`
      );
    } catch (err: any) {
      showToast('error', 'فشل التسوية', err.message);
    }
  };

  // Bulk settle execution
  const executeBulkSettle = () => {
    try {
      modifiedItems.forEach((item) => {
        const actual = actualStockMap[item.id];
        const currentStock = itemStockMap.get(item.id) ?? (item.current_stock || 0);
        const diff = actual - currentStock;
        const note = notesMap[item.id] || (diff < 0 ? 'عجز جرد مجمع' : 'زيادة جرد مجمع');

        storage.saveStockAdjustment(
          {
            item_id: item.id,
            item_name: item.name,
            adjustment_type: diff < 0 ? 'deficit' : 'surplus',
            quantity: Math.abs(diff),
            cost_price: item.cost_price,
            notes: note,
            date: getTodayDate(),
          },
          currentUser
        );
      });

      refreshData();
      setActualStockMap({});
      showToast('success', 'تمت التسوية المجمعة', `تم تسوية فروقات ${modifiedItems.length} صنف بنجاح`);
    } catch (err: any) {
      showToast('error', 'خطأ في التسوية', err.message);
    }
  };

  return (
    <div className="p-3 sm:p-5 w-full max-w-full 2xl:max-w-[1920px] mx-auto space-y-4 pb-28 md:pb-8 text-slate-900 dark:text-zinc-100">
      {/* Top Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 p-3 sm:p-4 rounded-2xl shadow-xs">
        <div className="flex items-center gap-2.5">
          <ClipboardCheck className="w-6 h-6 text-amber-500" />
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">جرد المخزون وتسوية الفروقات</h2>
            <span className="text-xs text-slate-600 dark:text-zinc-400">
              مطابقة الرصيد الفعلي على الرف مع رصيد الدفاتر وتسوية العجز أو الزيادة
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterShelf}
            onChange={(e) => setFilterShelf(e.target.value)}
            className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="all">كل الأرفف</option>
            {shelvesList.map((s) => (
              <option key={s} value={s}>
                الرف: {s}
              </option>
            ))}
          </select>

          <select
            value={filterBrand}
            onChange={(e) => setFilterBrand(e.target.value)}
            className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="all">كل الماركات</option>
            {brandsList.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          {modifiedItems.length > 0 && (
            <Button
              variant="primary"
              size="md"
              icon={<CheckCircle2 className="w-4 h-4" />}
              onClick={() => setBulkConfirmOpen(true)}
              className="font-black shadow-md shadow-amber-500/20"
            >
              تسوية الكل ({modifiedItems.length})
            </Button>
          )}
        </div>
      </div>

      {/* Audit Items Table */}
      <Card padding="none" className="overflow-hidden shadow-xs">
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 dark:text-white">
            قائمة أصناف الجرد ({auditItems.length} صنف)
          </h3>
          <span className="text-xs text-slate-500 dark:text-zinc-400">
            أدخل الكمية الفعلية الموجودة على الرف واضغط "تسوية"
          </span>
        </div>

        {/* Mobile Card List (Perfect for walking aisles with a phone) */}
        <div className="block sm:hidden divide-y divide-slate-200 dark:divide-zinc-800">
          {auditItems.map((item) => {
            const systemStock = itemStockMap.get(item.id) ?? (item.current_stock || 0);
            const actual = actualStockMap[item.id];
            const hasEnteredActual = actual !== undefined && !isNaN(actual);
            const diff = hasEnteredActual ? actual - systemStock : 0;

            return (
              <div key={item.id} className="p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">{item.name}</h4>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-2 font-mono">
                      <span>كود: {item.code}</span>
                      {item.shelf_location && (
                        <span className="text-amber-600 dark:text-amber-400 font-bold">· الرف: {item.shelf_location}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400 block">دفتري</span>
                    <span className="font-mono font-bold text-xs text-slate-700 dark:text-zinc-200">
                      {systemStock} {item.unit}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 items-center bg-slate-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                      الرصيد الفعلي المعدود:
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder={String(systemStock)}
                      value={actual !== undefined && !isNaN(actual) ? actual : ''}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10);
                        handleActualStockChange(item.id, isNaN(parsed) ? undefined : parsed);
                      }}
                      className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-center text-sm font-mono font-black text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">
                      الفرق:
                    </span>
                    <div className="py-1.5 text-center font-mono font-bold text-xs">
                      {hasEnteredActual ? (
                        diff === 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400">متطابق ✓</span>
                        ) : diff > 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400">+{diff} (زيادة)</span>
                        ) : (
                          <span className="text-rose-600 dark:text-rose-400">{diff} (عجز)</span>
                        )
                      ) : (
                        <span className="text-slate-400 dark:text-zinc-600">لم يُعد بعد</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="سبب الفرق (تلف، ضياع...)"
                    value={notesMap[item.id] || ''}
                    onChange={(e) =>
                      setNotesMap((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    className="flex-1 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    onClick={() => handleSettleItem(item)}
                    disabled={!hasEnteredActual || diff === 0}
                    className="px-4 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-xs shrink-0"
                  >
                    تسوية
                  </button>
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
                <th className="p-3">الصنف</th>
                <th className="p-3">الرف</th>
                <th className="p-3 text-center">الرصيد الدفتري</th>
                <th className="p-3 text-center">الرصيد الفعلي</th>
                <th className="p-3 text-center">الفرق</th>
                <th className="p-3">ملاحظات التسوية</th>
                <th className="p-3 text-left">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60">
              {auditItems.map((item) => {
                const systemStock = itemStockMap.get(item.id) ?? (item.current_stock || 0);
                const actual = actualStockMap[item.id];
                const hasEnteredActual = actual !== undefined && !isNaN(actual);
                const diff = hasEnteredActual ? actual - systemStock : 0;

                return (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-zinc-850/60 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-slate-900 dark:text-white">{item.name}</div>
                      <div className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono">كود: {item.code}</div>
                    </td>
                    <td className="p-3 font-mono text-amber-600 dark:text-amber-400 font-bold">{item.shelf_location || '-'}</td>
                    <td className="p-3 text-center font-mono font-bold text-slate-700 dark:text-zinc-200">
                      {systemStock} {item.unit}
                    </td>
                    <td className="p-3 text-center">
                      <input
                        type="number"
                        min="0"
                        placeholder={String(systemStock)}
                        value={actual !== undefined && !isNaN(actual) ? actual : ''}
                        onChange={(e) => {
                          const parsed = parseInt(e.target.value, 10);
                          handleActualStockChange(item.id, isNaN(parsed) ? undefined : parsed);
                        }}
                        className="w-20 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 text-center text-xs font-mono font-black text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </td>
                    <td className="p-3 text-center font-mono font-bold">
                      {hasEnteredActual ? (
                        diff === 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400">متطابق</span>
                        ) : diff > 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400">+{diff} (زيادة)</span>
                        ) : (
                          <span className="text-rose-600 dark:text-rose-400">{diff} (عجز)</span>
                        )
                      ) : (
                        <span className="text-slate-400 dark:text-zinc-600">-</span>
                      )}
                    </td>
                    <td className="p-3">
                      <input
                        type="text"
                        placeholder="سبب الفرق (تلف، ضياع...)"
                        value={notesMap[item.id] || ''}
                        onChange={(e) =>
                          setNotesMap((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl px-2.5 py-1 text-xs text-slate-900 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </td>
                    <td className="p-3 text-left">
                      <button
                        onClick={() => handleSettleItem(item)}
                        disabled={!hasEnteredActual || diff === 0}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-xs"
                      >
                        تسوية
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Bulk Settle Confirm Dialog */}
      <ConfirmDialog
        isOpen={bulkConfirmOpen}
        onClose={() => setBulkConfirmOpen(false)}
        onConfirm={() => {
          setBulkConfirmOpen(false);
          executeBulkSettle();
        }}
        title="تأكيد تسوية الجرد المجمعة"
        message={`هل أنت متأكد من تسوية فروقات الجرد لعدد (${modifiedItems.length}) صنف دفعة واحدة؟ سيتم تحديث أرصدة المخزن وتسجيل الحركات.`}
        confirmText="تأكيد التسوية"
        variant="warning"
      />
    </div>
  );
};
