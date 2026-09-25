import React, { useState, useMemo, useDeferredValue, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatNumber } from '../lib/formatters';
import { storage } from '../lib/storage';
import { Item } from '../types';
import { normalizeArabicText } from '../lib/security';
import {
  Search,
  Plus,
  Edit2,
  AlertTriangle,
  Layers,
  MapPin,
  Car,
  Package,
  X,
  Eye,
  Filter,
  Trash2,
  Barcode,
  Boxes,
  TrendingUp,
  Upload,
  LayoutGrid,
  List,
  ChevronRight,
  ChevronLeft,
  ChevronsRight,
  ChevronsLeft,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { StatCard } from './ui/StatCard';
import { Modal } from './ui/Modal';
import { BottomSheet } from './ui/BottomSheet';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { CsvImportModal } from './CsvImportModal';

export const ItemsView: React.FC = () => {
  const {
    items,
    currentUser,
    refreshData,
    showToast,
    setActiveTab,
    canViewProfits,
    canViewCosts,
    setSelectedItemIdForCard,
    itemStockMap,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterLowStockOnly, setFilterLowStockOnly] = useState<boolean>(false);
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Pagination state for ultra-fast rendering with large inventories
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(36);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  // Delete Confirm
  const [itemToDelete, setItemToDelete] = useState<Item | null>(null);

  // Form Fields
  const [code, setCode] = useState<string>('');
  const [barcode, setBarcode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [brand, setBrand] = useState<string>('');
  const [carModel, setCarModel] = useState<string>('');
  const [oemNumber, setOemNumber] = useState<string>('');
  const [unit, setUnit] = useState<string>('قطعة');
  const [costPrice, setCostPrice] = useState<number>(0);
  const [retailPrice, setRetailPrice] = useState<number>(0);
  const [wholesalePrice, setWholesalePrice] = useState<number>(0);
  const [minStock, setMinStock] = useState<number>(2);
  const [shelfLocation, setShelfLocation] = useState<string>('');
  const [initialStock, setInitialStock] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');

  // Extract unique brands
  const brandsList = useMemo(() => {
    const set = new Set(items.map((i) => i.brand).filter(Boolean));
    return Array.from(set);
  }, [items]);

  // Inventory stats
  const stats = useMemo(() => {
    let totalItems = items.length;
    let lowStockCount = 0;
    let totalCostVal = 0;
    let totalRetailVal = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const stock = itemStockMap.get(item.id) ?? (item.current_stock || 0);
      if (stock <= item.min_stock) lowStockCount++;
      totalCostVal += stock * (item.cost_price || 0);
      totalRetailVal += stock * (item.retail_price || 0);
    }

    return { totalItems, lowStockCount, totalCostVal, totalRetailVal };
  }, [items, itemStockMap]);

  // Pre-indexed search tokens so we do NOT run regex on 7 fields per item on every keystroke
  const indexedItems = useMemo(() => {
    return items.map((item) => ({
      item,
      searchToken: normalizeArabicText(
        `${item.name} ${item.code} ${item.barcode || ''} ${item.oem_number || ''} ${item.car_model || ''} ${item.brand || ''} ${item.shelf_location || ''} ${item.category || ''}`
      ),
    }));
  }, [items]);

  // Deferred search query keeps UI responsive at 60 FPS while typing
  const deferredQuery = useDeferredValue(searchQuery);
  const normalizedQuery = useMemo(() => normalizeArabicText(deferredQuery), [deferredQuery]);

  // Filter items using the precomputed index
  const filteredItems = useMemo(() => {
    return indexedItems
      .filter(({ item, searchToken }) => {
        if (normalizedQuery && !searchToken.includes(normalizedQuery)) {
          return false;
        }

        if (selectedBrand !== 'all' && item.brand !== selectedBrand) {
          return false;
        }

        if (filterLowStockOnly) {
          const stock = itemStockMap.get(item.id) ?? (item.current_stock || 0);
          if (stock > item.min_stock) return false;
        }

        return true;
      })
      .map(({ item }) => item);
  }, [indexedItems, normalizedQuery, selectedBrand, filterLowStockOnly, itemStockMap]);

  // Reset to first page whenever search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [normalizedQuery, selectedBrand, filterLowStockOnly, pageSize]);

  // Paginated slice for instant rendering
  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    if (pageSize >= 9999) return filteredItems;
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  const handleOpenAdd = () => {
    setEditingItem(null);
    const rndCode = `PRT-${Date.now().toString().slice(-5)}`;
    setCode(rndCode);
    setBarcode(`622${Date.now().toString().slice(-9)}`);
    setName('');
    setBrand('');
    setCarModel('');
    setOemNumber('');
    setUnit('قطعة');
    setCostPrice(0);
    setRetailPrice(0);
    setWholesalePrice(0);
    setMinStock(2);
    setShelfLocation('');
    setInitialStock(0);
    setNotes('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: Item) => {
    setEditingItem(item);
    setCode(item.code);
    setBarcode(item.barcode || '');
    setName(item.name);
    setBrand(item.brand);
    setCarModel(item.car_model);
    setOemNumber(item.oem_number || '');
    setUnit(item.unit);
    setCostPrice(Number(item.cost_price) || 0);
    setRetailPrice(Number(item.retail_price) || 0);
    setWholesalePrice(Number(item.wholesale_price) || 0);
    setMinStock(Number(item.min_stock) || 0);
    setShelfLocation(item.shelf_location || '');
    setNotes(item.notes || '');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      showToast('error', 'بيانات غير مكتملة', 'يرجى كتابة اسم الصنف');
      return;
    }

    try {
      storage.saveItem(
        {
          id: editingItem ? editingItem.id : undefined,
          code,
          barcode,
          name,
          brand,
          car_model: carModel,
          oem_number: oemNumber,
          unit,
          cost_price: costPrice,
          retail_price: retailPrice,
          wholesale_price: wholesalePrice,
          min_stock: minStock,
          shelf_location: shelfLocation,
          initial_stock: editingItem ? (editingItem.initial_stock || 0) : initialStock,
          notes,
        },
        currentUser
      );

      refreshData();
      showToast(
        'success',
        editingItem ? 'تم التعديل' : 'تمت الإضافة',
        `تم حفظ بيانات الصنف (${name}) بنجاح`
      );
      setIsModalOpen(false);
    } catch (err: any) {
      showToast('error', 'خطأ في الحفظ', err.message);
    }
  };

  const handleDeleteItem = () => {
    if (!itemToDelete) return;
    try {
      storage.deleteItem(itemToDelete.id, currentUser);
      refreshData();
      showToast('success', 'تم الحذف', `تم حذف الصنف (${itemToDelete.name}) بنجاح`);
      setItemToDelete(null);
    } catch (err: any) {
      showToast('error', 'تعذر الحذف', err.message);
    }
  };

  const handleViewCard = (item: Item) => {
    setSelectedItemIdForCard(item.id);
    setActiveTab('item_card');
  };

  return (
    <div className="p-3 sm:p-5 w-full max-w-full 2xl:max-w-[1920px] mx-auto space-y-4 pb-24 md:pb-8">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="إجمالي الأصناف"
          value={stats.totalItems}
          subtitle="صنف مسجل بالمخزن"
          icon={<Package className="w-5 h-5" />}
          variant="amber"
        />

        <StatCard
          title="نواقص المخزون"
          value={stats.lowStockCount}
          subtitle="أصناف وصلت للحد الأدنى"
          icon={<AlertTriangle className="w-5 h-5" />}
          variant={stats.lowStockCount > 0 ? 'rose' : 'zinc'}
          onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
        />

        {canViewCosts && (
          <StatCard
            title="قيمة المخزون (بالتكلفة)"
            value={formatCurrency(stats.totalCostVal)}
            subtitle="رأس المال في البضاعة"
            icon={<Boxes className="w-5 h-5" />}
            variant="blue"
          />
        )}

        {canViewProfits && (
          <StatCard
            title="قيمة المخزون (بالبيع)"
            value={formatCurrency(stats.totalRetailVal)}
            subtitle="الإيراد المتوقع عند البيع"
            icon={<TrendingUp className="w-5 h-5" />}
            variant="emerald"
          />
        )}
      </div>

      {/* Search and Action Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-3 sm:p-4 rounded-2xl shadow-xs transition-colors">
        {/* Search Input */}
        <div className="relative flex-1 max-w-xl">
          <Search className="w-5 h-5 absolute start-3.5 text-amber-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث بالاسم، الكود، الباركود، رقم OEM، الموديل، الرف..."
            className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700/80 rounded-xl ps-11 pe-9 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute end-3 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter and Add Button */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mobile Filter Button */}
          <button
            onClick={() => setIsFilterSheetOpen(true)}
            className="sm:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-xs font-bold border border-slate-200 dark:border-zinc-700"
          >
            <Filter className="w-4 h-4 text-amber-500" />
            <span>فلترة</span>
          </button>

          {/* View Mode Toggle (Cards vs Table) */}
          <div className="hidden sm:flex items-center bg-slate-100 dark:bg-zinc-800 p-1 rounded-xl border border-slate-200 dark:border-zinc-700">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-white dark:bg-zinc-900 text-amber-600 dark:text-amber-400 shadow-xs'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="عرض الكروت"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-zinc-900 text-amber-600 dark:text-amber-400 shadow-xs'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="عرض جدول سريع"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Desktop Filter Chips */}
          <div className="hidden sm:flex items-center gap-2">
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-200 font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="all">كل الماركات ({brandsList.length})</option>
              {brandsList.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            <button
              onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                filterLowStockOnly
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600'
              }`}
            >
              النواقص فقط ({stats.lowStockCount})
            </button>
          </div>

          <Button
            variant="secondary"
            size="md"
            icon={<Upload className="w-4 h-4 text-amber-500" />}
            onClick={() => setIsImportModalOpen(true)}
            className="font-bold"
          >
            استيراد CSV
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={handleOpenAdd}
            className="font-black shadow-md shadow-amber-500/20"
          >
            صنف جديد
          </Button>
        </div>
      </div>

      {/* Pagination Bar & Results Counter */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-slate-600 dark:text-zinc-400 bg-white/70 dark:bg-zinc-900/60 p-2.5 sm:px-4 rounded-xl border border-slate-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span>
            عرض <span className="font-bold font-mono text-slate-900 dark:text-white">{filteredItems.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span> إلى{' '}
            <span className="font-bold font-mono text-slate-900 dark:text-white">{Math.min(currentPage * pageSize, filteredItems.length)}</span> من إجمالي{' '}
            <span className="font-bold font-mono text-amber-600 dark:text-amber-400">{filteredItems.length}</span> صنف
          </span>

          {filteredItems.length > 36 && (
            <div className="flex items-center gap-1.5 mr-2">
              <span className="text-[11px]">في الصفحة:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-800 dark:text-zinc-200"
              >
                <option value={36}>36</option>
                <option value={72}>72</option>
                <option value={120}>120</option>
                <option value={99999}>الكل</option>
              </select>
            </div>
          )}
        </div>

        {/* Page Switcher */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-zinc-700 cursor-pointer disabled:cursor-not-allowed"
              title="الصفحة الأولى"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-zinc-700 cursor-pointer disabled:cursor-not-allowed"
              title="الصفحة السابقة"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <span className="px-2 font-bold font-mono text-slate-800 dark:text-zinc-200">
              {currentPage} / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-zinc-700 cursor-pointer disabled:cursor-not-allowed"
              title="الصفحة التالية"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-zinc-700 cursor-pointer disabled:cursor-not-allowed"
              title="الصفحة الأخيرة"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Items List (Responsive Cards on Mobile, Table on Desktop) */}
      {filteredItems.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-900/30 space-y-2">
          <Package className="w-12 h-12 text-slate-400 dark:text-zinc-600 mx-auto" />
          <h4 className="text-sm font-bold text-slate-700 dark:text-zinc-300">لم يتم العثور على أصناف</h4>
          <p className="text-xs text-slate-500 dark:text-zinc-500">جرب تغيير كلمات البحث أو إزالة الفلاتر</p>
        </div>
      ) : viewMode === 'table' ? (
        /* FAST COMPACT TABLE VIEW (Ultra-fast scrolling with thousands of items) */
        <Card padding="none" className="overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 dark:bg-zinc-950/80 text-slate-700 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800 font-bold">
                <tr>
                  <th className="p-3 w-12 text-center font-mono">#</th>
                  <th className="p-3 min-w-[200px]">اسم الصنف</th>
                  <th className="p-3 font-mono">الكود / OEM</th>
                  <th className="p-3">الماركة / الموديل</th>
                  <th className="p-3">الرف</th>
                  <th className="p-3 text-center">الرصيد المتاح</th>
                  <th className="p-3 text-center font-mono">سعر البيع</th>
                  <th className="p-3 text-center font-mono">الجملة</th>
                  <th className="p-3 text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                {paginatedItems.map((item, idx) => {
                  const stock = itemStockMap.get(item.id) ?? (item.current_stock || 0);
                  const isLow = stock <= item.min_stock;
                  const isOut = stock <= 0;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      <td className="p-3 text-center font-mono text-slate-400 dark:text-zinc-500">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900 dark:text-white">{item.name}</div>
                        {item.category && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">{item.category}</span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-[11px]">
                        <span className="bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-zinc-700">
                          {item.code}
                        </span>
                        {item.oem_number && (
                          <div className="text-[10px] text-cyan-600 dark:text-cyan-400 mt-0.5">OEM: {item.oem_number}</div>
                        )}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-zinc-300">
                        <div>{item.brand || '-'}</div>
                        {item.car_model && <div className="text-[10px] text-slate-400">{item.car_model}</div>}
                      </td>
                      <td className="p-3 font-mono text-amber-600 dark:text-amber-400 font-bold">
                        {item.shelf_location || '-'}
                      </td>
                      <td className="p-3 text-center">
                        <Badge
                          variant={isOut ? 'rose' : isLow ? 'amber' : 'emerald'}
                          size="sm"
                        >
                          {stock} {item.unit}
                        </Badge>
                      </td>
                      <td className="p-3 text-center font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatCurrency(item.retail_price)}
                      </td>
                      <td className="p-3 text-center font-bold font-mono text-cyan-600 dark:text-cyan-400 tabular-nums">
                        {formatCurrency(item.wholesale_price)}
                      </td>
                      <td className="p-3 text-left">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleViewCard(item)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-cyan-600 dark:text-cyan-400 transition-colors cursor-pointer"
                            title="كارت الصنف"
                          >
                            <Layers className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white transition-colors cursor-pointer"
                            title="تعديل الصنف"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {currentUser.role === 'admin' && (
                            <button
                              onClick={() => setItemToDelete(item)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 dark:bg-zinc-800 dark:hover:bg-rose-500/20 text-slate-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 transition-colors cursor-pointer"
                              title="حذف الصنف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        /* CARDS GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-3">
          {paginatedItems.map((item) => {
            const stock = itemStockMap.get(item.id) ?? (item.current_stock || 0);
            const isLow = stock <= item.min_stock;
            const isOut = stock <= 0;

            return (
              <Card
                key={item.id}
                className="hover:border-amber-500/50 transition-all flex flex-col justify-between gap-3 group shadow-xs"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <h4 className="text-sm font-black text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors line-clamp-1">
                        {item.name}
                      </h4>
                      <div className="text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 flex-wrap">
                        {item.category && <span className="font-bold text-amber-600 dark:text-amber-400/90">{item.category}</span>}
                        {item.brand && <span className="font-bold text-slate-700 dark:text-zinc-300">{item.brand}</span>}
                        {item.car_model && <span className="text-[11px]">· {item.car_model}</span>}
                      </div>
                    </div>

                    <Badge
                      variant={isOut ? 'rose' : isLow ? 'amber' : 'emerald'}
                      size="sm"
                      className="shrink-0"
                    >
                      {stock} {item.unit}
                    </Badge>
                  </div>

                  {/* Codes & Location */}
                  <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-zinc-400 flex-wrap">
                    <span className="font-mono bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-zinc-700">
                      كود: {item.code}
                    </span>
                    {item.shelf_location && (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                        <MapPin className="w-3 h-3" />
                        الرف: {item.shelf_location}
                      </span>
                    )}
                    {item.oem_number && (
                      <span className="font-mono text-cyan-600 dark:text-cyan-400">OEM: {item.oem_number}</span>
                    )}
                  </div>

                  {/* Prices Strip */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800/80 text-xs">
                    <div>
                      <span className="text-slate-400 dark:text-zinc-500 block text-[10px]">قطاعي</span>
                      <span className="font-black font-mono text-emerald-600 dark:text-emerald-400 text-sm tabular-nums">
                        {formatCurrency(item.retail_price)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 dark:text-zinc-500 block text-[10px]">جملة</span>
                      <span className="font-bold font-mono text-cyan-600 dark:text-cyan-400 text-sm tabular-nums">
                        {formatCurrency(item.wholesale_price)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800/80 gap-2">
                  <button
                    onClick={() => handleViewCard(item)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                    <span>كارت الصنف</span>
                  </button>

                  <button
                    onClick={() => handleOpenEdit(item)}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white transition-colors cursor-pointer"
                    title="تعديل بيانات الصنف"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  {currentUser.role === 'admin' && (
                    <button
                      onClick={() => setItemToDelete(item)}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-rose-100 dark:bg-zinc-800 dark:hover:bg-rose-500/20 text-slate-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 transition-colors cursor-pointer"
                      title="حذف الصنف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Item Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        maxWidth="lg"
        title={editingItem ? 'تعديل بيانات الصنف' : 'إضافة صنف جديد للمخزن'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                اسم الصنف بالكامل (إجباري):
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: تيل فرامل أمامي تويوتا كورولا 2020"
                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">كود الصنف:</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">الباركود الدولي:</label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">الماركة / الشركة:</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Bosch, Denso, Valeo..."
                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">موديلات السيارات المتوافقة:</label>
              <input
                type="text"
                value={carModel}
                onChange={(e) => setCarModel(e.target.value)}
                placeholder="كورولا 2014-2022، إلنترا..."
                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">رقم القطعة الأصلي (OEM):</label>
              <input
                type="text"
                value={oemNumber}
                onChange={(e) => setOemNumber(e.target.value)}
                placeholder="04465-02220"
                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">مكان التخزين (الرف):</label>
              <input
                type="text"
                value={shelfLocation}
                onChange={(e) => setShelfLocation(e.target.value)}
                placeholder="A-12, B-04..."
                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {/* Pricing Section */}
            <div className="sm:col-span-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
              <span className="text-xs font-black text-amber-600 dark:text-amber-400 block mb-2">التسعير والحد الأدنى:</span>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">سعر التكلفة:</label>
                  <input
                    type="number"
                    step="0.5"
                    value={isNaN(costPrice) ? 0 : costPrice}
                    onChange={(e) => setCostPrice(Number(e.target.value) || 0)}
                    className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 text-sm font-mono text-cyan-600 dark:text-cyan-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">سعر القطاعي:</label>
                  <input
                    type="number"
                    step="0.5"
                    value={isNaN(retailPrice) ? 0 : retailPrice}
                    onChange={(e) => setRetailPrice(Number(e.target.value) || 0)}
                    className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 text-sm font-mono text-emerald-600 dark:text-emerald-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">سعر الجملة:</label>
                  <input
                    type="number"
                    step="0.5"
                    value={isNaN(wholesalePrice) ? 0 : wholesalePrice}
                    onChange={(e) => setWholesalePrice(Number(e.target.value) || 0)}
                    className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 text-sm font-mono text-amber-600 dark:text-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* Initial Stock (Only for new item) */}
            {!editingItem && (
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">رصيد أول المدة:</label>
                <input
                  type="number"
                  min="0"
                  value={isNaN(initialStock) ? 0 : initialStock}
                  onChange={(e) => setInitialStock(Number(e.target.value) || 0)}
                  className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">حد الأمان (الحد الأدنى):</label>
              <input
                type="number"
                min="0"
                value={isNaN(minStock) ? 0 : minStock}
                onChange={(e) => setMinStock(Number(e.target.value) || 0)}
                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-3 border-t border-slate-200 dark:border-zinc-800">
            <Button variant="primary" type="submit" className="flex-1">
              {editingItem ? 'حفظ التعديلات' : 'إضافة الصنف للمخزن'}
            </Button>
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* Mobile Filter Bottom Sheet */}
      <BottomSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        title="فلترة وتصفية الأصناف"
      >
        <div className="space-y-4 pb-4">
          <div>
            <label className="text-xs font-bold text-slate-600 dark:text-zinc-400 block mb-2">حسب الماركة:</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedBrand('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  selectedBrand === 'all'
                    ? 'bg-amber-500 text-zinc-950 font-black'
                    : 'bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-800'
                }`}
              >
                الكل
              </button>
              {brandsList.map((b) => (
                <button
                  key={b}
                  onClick={() => setSelectedBrand(b)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                    selectedBrand === b
                      ? 'bg-amber-500 text-zinc-950 font-black'
                      : 'bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-800'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm font-bold text-slate-900 dark:text-white cursor-pointer">
              <input
                type="checkbox"
                checked={filterLowStockOnly}
                onChange={(e) => setFilterLowStockOnly(e.target.checked)}
                className="rounded accent-amber-500"
              />
              <span>عرض الأصناف التي قاربت على النفاد فقط ({stats.lowStockCount})</span>
            </label>
          </div>

          <Button variant="primary" className="w-full" onClick={() => setIsFilterSheetOpen(false)}>
            تطبيق الفلترة
          </Button>
        </div>
      </BottomSheet>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(itemToDelete)}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleDeleteItem}
        title="حذف صنف من المخزن"
        message={`هل أنت متأكد من حذف الصنف (${itemToDelete?.name})؟`}
        variant="danger"
        confirmText="تأكيد الحذف"
      />

      {/* CSV Import Modal */}
      <CsvImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        defaultType="items"
      />
    </div>
  );
};

export default ItemsView;
