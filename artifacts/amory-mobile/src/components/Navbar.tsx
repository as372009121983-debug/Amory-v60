import React, { useState } from 'react';
import { useApp, ActiveTab } from '../context/AppContext';
import { formatCurrency } from '../lib/formatters';
import {
  LayoutDashboard,
  ShoppingCart,
  ShoppingBag,
  Package,
  Layers,
  Users2,
  Wallet,
  Receipt as ReceiptIcon,
  CreditCard,
  CalendarDays,
  Boxes,
  TrendingUp,
  ShieldCheck,
  Menu,
  X,
  Lock,
  Moon,
  Sun,
  ChevronLeft,
  Wrench,
  RotateCcw,
} from 'lucide-react';
import { BottomSheet } from './ui/BottomSheet';
import { getAppBrandName, getAppBrandShortName } from '../lib/cloudSync';

export const Navbar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    currentUser,
    treasuryBalance,
    settings,
    lockScreen,
    isDarkMode,
    toggleDarkMode,
    canViewProfits,
    canViewTreasuryBalance,
  } = useApp();

  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);

  // Desktop Navigation Items
  const desktopNavItems = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'لوحة اليوم',
      icon: LayoutDashboard,
      shortcut: null,
      adminOnly: false,
    },
    {
      id: 'sales_invoice' as ActiveTab,
      label: 'فاتورة مبيعات',
      icon: ShoppingCart,
      shortcut: 'F2',
      adminOnly: false,
    },
    {
      id: 'purchase_invoice' as ActiveTab,
      label: 'فاتورة مشتريات',
      icon: ShoppingBag,
      shortcut: null,
      adminOnly: false,
    },
    {
      id: 'returns' as ActiveTab,
      label: 'المرتجعات والتسويات',
      icon: RotateCcw,
      shortcut: 'F4',
      adminOnly: false,
    },
    {
      id: 'items' as ActiveTab,
      label: 'الأصناف والمخزن',
      icon: Package,
      shortcut: 'F3',
      adminOnly: false,
    },
    {
      id: 'item_card' as ActiveTab,
      label: 'كارت حركة الصنف',
      icon: Layers,
      shortcut: null,
      adminOnly: false,
    },
    {
      id: 'parties' as ActiveTab,
      label: 'العملاء والموردين',
      icon: Users2,
      shortcut: null,
      adminOnly: false,
    },
    {
      id: 'treasury' as ActiveTab,
      label: 'الخزينة والحسابات',
      icon: Wallet,
      shortcut: null,
      adminOnly: true, // Only admin/accountant can access
    },
    {
      id: 'receipts' as ActiveTab,
      label: 'سندات القبض والصرف',
      icon: ReceiptIcon,
      shortcut: null,
      adminOnly: false,
    },
    {
      id: 'expenses' as ActiveTab,
      label: 'المصروفات',
      icon: CreditCard,
      shortcut: null,
      adminOnly: false,
    },
    {
      id: 'daily_journal' as ActiveTab,
      label: 'اليومية العامة',
      icon: CalendarDays,
      shortcut: null,
      adminOnly: false,
    },
    {
      id: 'inventory_audit' as ActiveTab,
      label: 'المخزون والجرد',
      icon: Boxes,
      shortcut: null,
      adminOnly: false,
    },
    {
      id: 'reports' as ActiveTab,
      label: 'الأرباح والتقارير',
      icon: TrendingUp,
      shortcut: null,
      adminOnly: true, // Only admin/accountant can view
    },
    {
      id: 'users_settings' as ActiveTab,
      label: 'المستخدمين والإعدادات',
      icon: ShieldCheck,
      shortcut: null,
      adminOnly: true, // Admin only
    },
  ];

  // Mobile Bottom Navigation: 5 core buttons
  const mobileNavItems = [
    {
      id: 'sales_invoice' as ActiveTab,
      label: 'مبيعات',
      icon: ShoppingCart,
    },
    {
      id: 'purchase_invoice' as ActiveTab,
      label: 'مشتريات',
      icon: ShoppingBag,
    },
    ...(canViewTreasuryBalance
      ? [
          {
            id: 'treasury' as ActiveTab,
            label: 'الخزينة',
            icon: Wallet,
          },
        ]
      : [
          {
            id: 'receipts' as ActiveTab,
            label: 'السندات',
            icon: ReceiptIcon,
          },
        ]),
    {
      id: 'items' as ActiveTab,
      label: 'الأصناف',
      icon: Package,
    },
  ];

  // More Sheet Menu for Mobile
  const moreSheetItems = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'لوحة اليوم',
      sub: 'ملخص الورديات والأرباح',
      icon: LayoutDashboard,
      color: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      allowed: true,
    },
    {
      id: 'parties' as ActiveTab,
      label: 'العملاء والموردين',
      sub: 'كشف حساب ومديونيات',
      icon: Users2,
      color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      allowed: true,
    },
    {
      id: 'receipts' as ActiveTab,
      label: 'سندات قبض وصرف',
      sub: 'إيصالات توريد وسداد',
      icon: ReceiptIcon,
      color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
      allowed: true,
    },
    {
      id: 'expenses' as ActiveTab,
      label: 'تسجيل المصروفات',
      sub: 'إيجار، كهرباء، عمالة',
      icon: CreditCard,
      color: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      allowed: true,
    },
    {
      id: 'daily_journal' as ActiveTab,
      label: 'اليومية العامة',
      sub: 'دفتر القيود والأستاذ',
      icon: CalendarDays,
      color: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      allowed: true,
    },
    {
      id: 'item_card' as ActiveTab,
      label: 'كارت حركة الصنف',
      sub: 'سجل حركات بيع وشراء الصنف',
      icon: Layers,
      color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
      allowed: true,
    },
    {
      id: 'inventory_audit' as ActiveTab,
      label: 'المخزون والجرد',
      sub: 'تسوية وجرد المخزن الفعلي',
      icon: Boxes,
      color: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      allowed: true,
    },
    {
      id: 'reports' as ActiveTab,
      label: 'الأرباح والتقارير',
      sub: 'حساب الأرباح وحركة الأصناف',
      icon: TrendingUp,
      color: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
      allowed: canViewProfits,
    },
    {
      id: 'users_settings' as ActiveTab,
      label: 'المستخدمين والصلاحيات',
      sub: 'إدارة الكاشير والمحاسبين',
      icon: ShieldCheck,
      color: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
      allowed: currentUser.role === 'admin',
    },
    {
      id: 'returns' as ActiveTab,
      label: 'المرتجعات والتسويات',
      sub: 'إرجاع مبيعات ومشتريات',
      icon: RotateCcw,
      color: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      allowed: true,
    },
    {
      id: 'selftest' as ActiveTab,
      label: 'الفحص الذاتي (المرحلة 0)',
      sub: 'اختبار 9 سيناريوهات وسعة 50,000',
      icon: ShieldCheck,
      color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      allowed: currentUser.role === 'admin',
    },
  ];

  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setIsMoreSheetOpen(false);
  };

  const getScreenTitle = (tab: ActiveTab): string => {
    switch (tab) {
      case 'dashboard':
        return 'لوحة اليوم';
      case 'sales_invoice':
        return 'فاتورة مبيعات';
      case 'purchase_invoice':
        return 'فاتورة مشتريات';
      case 'returns':
        return 'المرتجعات والتسويات';
      case 'selftest':
        return 'الفحص والاختبار الذاتي (المرحلة 0)';
      case 'items':
        return 'الأصناف والمخزن';
      case 'item_card':
        return 'كارت الصنف';
      case 'parties':
      case 'customers':
      case 'suppliers':
        return 'العملاء والموردين';
      case 'treasury':
        return 'الخزينة';
      case 'receipts':
        return 'السندات';
      case 'expenses':
        return 'المصروفات';
      case 'daily_journal':
        return 'اليومية العامة';
      case 'inventory':
      case 'inventory_audit':
        return 'جرد المخزون';
      case 'reports':
        return 'التقارير والأرباح';
      case 'users':
      case 'users_settings':
        return 'المستخدمين والإعدادات';
      default:
        return getAppBrandShortName();
    }
  };

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. DESKTOP & TABLET FIXED SIDEBAR (Right side in RTL)                     */}
      {/* ========================================================================= */}
      <aside className="hidden md:flex flex-col fixed top-0 right-0 bottom-0 z-40 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white border-l border-slate-200 dark:border-zinc-800 transition-all duration-300 md:w-20 lg:w-64 no-print select-none shadow-xl dark:shadow-2xl">
        {/* Brand Header */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-slate-200 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-900/40">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-zinc-950 shadow-md shadow-amber-500/20 shrink-0 font-black">
            <Wrench className="w-5 h-5 text-zinc-950" />
          </div>
          <div className="hidden lg:block overflow-hidden">
            <h1 className="text-sm font-black tracking-tight text-slate-900 dark:text-white truncate">
              {getAppBrandName()}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
              <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">سحابي ومحلي متكامل</span>
            </div>
          </div>
        </div>

        {/* Treasury Quick Widget (Desktop only - Admin & Accountant only) */}
        {canViewTreasuryBalance && (
          <div className="hidden lg:block p-3 mx-3 my-2 rounded-2xl bg-slate-50 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800/80 shadow-xs">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 mb-1">
              <span className="flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>رصيد الخزينة</span>
              </span>
              <button
                onClick={() => setActiveTab('treasury')}
                className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline font-bold cursor-pointer"
              >
                عرض
              </button>
            </div>
            <div className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400 dir-ltr tabular-nums">
              {formatCurrency(treasuryBalance)}
            </div>
          </div>
        )}

        {/* Navigation Items (Scrollable) */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-1 scrollbar-none">
          {desktopNavItems.map((item) => {
            if (item.adminOnly && currentUser.role === 'cashier') return null;

            const Icon = item.icon;
            const isActive =
              activeTab === item.id ||
              (item.id === 'parties' && (activeTab === 'customers' || activeTab === 'suppliers')) ||
              (item.id === 'inventory_audit' && activeTab === 'inventory') ||
              (item.id === 'users_settings' && activeTab === 'users');

            return (
              <button
                key={item.id}
                onClick={() => handleSelectTab(item.id)}
                title={item.label}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all group cursor-pointer ${
                  isActive
                    ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20 font-black'
                    : 'text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-900/90'
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-zinc-950' : 'text-slate-400 group-hover:text-amber-500 dark:group-hover:text-amber-400'
                  }`}
                />
                <span className="hidden lg:inline truncate text-right flex-1">{item.label}</span>
                {item.shortcut && (
                  <span
                    className={`hidden lg:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                      isActive
                        ? 'bg-amber-600/30 text-zinc-950 border-amber-600/40'
                        : 'bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400 border-slate-300 dark:border-zinc-700'
                    }`}
                  >
                    {item.shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Card, Theme Toggle & Lock Screen */}
        <div className="p-3 border-t border-slate-200 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-900/60 space-y-2">
          {/* User display */}
          <div className="hidden lg:flex items-center gap-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-2 shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
              {currentUser.role === 'admin' ? 'مدير' : currentUser.role === 'accountant' ? 'محاسب' : 'كاشير'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate">{currentUser.full_name}</div>
              <div className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono">@{currentUser.username}</div>
            </div>
          </div>

          {/* Action Row: Lock Button & Theme Toggle */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={lockScreen}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white hover:bg-slate-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-bold transition-colors cursor-pointer border border-slate-200 dark:border-zinc-700 shadow-xs"
              title="قفل الشاشة الآن"
            >
              <Lock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
              <span className="hidden lg:inline">قفل</span>
            </button>

            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer border border-slate-200 dark:border-zinc-700 shadow-xs"
              title={isDarkMode ? 'الوضع المضيء (الصباحي)' : 'الوضع الداكن (الليلي)'}
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-cyan-600" />}
            </button>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. MOBILE TOP HEADER (Fixed under safe area)                              */}
      {/* ========================================================================= */}
      <header className="mobile-top-header md:hidden fixed top-0 left-0 right-0 z-40 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md text-slate-900 dark:text-white border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between px-3 pt-safe h-[calc(3.5rem+env(safe-area-inset-top,0px))] no-print select-none shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center text-zinc-950 font-black shadow-xs shrink-0">
            <Wrench className="w-4 h-4" />
          </div>
          {/* Strictly "العموري" on mobile without cutting */}
          <span className="text-base font-black text-amber-500 dark:text-amber-400 tracking-tight shrink-0">{getAppBrandShortName()}</span>
          <span className="text-slate-400 dark:text-zinc-600 shrink-0">/</span>
          <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">
            {getScreenTitle(activeTab)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={lockScreen}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-slate-600 dark:text-zinc-400 hover:text-amber-500 active:scale-95 transition-all cursor-pointer"
            title="قفل الشاشة"
          >
            <Lock className="w-4 h-4" />
          </button>
          <button
            onClick={toggleDarkMode}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white active:scale-95 transition-all cursor-pointer"
            title="تبديل الوضع"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-cyan-600" />}
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 3. MOBILE FIXED BOTTOM BAR (5 Core Icons with safe area)                   */}
      {/* ========================================================================= */}
      <nav className="mobile-bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-40 h-[calc(4.25rem+env(safe-area-inset-bottom,0px))] bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md text-slate-900 dark:text-white border-t border-slate-200 dark:border-zinc-800 grid grid-cols-5 px-1 no-print select-none shadow-2xl pb-[env(safe-area-inset-bottom,0px)]">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleSelectTab(item.id)}
              className={`flex flex-col items-center justify-center py-1 min-h-[48px] transition-all cursor-pointer relative ${
                isActive ? 'text-amber-600 dark:text-amber-400 font-black' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
              }`}
            >
              <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-115 text-amber-500 dark:text-amber-400' : ''}`} />
              <span className="text-[10px] mt-1 font-bold">{item.label}</span>
              {isActive && (
                <span className="absolute top-0 w-8 h-1 bg-amber-500 dark:bg-amber-400 rounded-b-full shadow-sm shadow-amber-400/50" />
              )}
            </button>
          );
        })}

        {/* 5th Icon: "المزيد" opens Bottom Sheet */}
        <button
          onClick={() => setIsMoreSheetOpen(true)}
          className={`flex flex-col items-center justify-center py-1 min-h-[48px] transition-all cursor-pointer relative ${
            isMoreSheetOpen ? 'text-amber-600 dark:text-amber-400 font-black' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
          }`}
        >
          <Menu className={`w-5 h-5 transition-transform ${isMoreSheetOpen ? 'scale-115' : ''}`} />
          <span className="text-[10px] mt-1 font-bold">المزيد</span>
        </button>
      </nav>

      {/* ========================================================================= */}
      {/* 4. MOBILE "MORE" BOTTOM SHEET                                             */}
      {/* ========================================================================= */}
      <BottomSheet
        isOpen={isMoreSheetOpen}
        onClose={() => setIsMoreSheetOpen(false)}
        title="جميع الشاشات والإجراءات"
      >
        <div className="grid grid-cols-2 gap-2.5 pb-6">
          {moreSheetItems
            .filter((item) => item.allowed)
            .map((item) => {
              const Icon = item.icon;
              const isActive =
                activeTab === item.id ||
                (item.id === 'parties' && (activeTab === 'customers' || activeTab === 'suppliers')) ||
                (item.id === 'inventory_audit' && activeTab === 'inventory') ||
                (item.id === 'users_settings' && activeTab === 'users');

              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  className={`flex flex-col items-start p-3.5 rounded-2xl border text-right transition-all group cursor-pointer ${
                    isActive
                      ? 'bg-amber-50/80 dark:bg-zinc-900 border-amber-500 shadow-md shadow-amber-500/10 ring-1 ring-amber-500/30'
                      : 'bg-slate-50 dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 border ${item.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-black text-slate-900 dark:text-white">{item.label}</div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5 line-clamp-1">{item.sub}</div>
                </button>
              );
            })}
        </div>
      </BottomSheet>
    </>
  );
};
