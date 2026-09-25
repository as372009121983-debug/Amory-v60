import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Item,
  Customer,
  Supplier,
  SalesInvoice,
  PurchaseInvoice,
  ReturnRecord,
  Receipt,
  Expense,
  ExpenseCategory,
  StockAdjustment,
  StockMovement,
  AccountMovement,
  TreasuryMovement,
  AuditLog,
  StoreSettings,
  UserProfile,
  UserRole,
} from '../types';
import { storage, SupabaseConfig } from '../lib/storage';
import { hashPin, generateSalt } from '../lib/security';
import { cloudEnabled, supabase, signIn, signUp, signOut, getWorkspace, upsertWorkspace, updateWorkspace, subscribeToWorkspace, buildCloudSnapshot, isMeaningfulSnapshot, markCloudSyncPending, clearCloudSyncPending, hasCloudSyncPending } from '../lib/cloudSync';
import type { Session } from '@supabase/supabase-js';

export type ActiveTab =
  | 'dashboard'
  | 'sales_invoice'
  | 'purchase_invoice'
  | 'returns'
  | 'items'
  | 'item_card'
  | 'parties'
  | 'customers'
  | 'suppliers'
  | 'treasury'
  | 'receipts'
  | 'expenses'
  | 'daily_journal'
  | 'inventory'
  | 'inventory_audit'
  | 'reports'
  | 'users'
  | 'users_settings'
  | 'selftest';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

export interface PrintDocument {
  type: 'sales_invoice' | 'purchase_invoice' | 'receipt' | 'account_statement' | 'item_card' | 'daily_report' | 'return';
  data: any;
  format: 'a4' | 'thermal';
}

interface AppContextType {
  // Auth & Session
  currentUser: UserProfile;
  setCurrentUser: (user: UserProfile) => void;
  users: UserProfile[];
  isLocked: boolean;
  lockScreen: () => void;
  unlockScreen: () => void;
  loginWithPin: (userId: string, pin: string) => Promise<{ success: boolean; message?: string }>;
  setupUserPin: (userId: string, pin: string) => Promise<{ success: boolean; message?: string }>;
  failedLoginAttempts: number;
  lockoutRemainingSeconds: number;

  // Cloud account & multi-device sync
  cloudEnabled: boolean;
  cloudLoading: boolean;
  cloudSession: Session | null;
  cloudHydrated: boolean;
  cloudSyncing: boolean;
  cloudError: string;
  lastCloudSync: string | null;
  signInCloud: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  signUpCloud: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  signOutCloud: () => Promise<void>;

  // Navigation
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  // Data Collections
  items: Item[];
  customers: Customer[];
  suppliers: Supplier[];
  salesInvoices: SalesInvoice[];
  purchaseInvoices: PurchaseInvoice[];
  returns: ReturnRecord[];
  receipts: Receipt[];
  expenses: Expense[];
  expenseCategories: ExpenseCategory[];
  stockAdjustments: StockAdjustment[];
  stockMovements: StockMovement[];
  accountMovements: AccountMovement[];
  treasuryMovements: TreasuryMovement[];
  auditLogs: AuditLog[];
  settings: StoreSettings;
  updateSettings: (newSettings: StoreSettings) => void;
  treasuryBalance: number;

  // Fast Precomputed Lookup Maps (O(1) access)
  itemStockMap: Map<string, number>;
  customerBalanceMap: Map<string, number>;
  supplierBalanceMap: Map<string, number>;

  // User Administration
  saveUser: (userData: { id?: string; name: string; username: string; role: UserRole; is_active: boolean; avatar_color?: string }) => void;
  deleteUser: (userId: string) => void;

  // Invoices & Actions
  cancelSalesInvoice: (invoiceId: string, reason: string) => boolean;
  cancelPurchaseInvoice: (invoiceId: string, reason: string) => boolean;
  saveReturn: (retData: any) => ReturnRecord;
  cancelReturn: (returnId: string, reason: string) => boolean;

