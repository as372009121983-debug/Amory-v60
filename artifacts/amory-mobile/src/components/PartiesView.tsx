import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate } from '../lib/formatters';
import { storage } from '../lib/storage';
import { Customer, Supplier, PartyType } from '../types';
import { normalizeArabicText } from '../lib/security';
import {
  Users,
  Plus,
  Phone,
  MapPin,
  FileSpreadsheet,
  Printer,
  DollarSign,
  Building,
  Edit2,
  X,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  Download,
  AlertCircle,
  Upload,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { StatCard } from './ui/StatCard';
import { Modal } from './ui/Modal';
import { CsvImportModal } from './CsvImportModal';

export const PartiesView: React.FC = () => {
  const {
    customers,
    suppliers,
    accountMovements,
    currentUser,
    refreshData,
    showToast,
    customerBalanceMap,
    supplierBalanceMap,
    setPrintDoc,
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<PartyType>('customer');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Add / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [editingParty, setEditingParty] = useState<any | null>(null);
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [creditLimit, setCreditLimit] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');

  // Statement of Account Modal
  const [statementModalOpen, setStatementModalOpen] = useState<boolean>(false);
  const [selectedParty, setSelectedParty] = useState<{ id: string; name: string; type: PartyType } | null>(null);
  const [startDate, setStartDate] = useState<string>('2026-01-01');
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Current list based on subtab
  const currentList = activeSubTab === 'customer' ? customers : suppliers;

  // Normalized search query
  const normalizedQuery = useMemo(() => normalizeArabicText(searchQuery), [searchQuery]);

  const filteredList = useMemo(() => {
    return currentList.filter((p) => {
      const nName = normalizeArabicText(p.name);
      const nPhone = normalizeArabicText(p.phone || '');
      const nAddress = normalizeArabicText(p.address || '');
      return !normalizedQuery || nName.includes(normalizedQuery) || nPhone.includes(normalizedQuery) || nAddress.includes(normalizedQuery);
    });
  }, [currentList, normalizedQuery]);

  // Totals calculated from the balance maps
  const { totalBalance, debitCount, creditCount } = useMemo(() => {
    let sum = 0;
    let debits = 0;
    let credits = 0;

    if (activeSubTab === 'customer') {
      customers.forEach((c) => {
        const bal = customerBalanceMap.get(c.id) ?? (c.current_balance || 0);
        sum += bal;
        if (bal > 0) debits++;
        else if (bal < 0) credits++;
      });
    } else {
      suppliers.forEach((s) => {
        const bal = supplierBalanceMap.get(s.id) ?? (s.current_balance || 0);
        sum += bal;
        if (bal > 0) debits++;
        else if (bal < 0) credits++;
      });
    }

    return { totalBalance: sum, debitCount: debits, creditCount: credits };
  }, [activeSubTab, customers, suppliers, customerBalanceMap, supplierBalanceMap]);

  const handleOpenAdd = () => {
    setEditingParty(null);
    setName('');
    setPhone('');
    setAddress('');
    setOpeningBalance(0);
    setCreditLimit(0);
    setNotes('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: any) => {
    setEditingParty(p);
    setName(p.name);
    setPhone(p.phone || '');
    setAddress(p.address || '');
    setOpeningBalance(Number(p.opening_balance) || 0);
    setCreditLimit(Number(p.credit_limit) || 0);
    setNotes(p.notes || '');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('error', 'بيانات ناقصة', 'الاسم مطلوب');
      return;
    }

    try {
      if (activeSubTab === 'customer') {
        storage.saveCustomer(
          {
            id: editingParty?.id,
            name,
            phone,
            address,
            opening_balance: Number(openingBalance),
            credit_limit: Number(creditLimit),
            notes,
          },
          currentUser
        );
      } else {
        storage.saveSupplier(
          {
            id: editingParty?.id,
            name,
            phone,
            address,
            opening_balance: Number(openingBalance),
            notes,
          },
          currentUser
        );
      }

      refreshData();
      setIsModalOpen(false);
      showToast('success', 'تم الحفظ', `تم حفظ بيانات ${name} بنجاح`);
    } catch (err: any) {
      showToast('error', 'خطأ في الحفظ', err.message);
    }
  };

  const handleOpenStatement = (party: any, type: PartyType) => {
    setSelectedParty({ id: party.id, name: party.name, type });
    setStatementModalOpen(true);
  };

  // Statement calculations for selected party
  const partyStatement = useMemo(() => {
    if (!selectedParty) return { movements: [], openingBal: 0, closingBal: 0, totalDebit: 0, totalCredit: 0 };

    const allMovements = accountMovements
      .filter((m) => m.party_id === selectedParty.id && m.party_type === selectedParty.type)
      .sort(
        (a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime() ||
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

    let opening = 0;
    const periodList: typeof allMovements = [];
    let sumDebit = 0;
    let sumCredit = 0;

    allMovements.forEach((m) => {
      const d = Number(m.debit || 0);
      const c = Number(m.credit || 0);

      if (m.date < startDate) {
        opening += d - c;
      } else if (m.date <= endDate) {
        periodList.push(m);
        sumDebit += d;
        sumCredit += c;
      }
    });

    let current = opening;
    const listWithRunning = periodList.map((m) => {
      const d = Number(m.debit || 0);
      const c = Number(m.credit || 0);
      current = current + d - c;
      return {
        ...m,
        calculatedBalance: current,
      };
    });

    return {
      movements: listWithRunning,
      openingBal: opening,
      closingBal: current,
      totalDebit: sumDebit,
      totalCredit: sumCredit,
    };
  }, [selectedParty, accountMovements, startDate, endDate]);

  const handleExportStatementCSV = () => {
    if (!selectedParty) return;
    const headers = ['التاريخ', 'نوع الحركة', 'رقم السند/الفاتورة', 'مدين (له)', 'دائن (عليه)', 'الرصيد الجاري', 'ملاحظات'];
    const rows = partyStatement.movements.map((m) => [
      m.date,
      m.doc_type,
      m.doc_number,
      m.debit || 0,
      m.credit || 0,
      m.calculatedBalance,
      m.notes || '',
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `statement_${selectedParty.name}_${startDate}_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-3 sm:p-5 w-full max-w-full 2xl:max-w-[1920px] mx-auto space-y-4 pb-28 md:pb-8 text-slate-900 dark:text-zinc-100">
      {/* Subtab Switcher: العملاء / الموردين */}
      <div className="flex bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-1 rounded-2xl w-full sm:w-80">
        <button
          onClick={() => setActiveSubTab('customer')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'customer'
              ? 'bg-amber-500 text-zinc-950 shadow-xs font-black'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>العملاء ({customers.length})</span>
        </button>
        <button
          onClick={() => setActiveSubTab('supplier')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'supplier'
              ? 'bg-cyan-600 text-white shadow-xs font-black'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>الموردين ({suppliers.length})</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          title={activeSubTab === 'customer' ? 'إجمالي ديون العملاء (لنا بالخارج)' : 'إجمالي مستحقات الموردين (علينا)'}
          value={formatCurrency(totalBalance)}
          subtitle={`صافي أرصدة ${activeSubTab === 'customer' ? 'العملاء' : 'الموردين'}`}
          icon={<DollarSign className="w-5 h-5" />}
          variant={totalBalance > 0 ? (activeSubTab === 'customer' ? 'rose' : 'blue') : 'emerald'}
        />

        <StatCard
          title={activeSubTab === 'customer' ? 'عملاء عليهم مديونية' : 'موردين لهم مستحقات'}
          value={debitCount}
          subtitle="أرصدة مدينة نشطة"
          icon={<ArrowUpRight className="w-5 h-5" />}
          variant="amber"
        />

        <StatCard
          title={activeSubTab === 'customer' ? 'عملاء لهم أرصدة دائنة' : 'موردين لنا عندهم دفعات'}
          value={creditCount}
          subtitle="أرصدة دائنة مسددة مقدماً"
          icon={<ArrowDownLeft className="w-5 h-5" />}
          variant="zinc"
        />
      </div>

      {/* Search & Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 p-3 sm:p-4 rounded-2xl shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-5 h-5 absolute start-3.5 text-slate-400 dark:text-zinc-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`ابحث في ${activeSubTab === 'customer' ? 'العملاء' : 'الموردين'} بالاسم، الهاتف، العنوان...`}
            className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700/80 rounded-xl ps-11 pe-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="secondary"
            size="md"
            icon={<Upload className="w-4 h-4 text-amber-500" />}
            onClick={() => setIsImportModalOpen(true)}
            className="flex-1 sm:flex-initial font-bold text-xs"
          >
            <span>استيراد</span>
            <span className="hidden sm:inline"> {activeSubTab === 'customer' ? 'عملاء' : 'موردين'} (CSV)</span>
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={handleOpenAdd}
            className="flex-1 sm:flex-initial font-black shadow-md shadow-amber-500/20 text-xs"
          >
            <span>إضافة</span>
            <span className="hidden sm:inline"> {activeSubTab === 'customer' ? 'عميل جديد' : 'مورد جديد'}</span>
          </Button>
        </div>
      </div>

      {/* Parties Cards (Mobile-first responsive grid) */}
      {filteredList.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-3xl bg-slate-50 dark:bg-zinc-900/30 space-y-2">
          <Users className="w-12 h-12 text-slate-400 dark:text-zinc-600 mx-auto" />
          <h4 className="text-sm font-bold text-slate-700 dark:text-zinc-300">لم يتم العثور على نتائج</h4>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredList.map((p) => {
            const bal =
              activeSubTab === 'customer'
                ? (customerBalanceMap.get(p.id) ?? (p.current_balance || 0))
                : (supplierBalanceMap.get(p.id) ?? (p.current_balance || 0));

            const isCustomer = activeSubTab === 'customer';
            const hasOverCredit = isCustomer && (p as Customer).credit_limit && bal > (p as Customer).credit_limit!;

            return (
              <Card
                key={p.id}
                className="hover:border-slate-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between gap-3 group shadow-xs"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <h4 className="text-sm font-black text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors line-clamp-1">
                        {p.name}
                      </h4>
                      <div className="text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-2 flex-wrap">
                        {p.phone ? (
                          <span className="flex items-center gap-1 font-mono text-slate-700 dark:text-zinc-300">
                            <Phone className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            {p.phone}
                          </span>
                        ) : (
                          <span>بدون هاتف</span>
                        )}
                        {p.address && (
                          <span className="flex items-center gap-1 text-slate-500 dark:text-zinc-400">
                            <MapPin className="w-3 h-3" />
                            {p.address}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-left shrink-0">
                      <span className="text-[10px] text-slate-500 dark:text-zinc-400 block font-bold">الرصيد الحالي</span>
                      <span
                        className={`text-base font-black font-mono tabular-nums ${
                          bal > 0 ? 'text-rose-600 dark:text-rose-400' : bal < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-zinc-400'
                        }`}
                      >
                        {formatCurrency(bal)}
                      </span>
                    </div>
                  </div>

                  {/* Credit limit warning if applicable */}
                  {hasOverCredit && (
                    <div className="flex items-center gap-1 text-[11px] text-rose-700 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-1 rounded-lg font-bold">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                      <span>تجاوز الحد الائتماني ({formatCurrency((p as Customer).credit_limit!)})</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-zinc-800/80 gap-2">
                  <button
                    onClick={() => handleOpenStatement(p, activeSubTab)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-xs font-bold rounded-xl transition-colors cursor-pointer border border-slate-200 dark:border-zinc-700"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-amber-500" />
                    <span>كشف حساب تفصيلي</span>
                  </button>

                  <button
                    onClick={() => handleOpenEdit(p)}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white transition-colors cursor-pointer border border-slate-200 dark:border-zinc-700"
                    title="تعديل البيانات"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Party Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        maxWidth="md"
        title={editingParty ? `تعديل بيانات ${editingParty.name}` : `إضافة ${activeSubTab === 'customer' ? 'عميل' : 'مورد'} جديد`}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">الاسم بالكامل (إجباري):</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: ورشة الأمانة، الحاج إبراهيم..."
              className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">رقم الهاتف:</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01012345678"
                className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">العنوان / المنطقة:</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="التوفيقية، الحرفيين..."
                className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">رصيد أول المدة:</label>
              <input
                type="number"
                step="5"
                value={isNaN(openingBalance) ? 0 : openingBalance}
                onChange={(e) => setOpeningBalance(Number(e.target.value) || 0)}
                className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {activeSubTab === 'customer' && (
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">الحد الائتماني المسموح:</label>
                <input
                  type="number"
                  step="50"
                  value={isNaN(creditLimit) ? 0 : creditLimit}
                  onChange={(e) => setCreditLimit(Number(e.target.value) || 0)}
                  placeholder="0 (بدون حد)"
                  className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">ملاحظات إضافية:</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="شروط السداد، خصومات خاصة..."
              className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
            <Button variant="primary" type="submit" className="flex-1">
              {editingParty ? 'حفظ التعديلات' : 'إضافة الآن'}
            </Button>
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* Statement of Account Modal */}
      <Modal
        isOpen={statementModalOpen}
        onClose={() => setStatementModalOpen(false)}
        maxWidth="4xl"
        title={
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-amber-500" />
            <span>كشف حساب: {selectedParty?.name}</span>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Statement Date Filters & Action Strip */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-100 dark:bg-zinc-900 p-3 rounded-2xl border border-slate-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">من تاريخ:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 dark:text-zinc-400 block mb-1">إلى تاريخ:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Download className="w-3.5 h-3.5" />}
                onClick={handleExportStatementCSV}
              >
                تصدير Excel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Printer className="w-3.5 h-3.5" />}
                onClick={() => {
                  setPrintDoc({
                    type: 'account_statement',
                    data: {
                      party: selectedParty,
                      statement: partyStatement,
                      startDate,
                      endDate,
                    },
                    format: 'a4',
                  });
                }}
              >
                طباعة كشف الحساب
              </Button>
            </div>
          </div>

          {/* Statement KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center bg-slate-50 dark:bg-zinc-950/80 p-3 rounded-2xl border border-slate-200 dark:border-zinc-800">
            <div>
              <span className="text-[11px] text-slate-500 dark:text-zinc-400 block">رصيد أول المدة</span>
              <span className="text-sm font-black font-mono text-slate-800 dark:text-zinc-200">
                {formatCurrency(partyStatement.openingBal)}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 dark:text-zinc-400 block">إجمالي المدين (لنا)</span>
              <span className="text-sm font-black font-mono text-rose-600 dark:text-rose-400">
                {formatCurrency(partyStatement.totalDebit)}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 dark:text-zinc-400 block">إجمالي الدائن (مسدد)</span>
              <span className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400">
                {formatCurrency(partyStatement.totalCredit)}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 dark:text-zinc-400 block">الرصيد الختامي</span>
              <span className="text-sm font-black font-mono text-amber-600 dark:text-amber-400">
                {formatCurrency(partyStatement.closingBal)}
              </span>
            </div>
          </div>

          {/* Statement Movements Table */}
          <div className="max-h-[50vh] overflow-y-auto overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 dark:bg-zinc-900 sticky top-0 text-slate-700 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800 font-bold">
                <tr>
                  <th className="p-2.5">التاريخ</th>
                  <th className="p-2.5">نوع المستند</th>
                  <th className="p-2.5">رقم المستند</th>
                  <th className="p-2.5 text-center">مدين (+)</th>
                  <th className="p-2.5 text-center">دائن (-)</th>
                  <th className="p-2.5 text-left font-black">الرصيد الجاري</th>
                  <th className="p-2.5">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60">
                {partyStatement.movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500 dark:text-zinc-500">
                      لا توجد حركات في الفترة المحددة
                    </td>
                  </tr>
                ) : (
                  partyStatement.movements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-zinc-850">
                      <td className="p-2.5 font-mono text-slate-600 dark:text-zinc-300">{formatDate(m.date)}</td>
                      <td className="p-2.5 text-slate-900 dark:text-zinc-200">{m.doc_type}</td>
                      <td className="p-2.5 font-mono text-cyan-600 dark:text-cyan-400 font-bold">{m.doc_number}</td>
                      <td className="p-2.5 text-center font-mono font-bold text-rose-600 dark:text-rose-400">
                        {m.debit > 0 ? formatCurrency(m.debit) : '-'}
                      </td>
                      <td className="p-2.5 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {m.credit > 0 ? formatCurrency(m.credit) : '-'}
                      </td>
                      <td className="p-2.5 text-left font-mono font-black text-amber-600 dark:text-amber-400 tabular-nums">
                        {formatCurrency(m.calculatedBalance)}
                      </td>
                      <td className="p-2.5 text-slate-500 dark:text-zinc-400 text-[11px]">{m.notes || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* CSV Import Modal */}
      <CsvImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        defaultType={activeSubTab === 'customer' ? 'customers' : 'suppliers'}
      />
    </div>
  );
};
