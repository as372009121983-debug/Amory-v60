import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { SalesInvoiceView } from './components/SalesInvoiceView';
import { PurchaseInvoiceView } from './components/PurchaseInvoiceView';
import { ItemsView } from './components/ItemsView';
import { ItemCardView } from './components/ItemCardView';
import { PartiesView } from './components/PartiesView';
import { TreasuryView } from './components/TreasuryView';
import { ReceiptsView } from './components/ReceiptsView';
import { ExpensesView } from './components/ExpensesView';
import { DailyJournalView } from './components/DailyJournalView';
import { InventoryAuditView } from './components/InventoryAuditView';
import { ReportsView } from './components/ReportsView';
import { UsersView } from './components/UsersView';
import { ReturnsView } from './components/ReturnsView';
import { SelfTestView } from './components/SelfTestView';
import { PrintDocumentView } from './components/PrintDocumentView';
import { SUPABASE_FULL_SQL } from './lib/supabaseSql';
import { CloudAccountView } from './components/CloudAccountView';
import { CheckCircle2, AlertCircle, Info, X, Database, Copy, Check } from 'lucide-react';

const MainContent: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    currentUser,
    isLocked,
    toasts,
    removeToast,
    isSupabaseModalOpen,
    setIsSupabaseModalOpen,
    showToast,
    printDoc,
    cloudEnabled,
    cloudLoading,
    cloudSession,
    cloudHydrated,
  } = useApp();

  const [copiedSql, setCopiedSql] = useState(false);

  // Check URL query param for ?selftest=1
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('selftest') === '1' && currentUser?.role === 'admin') {
      setActiveTab('selftest');
    }
  }, [currentUser, setActiveTab]);

  // Global F4 shortcut for Returns
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault();
        setActiveTab('returns');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab]);

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_FULL_SQL);
    setCopiedSql(true);
    showToast('success', 'تم النسخ', 'تم نسخ سكربت Supabase SQL كاملاً للحافظة');
    setTimeout(() => setCopiedSql(false), 3000);
  };

  // Cloud account gate: when Supabase is configured, every device must enter the same account first.
  if (cloudEnabled && (cloudLoading || !cloudSession || !cloudHydrated)) {
    return <CloudAccountView />;
  }

  // If session is locked, render the PIN Login View
  if (isLocked) {
    return <LoginView />;
  }

  // If document is being printed
  if (printDoc) {
    return <PrintDocumentView />;
  }

  const hasFixedBottomActionBar = activeTab === 'sales_invoice' || activeTab === 'purchase_invoice';

  return (
    <div className="mobile-app-shell min-h-[100dvh] bg-slate-100 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 flex flex-col font-cairo selection:bg-amber-500 selection:text-zinc-950 relative transition-colors duration-200">
      {/* Navigation (Sidebar on Desktop/Tablet, Top & Bottom Nav on Mobile) */}
      <Navbar />

      {/* Main Content Area - offset for desktop/tablet sidebar & mobile top header */}
      <div className="mobile-app-main flex-1 md:mr-20 lg:mr-64 flex flex-col min-w-0 transition-all duration-300 pt-[calc(3.75rem+env(safe-area-inset-top,0px))] md:pt-0">
        <main className={`mobile-main-scroll flex-1 w-full max-w-[100vw] overflow-x-hidden ${hasFixedBottomActionBar ? 'pb-mobile-checkout md:pb-8' : 'pb-mobile-page md:pb-8'}`}>
          {activeTab === 'dashboard' && <div className="mobile-screen-host"><DashboardView /></div>}
          {activeTab === 'sales_invoice' && <div className="mobile-screen-host"><SalesInvoiceView /></div>}
          {activeTab === 'purchase_invoice' && <div className="mobile-screen-host"><PurchaseInvoiceView /></div>}
          {activeTab === 'returns' && <div className="mobile-screen-host"><ReturnsView /></div>}
          {activeTab === 'selftest' && <div className="mobile-screen-host"><SelfTestView onBackToApp={() => setActiveTab('dashboard')} /></div>}
          {activeTab === 'items' && <div className="mobile-screen-host"><ItemsView /></div>}
          {activeTab === 'item_card' && <div className="mobile-screen-host"><ItemCardView /></div>}
          {(activeTab === 'parties' || activeTab === 'customers' || activeTab === 'suppliers') && <div className="mobile-screen-host"><PartiesView /></div>}
          {activeTab === 'treasury' && <div className="mobile-screen-host"><TreasuryView /></div>}
          {activeTab === 'receipts' && <div className="mobile-screen-host"><ReceiptsView /></div>}
          {activeTab === 'expenses' && <div className="mobile-screen-host"><ExpensesView /></div>}
          {activeTab === 'daily_journal' && <div className="mobile-screen-host"><DailyJournalView /></div>}
          {(activeTab === 'inventory' || activeTab === 'inventory_audit') && <div className="mobile-screen-host"><InventoryAuditView /></div>}
          {activeTab === 'reports' && <div className="mobile-screen-host"><ReportsView /></div>}
          {(activeTab === 'users' || activeTab === 'users_settings') && <div className="mobile-screen-host"><UsersView /></div>}
        </main>
      </div>

      {/* Toast Notifications Container (at top under header, max 2 toasts, never blocking bottom actions) */}
      <div className="fixed top-16 md:top-5 left-3 right-3 md:right-auto md:left-6 z-50 flex flex-col gap-2 pointer-events-none items-center md:items-start max-w-sm">
        {toasts.slice(-2).map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border text-xs font-semibold w-full transition-all transform animate-in slide-in-from-top-2 duration-200 backdrop-blur-md ${
              t.type === 'success'
                ? 'bg-zinc-900/95 text-emerald-400 border-emerald-500/40 shadow-emerald-950/20'
                : t.type === 'error'
                ? 'bg-zinc-900/95 text-rose-400 border-rose-500/40 shadow-rose-950/20'
                : 'bg-zinc-900/95 text-zinc-100 border-zinc-700 shadow-black/40'
            }`}
          >
            {t.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : t.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            ) : (
              <Info className="w-5 h-5 text-cyan-400 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-black text-white text-xs">{t.title}</div>
              {t.message && <div className="text-[11px] text-zinc-300 mt-0.5 leading-tight">{t.message}</div>}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-zinc-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Supabase SQL Code Modal (Developer Tab) */}
      {isSupabaseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-zinc-950 text-zinc-100 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-3xl max-h-[88dvh] flex flex-col shadow-2xl border border-zinc-800">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-cyan-400" />
                <h3 className="font-black text-sm text-white">سكربت تهيئة قاعدة بيانات Supabase (SQL)</h3>
              </div>
              <button
                onClick={() => setIsSupabaseModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl mb-3 text-xs text-zinc-300 flex items-center justify-between">
                <span>انسخ الكود التالي والصقه في Supabase SQL Editor لإنشاء الجداول والسياسات تلقائياً:</span>
                <button
                  onClick={handleCopySql}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-zinc-950 text-xs font-bold rounded-lg transition-colors"
                >
                  {copiedSql ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedSql ? 'تم النسخ' : 'نسخ الكود'}</span>
                </button>
              </div>
              <pre className="bg-zinc-900 p-4 rounded-xl text-[11px] font-mono text-zinc-300 overflow-x-auto border border-zinc-800 dir-ltr text-left">
                {SUPABASE_FULL_SQL}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
};

export default App;