  // Cloud Config (Developer)
  supabaseConfig: SupabaseConfig;
  updateSupabaseConfig: (cfg: SupabaseConfig) => void;
  isSupabaseModalOpen: boolean;
  setIsSupabaseModalOpen: (open: boolean) => void;

  // UI & Notifications
  toasts: ToastMessage[];
  showToast: (type: ToastMessage['type'], title: string, message: string) => void;
  removeToast: (id: string) => void;
  printDoc: PrintDocument | null;
  setPrintDoc: (doc: PrintDocument | null) => void;
  refreshData: () => void;
  resetInactivityTimer: () => void;
  selectedItemIdForCard: string | null;
  setSelectedItemIdForCard: (id: string | null) => void;

  // Theme (Dark / Light)
  isDarkMode: boolean;
  toggleDarkMode: () => void;

  // Permissions helpers
  canViewCosts: boolean;
  canViewProfits: boolean;
  canViewTreasuryBalance: boolean;
  canDeleteInvoices: boolean;
  canManageSettings: boolean;

  // Keyboard Shortcuts & Global Triggers
  registerSaveTrigger: (fn: () => void) => () => void;
  triggerSave: () => void;
  searchFocusSignal: number;
  triggerSearchFocus: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize storage engine
  useEffect(() => {
    storage.init();
  }, []);

  const [users, setUsers] = useState<UserProfile[]>(() => storage.getUsers());
  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    const list = storage.getUsers();
    return list.find((u) => u.role === 'admin' && u.is_active) || list[0];
  });

  // Auth lock screen: always lock on startup unless absolutely no PIN exists in the entire system
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    const list = storage.getUsers();
    return list.some((u) => Boolean(u.pin_hash && u.pin_salt));
  });

  const [failedLoginAttempts, setFailedLoginAttempts] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('amory_failed_attempts');
      return saved ? parseInt(saved, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });

  const [lockoutRemainingSeconds, setLockoutRemainingSeconds] = useState<number>(() => {
    try {
      const until = localStorage.getItem('amory_lockout_until');
      if (until) {
        const diff = Math.ceil((parseInt(until, 10) - Date.now()) / 1000);
        return diff > 0 ? diff : 0;
      }
    } catch {
      // ignore
    }
    return 0;
  });
  const [cloudSession, setCloudSession] = useState<Session | null>(null);
  const [cloudLoading, setCloudLoading] = useState<boolean>(cloudEnabled);
  const [cloudHydrated, setCloudHydrated] = useState<boolean>(!cloudEnabled);
  const [cloudSyncing, setCloudSyncing] = useState<boolean>(false);
  const [cloudError, setCloudError] = useState<string>('');
  const [lastCloudSync, setLastCloudSync] = useState<string | null>(null);
  const cloudVersionRef = useRef(0);
  const cloudVersionKeyRef = useRef<string | null>(null);
  const cloudAccountRef = useRef<string | null>(null);
  const cloudPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudApplyingRef = useRef(false);
  // Tracks whether the user changed local data (e.g. imported a CSV) while the
  // initial cloud snapshot was still being fetched, so that slow-arriving cloud
  // data never silently overwrites a fresh local import (see hydration effect below).
  const localWriteDuringHydrationRef = useRef(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  // Reactive Data states
  const [items, setItems] = useState<Item[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [stockAdjustments, setStockAdjustments] = useState<StockAdjustment[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [accountMovements, setAccountMovements] = useState<AccountMovement[]>([]);
  const [treasuryMovements, setTreasuryMovements] = useState<TreasuryMovement[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(() => storage.getSettings());
  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseConfig>(() => storage.getSupabaseConfig());
  const [treasuryBalance, setTreasuryBalance] = useState<number>(0);

  // Fast Batch Maps
  const [itemStockMap, setItemStockMap] = useState<Map<string, number>>(new Map());
  const [customerBalanceMap, setCustomerBalanceMap] = useState<Map<string, number>>(new Map());
  const [supplierBalanceMap, setSupplierBalanceMap] = useState<Map<string, number>>(new Map());

  // UI state
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [printDoc, setPrintDoc] = useState<PrintDocument | null>(null);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState<boolean>(false);
  const [searchFocusSignal, setSearchFocusSignal] = useState<number>(0);
  const [selectedItemIdForCard, setSelectedItemIdForCard] = useState<string | null>(null);

  // Theme mode
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('autoparts_theme');
    if (saved) return saved === 'dark';
    return true; // Default to dark garage luxury theme
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('autoparts_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('autoparts_theme', 'light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => !prev);
  }, []);

  const saveHandlersRef = useRef<(() => void)[]>([]);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((type: ToastMessage['type'], title: string, message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => {
      // Merge identical toasts to avoid clutter
      const filtered = prev.filter((t) => !(t.type === type && t.title === title));
      const trimmed = filtered.slice(-1); // Max 2 toasts at a time
      return [...trimmed, { id, type, title, message }];
    });

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshData = useCallback(() => {
    const u = storage.getUsers();
    setUsers(u);
    // ensure currentUser stays updated
    setCurrentUser((prev) => u.find((item) => item.id === prev.id) || u[0]);

    setItems(storage.getItems());
    setCustomers(storage.getCustomers());
    setSuppliers(storage.getSuppliers());
    setSalesInvoices(storage.getSalesInvoices());
    setPurchaseInvoices(storage.getPurchaseInvoices());
    setReturns(storage.getReturns());
    setReceipts(storage.getReceipts());
    setExpenses(storage.getExpenses());
    setExpenseCategories(storage.getExpenseCategories());
    setStockAdjustments(storage.getStockAdjustments());
    setStockMovements(storage.getStockMovements());
    setAccountMovements(storage.getAccountMovements());
    setTreasuryMovements(storage.getTreasuryMovements());
    setAuditLogs(storage.getAuditLogs());
    setSettings(storage.getSettings());
    setSupabaseConfig(storage.getSupabaseConfig());
    setTreasuryBalance(storage.calculateTreasuryBalance());

    // Precompute maps
    setItemStockMap(storage.calculateAllItemStocks());
    setCustomerBalanceMap(storage.calculateAllCustomerBalances());
    setSupplierBalanceMap(storage.calculateAllSupplierBalances());
  }, []);

  // Initial load: refresh immediately from synchronous cache, and re-refresh when IndexedDB is ready
  useEffect(() => {
    refreshData();
    storage.ready.then(() => {
      refreshData();
    });
  }, [refreshData]);

  useEffect(() => {
    const supabaseClient = supabase;
    if (!cloudEnabled || !supabaseClient) {
      setCloudLoading(false);
      setCloudHydrated(true);
      return;
    }

    let mounted = true;
    const boot = async () => {
      try {
        const session = (await supabaseClient.auth.getSession()).data.session;
        if (!mounted) return;
        setCloudSession(session);
      } catch (e: any) {
        if (mounted) setCloudError(e?.message || 'تعذر الاتصال بالحساب السحابي');
      } finally {
        if (mounted) setCloudLoading(false);
      }
    };
    void boot();
    const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setCloudSession(session);
      if (!session) {
        setCloudHydrated(false);
        setCloudSyncing(false);
      }
    });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);

  const signInCloud = useCallback(async (email: string, password: string) => {
    try {
      const result = await signIn(email, password);
      if (result.error) return { success: false, message: result.error.message };
      return { success: true, message: 'تم تسجيل الدخول، جاري تحميل بيانات المحل...' };
    } catch (e: any) {
      return { success: false, message: e?.message || 'تعذر تسجيل الدخول' };
    }
  }, []);

  const signUpCloud = useCallback(async (email: string, password: string) => {
    if (password.length < 6) return { success: false, message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' };
    try {
      const result = await signUp(email, password);
      if (result.error) return { success: false, message: result.error.message };
      if (!result.data.session) return { success: true, message: 'تم إنشاء الحساب. افتح رسالة البريد لتأكيد الحساب ثم سجل الدخول.' };
      return { success: true, message: 'تم إنشاء الحساب، جاري تجهيز مساحة المحل...' };
    } catch (e: any) {
      return { success: false, message: e?.message || 'تعذر إنشاء الحساب' };
    }
  }, []);

  const signOutCloud = useCallback(async () => {
    await signOut();
    setCloudSession(null);
    setCloudHydrated(false);
  }, []);

  useEffect(() => {
    if (!cloudSession) return;
    let disposed = false;
    const accountId = cloudSession.user.id;
    cloudAccountRef.current = accountId;
    cloudVersionKeyRef.current = `amory_cloud_version_${accountId}`;
    try { cloudVersionRef.current = Number(localStorage.getItem(cloudVersionKeyRef.current) || 0); } catch { cloudVersionRef.current = 0; }
    setCloudSyncing(true);
    setCloudHydrated(false);
    setCloudError('');
    localWriteDuringHydrationRef.current = false;

    const start = async () => {
      try {
        // Offline-first: the local IndexedDB/localStorage cache is the working copy.
        // If the device has no internet, open the app immediately and sync later.
        if (!navigator.onLine) {
          setCloudHydrated(true);
          setCloudSyncing(false);
          return;
        }
        const row = await getWorkspace(accountId);
        if (disposed) return;

        // Guard: if the user made local changes (e.g. imported a CSV of products,
        // customers or suppliers) while this fetch was in flight, the fetched
        // snapshot is now stale. Applying it would silently overwrite the import
        // the user just did, making it look like "the file never got uploaded".
        // In that case local data wins: push it to the cloud instead of pulling.
        if (localWriteDuringHydrationRef.current) {
          try {
            const pushed = row
              ? await updateWorkspace(accountId, buildCloudSnapshot(storage), Number(row.version || 0))
              : await upsertWorkspace(accountId, buildCloudSnapshot(storage));
            cloudVersionRef.current = Number(pushed.version || (row ? Number(row.version || 0) + 1 : 1));
            try { localStorage.setItem(cloudVersionKeyRef.current!, String(cloudVersionRef.current)); } catch {}
          } catch (pushErr) {
            // If the push itself fails (e.g. version conflict), don't touch local
            // data - just mark a pending sync so the next write/online event retries.
            markCloudSyncPending();
          }
          setLastCloudSync(new Date().toISOString());
          setCloudHydrated(true);
          return;
        }

        if (row && isMeaningfulSnapshot(row.snapshot)) {
          cloudApplyingRef.current = true;
          storage.applyCloudSnapshot(row.snapshot);
          cloudApplyingRef.current = false;
          cloudVersionRef.current = Number(row.version || 0);
          try { localStorage.setItem(cloudVersionKeyRef.current!, String(cloudVersionRef.current)); } catch {}
          refreshData();
        } else if (row) {
          const seeded = await updateWorkspace(accountId, buildCloudSnapshot(storage), Number(row.version || 0));
          cloudVersionRef.current = Number(seeded.version || 1);
          try { localStorage.setItem(cloudVersionKeyRef.current!, String(cloudVersionRef.current)); } catch {}
        } else {
          const created = await upsertWorkspace(accountId, buildCloudSnapshot(storage));
          cloudVersionRef.current = Number(created.version || 1);
          try { localStorage.setItem(cloudVersionKeyRef.current!, String(cloudVersionRef.current)); } catch {}
        }
        setLastCloudSync(new Date().toISOString());
        setCloudHydrated(true);
      } catch (e: any) {
        cloudApplyingRef.current = false;
        // A cloud failure must not lock the user out of their local data.
        setCloudError(e?.message || 'تعذر الاتصال بالسحابة');
        setCloudHydrated(true);
      } finally {
        if (!disposed) setCloudSyncing(false);
      }
    };
    void start();

    const unsubscribe = subscribeToWorkspace(accountId, (row) => {
      if (disposed || row.account_id !== cloudAccountRef.current) return;
      if (Number(row.version || 0) <= cloudVersionRef.current) return;
      cloudApplyingRef.current = true;
      storage.applyCloudSnapshot(row.snapshot);
      cloudApplyingRef.current = false;
      cloudVersionRef.current = Number(row.version || 0);
      try { localStorage.setItem(cloudVersionKeyRef.current!, String(cloudVersionRef.current)); } catch {}
      refreshData();
      setLastCloudSync(row.updated_at || new Date().toISOString());
      showToast('success', 'تم تحديث البيانات', 'وصل تحديث من جهاز آخر إلى هذا الجهاز.');
    });
    return () => { disposed = true; unsubscribe(); if (cloudPushTimerRef.current) clearTimeout(cloudPushTimerRef.current); };
  }, [cloudSession, refreshData, showToast]);

  useEffect(() => {
    if (!cloudEnabled) return;
    const pushLocalToCloud = async () => {
      if (!cloudSession || cloudApplyingRef.current || !cloudAccountRef.current || !cloudHydrated || !navigator.onLine) return;
      try {
        setCloudSyncing(true);
        const row = await updateWorkspace(cloudAccountRef.current, buildCloudSnapshot(storage), cloudVersionRef.current);
        cloudVersionRef.current = Number(row.version || cloudVersionRef.current + 1);
        try { localStorage.setItem(cloudVersionKeyRef.current!, String(cloudVersionRef.current)); } catch {}
        clearCloudSyncPending();
        setLastCloudSync(row.updated_at || new Date().toISOString());
        setCloudError('');
      } catch (e: any) {
        markCloudSyncPending();
        setCloudError(e?.message || 'تعذر رفع التغيير إلى السحابة');
        // Keep local data working. The next online event will retry automatically.
      } finally {
        setCloudSyncing(false);
      }
    };

    storage.setCloudSyncHandler(() => {
      if (!cloudSession || cloudApplyingRef.current || !cloudAccountRef.current) return;
      if (!cloudHydrated) {
        // A real local write (import, add, edit...) happened before the initial
        // cloud pull finished. Remember this so the pull doesn't clobber it.
        localWriteDuringHydrationRef.current = true;
        return;
      }
      markCloudSyncPending();
      if (!navigator.onLine) return;
      if (cloudPushTimerRef.current) clearTimeout(cloudPushTimerRef.current);
      cloudPushTimerRef.current = setTimeout(() => { void pushLocalToCloud(); }, 700);
    });

    const handleOnline = () => {
      if (hasCloudSyncPending()) {
        showToast('info', 'رجع الإنترنت', 'جاري مزامنة التغييرات التي تمت بدون إنترنت...');
        void pushLocalToCloud();
      } else {
        void pushLocalToCloud();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => {
      storage.setCloudSyncHandler(null);
      window.removeEventListener('online', handleOnline);
    };
  }, [cloudSession, cloudHydrated, showToast]);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutRemainingSeconds <= 0) {
      try {
        localStorage.removeItem('amory_lockout_until');
      } catch {
        // ignore
      }
      return;
    }
    const interval = setInterval(() => {
      setLockoutRemainingSeconds((prev) => {
        if (prev <= 1) {
          try {
            localStorage.removeItem('amory_lockout_until');
            localStorage.removeItem('amory_failed_attempts');
          } catch {
            // ignore
          }
          setFailedLoginAttempts(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutRemainingSeconds]);

  // Inactivity Auto-Lock Timer (configurable in settings)
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    const minutes = settings.auto_lock_minutes && settings.auto_lock_minutes > 0 ? settings.auto_lock_minutes : 15;
    inactivityTimerRef.current = setTimeout(() => {
      setIsLocked(true);
      showToast('info', 'قفل الشاشة', 'تم قفل التطبيق تلقائياً بعد فترة من عدم النشاط حفاظاً على أمان بياناتك.');
    }, minutes * 60 * 1000);
  }, [settings.auto_lock_minutes, showToast]);

  useEffect(() => {
    const handleActivity = () => {
      if (!isLocked) {
        resetInactivityTimer();
      }
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('click', handleActivity);
    window.addEventListener('focus', handleActivity);
    document.addEventListener('visibilitychange', handleActivity);

    resetInactivityTimer();

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('focus', handleActivity);
      document.removeEventListener('visibilitychange', handleActivity);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [isLocked, resetInactivityTimer]);

  const lockScreen = useCallback(() => {
    setIsLocked(true);
    showToast('info', 'تم قفل الشاشة', 'يرجى إدخال رمز PIN للمتابعة');
  }, [showToast]);

  const unlockScreen = useCallback(() => {
    setIsLocked(false);
  }, []);

  const loginWithPin = useCallback(
    async (userId: string, pin: string): Promise<{ success: boolean; message?: string }> => {
      if (lockoutRemainingSeconds > 0) {
        return {
          success: false,
          message: `تم قفل محاولات الدخول مؤقتاً. يرجى الانتظار ${lockoutRemainingSeconds} ثانية.`,
        };
      }

      const user = users.find((u) => u.id === userId);
      if (!user) {
        return { success: false, message: 'المستخدم غير موجود' };
      }
      if (!user.is_active) {
        return { success: false, message: 'هذا الحساب معطل حالياً. يرجى مراجعة مدير النظام.' };
      }

      // If user has no PIN yet (e.g. first run)
      if (!user.pin_hash || !user.pin_salt) {
        return { success: false, message: 'needs_setup' };
      }

      const inputHash = await hashPin(pin, user.pin_salt);
      if (inputHash === user.pin_hash) {
        setCurrentUser(user);
        setIsLocked(false);
        setFailedLoginAttempts(0);
        try {
          localStorage.removeItem('amory_lockout_until');
          localStorage.removeItem('amory_failed_attempts');
        } catch {
          // ignore
        }
        showToast('success', 'أهلاً بك', `تم تسجيل الدخول بنجاح: ${user.full_name}`);
        return { success: true };
      }

      const newFailed = failedLoginAttempts + 1;
      setFailedLoginAttempts(newFailed);

      if (newFailed >= 5) {
        const lockoutUntil = Date.now() + 60 * 1000;
        try {
          localStorage.setItem('amory_lockout_until', String(lockoutUntil));
          localStorage.setItem('amory_failed_attempts', String(newFailed));
        } catch {
          // ignore
        }
        setLockoutRemainingSeconds(60);
        showToast('error', 'محاولات خاطئة متكررة', 'تم قفل تسجيل الدخول لمدة 60 ثانية لحماية النظام.');
        return { success: false, message: 'تم قفل تسجيل الدخول لمدة 60 ثانية بسبب تكرار المحاولات الخاطئة.' };
      }

      try {
        localStorage.setItem('amory_failed_attempts', String(newFailed));
      } catch {
        // ignore
      }
      const remaining = 5 - newFailed;
      showToast('error', 'رمز PIN غير صحيح', `تبقى لك ${remaining} محاولات قبل القفل المؤقت.`);
      return { success: false, message: `رمز PIN غير صحيح. يتبقى لك ${remaining} محاولات.` };
    },
    [users, lockoutRemainingSeconds, failedLoginAttempts, showToast]
  );

  const setupUserPin = useCallback(
    async (userId: string, pin: string): Promise<{ success: boolean; message?: string }> => {
      if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
        return { success: false, message: 'رمز PIN يجب أن يكون من 4 إلى 6 أرقام فقط.' };
      }

      const allUsers = storage.getUsers();
      const anyUserHasPin = allUsers.some((u) => Boolean(u.pin_hash && u.pin_salt));
      // If at least one user has a PIN, require logged-in admin
      if (anyUserHasPin && (!currentUser || currentUser.role !== 'admin')) {
        return { success: false, message: 'تعيين وتغيير رمز PIN يتطلب تسجيل دخول مدير النظام.' };
      }

      const salt = generateSalt();
      const hash = await hashPin(pin, salt);
      storage.setUserPin(userId, hash, salt);
      refreshData();
      showToast('success', 'تم تعيين الرمز', 'تم حفظ رمز PIN بنجاح.');
      return { success: true };
    },
    [currentUser, refreshData, showToast]
  );

  const updateSettings = useCallback(
    (newSettings: StoreSettings) => {
      storage.updateSettings(newSettings);
      setSettings(newSettings);
      showToast('success', 'تم الحفظ', 'تم تحديث إعدادات النظام بنجاح');
    },
    [showToast]
  );

  const updateSupabaseConfig = useCallback(
    (cfg: SupabaseConfig) => {
      storage.setSupabaseConfig(cfg);
      setSupabaseConfig(cfg);
      showToast('success', 'إعدادات المزامنة', 'تم حفظ إعدادات الاتصال بنجاح');
    },
    [showToast]
  );

  // User management
  const saveUser = useCallback(
    (userData: { id?: string; name: string; username: string; role: UserRole; is_active: boolean; avatar_color?: string }) => {
      try {
        storage.saveUser(userData, currentUser);
        refreshData();
        showToast('success', 'المستخدمون', 'تم حفظ بيانات المستخدم بنجاح');
      } catch (e: any) {
        showToast('error', 'خطأ في حفظ المستخدم', e.message || 'فشلت العملية');
      }
    },
    [currentUser, refreshData, showToast]
  );

  const deleteUser = useCallback(
    (userId: string) => {
      try {
        storage.deleteUser(userId, currentUser);
        refreshData();
        showToast('success', 'تم الحذف', 'تم حذف المستخدم بنجاح');
      } catch (e: any) {
        showToast('error', 'تعذر الحذف', e.message || 'فشلت العملية');
      }
    },
    [currentUser, refreshData, showToast]
  );

  // Safe Invoice Cancellation
  const cancelSalesInvoice = useCallback(
    (invoiceId: string, reason: string): boolean => {
      try {
        storage.cancelSalesInvoice(invoiceId, reason, currentUser);
        refreshData();
        showToast('success', 'تم إلغاء الفاتورة', 'تم إلغاء الفاتورة ورد المخزون والخزينة وحساب العميل بنجاح');
        return true;
      } catch (e: any) {
        showToast('error', 'تعذر إلغاء الفاتورة', e.message || 'حدث خطأ');
        return false;
      }
    },
    [currentUser, refreshData, showToast]
  );

  const cancelPurchaseInvoice = useCallback(
    (invoiceId: string, reason: string): boolean => {
      try {
        storage.cancelPurchaseInvoice(invoiceId, reason, currentUser);
        refreshData();
        showToast('success', 'تم إلغاء فاتورة الشراء', 'تم إلغاء الفاتورة وعكس تأثيراتها بنجاح');
        return true;
      } catch (e: any) {
        showToast('error', 'تعذر الإلغاء', e.message || 'حدث خطأ');
        return false;
      }
    },
    [currentUser, refreshData, showToast]
  );

  const saveReturn = useCallback(
    (retData: any): ReturnRecord => {
      try {
        const res = storage.saveReturn(retData, currentUser);
        refreshData();
        showToast(
          'success',
          retData.return_type === 'sale_return' ? 'تم تسجيل مرتجع المبيعات' : 'تم تسجيل مرتجع المشتريات',
          `رقم الإشعار: ${res.return_number}`
        );
        return res;
      } catch (e: any) {
        showToast('error', 'تعذر تسجيل المرتجع', e.message || 'حدث خطأ');
        throw e;
      }
    },
    [currentUser, refreshData, showToast]
  );

  const cancelReturn = useCallback(
    (returnId: string, reason: string): boolean => {
      try {
        storage.cancelReturn(returnId, reason, currentUser);
        refreshData();
        showToast('success', 'تم إلغاء المرتجع', 'تم إلغاء المرتجع وعكس الحركات للمخزن والخزينة والحسابات بنجاح');
        return true;
      } catch (e: any) {
        showToast('error', 'تعذر إلغاء المرتجع', e.message || 'حدث خطأ');
        return false;
      }
    },
    [currentUser, refreshData, showToast]
  );

  // Role based checks
  const canViewCosts = useMemo(() => currentUser.role !== 'cashier', [currentUser]);
  const canViewProfits = useMemo(() => currentUser.role !== 'cashier', [currentUser]);
  const canViewTreasuryBalance = useMemo(() => currentUser.role !== 'cashier', [currentUser]);
  const canDeleteInvoices = useMemo(() => currentUser.role === 'admin', [currentUser]);
  const canManageSettings = useMemo(() => currentUser.role === 'admin', [currentUser]);

  // Keyboard shortcut handlers (F2 for save, F3 for item search)
  const registerSaveTrigger = useCallback((fn: () => void) => {
    saveHandlersRef.current.push(fn);
    return () => {
      saveHandlersRef.current = saveHandlersRef.current.filter((item) => item !== fn);
    };
  }, []);

  const triggerSave = useCallback(() => {
    if (saveHandlersRef.current.length > 0) {
      const lastHandler = saveHandlersRef.current[saveHandlersRef.current.length - 1];
      lastHandler();
    }
  }, []);

  const triggerSearchFocus = useCallback(() => {
    setSearchFocusSignal((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        triggerSave();
      } else if (e.key === 'F3') {
        e.preventDefault();
        triggerSearchFocus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerSave, triggerSearchFocus]);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        users,
        isLocked,
        lockScreen,
        unlockScreen,
        loginWithPin,
        setupUserPin,
        failedLoginAttempts,
        lockoutRemainingSeconds,
        cloudEnabled,
        cloudLoading,
        cloudSession,
        cloudHydrated,
        cloudSyncing,
        cloudError,
        lastCloudSync,
        signInCloud,
        signUpCloud,
        signOutCloud,
        activeTab,
        setActiveTab,
        items,
        customers,
        suppliers,
        salesInvoices,
        purchaseInvoices,
        returns,
        receipts,
        expenses,
        expenseCategories,
        stockAdjustments,
        stockMovements,
        accountMovements,
        treasuryMovements,
        auditLogs,
        settings,
        updateSettings,
        treasuryBalance,
        itemStockMap,
        customerBalanceMap,
        supplierBalanceMap,
        saveUser,
        deleteUser,
        cancelSalesInvoice,
        cancelPurchaseInvoice,
        saveReturn,
        cancelReturn,
        supabaseConfig,
        updateSupabaseConfig,
        toasts,
        showToast,
        removeToast,
        printDoc,
        setPrintDoc,
        isSupabaseModalOpen,
        setIsSupabaseModalOpen,
        refreshData,
        resetInactivityTimer,
        selectedItemIdForCard,
        setSelectedItemIdForCard,
        isDarkMode,
        toggleDarkMode,
        canViewCosts,
        canViewProfits,
        canViewTreasuryBalance,
        canDeleteInvoices,
        canManageSettings,
        registerSaveTrigger,
        triggerSave,
        searchFocusSignal,
        triggerSearchFocus,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
