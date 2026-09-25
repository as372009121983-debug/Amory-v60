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
  DocumentCounters,
} from '../types';
import {
  INITIAL_ITEMS,
  INITIAL_CUSTOMERS,
  INITIAL_SUPPLIERS,
  INITIAL_SETTINGS,
  INITIAL_EXPENSE_CATEGORIES,
  INITIAL_USERS,
  getInitialMovements,
} from './initialData';
import { generateSecureId } from './security';

const STORAGE_KEY_PREFIX = 'autoparts_v1_';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConnected: boolean;
}

export interface StorageUsage {
  usedBytes: number;
  maxBytes: number;
  percent: number;
  formattedUsed: string;
  formattedAvailable?: string;
  persisted?: boolean;
}

function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 ميجابايت';
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} ك.ب`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} ميجابايت`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} جيجابايت`;
}

function openIndexedDB(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB غير متاح'));
    }
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains('keyval')) {
        db.createObjectStore('keyval', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve(request.result);
  });
}

function idbPutBatch(db: IDBDatabase, items: { key: string; value: any }[]): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('keyval', 'readwrite');
      const store = tx.objectStore('keyval');
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}

function idbGetAll(db: IDBDatabase): Promise<{ key: string; value: any }[]> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('keyval', 'readonly');
      const store = tx.objectStore('keyval');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

function idbClear(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('keyval', 'readwrite');
      const store = tx.objectStore('keyval');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

function idbDeleteDatabase(dbName: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve();
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/**
 * DataStore Interface for Local & Future Cloud synchronization
 */
export interface DataStore {
  getItems(): Item[];
  getCustomers(): Customer[];
  getSuppliers(): Supplier[];
  getSalesInvoices(): SalesInvoice[];
  getPurchaseInvoices(): PurchaseInvoice[];
  getReturns(): ReturnRecord[];
  getReceipts(): Receipt[];
  getExpenses(): Expense[];
  getExpenseCategories(): ExpenseCategory[];
  getStockAdjustments(): StockAdjustment[];
  getStockMovements(): StockMovement[];
  getAccountMovements(): AccountMovement[];
  getTreasuryMovements(): TreasuryMovement[];
  getAuditLogs(): AuditLog[];
  getUsers(): UserProfile[];
  getSettings(): StoreSettings;
  getCounters(): DocumentCounters;
  calculateItemStock(itemId: string): number;
  calculateCustomerBalance(customerId: string): number;
  calculateSupplierBalance(supplierId: string): number;
  calculateTreasuryBalance(): number;
}

export class StorageEngine implements DataStore {
  private prefix: string;
  private dbName: string;
  private isIsolatedTest: boolean;
  private cache = new Map<string, any>();
  private db: IDBDatabase | null = null;
  public ready: Promise<void>;

  // Batching & Atomic Rollback
  private batchDepth = 0;
  private batchPending = new Map<string, any>();
  private cacheSnapshot: Map<string, any> | null = null;

  // Cached storage usage
  private cachedUsage: StorageUsage = {
    usedBytes: 0,
    maxBytes: 1024 * 1024 * 1024,
    percent: 0,
    formattedUsed: '0 ميجابايت',
    formattedAvailable: 'مساحة غير محدودة تقريباً',
    persisted: false,
  };

  // Cached stock and balance maps for performance with tens of thousands of items
  private cachedStockMap: Map<string, number> | null = null;
  private cachedCustBalMap: Map<string, number> | null = null;
  private cachedSuppBalMap: Map<string, number> | null = null;
  private cloudSyncHandler: ((keys: string[]) => void) | null = null;
  private suppressCloudSync = false;

  constructor(prefix: string = STORAGE_KEY_PREFIX, dbName: string = 'autoparts_db', isIsolatedTest: boolean = false) {
    this.prefix = prefix;
    this.dbName = dbName;
    this.isIsolatedTest = isIsolatedTest;

    // Synchronously hydrate this.cache from localStorage immediately on creation
    if (typeof localStorage !== 'undefined') {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const fullKey = localStorage.key(i);
          if (fullKey && fullKey.startsWith(this.prefix)) {
            const rawKey = fullKey.substring(this.prefix.length);
            const valStr = localStorage.getItem(fullKey);
            if (valStr !== null) {
              try {
                this.cache.set(rawKey, JSON.parse(valStr));
              } catch {
                this.cache.set(rawKey, valStr);
              }
            }
          }
        }
      } catch (e) {
        console.warn('[StorageEngine] Error hydrating from localStorage:', e);
      }
    }

    this.ready = this.initializeStorage();
  }

  private async initializeStorage(): Promise<void> {
    try {
      this.db = await openIndexedDB(this.dbName);
    } catch (e) {
      console.warn('[StorageEngine] IndexedDB could not be opened, using in-memory/localStorage', e);
    }

    if (this.db) {
      try {
        const records = await idbGetAll(this.db);
        if (records && records.length > 0) {
          for (const r of records) {
            this.cache.set(r.key, r.value);
            if (typeof localStorage !== 'undefined') {
              try {
                localStorage.setItem(this.prefix + r.key, JSON.stringify(r.value));
              } catch {}
            }
          }
        }
      } catch (err) {
        console.error('[StorageEngine] Error loading records from IndexedDB', err);
      }
    }

    const isInitializedInCache = Boolean(this.cache.get('initialized'));
    const isInitializedInLocal = typeof localStorage !== 'undefined' && Boolean(localStorage.getItem(this.prefix + 'initialized'));

    if (!isInitializedInCache && !isInitializedInLocal) {
      // Fresh start: seed default collections ONLY when completely empty
      this.initDefaultData();
    } else {
      // Safe schema checks for existing cache
      if (!this.cache.get('users')) {
        this.set('users', INITIAL_USERS);
      }
      if (!this.cache.get('counters')) {
        const sales = this.get<any[]>('sales_invoices', []).length;
        const purchases = this.get<any[]>('purchase_invoices', []).length;
        const receipts = this.get<any[]>('receipts', []).length;
        const expenses = this.get<any[]>('expenses', []).length;
        const returns = this.get<any[]>('returns', []).length;
        const adjustments = this.get<any[]>('stock_adjustments', []).length;
        this.set('counters', {
          sales,
          purchases,
          receipts,
          payments: receipts,
          expenses,
          returns,
          adjustments,
        });
      }
    }

    // Request browser persistence
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then((persisted) => {
        this.cachedUsage.persisted = persisted;
      }).catch(() => {});
    }

    // Initial storage estimate
    this.updateStorageEstimate();
  }

  private initDefaultData(): void {
    const { stockMovements, accountMovements, treasuryMovements } = getInitialMovements();
    this.set('items', INITIAL_ITEMS);
    this.set('customers', INITIAL_CUSTOMERS);
    this.set('suppliers', INITIAL_SUPPLIERS);
    this.set('settings', INITIAL_SETTINGS);
    this.set('users', INITIAL_USERS);
    this.set('expense_categories', INITIAL_EXPENSE_CATEGORIES);
    this.set('stock_movements', stockMovements);
    this.set('account_movements', accountMovements);
    this.set('treasury_movements', treasuryMovements);
    this.set('sales_invoices', []);
    this.set('purchase_invoices', []);
    this.set('returns', []);
    this.set('receipts', []);
    this.set('expenses', []);
    this.set('stock_adjustments', []);
    this.set('counters', {
      sales: 0,
      purchases: 0,
      receipts: 0,
      payments: 0,
      expenses: 0,
      returns: 0,
      adjustments: 0,
    });
    this.set('audit_log', [
      {
        id: generateSecureId('log'),
        user_name: 'النظام',
        action: 'تهيئة النظام',
        entity_type: 'system',
        entity_id: '0',
        details: 'تم بدء النظام وتأمين التخزين فائق السعة بنجاح',
        created_at: new Date().toISOString(),
      },
    ]);
    this.set('initialized', 'true');
  }

  public async updateStorageEstimate(): Promise<StorageUsage> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const used = est.usage || 0;
        const quota = est.quota || (1024 * 1024 * 1024);
        const percent = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
        this.cachedUsage = {
          usedBytes: used,
          maxBytes: quota,
          percent,
          formattedUsed: formatStorageBytes(used),
          formattedAvailable: formatStorageBytes(Math.max(0, quota - used)),
          persisted: this.cachedUsage.persisted,
        };
        return this.cachedUsage;
      } catch {}
    }
    return this.cachedUsage;
  }

  private invalidateIndices(key: string): void {
    if (key === 'stock_movements' || key === 'items' || key === 'stock_adjustments') {
      this.cachedStockMap = null;
    }
    if (key === 'account_movements' || key === 'customers' || key === 'sales_invoices' || key === 'receipts' || key === 'returns') {
      this.cachedCustBalMap = null;
    }
    if (key === 'account_movements' || key === 'suppliers' || key === 'purchase_invoices' || key === 'returns') {
      this.cachedSuppBalMap = null;
    }
  }

  public get<T>(key: string, defaultVal: T): T {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    // Fallback to localStorage if in transition
    if (typeof localStorage !== 'undefined') {
      try {
        const local = localStorage.getItem(this.prefix + key);
        if (local !== null) {
          const parsed = JSON.parse(local);
          this.cache.set(key, parsed);
          return parsed;
        }
      } catch {}
    }
    return defaultVal;
  }

  public set<T>(key: string, val: T): void {
    this.cache.set(key, val);
    this.invalidateIndices(key);

    // Synchronously write to localStorage for instant hydration on page refresh
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.prefix + key, JSON.stringify(val));
      } catch (e) {
        // Quota exceeded in localStorage - IndexedDB handles the big collections
      }
    }

    if (this.batchDepth > 0) {
      this.batchPending.set(key, val);
    } else {
      if (this.db) {
        idbPutBatch(this.db, [{ key, value: val }]).catch((err) => {
          console.error('[StorageEngine] IndexedDB write error:', err);
        });
      }
      if (!this.suppressCloudSync) this.cloudSyncHandler?.([key]);
    }
  }

  public setCloudSyncHandler(handler: ((keys: string[]) => void) | null): void {
    this.cloudSyncHandler = handler;
  }

  public withCloudSyncSuppressed<T>(fn: () => T): T {
    const previous = this.suppressCloudSync;
    this.suppressCloudSync = true;
    try { return fn(); } finally { this.suppressCloudSync = previous; }
  }

  public getCloudSnapshot(): Record<string, any> {
    const keys = ['items','customers','suppliers','sales_invoices','purchase_invoices','returns','receipts','expenses','expense_categories','stock_adjustments','stock_movements','account_movements','treasury_movements','audit_log','settings','users','counters'];
    const snapshot: Record<string, any> = {};
    for (const key of keys) {
      const value = this.get<any>(key, null);
      if (key === 'users' && Array.isArray(value)) {
        snapshot[key] = value.map((user: any) => { const copy = { ...user }; delete copy.pin_hash; delete copy.pin_salt; return copy; });
      } else snapshot[key] = value;
    }
    return snapshot;
  }

  public applyCloudSnapshot(snapshot: Record<string, any>): void {
    this.withCloudSyncSuppressed(() => {
      this.batch(() => {
        for (const [key, value] of Object.entries(snapshot || {})) {
          if (value !== undefined && key !== 'supabase_config') this.set(key, value);
        }
      });
    });
  }

  /**
   * Execute multiple writes in a single atomic transaction with complete memory rollback if failed
   */
  public batch<T>(fn: () => T): T {
    if (this.batchDepth === 0) {
      // Shallow clone cache map for instant rollback
      this.cacheSnapshot = new Map(this.cache);
      this.batchPending.clear();
    }
    this.batchDepth++;

    try {
      const result = fn();
      this.batchDepth--;

      if (this.batchDepth === 0) {
        const itemsToSave = Array.from(this.batchPending.entries()).map(([k, v]) => ({ key: k, value: v }));
        this.batchPending.clear();
        this.cacheSnapshot = null;

        if (typeof localStorage !== 'undefined') {
          try {
            for (const item of itemsToSave) {
              localStorage.setItem(this.prefix + item.key, JSON.stringify(item.value));
            }
          } catch {}
        }

        if (this.db && itemsToSave.length > 0) {
          idbPutBatch(this.db, itemsToSave).catch((err) => {
            console.error('[StorageEngine] IndexedDB batch write error:', err);
          });
        }
        if (!this.suppressCloudSync && itemsToSave.length > 0) {
          this.cloudSyncHandler?.(itemsToSave.map((item) => item.key));
        }
      }
      return result;
    } catch (err: any) {
      this.batchDepth--;
      if (this.batchDepth === 0) {
        // Rollback memory cache immediately
        if (this.cacheSnapshot) {
          this.cache = this.cacheSnapshot;
          this.cacheSnapshot = null;
        }
        this.batchPending.clear();
        this.cachedStockMap = null;
        this.cachedCustBalMap = null;
        this.cachedSuppBalMap = null;
      }
      throw err;
    }
  }

  public atomicCommit(updates: Record<string, any>): void {
    this.batch(() => {
      for (const [key, val] of Object.entries(updates)) {
        this.set(key, val);
      }
    });
  }

  // Initializer compatibility - Safe, never destroys data on page refresh
  public init(): void {
    const isInitializedInCache = Boolean(this.cache.get('initialized'));
    const isInitializedInLocal = typeof localStorage !== 'undefined' && Boolean(localStorage.getItem(this.prefix + 'initialized'));
    if (!isInitializedInCache && !isInitializedInLocal) {
      this.initDefaultData();
    }
  }

  /**
   * Clean up isolated test storage without leaving any trace
   */
  public async destroy(): Promise<void> {
    this.cache.clear();
    this.cachedStockMap = null;
    this.cachedCustBalMap = null;
    this.cachedSuppBalMap = null;
    if (this.db) {
      try {
        await idbClear(this.db);
        this.db.close();
      } catch {}
      this.db = null;
    }
    await idbDeleteDatabase(this.dbName);
    if (typeof localStorage !== 'undefined') {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(this.prefix)) toRemove.push(k);
      }
      for (const k of toRemove) localStorage.removeItem(k);
    }
  }

  /**
   * One-time confirmation for admin to remove old localStorage copy after verifying IndexedDB
   */
  public confirmMigrationCleanup(): { success: boolean; removedCount: number } {
    if (typeof localStorage === 'undefined') return { success: false, removedCount: 0 };
    let removedCount = 0;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(this.prefix)) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      try {
        localStorage.removeItem(k);
        removedCount++;
      } catch {}
    }
    this.logAudit('المدير', 'تأكيد ترحيل التخزين', 'system', '0', `تم تنظيف ${removedCount} مفتاح من التخزين القديم بعد التحقق`);
    return { success: true, removedCount };
  }

  // --- Document Counters (Sequential, Monotonic) ---
  public getCounters(): DocumentCounters {
    return this.get<DocumentCounters>('counters', {
      sales: 0,
      purchases: 0,
      receipts: 0,
      payments: 0,
      expenses: 0,
      returns: 0,
      adjustments: 0,
    });
  }

  public nextCounter(type: keyof DocumentCounters): number {
    const counters = this.getCounters();
    counters[type] = (counters[type] || 0) + 1;
    this.set('counters', counters);
    return counters[type];
  }

  public generateSalesInvoiceNumber(dateStr?: string): string {
    const settings = this.getSettings();
    const prefix = settings.sales_prefix || 'S';
    const year = (dateStr ? new Date(dateStr) : new Date()).getFullYear();
    const count = this.nextCounter('sales');
    return `${prefix}-${year}-${String(count).padStart(6, '0')}`;
  }

  public generatePurchaseInvoiceNumber(dateStr?: string): string {
    const settings = this.getSettings();
    const prefix = settings.purchase_prefix || 'P';
    const year = (dateStr ? new Date(dateStr) : new Date()).getFullYear();
    const count = this.nextCounter('purchases');
    return `${prefix}-${year}-${String(count).padStart(6, '0')}`;
  }

  public generateReceiptNumber(type: 'customer_receipt' | 'supplier_payment'): string {
    const year = new Date().getFullYear();
    if (type === 'customer_receipt') {
      const count = this.nextCounter('receipts');
      return `REC-${year}-${String(count).padStart(6, '0')}`;
    }
    const count = this.nextCounter('payments');
    return `PAY-${year}-${String(count).padStart(6, '0')}`;
  }

  public generateExpenseNumber(): string {
    const year = new Date().getFullYear();
    const count = this.nextCounter('expenses');
    return `EXP-${year}-${String(count).padStart(6, '0')}`;
  }

  public generateReturnNumber(type: 'sale_return' | 'purchase_return'): string {
    const year = new Date().getFullYear();
    const count = this.nextCounter('returns');
    const p = type === 'sale_return' ? 'RET-SL' : 'RET-PR';
    return `${p}-${year}-${String(count).padStart(6, '0')}`;
  }

  public generateAdjustmentNumber(type: 'surplus' | 'deficit'): string {
    const year = new Date().getFullYear();
    const count = this.nextCounter('adjustments');
    const p = type === 'surplus' ? 'ADJ-IN' : 'ADJ-OUT';
    return `${p}-${year}-${String(count).padStart(6, '0')}`;
  }

  // --- Optimized Batch Stock & Balance Maps (O(n+m) instead of O(n*m), with cache) ---
  public calculateAllItemStocks(): Map<string, number> {
    if (this.cachedStockMap) {
      return new Map(this.cachedStockMap);
    }
    const map = new Map<string, number>();
    const rawItems = this.get<Item[]>('items', []);
    for (let i = 0; i < rawItems.length; i++) {
      const it = rawItems[i];
      if (it.initial_stock) {
        map.set(it.id, Number(it.initial_stock || 0));
      }
    }

    const movements = this.getStockMovements();
    const movementItems = new Set<string>();
    const movMap = new Map<string, number>();

    for (let i = 0; i < movements.length; i++) {
      const m = movements[i];
      movementItems.add(m.item_id);
      const cur = movMap.get(m.item_id) || 0;
      movMap.set(m.item_id, cur + Number(m.quantity_in || 0) - Number(m.quantity_out || 0));
    }

    for (const itemId of movementItems) {
      map.set(itemId, movMap.get(itemId) || 0);
    }

    for (const [k, v] of map.entries()) {
      map.set(k, Math.round(v * 100) / 100);
    }
    this.cachedStockMap = map;
    return new Map(map);
  }

  public calculateAllCustomerBalances(): Map<string, number> {
    if (this.cachedCustBalMap) {
      return new Map(this.cachedCustBalMap);
    }
    const map = new Map<string, number>();
    const rawCusts = this.get<Customer[]>('customers', []);
    for (let i = 0; i < rawCusts.length; i++) {
      const c = rawCusts[i];
      if (c.opening_balance) {
        map.set(c.id, Number(c.opening_balance || 0));
      }
    }

    const movements = this.getAccountMovements();
    const movementParties = new Set<string>();
    const movMap = new Map<string, number>();

    for (let i = 0; i < movements.length; i++) {
      const m = movements[i];
      if (m.party_type === 'customer') {
        movementParties.add(m.party_id);
        const cur = movMap.get(m.party_id) || 0;
        movMap.set(m.party_id, cur + Number(m.debit || 0) - Number(m.credit || 0));
      }
    }

    for (const partyId of movementParties) {
      map.set(partyId, movMap.get(partyId) || 0);
    }

    for (const [k, v] of map.entries()) {
      map.set(k, Math.round(v * 100) / 100);
    }
    this.cachedCustBalMap = map;
    return new Map(map);
  }

  public calculateAllSupplierBalances(): Map<string, number> {
    if (this.cachedSuppBalMap) {
      return new Map(this.cachedSuppBalMap);
    }
    const map = new Map<string, number>();
    const rawSupps = this.get<Supplier[]>('suppliers', []);
    for (let i = 0; i < rawSupps.length; i++) {
      const s = rawSupps[i];
      if (s.opening_balance) {
        map.set(s.id, Number(s.opening_balance || 0));
      }
    }

    const movements = this.getAccountMovements();
    const movementParties = new Set<string>();
    const movMap = new Map<string, number>();

    for (let i = 0; i < movements.length; i++) {
      const m = movements[i];
      if (m.party_type === 'supplier') {
        movementParties.add(m.party_id);
        const cur = movMap.get(m.party_id) || 0;
        movMap.set(m.party_id, cur + Number(m.credit || 0) - Number(m.debit || 0));
      }
    }

    for (const partyId of movementParties) {
      map.set(partyId, movMap.get(partyId) || 0);
    }

    for (const [k, v] of map.entries()) {
      map.set(k, Math.round(v * 100) / 100);
    }
    this.cachedSuppBalMap = map;
    return new Map(map);
  }

  // --- Read Raw Collections ---
  public getItems(): Item[] {
    const raw = this.get<Item[]>('items', []);
    const stockMap = this.calculateAllItemStocks();
    return raw.map((item) => ({
      ...item,
      current_stock: stockMap.get(item.id) ?? Number(item.initial_stock || 0),
    }));
  }

  public getCustomers(): Customer[] {
    const raw = this.get<Customer[]>('customers', []);
    const balanceMap = this.calculateAllCustomerBalances();
    return raw.map((c) => ({
      ...c,
      current_balance: balanceMap.get(c.id) ?? Number(c.opening_balance || 0),
    }));
  }

  public getSuppliers(): Supplier[] {
    const raw = this.get<Supplier[]>('suppliers', []);
    const balanceMap = this.calculateAllSupplierBalances();
    return raw.map((s) => ({
      ...s,
      current_balance: balanceMap.get(s.id) ?? Number(s.opening_balance || 0),
    }));
  }

  public getSalesInvoices(): SalesInvoice[] {
    return this.get<SalesInvoice[]>('sales_invoices', []);
  }

  public getPurchaseInvoices(): PurchaseInvoice[] {
    return this.get<PurchaseInvoice[]>('purchase_invoices', []);
  }

  public getReturns(): ReturnRecord[] {
    return this.get<ReturnRecord[]>('returns', []);
  }

  public getReceipts(): Receipt[] {
    return this.get<Receipt[]>('receipts', []);
  }

  public getExpenses(): Expense[] {
    return this.get<Expense[]>('expenses', []);
  }

  public getExpenseCategories(): ExpenseCategory[] {
    return this.get<ExpenseCategory[]>('expense_categories', INITIAL_EXPENSE_CATEGORIES);
  }

  public getStockAdjustments(): StockAdjustment[] {
    return this.get<StockAdjustment[]>('stock_adjustments', []);
  }

  public getStockMovements(): StockMovement[] {
    return this.get<StockMovement[]>('stock_movements', []);
  }

  public getAccountMovements(): AccountMovement[] {
    return this.get<AccountMovement[]>('account_movements', []);
  }

  public getTreasuryMovements(): TreasuryMovement[] {
    return this.get<TreasuryMovement[]>('treasury_movements', []);
  }

  public getAuditLogs(): AuditLog[] {
    return this.get<AuditLog[]>('audit_log', []);
  }

  public getSettings(): StoreSettings {
    const s = this.get<StoreSettings>('settings', INITIAL_SETTINGS);
    if (!s.store_name) {
      s.store_name = 'العموري لقطع غيار السيارات';
    }
    return s;
  }

  public updateSettings(settings: StoreSettings): void {
    this.set('settings', settings);
  }

  public getSupabaseConfig(): SupabaseConfig {
    return this.get<SupabaseConfig>('supabase_config', {
      url: '',
      anonKey: '',
      isConnected: false,
    });
  }

  public setSupabaseConfig(cfg: SupabaseConfig): void {
    this.set('supabase_config', cfg);
  }

  // --- Calculations STRICTLY from Movements ---
  public calculateItemStock(itemId: string): number {
    const movements = this.getStockMovements().filter((m) => m.item_id === itemId);
    if (movements.length === 0) {
      const raw = this.get<Item[]>('items', []);
      const it = raw.find((i) => i.id === itemId);
      return Number(it?.initial_stock || 0);
    }
    const totalIn = movements.reduce((acc, m) => acc + Number(m.quantity_in || 0), 0);
    const totalOut = movements.reduce((acc, m) => acc + Number(m.quantity_out || 0), 0);
    return Math.round((totalIn - totalOut) * 100) / 100;
  }

  public calculateCustomerBalance(customerId: string): number {
    const movements = this.getAccountMovements().filter(
      (m) => m.party_id === customerId && m.party_type === 'customer'
    );
    if (movements.length === 0) {
      const raw = this.get<Customer[]>('customers', []);
      const c = raw.find((item) => item.id === customerId);
      return Number(c?.opening_balance || 0);
    }
    const totalDebit = movements.reduce((acc, m) => acc + Number(m.debit || 0), 0);
    const totalCredit = movements.reduce((acc, m) => acc + Number(m.credit || 0), 0);
    return Math.round((totalDebit - totalCredit) * 100) / 100;
  }

  public calculateSupplierBalance(supplierId: string): number {
    const movements = this.getAccountMovements().filter(
      (m) => m.party_id === supplierId && m.party_type === 'supplier'
    );
    if (movements.length === 0) {
      const raw = this.get<Supplier[]>('suppliers', []);
      const s = raw.find((item) => item.id === supplierId);
      return Number(s?.opening_balance || 0);
    }
    const totalCredit = movements.reduce((acc, m) => acc + Number(m.credit || 0), 0);
    const totalDebit = movements.reduce((acc, m) => acc + Number(m.debit || 0), 0);
    return Math.round((totalCredit - totalDebit) * 100) / 100;
  }

  public calculateTreasuryBalance(): number {
    const movements = this.getTreasuryMovements();
    const totalIn = movements.reduce((acc, m) => acc + Number(m.amount_in || 0), 0);
    const totalOut = movements.reduce((acc, m) => acc + Number(m.amount_out || 0), 0);
    return Math.round((totalIn - totalOut) * 100) / 100;
  }

  public getTreasuryDailySummary(targetDate: string): {
    openingBalance: number;
    totalIn: number;
    totalOut: number;
    closingBalance: number;
    movements: TreasuryMovement[];
  } {
    const all = this.getTreasuryMovements();
    const prevMovements = all.filter((m) => m.date < targetDate);
    const openingIn = prevMovements.reduce((acc, m) => acc + Number(m.amount_in || 0), 0);
    const openingOut = prevMovements.reduce((acc, m) => acc + Number(m.amount_out || 0), 0);
    const openingBalance = Math.round((openingIn - openingOut) * 100) / 100;

    const dayMovements = all.filter((m) => m.date === targetDate);
    const dayIn = dayMovements.reduce((acc, m) => acc + Number(m.amount_in || 0), 0);
    const dayOut = dayMovements.reduce((acc, m) => acc + Number(m.amount_out || 0), 0);
    const closingBalance = Math.round((openingBalance + dayIn - dayOut) * 100) / 100;

    return {
      openingBalance,
      totalIn: dayIn,
      totalOut: dayOut,
      closingBalance,
      movements: dayMovements,
    };
  }

  // --- Storage Monitoring & Quota ---
  public getStorageUsage(): StorageUsage {
    let totalChars = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
          const val = localStorage.getItem(key);
          totalChars += key.length + (val ? val.length : 0);
        }
      }
    } catch {
      // Storage access error handling
    }
    const usedBytes = totalChars * 2; // UTF-16 characters
    const maxBytes = 5 * 1024 * 1024; // 5MB standard browser quota
    const percent = Math.min(100, Math.round((usedBytes / maxBytes) * 100));
    const formattedUsed = `${(usedBytes / (1024 * 1024)).toFixed(2)} ميجابايت`;

    return {
      usedBytes,
      maxBytes,
      percent,
      formattedUsed,
    };
  }

  // --- Atomic Mutation Operations ---

  public saveItem(item: Omit<Item, 'id' | 'created_at'> & { id?: string }, user: UserProfile): Item {
    const items = this.get<Item[]>('items', []);
    const isEdit = Boolean(item.id);
    let savedItem: Item;

    if (isEdit) {
      savedItem = {
        ...item,
        id: item.id!,
        created_at: items.find((i) => i.id === item.id)?.created_at || new Date().toISOString(),
      };
      const updated = items.map((i) => (i.id === item.id ? savedItem : i));
      this.set('items', updated);
    } else {
      savedItem = {
        ...item,
        id: generateSecureId('item'),
        created_at: new Date().toISOString(),
      };
      items.unshift(savedItem);
      this.set('items', items);

      if (savedItem.initial_stock > 0) {
        const stockMovements = this.getStockMovements();
        const newMov: StockMovement = {
          id: generateSecureId('sm-init'),
          item_id: savedItem.id,
          item_name: savedItem.name,
          movement_type: 'initial',
          doc_type: 'رصيد أول المدة',
          doc_id: savedItem.id,
          doc_number: `INIT-${savedItem.code}`,
          party_name: 'جرد افتتاحي',
          quantity_in: savedItem.initial_stock,
          quantity_out: 0,
          unit_price: savedItem.cost_price,
          running_balance: savedItem.initial_stock,
          date: new Date().toISOString().split('T')[0],
          notes: 'رصيد افتتاحي للصنف',
          created_at: new Date().toISOString(),
        };
        stockMovements.push(newMov);
        this.set('stock_movements', stockMovements);
      }
    }

    this.logAudit(
      user.full_name,
      isEdit ? 'تعديل صنف' : 'إضافة صنف جديد',
      'item',
      savedItem.code,
      `${savedItem.name} - سعر الشراء: ${savedItem.cost_price} ج.م`
    );

    return savedItem;
  }

  public deleteItem(itemId: string, user: UserProfile): boolean {
    if (user.role !== 'admin') {
      throw new Error('حذف الأصناف متاح للمدير فقط.');
    }
    const items = this.getItems();
    const item = items.find((i) => i.id === itemId);
    if (!item) return false;

    const movements = this.getStockMovements().filter((m) => m.item_id === itemId && m.movement_type !== 'initial');
    if (movements.length > 0) {
      throw new Error(`لا يمكن حذف الصنف "${item.name}" لوجود (${movements.length}) حركة بيع أو شراء أو مرتجع مرتبطة به.`);
    }

    this.set('items', items.filter((i) => i.id !== itemId));
    this.set('stock_movements', this.getStockMovements().filter((m) => m.item_id !== itemId));
    this.logAudit(
      user.full_name,
      'حذف صنف',
      'item',
      item.code,
      `تم حذف الصنف: ${item.name}`
    );
    return true;
  }

  public saveCustomer(cust: Omit<Customer, 'id' | 'created_at'> & { id?: string }, user: UserProfile): Customer {
    const customers = this.get<Customer[]>('customers', []);
    const isEdit = Boolean(cust.id);
    let savedCust: Customer;

    if (isEdit) {
      savedCust = {
        ...cust,
        id: cust.id!,
        created_at: customers.find((c) => c.id === cust.id)?.created_at || new Date().toISOString(),
      };
      this.set('customers', customers.map((c) => (c.id === cust.id ? savedCust : c)));
    } else {
      savedCust = {
        ...cust,
        id: generateSecureId('cust'),
        created_at: new Date().toISOString(),
      };
      customers.push(savedCust);
      this.set('customers', customers);

      if (savedCust.opening_balance !== 0) {
        const accMovements = this.getAccountMovements();
        const isDebit = savedCust.opening_balance > 0;
        const newMov: AccountMovement = {
          id: generateSecureId('am-init'),
          party_type: 'customer',
          party_id: savedCust.id,
          party_name: savedCust.name,
          movement_type: 'initial',
          doc_type: 'رصيد افتتاحي',
          doc_id: savedCust.id,
          doc_number: `OPEN-${savedCust.id.slice(-4)}`,
          debit: isDebit ? Math.abs(savedCust.opening_balance) : 0,
          credit: !isDebit ? Math.abs(savedCust.opening_balance) : 0,
          balance_after: savedCust.opening_balance,
          date: new Date().toISOString().split('T')[0],
          notes: 'رصيد سابق افتتاحي للعميل',
          created_at: new Date().toISOString(),
        };
        accMovements.push(newMov);
        this.set('account_movements', accMovements);
      }
    }

    this.logAudit(
      user.full_name,
      isEdit ? 'تعديل بيانات عميل' : 'إضافة عميل جديد',
      'customer',
      savedCust.name,
      `الهاتف: ${savedCust.phone || '-'}، رصيد افتتاحي: ${savedCust.opening_balance} ج.م`
    );

    return savedCust;
  }

  public saveSupplier(supp: Omit<Supplier, 'id' | 'created_at'> & { id?: string }, user: UserProfile): Supplier {
    const suppliers = this.get<Supplier[]>('suppliers', []);
    const isEdit = Boolean(supp.id);
    let savedSupp: Supplier;

    if (isEdit) {
      savedSupp = {
        ...supp,
        id: supp.id!,
        created_at: suppliers.find((s) => s.id === supp.id)?.created_at || new Date().toISOString(),
      };
      this.set('suppliers', suppliers.map((s) => (s.id === supp.id ? savedSupp : s)));
    } else {
      savedSupp = {
        ...supp,
        id: generateSecureId('supp'),
        created_at: new Date().toISOString(),
      };
      suppliers.push(savedSupp);
      this.set('suppliers', suppliers);

      if (savedSupp.opening_balance !== 0) {
        const accMovements = this.getAccountMovements();
        const isCredit = savedSupp.opening_balance > 0;
        const newMov: AccountMovement = {
          id: generateSecureId('am-init'),
          party_type: 'supplier',
          party_id: savedSupp.id,
          party_name: savedSupp.name,
          movement_type: 'initial',
          doc_type: 'رصيد افتتاحي',
          doc_id: savedSupp.id,
          doc_number: `OPEN-${savedSupp.id.slice(-4)}`,
          debit: !isCredit ? Math.abs(savedSupp.opening_balance) : 0,
          credit: isCredit ? Math.abs(savedSupp.opening_balance) : 0,
          balance_after: savedSupp.opening_balance,
          date: new Date().toISOString().split('T')[0],
          notes: 'رصيد سابق افتتاحي للمورد',
          created_at: new Date().toISOString(),
        };
        accMovements.push(newMov);
        this.set('account_movements', accMovements);
      }
    }

    this.logAudit(
      user.full_name,
      isEdit ? 'تعديل بيانات مورد' : 'إضافة مورد جديد',
      'supplier',
      savedSupp.name,
      `الهاتف: ${savedSupp.phone || '-'}، رصيد افتتاحي: ${savedSupp.opening_balance} ج.م`
    );

    return savedSupp;
  }

  // --- 1. فاتورة المبيعات (حفظ متزامن مع التحقق الصارم من المخزون والأرصدة) ---
  public saveSalesInvoice(
    inv: {
      customer_id?: string | null;
      customer_name: string;
      invoice_date: string;
      lines: any[];
      subtotal: number;
      discount_type: 'fixed' | 'percentage';
      discount_value: number;
      final_total: number;
      paid_cash: number;
      notes?: string;
      extra_paid_as_credit?: boolean;
    },
    user: UserProfile
  ): SalesInvoice {
    // 1. التحقق من المدخلات الأساسية وصحة الأرقام
    if (!inv.lines || inv.lines.length === 0) {
      throw new Error('لا يمكن حفظ فاتورة بدون إضافة أصناف.');
    }

    let computedSubtotal = 0;
    const aggregatedQuantities = new Map<string, number>();

    for (const line of inv.lines) {
      const q = Math.max(1, Number(line.quantity) || 1);
      const p = Math.max(0, Number(line.unit_price) || 0);
      const d = Math.max(0, Number(line.discount) || 0);

      line.quantity = q;
      line.unit_price = p;
      line.discount = d;
      line.total = Math.max(0, q * p - d);
      computedSubtotal += line.total;

      aggregatedQuantities.set(
        line.item_id,
        (aggregatedQuantities.get(line.item_id) || 0) + q
      );
    }

    // Sanitize discount
    let discountVal = Number(inv.discount_value) || 0;
    if (inv.discount_type === 'percentage') {
      discountVal = Math.min(100, Math.max(0, discountVal));
    } else {
      discountVal = Math.min(computedSubtotal, Math.max(0, discountVal));
    }
    inv.discount_value = discountVal;

    let computedFinal = computedSubtotal;
    if (inv.discount_type === 'percentage') {
      computedFinal = computedSubtotal * (1 - discountVal / 100);
    } else {
      computedFinal = computedSubtotal - discountVal;
    }

    // Normalize canonical totals
    inv.subtotal = computedSubtotal;
    inv.final_total = computedFinal;

    const settings = this.getSettings();
    const defaultCashCustId = settings.default_cash_customer_id || 'cust-4';
    const isCashCustomer = !inv.customer_id || inv.customer_id === defaultCashCustId;

    // For cash customer, auto-match full payment to final total
    if (isCashCustomer) {
      inv.paid_cash = computedFinal;
    } else {
      inv.paid_cash = Math.max(0, Number(inv.paid_cash) || 0);
    }

    // 2. التحقق من رصيد المخزون (احترام إعداد البيع بالسالب لو مفعّل)
    if (!settings.allow_negative_stock) {
      for (const [itemId, totalQty] of aggregatedQuantities.entries()) {
        const curStock = this.calculateItemStock(itemId);
        if (totalQty > curStock) {
          const item = this.getItems().find((it) => it.id === itemId);
          const itemName = item ? item.name : itemId;
          throw new Error(
            `تحذير: كمية الصنف "${itemName}" المطلوبة (${totalQty} قطعة) أكبر من الرصيد المتوفر في المخزون (${curStock} قطعة). يمكنك تفعيل خيار البيع بالسالب من الإعدادات إذا أردت السماح بالبيع دون رصيد كافٍ.`
          );
        }
      }
    }

    // 3. التحقق من الحد الائتماني لو بيع آجل لعميل مسجل
    const prevBalance = inv.customer_id && !isCashCustomer ? this.calculateCustomerBalance(inv.customer_id) : 0;
    const remainingDebt = Math.max(0, inv.final_total - inv.paid_cash);

    if (!isCashCustomer && inv.customer_id && remainingDebt > 0) {
      const customer = this.getCustomers().find((c) => c.id === inv.customer_id);
      if (customer && customer.credit_limit && customer.credit_limit > 0) {
        const projectedBalance = prevBalance + remainingDebt;
        if (projectedBalance > customer.credit_limit && user.role === 'cashier') {
          throw new Error(
            `هذه الفاتورة تتجاوز الحد الائتماني للعميل (${customer.credit_limit} ج.م). الرصيد الحالي: ${prevBalance} ج.م، المطلوب إضافته: ${remainingDebt} ج.م. يتطلب موافقة المدير.`
          );
        }
      }
    }

    // توليد رقم الفاتورة والـ ID الموحد
    const invoiceNumber = this.generateSalesInvoiceNumber(inv.invoice_date);
    const invoiceId = generateSecureId('sales-inv');
    const invoices = this.getSalesInvoices();

    // معالجة المدفوع الزائد: للعميل المسجل فقط وليس النقدي
    const excessPaid = Math.max(0, inv.paid_cash - inv.final_total);
    const extraPaidAsCredit = isCashCustomer ? false : Boolean(inv.extra_paid_as_credit);

    // النقدية الفعلية المحصلة بالخزينة:
    // لو تم اختيار قيد الزيادة رصيد دائن للعميل -> الخزينة تأخذ المبلغ كاملاً
    // لو لم يتم الاختيار (كاش تم رد الباقي له فوراً) -> الخزينة يضاف إليها صافي الفاتورة
    const cashIntoTreasury = extraPaidAsCredit ? inv.paid_cash : Math.min(inv.paid_cash, inv.final_total);

    let balanceAfter = prevBalance;
    if (!isCashCustomer && inv.customer_id) {
      if (remainingDebt > 0) {
        balanceAfter = prevBalance + remainingDebt;
      } else if (excessPaid > 0 && extraPaidAsCredit) {
        balanceAfter = prevBalance - excessPaid; // رصيد دائن للعميل
      }
    }

    const savedInvoice: SalesInvoice = {
      id: invoiceId,
      invoice_number: invoiceNumber,
      customer_id: inv.customer_id || null,
      customer_name: inv.customer_name,
      invoice_date: inv.invoice_date,
      lines: inv.lines,
      subtotal: inv.subtotal,
      discount_type: inv.discount_type,
      discount_value: inv.discount_value,
      final_total: inv.final_total,
      paid_cash: inv.paid_cash,
      remaining_debt: remainingDebt,
      previous_balance: prevBalance,
      balance_after: balanceAfter,
      status: 'completed',
      notes: inv.notes,
      created_by: user.full_name,
      created_at: new Date().toISOString(),
    };

    invoices.unshift(savedInvoice);

    // 1. حركة المخزون
    const stockMovements = this.getStockMovements();
    inv.lines.forEach((line) => {
      const currentStock = this.calculateItemStock(line.item_id);
      const sm: StockMovement = {
        id: generateSecureId(`sm-${line.item_id}`),
        item_id: line.item_id,
        item_name: line.item_name,
        movement_type: 'sale',
        doc_type: 'فاتورة مبيعات',
        doc_id: invoiceId,
        doc_number: invoiceNumber,
        party_name: inv.customer_name,
        quantity_in: 0,
        quantity_out: line.quantity,
        unit_price: line.unit_price,
        running_balance: currentStock - line.quantity,
        date: inv.invoice_date,
        notes: `بيع بفاتورة ${invoiceNumber}`,
        created_at: new Date().toISOString(),
      };
      stockMovements.push(sm);
    });

    // 2. حركة حساب العميل
    const accMovements = this.getAccountMovements();
    if (!isCashCustomer && inv.customer_id) {
      if (remainingDebt > 0) {
        const am: AccountMovement = {
          id: generateSecureId(`am-${invoiceId}`),
          party_type: 'customer',
          party_id: inv.customer_id,
          party_name: inv.customer_name,
          movement_type: 'invoice_debit',
          doc_type: 'فاتورة مبيعات',
          doc_id: invoiceId,
          doc_number: invoiceNumber,
          debit: remainingDebt,
          credit: 0,
          balance_after: balanceAfter,
          date: inv.invoice_date,
          notes: `مبيعات آجل فاتورة ${invoiceNumber}`,
          created_at: new Date().toISOString(),
        };
        accMovements.push(am);
      } else if (excessPaid > 0 && extraPaidAsCredit) {
        const am: AccountMovement = {
          id: generateSecureId(`am-${invoiceId}`),
          party_type: 'customer',
          party_id: inv.customer_id,
          party_name: inv.customer_name,
          movement_type: 'receipt',
          doc_type: 'فاتورة مبيعات (رصيد دائن)',
          doc_id: invoiceId,
          doc_number: invoiceNumber,
          debit: 0,
          credit: excessPaid,
          balance_after: balanceAfter,
          date: inv.invoice_date,
          notes: `رصيد دائن من دفعة زائدة بفاتورة ${invoiceNumber}`,
          created_at: new Date().toISOString(),
        };
        accMovements.push(am);
      }
    }

    // 3. حركة الخزينة
    const treasuryMovements = this.getTreasuryMovements();
    if (cashIntoTreasury > 0) {
      const currentTreasury = this.calculateTreasuryBalance();
      const tm: TreasuryMovement = {
        id: generateSecureId(`tm-${invoiceId}`),
        movement_type: 'sale_cash',
        doc_type: 'فاتورة مبيعات',
        doc_id: invoiceId,
        doc_number: invoiceNumber,
        party_name: inv.customer_name,
        amount_in: cashIntoTreasury,
        amount_out: 0,
        balance_after: currentTreasury + cashIntoTreasury,
        date: inv.invoice_date,
        notes: `تحصيل نقدي لفاتورة ${invoiceNumber}`,
        created_by: user.full_name,
        created_at: new Date().toISOString(),
      };
      treasuryMovements.push(tm);
    }

    // الحفظ الذري المجمع للعملية بالكامل
    this.atomicCommit({
      sales_invoices: invoices,
      stock_movements: stockMovements,
      account_movements: accMovements,
      treasury_movements: treasuryMovements,
    });

    this.logAudit(
      user.full_name,
      'إنشاء فاتورة مبيعات',
      'sales_invoice',
      invoiceNumber,
      `العميل: ${inv.customer_name}، الإجمالي: ${inv.final_total} ج.م، نقدي: ${cashIntoTreasury} ج.م، متبقي: ${remainingDebt} ج.م`
    );

    return savedInvoice;
  }

  // --- 2. فاتورة المشتريات (حفظ متزامن مع المورد والخزينة) ---
  public savePurchaseInvoice(
    inv: {
      supplier_id: string;
      supplier_name: string;
      invoice_date: string;
      lines: any[];
      subtotal: number;
      discount_value: number;
      final_total: number;
      paid_cash: number;
      update_cost_price?: boolean;
      notes?: string;
    },
    user: UserProfile
  ): PurchaseInvoice {
    if (!inv.lines || inv.lines.length === 0) {
      throw new Error('لا يمكن حفظ فاتورة مشتريات بدون إضافة أصناف.');
    }

    let computedSubtotal = 0;
    for (const line of inv.lines) {
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
        throw new Error(`الكمية للصنف "${line.item_name}" غير صالحة.`);
      }
      if (!Number.isFinite(line.unit_price) || line.unit_price < 0) {
        throw new Error(`سعر الشراء للصنف "${line.item_name}" غير صالح.`);
      }
      computedSubtotal += line.quantity * line.unit_price;
    }

    if (Math.abs(computedSubtotal - inv.subtotal) > 0.05) {
      throw new Error(`خطأ في تدقيق إجمالي المشتريات. المحسوب: ${computedSubtotal.toFixed(2)}، المُرسل: ${inv.subtotal.toFixed(2)}`);
    }

    const computedFinal = computedSubtotal - (inv.discount_value || 0);
    if (Math.abs(computedFinal - inv.final_total) > 0.05) {
      throw new Error(`خطأ في تدقيق صافي فاتورة المشتريات. المحسوب: ${computedFinal.toFixed(2)}، المُرسل: ${inv.final_total.toFixed(2)}`);
    }

    const currentTreasury = this.calculateTreasuryBalance();
    if (inv.paid_cash > 0 && inv.paid_cash > currentTreasury) {
      throw new Error(
        `المبلغ المطلوب سداده نقداً للمورد (${inv.paid_cash} ج.م) أكبر من رصيد الخزينة الحالي (${currentTreasury} ج.م).`
      );
    }

    const invoices = this.getPurchaseInvoices();
    const invoiceNumber = this.generatePurchaseInvoiceNumber(inv.invoice_date);
    const invoiceId = generateSecureId('purchase-inv');

    const prevBalance = this.calculateSupplierBalance(inv.supplier_id);
    const remainingCredit = Math.max(0, inv.final_total - inv.paid_cash);
    const balanceAfter = prevBalance + remainingCredit;

    const savedInvoice: PurchaseInvoice = {
      id: invoiceId,
      invoice_number: invoiceNumber,
      supplier_id: inv.supplier_id,
      supplier_name: inv.supplier_name,
      invoice_date: inv.invoice_date,
      lines: inv.lines,
      subtotal: inv.subtotal,
      discount_value: inv.discount_value,
      final_total: inv.final_total,
      paid_cash: inv.paid_cash,
      remaining_credit: remainingCredit,
      previous_balance: prevBalance,
      balance_after: balanceAfter,
      update_cost_price: inv.update_cost_price,
      status: 'completed',
      notes: inv.notes,
      created_by: user.full_name,
      created_at: new Date().toISOString(),
    };

    invoices.unshift(savedInvoice);

    // 1. حركة المخزون
    const stockMovements = this.getStockMovements();
    const items = this.get<Item[]>('items', []);

    inv.lines.forEach((line) => {
      const currentStock = this.calculateItemStock(line.item_id);
      const sm: StockMovement = {
        id: generateSecureId(`sm-${line.item_id}`),
        item_id: line.item_id,
        item_name: line.item_name,
        movement_type: 'purchase',
        doc_type: 'فاتورة مشتريات',
        doc_id: invoiceId,
        doc_number: invoiceNumber,
        party_name: inv.supplier_name,
        quantity_in: line.quantity,
        quantity_out: 0,
        unit_price: line.unit_price,
        running_balance: currentStock + line.quantity,
        date: inv.invoice_date,
        notes: `شراء بفاتورة ${invoiceNumber}`,
        created_at: new Date().toISOString(),
      };
      stockMovements.push(sm);

      if (inv.update_cost_price) {
        const itemIdx = items.findIndex((i) => i.id === line.item_id);
        if (itemIdx !== -1) {
          items[itemIdx].cost_price = line.unit_price;
        }
      }
    });

    // 2. حركة حساب المورد
    const accMovements = this.getAccountMovements();
    if (remainingCredit > 0) {
      const am: AccountMovement = {
        id: generateSecureId(`am-${invoiceId}`),
        party_type: 'supplier',
        party_id: inv.supplier_id,
        party_name: inv.supplier_name,
        movement_type: 'invoice_credit',
        doc_type: 'فاتورة مشتريات',
        doc_id: invoiceId,
        doc_number: invoiceNumber,
        debit: 0,
        credit: remainingCredit,
        balance_after: balanceAfter,
        date: inv.invoice_date,
        notes: `مشتريات آجل فاتورة ${invoiceNumber}`,
        created_at: new Date().toISOString(),
      };
      accMovements.push(am);
    }

    // 3. حركة الخزينة
    const treasuryMovements = this.getTreasuryMovements();
    if (inv.paid_cash > 0) {
      const tm: TreasuryMovement = {
        id: generateSecureId(`tm-${invoiceId}`),
        movement_type: 'purchase_cash',
        doc_type: 'فاتورة مشتريات',
        doc_id: invoiceId,
        doc_number: invoiceNumber,
        party_name: inv.supplier_name,
        amount_in: 0,
        amount_out: inv.paid_cash,
        balance_after: currentTreasury - inv.paid_cash,
        date: inv.invoice_date,
        notes: `سداد نقدي لفاتورة مشتريات ${invoiceNumber}`,
        created_by: user.full_name,
        created_at: new Date().toISOString(),
      };
      treasuryMovements.push(tm);
    }

    // الحفظ الذري المجمع
    const commitData: Record<string, any> = {
      purchase_invoices: invoices,
      stock_movements: stockMovements,
      account_movements: accMovements,
      treasury_movements: treasuryMovements,
    };
    if (inv.update_cost_price) {
      commitData['items'] = items;
    }
    this.atomicCommit(commitData);

    this.logAudit(
      user.full_name,
      'إنشاء فاتورة مشتريات',
      'purchase_invoice',
      invoiceNumber,
      `المورد: ${inv.supplier_name}، الإجمالي: ${inv.final_total} ج.م، مسدد: ${inv.paid_cash} ج.م، متبقي: ${remainingCredit} ج.م`
    );

    return savedInvoice;
  }

  // --- إلغاء فاتورة مبيعات (Void / Cancel) مع حفظ السجل وعكس الحركات ---
  public cancelSalesInvoice(invoiceId: string, reason: string, user: UserProfile): SalesInvoice {
    if (user.role !== 'admin') {
      throw new Error('إلغاء الفواتير يتطلب صلاحية مدير النظام فقط.');
    }
    if (!reason || !reason.trim()) {
      throw new Error('يرجى كتابة سبب صريح لإلغاء الفاتورة لتسجيله في سجل التدقيق.');
    }

    const invoices = this.getSalesInvoices();
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) {
      throw new Error('الفاتورة غير موجودة.');
    }
    if (inv.status === 'cancelled') {
      throw new Error('الفاتورة ملغاة بالفعل مسبقاً.');
    }

    // التحقق من وجود أي مرتجعات نشطة مرتبطة بها
    const linkedReturns = this.getReturns().filter(
      (r) => (r.original_doc_id === invoiceId || r.original_doc_number === inv.invoice_number) && r.status !== 'cancelled'
    );
    if (linkedReturns.length > 0) {
      throw new Error(
        `لا يمكن إلغاء الفاتورة لأن هناك مرتجع نشط مسجل عليها برقم (${linkedReturns[0].return_number}). يجب إلغاء المرتجع أولاً.`
      );
    }

    // 1. تحديث حالة الفاتورة لتظل بالسجل كـ "ملغاة"
    inv.status = 'cancelled';
    inv.cancellation_reason = reason.trim();
    inv.cancelled_at = new Date().toISOString();
    inv.cancelled_by = user.full_name;

    const today = new Date().toISOString().split('T')[0];

    // 2. عكس حركات المخزون بحركات عكسية صريحة (Reversal)
    const currentStockMap = this.calculateAllItemStocks();
    const stockMovs = this.getStockMovements();
    inv.lines.forEach((line) => {
      const curStock = currentStockMap.get(line.item_id) ?? 0;
      stockMovs.push({
        id: generateSecureId(`sm-rev-${invoiceId}-${line.item_id}`),
        item_id: line.item_id,
        item_name: line.item_name,
        movement_type: 'cancellation',
        doc_type: 'إلغاء فاتورة مبيعات',
        doc_id: invoiceId,
        doc_number: inv.invoice_number,
        party_name: inv.customer_name,
        quantity_in: line.quantity,
        quantity_out: 0,
        unit_price: line.unit_price,
        running_balance: curStock + line.quantity,
        date: today,
        notes: `إلغاء فاتورة: ${reason.trim()}`,
        created_at: new Date().toISOString(),
      });
    });

    // 3. عكس حركة الخزينة إن كانت الفاتورة قد حصّلت كاش
    const originalCashIn = this.getTreasuryMovements()
      .filter((m) => m.doc_id === invoiceId && m.movement_type === 'sale_cash')
      .reduce((sum, m) => sum + (m.amount_in || 0), 0);

    const trMovs = this.getTreasuryMovements();
    if (originalCashIn > 0) {
      const curTreasury = this.calculateTreasuryBalance();
      trMovs.push({
        id: generateSecureId(`tm-rev-${invoiceId}`),
        movement_type: 'cancellation',
        doc_type: 'إلغاء فاتورة مبيعات',
        doc_id: invoiceId,
        doc_number: inv.invoice_number,
        party_name: inv.customer_name,
        amount_in: 0,
        amount_out: originalCashIn,
        balance_after: curTreasury - originalCashIn,
        date: today,
        notes: `إلغاء تحصيل نقدي لفاتورة ${inv.invoice_number}: ${reason.trim()}`,
        created_by: user.full_name,
        created_at: new Date().toISOString(),
      });
    }

    // 4. عكس حركة حساب العميل إن كان بيعاً آجلاً أو قيد عليه دين
    const accMovs = this.getAccountMovements();
    if (inv.customer_id) {
      const originalAccMovs = this.getAccountMovements().filter((m) => m.doc_id === invoiceId);
      const originalDebit = originalAccMovs.reduce((sum, m) => sum + (m.debit || 0), 0);
      const originalCredit = originalAccMovs.reduce((sum, m) => sum + (m.credit || 0), 0);

      if (originalDebit > 0 || originalCredit > 0) {
        const curCustBal = this.calculateCustomerBalance(inv.customer_id);
        accMovs.push({
          id: generateSecureId(`am-rev-${invoiceId}`),
          party_type: 'customer',
          party_id: inv.customer_id,
          party_name: inv.customer_name,
          movement_type: 'cancellation',
          doc_type: 'إلغاء فاتورة مبيعات',
          doc_id: invoiceId,
          doc_number: inv.invoice_number,
          debit: originalCredit,
          credit: originalDebit,
          balance_after: curCustBal - originalDebit + originalCredit,
          date: today,
          notes: `إلغاء فاتورة مبيعات ${inv.invoice_number}: ${reason.trim()}`,
          created_at: new Date().toISOString(),
        });
      }
    }

    this.atomicCommit({
      sales_invoices: invoices,
      stock_movements: stockMovs,
      treasury_movements: trMovs,
      account_movements: accMovs,
    });

    this.logAudit(
      user.full_name,
      'إلغاء فاتورة مبيعات',
      'sales_invoice',
      inv.invoice_number,
      `تم إلغاء الفاتورة وتسجيل قيود عكسية للمخزن والخزينة وحساب العميل. سبب الإلغاء: ${reason.trim()}`
    );

    return inv;
  }

  // --- إلغاء فاتورة مشتريات (Void / Cancel) ---
  public cancelPurchaseInvoice(invoiceId: string, reason: string, user: UserProfile): PurchaseInvoice {
    if (user.role !== 'admin') {
      throw new Error('إلغاء فواتير المشتريات يتطلب صلاحية مدير النظام فقط.');
    }
    if (!reason || !reason.trim()) {
      throw new Error('يرجى كتابة سبب صريح لإلغاء الفاتورة.');
    }

    const invoices = this.getPurchaseInvoices();
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) {
      throw new Error('فاتورة المشتريات غير موجودة.');
    }
    if (inv.status === 'cancelled') {
      throw new Error('الفاتورة ملغاة بالفعل مسبقاً.');
    }

    const linkedReturns = this.getReturns().filter(
      (r) => (r.original_doc_id === invoiceId || r.original_doc_number === inv.invoice_number) && r.status !== 'cancelled'
    );
    if (linkedReturns.length > 0) {
      throw new Error(
        `لا يمكن إلغاء فاتورة الشراء لوجود مرتجع نشط مرتبط بها برقم (${linkedReturns[0].return_number}).`
      );
    }

    inv.status = 'cancelled';
    inv.cancellation_reason = reason.trim();
    inv.cancelled_at = new Date().toISOString();
    inv.cancelled_by = user.full_name;

    const today = new Date().toISOString().split('T')[0];

    // 2. عكس حركات المخزون بسحب البضاعة الواردة
    const currentStockMap = this.calculateAllItemStocks();
    const stockMovs = this.getStockMovements();
    inv.lines.forEach((line) => {
      const curStock = currentStockMap.get(line.item_id) ?? 0;
      stockMovs.push({
        id: generateSecureId(`sm-rev-${invoiceId}-${line.item_id}`),
        item_id: line.item_id,
        item_name: line.item_name,
        movement_type: 'cancellation',
        doc_type: 'إلغاء فاتورة مشتريات',
        doc_id: invoiceId,
        doc_number: inv.invoice_number,
        party_name: inv.supplier_name,
        quantity_in: 0,
        quantity_out: line.quantity,
        unit_price: line.unit_price,
        running_balance: curStock - line.quantity,
        date: today,
        notes: `إلغاء فاتورة توريد: ${reason.trim()}`,
        created_at: new Date().toISOString(),
      });
    });

    // 3. عكس حركة الخزينة (استرداد النقدية المدفوعة للمورد)
    const originalCashOut = this.getTreasuryMovements()
      .filter((m) => m.doc_id === invoiceId && m.movement_type === 'purchase_cash')
      .reduce((sum, m) => sum + (m.amount_out || 0), 0);

    const trMovs = this.getTreasuryMovements();
    if (originalCashOut > 0) {
      const curTreasury = this.calculateTreasuryBalance();
      trMovs.push({
        id: generateSecureId(`tm-rev-${invoiceId}`),
        movement_type: 'cancellation',
        doc_type: 'إلغاء فاتورة مشتريات',
        doc_id: invoiceId,
        doc_number: inv.invoice_number,
        party_name: inv.supplier_name,
        amount_in: originalCashOut,
        amount_out: 0,
        balance_after: curTreasury + originalCashOut,
        date: today,
        notes: `استرداد نقدي لإلغاء فاتورة مشتريات ${inv.invoice_number}: ${reason.trim()}`,
        created_by: user.full_name,
        created_at: new Date().toISOString(),
      });
    }

    // 4. عكس حركة حساب المورد
    const accMovs = this.getAccountMovements();
    if (inv.supplier_id) {
      const originalAccMovs = this.getAccountMovements().filter((m) => m.doc_id === invoiceId);
      const originalCredit = originalAccMovs.reduce((sum, m) => sum + (m.credit || 0), 0);
      const originalDebit = originalAccMovs.reduce((sum, m) => sum + (m.debit || 0), 0);

      if (originalCredit > 0 || originalDebit > 0) {
        const curSuppBal = this.calculateSupplierBalance(inv.supplier_id);
        accMovs.push({
          id: generateSecureId(`am-rev-${invoiceId}`),
          party_type: 'supplier',
          party_id: inv.supplier_id,
          party_name: inv.supplier_name,
          movement_type: 'cancellation',
          doc_type: 'إلغاء فاتورة مشتريات',
          doc_id: invoiceId,
          doc_number: inv.invoice_number,
          debit: originalCredit,
          credit: originalDebit,
          balance_after: curSuppBal - originalCredit + originalDebit,
          date: today,
          notes: `إلغاء فاتورة مشتريات ${inv.invoice_number}: ${reason.trim()}`,
          created_at: new Date().toISOString(),
        });
      }
    }

    this.atomicCommit({
      purchase_invoices: invoices,
      stock_movements: stockMovs,
      treasury_movements: trMovs,
      account_movements: accMovs,
    });

    this.logAudit(
      user.full_name,
      'إلغاء فاتورة مشتريات',
      'purchase_invoice',
      inv.invoice_number,
      `تم إلغاء فاتورة المشتريات وتسجيل قيود عكسية للمورد والمخزن والخزينة. السبب: ${reason.trim()}`
    );

    return inv;
  }

  // للتوافق مع استدعاءات الكود القديمة
  public deleteSalesInvoice(invoiceId: string, user: UserProfile): boolean {
    this.cancelSalesInvoice(invoiceId, 'حذف الفاتورة بواسطة ' + user.full_name, user);
    return true;
  }

  // --- 3. سندات القبض والصرف ---
  public saveReceipt(
    rcpt: {
      receipt_type: 'customer_receipt' | 'supplier_payment';
      party_id: string;
      party_name: string;
      amount: number;
      linked_invoice_id?: string;
      linked_invoice_number?: string;
      date: string;
      notes?: string;
    },
    user: UserProfile
  ): Receipt {
    if (!Number.isFinite(rcpt.amount) || rcpt.amount <= 0) {
      throw new Error('مبلغ السند يجب أن يكون أكبر من صفر.');
    }

    const currentTreasury = this.calculateTreasuryBalance();
    if (rcpt.receipt_type === 'supplier_payment' && rcpt.amount > currentTreasury) {
      throw new Error(`رصيد الخزينة الحالي (${currentTreasury} ج.م) لا يكفي لسداد المورد بالمبلغ المطلوب (${rcpt.amount} ج.م).`);
    }

    const receipts = this.getReceipts();
    const rcptNumber = this.generateReceiptNumber(rcpt.receipt_type);
    const rcptId = generateSecureId('receipt');

    const savedReceipt: Receipt = {
      id: rcptId,
      receipt_number: rcptNumber,
      receipt_type: rcpt.receipt_type,
      party_id: rcpt.party_id,
      party_name: rcpt.party_name,
      amount: rcpt.amount,
      linked_invoice_id: rcpt.linked_invoice_id,
      linked_invoice_number: rcpt.linked_invoice_number,
      date: rcpt.date,
      notes: rcpt.notes,
      created_by: user.full_name,
      created_at: new Date().toISOString(),
    };

    receipts.unshift(savedReceipt);

    const treasuryMovements = this.getTreasuryMovements();
    const accMovements = this.getAccountMovements();

    if (rcpt.receipt_type === 'customer_receipt') {
      const currentCustBal = this.calculateCustomerBalance(rcpt.party_id);
      const newCustBal = currentCustBal - rcpt.amount;

      treasuryMovements.push({
        id: generateSecureId(`tm-${rcptId}`),
        movement_type: 'customer_receipt',
        doc_type: 'سند قبض',
        doc_id: rcptId,
        doc_number: rcptNumber,
        party_name: rcpt.party_name,
        amount_in: rcpt.amount,
        amount_out: 0,
        balance_after: currentTreasury + rcpt.amount,
        date: rcpt.date,
        notes: rcpt.notes || `تحصيل من عميل بسند قبض ${rcptNumber}`,
        created_by: user.full_name,
        created_at: new Date().toISOString(),
      });

      accMovements.push({
        id: generateSecureId(`am-${rcptId}`),
        party_type: 'customer',
        party_id: rcpt.party_id,
        party_name: rcpt.party_name,
        movement_type: 'receipt',
        doc_type: 'سند قبض',
        doc_id: rcptId,
        doc_number: rcptNumber,
        debit: 0,
        credit: rcpt.amount,
        balance_after: newCustBal,
        date: rcpt.date,
        notes: rcpt.notes || `سند قبض رقم ${rcptNumber}`,
        created_at: new Date().toISOString(),
      });
    } else {
      if (rcpt.amount > currentTreasury) {
        throw new Error(
          `رصيد الخزينة الحالي (${currentTreasury} ج.م) لا يكفي لصرف هذا المبلغ للمورد (${rcpt.amount} ج.م).`
        );
      }
      const currentSuppBal = this.calculateSupplierBalance(rcpt.party_id);
      const newSuppBal = currentSuppBal - rcpt.amount;

      treasuryMovements.push({
        id: generateSecureId(`tm-${rcptId}`),
        movement_type: 'supplier_payment',
        doc_type: 'سند صرف',
        doc_id: rcptId,
        doc_number: rcptNumber,
        party_name: rcpt.party_name,
        amount_in: 0,
        amount_out: rcpt.amount,
        balance_after: currentTreasury - rcpt.amount,
        date: rcpt.date,
        notes: rcpt.notes || `سداد لمورد بسند صرف ${rcptNumber}`,
        created_by: user.full_name,
        created_at: new Date().toISOString(),
      });

      accMovements.push({
        id: generateSecureId(`am-${rcptId}`),
        party_type: 'supplier',
        party_id: rcpt.party_id,
        party_name: rcpt.party_name,
        movement_type: 'payment',
        doc_type: 'سند صرف',
        doc_id: rcptId,
        doc_number: rcptNumber,
        debit: rcpt.amount,
        credit: 0,
        balance_after: newSuppBal,
        date: rcpt.date,
        notes: rcpt.notes || `سند صرف لمورد رقم ${rcptNumber}`,
        created_at: new Date().toISOString(),
      });
    }

    this.atomicCommit({
      receipts,
      treasury_movements: treasuryMovements,
      account_movements: accMovements,
    });

    this.logAudit(
      user.full_name,
      rcpt.receipt_type === 'customer_receipt' ? 'سند قبض نقدية' : 'سند صرف نقدية',
      'receipt',
      rcptNumber,
      `الطرف: ${rcpt.party_name}، المبلغ: ${rcpt.amount} ج.م`
    );

    return savedReceipt;
  }

  // --- 4. المصروفات ---
  public saveExpense(
    exp: {
      category_id: string;
      category_name: string;
      amount: number;
      date: string;
      notes?: string;
    },
    user: UserProfile
  ): Expense {
    if (!Number.isFinite(exp.amount) || exp.amount <= 0) {
      throw new Error('مبلغ المصروف يجب أن يكون أكبر من صفر.');
    }

    const currentTreasury = this.calculateTreasuryBalance();
    if (exp.amount > currentTreasury) {
      throw new Error(`رصيد الخزينة الحالي (${currentTreasury} ج.م) لا يكفي لصرف هذا المصروف بالمبلغ المطلوب (${exp.amount} ج.م).`);
    }

    const expenses = this.getExpenses();
    const expNumber = this.generateExpenseNumber();
    const expId = generateSecureId('expense');

    const savedExpense: Expense = {
      id: expId,
      expense_number: expNumber,
      category_id: exp.category_id,
      category_name: exp.category_name,
      amount: exp.amount,
      date: exp.date,
      notes: exp.notes,
      created_by: user.full_name,
      created_at: new Date().toISOString(),
    };

    expenses.unshift(savedExpense);

    const treasuryMovements = this.getTreasuryMovements();
    treasuryMovements.push({
      id: generateSecureId(`tm-${expId}`),
      movement_type: 'expense',
      doc_type: 'إذن صرف مصروفات',
      doc_id: expId,
      doc_number: expNumber,
      party_name: exp.category_name,
      amount_in: 0,
      amount_out: exp.amount,
      balance_after: currentTreasury - exp.amount,
      date: exp.date,
      notes: exp.notes ? `${exp.category_name}: ${exp.notes}` : exp.category_name,
      created_by: user.full_name,
      created_at: new Date().toISOString(),
    });

    this.atomicCommit({
      expenses,
      treasury_movements: treasuryMovements,
    });

    this.logAudit(
      user.full_name,
      'تسجيل مصروف',
      'expense',
      expNumber,
      `البند: ${exp.category_name}، المبلغ: ${exp.amount} ج.م`
    );

    return savedExpense;
  }

  // --- 5. المرتجعات (مبيعات ومشتريات) ---
  public saveReturn(
    ret: {
      return_type: 'sale_return' | 'purchase_return';
      original_doc_id?: string;
      original_doc_number?: string;
      party_id?: string;
      party_name: string;
      date: string;
      lines: any[];
      total_amount: number;
      refunded_cash: number;
      credited_to_account: number;
      notes?: string;
    },
    user: UserProfile
  ): ReturnRecord {
    if (!ret.lines || ret.lines.length === 0) {
      throw new Error('لا يمكن تسجيل مرتجع فارغ بدون بنود.');
    }

    const totalAmount = Number(ret.total_amount);
    const refundedCash = Number(ret.refunded_cash);
    const creditedToAccount = Number(ret.credited_to_account);

    if (
      !Number.isFinite(totalAmount) ||
      totalAmount <= 0 ||
      !Number.isFinite(refundedCash) ||
      refundedCash < 0 ||
      !Number.isFinite(creditedToAccount) ||
      creditedToAccount < 0
    ) {
      throw new Error('بيانات مبلغ المرتجع غير صالحة. راجع الإجمالي والمبلغ النقدي والمقيد بالحساب.');
    }

    if (Math.abs((refundedCash + creditedToAccount) - totalAmount) > 0.05) {
      throw new Error(`مجموع المبلغ المسترد نقداً (${refundedCash} ج.م) والمقيد بالحساب (${creditedToAccount} ج.م) يجب أن يساوي إجمالي المرتجع (${totalAmount} ج.م).`);
    }

    // تطبيع البنود والتحقق من عدم وجود كميات أو أسعار غير صالحة.
    for (const line of ret.lines) {
      const quantity = Number(line.quantity);
      const unitPrice = Number(line.unit_price);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error(`بيانات غير صالحة في بند "${line.item_name || 'غير معروف'}". يجب أن تكون الكمية أكبر من صفر والسعر غير سالب.`);
      }
    }

    const currentTreasury = this.calculateTreasuryBalance();
    if (ret.return_type === 'sale_return' && ret.refunded_cash > currentTreasury) {
      throw new Error(`رصيد الخزينة الحالي (${currentTreasury} ج.م) لا يكفي لرد المبلغ المطلوب نقداً (${ret.refunded_cash} ج.م).`);
    }

    // تحقق من الكميات المرتجعة ضد الفاتورة الأصلية إن وجدت
    if (ret.original_doc_id) {
      if (ret.return_type === 'sale_return') {
        const origInv = this.getSalesInvoices().find((i) => i.id === ret.original_doc_id);
        if (origInv) {
          if (origInv.status === 'cancelled') {
            throw new Error('لا يمكن عمل مرتجع على فاتورة مبيعات ملغاة.');
          }
          if (ret.refunded_cash > origInv.paid_cash) {
            throw new Error(`المبلغ المسترد نقداً (${ret.refunded_cash} ج.م) يتجاوز ما تم تحصيله نقداً بالفاتورة الأصلية (${origInv.paid_cash} ج.م).`);
          }

          // حساب ما تم إرجاعه مسبقاً من الفواتير النشطة فقط
          const prevReturns = this.getReturns().filter((r) => r.original_doc_id === origInv.id && r.status !== 'cancelled');
          const returnedQtyMap = new Map<string, number>();
          prevReturns.forEach((pr) => {
            pr.lines.forEach((l) => {
              returnedQtyMap.set(l.item_id, (returnedQtyMap.get(l.item_id) || 0) + l.quantity);
            });
          });

          for (const line of ret.lines) {
            const origLine = origInv.lines.find((l) => l.item_id === line.item_id);
            const maxAllowed = origLine ? origLine.quantity - (returnedQtyMap.get(line.item_id) || 0) : 0;
            if (line.quantity > maxAllowed) {
              throw new Error(
                `لا يمكن إرجاع كمية (${line.quantity}) من "${line.item_name}". الكمية المتبقية القابلة للإرجاع من الفاتورة هي (${maxAllowed}) قطعة.`
              );
            }
          }
        }
      } else if (ret.return_type === 'purchase_return') {
        const origInv = this.getPurchaseInvoices().find((i) => i.id === ret.original_doc_id);
        if (origInv) {
          if (origInv.status === 'cancelled') {
            throw new Error('لا يمكن عمل مرتجع على فاتورة مشتريات ملغاة.');
          }

          // لا تسمح طبقة التخزين نفسها بتجاوز الكميات المتبقية حتى لو تم
          // تجاوز واجهة المستخدم أو تم استدعاء التخزين مباشرة.
          const prevReturns = this.getReturns().filter(
            (r) => r.original_doc_id === origInv.id && r.status !== 'cancelled'
          );
          const returnedQtyMap = new Map<string, number>();
          prevReturns.forEach((pr) => {
            pr.lines.forEach((l) => {
              returnedQtyMap.set(
                l.item_id,
                (returnedQtyMap.get(l.item_id) || 0) + Number(l.quantity || 0)
              );
            });
          });

          for (const line of ret.lines) {
            const origLine = origInv.lines.find((l) => l.item_id === line.item_id);
            const originalQty = origLine ? Number(origLine.quantity || 0) : 0;
            const alreadyReturned = returnedQtyMap.get(line.item_id) || 0;
            const maxAllowed = Math.max(0, originalQty - alreadyReturned);
            const requestedQty = Number(line.quantity);

            if (!origLine || requestedQty > maxAllowed) {
              throw new Error(
                `لا يمكن إرجاع كمية (${requestedQty}) من "${line.item_name}". الكمية المتبقية القابلة للإرجاع من فاتورة الشراء هي (${maxAllowed}) قطعة.`
              );
            }
          }
        }
      }
    }

    const returns = this.getReturns();
    const retNumber = this.generateReturnNumber(ret.return_type);
    const returnId = generateSecureId('return');

    const savedReturn: ReturnRecord = {
      id: returnId,
      return_number: retNumber,
      return_type: ret.return_type,
      original_doc_id: ret.original_doc_id,
      original_doc_number: ret.original_doc_number,
      party_id: ret.party_id,
      party_name: ret.party_name,
      date: ret.date,
      lines: ret.lines,
      total_amount: totalAmount,
      refunded_cash: refundedCash,
      credited_to_account: creditedToAccount,
      status: 'completed',
      notes: ret.notes,
      created_by: user.full_name,
      created_at: new Date().toISOString(),
    };

    returns.unshift(savedReturn);

    const stockMovements = this.getStockMovements();
    const accMovements = this.getAccountMovements();
    const treasuryMovements = this.getTreasuryMovements();

    if (ret.return_type === 'sale_return') {
      ret.lines.forEach((line) => {
        const curStock = this.calculateItemStock(line.item_id);
        stockMovements.push({
          id: generateSecureId(`sm-${returnId}-${line.item_id}`),
          item_id: line.item_id,
          item_name: line.item_name,
          movement_type: 'sale_return',
          doc_type: 'مرتجع مبيعات',
          doc_id: returnId,
          doc_number: retNumber,
          party_name: ret.party_name,
          quantity_in: line.quantity,
          quantity_out: 0,
          unit_price: line.unit_price,
          running_balance: curStock + line.quantity,
          date: ret.date,
          notes: `مرتجع مبيعات ${retNumber}`,
          created_at: new Date().toISOString(),
        });
      });

      if (ret.refunded_cash > 0) {
        treasuryMovements.push({
          id: generateSecureId(`tm-${returnId}`),
          movement_type: 'sale_return_cash',
          doc_type: 'مرتجع مبيعات',
          doc_id: returnId,
          doc_number: retNumber,
          party_name: ret.party_name,
          amount_in: 0,
          amount_out: ret.refunded_cash,
          balance_after: currentTreasury - ret.refunded_cash,
          date: ret.date,
          notes: `رد نقدي مرتجع مبيعات ${retNumber}`,
          created_by: user.full_name,
          created_at: new Date().toISOString(),
        });
      }

      if (ret.party_id && ret.credited_to_account > 0) {
        const curBal = this.calculateCustomerBalance(ret.party_id);
        accMovements.push({
          id: generateSecureId(`am-${returnId}`),
          party_type: 'customer',
          party_id: ret.party_id,
          party_name: ret.party_name,
          movement_type: 'return_credit',
          doc_type: 'مرتجع مبيعات',
          doc_id: returnId,
          doc_number: retNumber,
          debit: 0,
          credit: ret.credited_to_account,
          balance_after: curBal - ret.credited_to_account,
          date: ret.date,
          notes: `خصم مديونية مرتجع مبيعات ${retNumber}`,
          created_at: new Date().toISOString(),
        });
      }
    } else {
      ret.lines.forEach((line) => {
        const curStock = this.calculateItemStock(line.item_id);
        stockMovements.push({
          id: generateSecureId(`sm-${returnId}-${line.item_id}`),
          item_id: line.item_id,
          item_name: line.item_name,
          movement_type: 'purchase_return',
          doc_type: 'مرتجع مشتريات',
          doc_id: returnId,
          doc_number: retNumber,
          party_name: ret.party_name,
          quantity_in: 0,
          quantity_out: line.quantity,
          unit_price: line.unit_price,
          running_balance: curStock - line.quantity,
          date: ret.date,
          notes: `مرتجع مشتريات لمورد ${retNumber}`,
          created_at: new Date().toISOString(),
        });
      });

      if (ret.refunded_cash > 0) {
        treasuryMovements.push({
          id: generateSecureId(`tm-${returnId}`),
          movement_type: 'purchase_return_cash',
          doc_type: 'مرتجع مشتريات',
          doc_id: returnId,
          doc_number: retNumber,
          party_name: ret.party_name,
          amount_in: ret.refunded_cash,
          amount_out: 0,
          balance_after: currentTreasury + ret.refunded_cash,
          date: ret.date,
          notes: `استلام كاش مرتجع مشتريات ${retNumber}`,
          created_by: user.full_name,
          created_at: new Date().toISOString(),
        });
      }

      if (ret.party_id && ret.credited_to_account > 0) {
        const curBal = this.calculateSupplierBalance(ret.party_id);
        accMovements.push({
          id: generateSecureId(`am-${returnId}`),
          party_type: 'supplier',
          party_id: ret.party_id,
          party_name: ret.party_name,
          movement_type: 'return_debit',
          doc_type: 'مرتجع مشتريات',
          doc_id: returnId,
          doc_number: retNumber,
          debit: ret.credited_to_account,
          credit: 0,
          balance_after: curBal - ret.credited_to_account,
          date: ret.date,
          notes: `تخفيض مستحقات مرتجع مشتريات ${retNumber}`,
          created_at: new Date().toISOString(),
        });
      }
    }

    this.atomicCommit({
      returns,
      stock_movements: stockMovements,
      treasury_movements: treasuryMovements,
      account_movements: accMovements,
    });

    this.logAudit(
      user.full_name,
      ret.return_type === 'sale_return' ? 'تسجيل مرتجع مبيعات' : 'تسجيل مرتجع مشتريات',
      'returns',
      retNumber,
      `المبلغ: ${ret.total_amount} ج.م، الطرف: ${ret.party_name}`
    );

    return savedReturn;
  }

  // --- إلغاء مرتجع وعكس حركاته بالكامل (للمدير فقط) ---
  public cancelReturn(returnId: string, reason: string, user: UserProfile): ReturnRecord {
    if (user.role !== 'admin') {
      throw new Error('إلغاء المرتجعات يتطلب صلاحية مدير النظام فقط.');
    }
    if (!reason || !reason.trim()) {
      throw new Error('يرجى كتابة سبب صريح لإلغاء المرتجع.');
    }

    const returns = this.getReturns();
    const ret = returns.find((r) => r.id === returnId);
    if (!ret) {
      throw new Error('سجل المرتجع غير موجود.');
    }
    if (ret.status === 'cancelled') {
      throw new Error('المرتجع ملغى مسبقاً.');
    }

    ret.status = 'cancelled';
    ret.cancellation_reason = reason.trim();
    ret.cancelled_at = new Date().toISOString();
    ret.cancelled_by = user.full_name;

    const today = new Date().toISOString().split('T')[0];
    const stockMovements = this.getStockMovements();
    const treasuryMovements = this.getTreasuryMovements();
    const accMovements = this.getAccountMovements();

    if (ret.return_type === 'sale_return') {
      // Reversal: sale_return previously increased stock, so cancellation decreases stock
      ret.lines.forEach((line) => {
        const curStock = this.calculateItemStock(line.item_id);
        stockMovements.push({
          id: generateSecureId(`sm-rev-ret-${returnId}-${line.item_id}`),
          item_id: line.item_id,
          item_name: line.item_name,
          movement_type: 'cancellation',
          doc_type: 'إلغاء مرتجع مبيعات',
          doc_id: returnId,
          doc_number: ret.return_number,
          party_name: ret.party_name,
          quantity_in: 0,
          quantity_out: line.quantity,
          unit_price: line.unit_price,
          running_balance: curStock - line.quantity,
          date: today,
          notes: `إلغاء مرتجع مبيعات ${ret.return_number}: ${reason.trim()}`,
          created_at: new Date().toISOString(),
        });
      });

      // Treasury reversal: if cash was refunded out, put it back in
      if (ret.refunded_cash > 0) {
        const curTreasury = this.calculateTreasuryBalance();
        treasuryMovements.push({
          id: generateSecureId(`tm-rev-ret-${returnId}`),
          movement_type: 'cancellation',
          doc_type: 'إلغاء مرتجع مبيعات',
          doc_id: returnId,
          doc_number: ret.return_number,
          party_name: ret.party_name,
          amount_in: ret.refunded_cash,
          amount_out: 0,
          balance_after: curTreasury + ret.refunded_cash,
          date: today,
          notes: `إلغاء رد نقدي لمرتجع مبيعات ${ret.return_number}: ${reason.trim()}`,
          created_by: user.full_name,
          created_at: new Date().toISOString(),
        });
      }

      // Customer account reversal: if credited_to_account > 0, re-debit it
      if (ret.party_id && ret.credited_to_account > 0) {
        const curCustBal = this.calculateCustomerBalance(ret.party_id);
        accMovements.push({
          id: generateSecureId(`am-rev-ret-${returnId}`),
          party_type: 'customer',
          party_id: ret.party_id,
          party_name: ret.party_name,
          movement_type: 'cancellation',
          doc_type: 'إلغاء مرتجع مبيعات',
          doc_id: returnId,
          doc_number: ret.return_number,
          debit: ret.credited_to_account,
          credit: 0,
          balance_after: curCustBal + ret.credited_to_account,
          date: today,
          notes: `إلغاء رصيد دائن لمرتجع ${ret.return_number}: ${reason.trim()}`,
          created_at: new Date().toISOString(),
        });
      }
    } else {
      // purchase_return previously decreased stock, so cancellation increases stock
      ret.lines.forEach((line) => {
        const curStock = this.calculateItemStock(line.item_id);
        stockMovements.push({
          id: generateSecureId(`sm-rev-ret-${returnId}-${line.item_id}`),
          item_id: line.item_id,
          item_name: line.item_name,
          movement_type: 'cancellation',
          doc_type: 'إلغاء مرتجع مشتريات',
          doc_id: returnId,
          doc_number: ret.return_number,
          party_name: ret.party_name,
          quantity_in: line.quantity,
          quantity_out: 0,
          unit_price: line.unit_price,
          running_balance: curStock + line.quantity,
          date: today,
          notes: `إلغاء مرتجع مشتريات ${ret.return_number}: ${reason.trim()}`,
          created_at: new Date().toISOString(),
        });
      });

      // Treasury reversal: if cash was received in, take it back out
      if (ret.refunded_cash > 0) {
        const curTreasury = this.calculateTreasuryBalance();
        treasuryMovements.push({
          id: generateSecureId(`tm-rev-ret-${returnId}`),
          movement_type: 'cancellation',
          doc_type: 'إلغاء مرتجع مشتريات',
          doc_id: returnId,
          doc_number: ret.return_number,
          party_name: ret.party_name,
          amount_in: 0,
          amount_out: ret.refunded_cash,
          balance_after: curTreasury - ret.refunded_cash,
          date: today,
          notes: `إلغاء تحصيل نقدي لمرتجع مشتريات ${ret.return_number}: ${reason.trim()}`,
          created_by: user.full_name,
          created_at: new Date().toISOString(),
        });
      }

      // Supplier account reversal: re-credit the supplier balance
      if (ret.party_id && ret.credited_to_account > 0) {
        const curSuppBal = this.calculateSupplierBalance(ret.party_id);
        accMovements.push({
          id: generateSecureId(`am-rev-ret-${returnId}`),
          party_type: 'supplier',
          party_id: ret.party_id,
          party_name: ret.party_name,
          movement_type: 'cancellation',
          doc_type: 'إلغاء مرتجع مشتريات',
          doc_id: returnId,
          doc_number: ret.return_number,
          debit: 0,
          credit: ret.credited_to_account,
          balance_after: curSuppBal + ret.credited_to_account,
          date: today,
          notes: `إلغاء خصم من رصيد مورد لمرتجع ${ret.return_number}: ${reason.trim()}`,
          created_at: new Date().toISOString(),
        });
      }
    }

    this.atomicCommit({
      returns,
      stock_movements: stockMovements,
      treasury_movements: treasuryMovements,
      account_movements: accMovements,
    });

    this.logAudit(
      user.full_name,
      'إلغاء مرتجع',
      'return',
      ret.return_number,
      `السبب: ${reason.trim()}، القيمة: ${ret.total_amount} ج.م`
    );

    return ret;
  }

  // --- 6. تسويات الجرد ---
  public saveStockAdjustment(
    adj: {
      item_id: string;
      item_name: string;
      adjustment_type: 'surplus' | 'deficit';
      quantity: number;
      cost_price: number;
      notes?: string;
      date: string;
    },
    user: UserProfile
  ): StockAdjustment {
    if (!Number.isFinite(adj.quantity) || adj.quantity <= 0) {
      throw new Error('كمية التسوية يجب أن تكون أكبر من صفر.');
    }

    const adjustments = this.getStockAdjustments();
    const adjNumber = this.generateAdjustmentNumber(adj.adjustment_type);
    const adjId = generateSecureId('adj');

    const savedAdjustment: StockAdjustment = {
      id: adjId,
      adjustment_number: adjNumber,
      item_id: adj.item_id,
      item_name: adj.item_name,
      adjustment_type: adj.adjustment_type,
      quantity: adj.quantity,
      cost_price: adj.cost_price,
      notes: adj.notes,
      date: adj.date,
      created_by: user.full_name,
      created_at: new Date().toISOString(),
    };

    adjustments.unshift(savedAdjustment);

    const currentStock = this.calculateItemStock(adj.item_id);
    const stockMovements = this.getStockMovements();
    const isSurplus = adj.adjustment_type === 'surplus';

    stockMovements.push({
      id: generateSecureId(`sm-${adjId}`),
      item_id: adj.item_id,
      item_name: adj.item_name,
      movement_type: isSurplus ? 'adjustment_in' : 'adjustment_out',
      doc_type: isSurplus ? 'تسوية جردية (زيادة)' : 'تسوية جردية (عجز)',
      doc_id: adjId,
      doc_number: adjNumber,
      party_name: 'جرد المستودع',
      quantity_in: isSurplus ? adj.quantity : 0,
      quantity_out: !isSurplus ? adj.quantity : 0,
      unit_price: adj.cost_price,
      running_balance: isSurplus ? currentStock + adj.quantity : currentStock - adj.quantity,
      date: adj.date,
      notes: adj.notes || (isSurplus ? 'إضافة فائض جرد' : 'تسوية عجز جرد'),
      created_at: new Date().toISOString(),
    });

    this.atomicCommit({
      stock_adjustments: adjustments,
      stock_movements: stockMovements,
    });

    this.logAudit(
      user.full_name,
      isSurplus ? 'تسوية جردية (فائض)' : 'تسوية جردية (عجز)',
      'stock_adjustment',
      adjNumber,
      `الصنف: ${adj.item_name}، الكمية: ${adj.quantity} قطعة`
    );

    return savedAdjustment;
  }

  // --- 7. حركة الخزينة اليدوية (إيداع / سحب) ---
  public saveTreasuryManualTransfer(
    data: {
      type: 'manual_deposit' | 'manual_withdraw';
      amount: number;
      notes: string;
      date: string;
    },
    user: UserProfile
  ): TreasuryMovement {
    if (user.role === 'cashier') {
      throw new Error('عمليات السحب والإيداع اليدوي بالخزينة تتطلب صلاحية مدير أو محاسب.');
    }
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new Error('المبلغ يجب أن يكون أكبر من صفر.');
    }
    if (!data.notes || !data.notes.trim()) {
      throw new Error('بيان سبب الحركة اليدوية إجباري للرقابة المالية.');
    }

    const currentTreasury = this.calculateTreasuryBalance();
    const movements = this.getTreasuryMovements();
    const isDeposit = data.type === 'manual_deposit';

    if (!isDeposit && data.amount > currentTreasury) {
      throw new Error(
        `المبلغ المطلوب سحبه (${data.amount} ج.م) أكبر من رصيد الخزينة الحالي (${currentTreasury} ج.م).`
      );
    }

    const newBal = isDeposit ? currentTreasury + data.amount : currentTreasury - data.amount;
    const docNum = `MAN-${Date.now().toString().slice(-6)}`;

    const newMov: TreasuryMovement = {
      id: generateSecureId('tm-man'),
      movement_type: data.type,
      doc_type: isDeposit ? 'إيداع نقدي يدوي' : 'سحب نقدي يدوي',
      doc_number: docNum,
      party_name: isDeposit ? 'إيداع بالخزينة' : 'مسحوبات نقدية',
      amount_in: isDeposit ? data.amount : 0,
      amount_out: !isDeposit ? data.amount : 0,
      balance_after: newBal,
      date: data.date,
      notes: data.notes.trim(),
      created_by: user.full_name,
      created_at: new Date().toISOString(),
    };

    movements.push(newMov);
    this.atomicCommit({
      treasury_movements: movements,
    });

    this.logAudit(
      user.full_name,
      isDeposit ? 'إيداع يدوي بالخزينة' : 'سحب يدوي من الخزينة',
      'treasury',
      newMov.doc_number!,
      `المبلغ: ${data.amount} ج.م، البيان: ${data.notes.trim()}`
    );

    return newMov;
  }

  // --- تصدير واستيراد البيانات (نسخ احتياطي آمن) ---
  public exportFullBackup(): string {
    const nowIso = new Date().toISOString();
    const settings = this.getSettings();
    settings.last_backup_at = nowIso;
    try {
      this.set('settings', settings);
    } catch {
      // ignore if quota during export
    }

    const backupData: Record<string, any> = {
      _app_version: '1.2.0',
      _exported_at: nowIso,
      _store_name: settings.store_name,
    };
    const keys = [
      'items',
      'customers',
      'suppliers',
      'sales_invoices',
      'purchase_invoices',
      'returns',
      'receipts',
      'expenses',
      'expense_categories',
      'stock_adjustments',
      'stock_movements',
      'account_movements',
      'treasury_movements',
      'settings',
      'users',
      'counters',
      'audit_log',
    ];
    keys.forEach((k) => {
      backupData[k] = this.get(k, null);
    });
    return JSON.stringify(backupData, null, 2);
  }

  public exportFullBackupBlob(): Blob {
    const nowIso = new Date().toISOString();
    const settings = this.getSettings();
    settings.last_backup_at = nowIso;
    try {
      this.set('settings', settings);
    } catch {}

    const chunks: (string | Blob)[] = ['{\n  "_app_version": "1.2.0",\n  "_exported_at": "' + nowIso + '",\n  "_store_name": ' + JSON.stringify(settings.store_name || '') + ',\n'];
    const keys = [
      'items',
      'customers',
      'suppliers',
      'sales_invoices',
      'purchase_invoices',
      'returns',
      'receipts',
      'expenses',
      'expense_categories',
      'stock_adjustments',
      'stock_movements',
      'account_movements',
      'treasury_movements',
      'settings',
      'users',
      'counters',
      'audit_log',
    ];

    keys.forEach((k, idx) => {
      const isLast = idx === keys.length - 1;
      const val = this.get(k, null);
      chunks.push(`  "${k}": ${JSON.stringify(val)}${isLast ? '' : ','}\n`);
    });
    chunks.push('}');
    return new Blob(chunks, { type: 'application/json;charset=utf-8' });
  }

  public getBackupSummary(jsonStr: string): {
    isValid: boolean;
    error?: string;
    itemsCount: number;
    salesInvoicesCount: number;
    customersCount: number;
    exportedAt?: string;
    storeName?: string;
  } {
    try {
      const data = JSON.parse(jsonStr);
      if (!data || typeof data !== 'object') {
        return { isValid: false, error: 'الملف غير صالح أو فارغ', itemsCount: 0, salesInvoicesCount: 0, customersCount: 0 };
      }
      const requiredArrays = ['items', 'customers', 'suppliers', 'sales_invoices', 'stock_movements', 'account_movements', 'treasury_movements'];
      for (const k of requiredArrays) {
        if (!Array.isArray(data[k])) {
          return { isValid: false, error: `ملف النسخة الاحتياطية ناقص للجدول الأساسي (${k})`, itemsCount: 0, salesInvoicesCount: 0, customersCount: 0 };
        }
      }
      return {
        isValid: true,
        itemsCount: data.items.length,
        salesInvoicesCount: data.sales_invoices.length,
        customersCount: data.customers.length,
        exportedAt: data._exported_at,
        storeName: data._store_name || data.settings?.store_name,
      };
    } catch {
      return { isValid: false, error: 'تنسيق JSON غير صالح أو الملف تالف', itemsCount: 0, salesInvoicesCount: 0, customersCount: 0 };
    }
  }

  public importFullBackup(jsonStr: string, user: UserProfile): boolean {
    if (user.role !== 'admin') {
      throw new Error('استعادة النسخة الاحتياطية للمدير فقط.');
    }

    const summary = this.getBackupSummary(jsonStr);
    if (!summary.isValid) {
      throw new Error(summary.error || 'الملف غير صالح للاستعادة.');
    }

    try {
      // 1. أخذ نسخة احتياطية تلقائية في sessionStorage لحماية المساحة
      const currentBackup = this.exportFullBackup();
      try {
        sessionStorage.setItem('amory_backup_pre_restore', currentBackup);
      } catch (err) {
        console.warn('SessionStorage quota reached for pre-restore backup', err);
      }

      // 2. تطبيق الاستيراد
      const data = JSON.parse(jsonStr);
      const allowedKeys = [
        'items',
        'customers',
        'suppliers',
        'sales_invoices',
        'purchase_invoices',
        'returns',
        'receipts',
        'expenses',
        'expense_categories',
        'stock_adjustments',
        'stock_movements',
        'account_movements',
        'treasury_movements',
        'settings',
        'users',
        'counters',
      ];

      const commitUpdates: Record<string, any> = {};
      allowedKeys.forEach((k) => {
        if (data[k] !== undefined) {
          commitUpdates[k] = data[k];
        }
      });

      this.atomicCommit(commitUpdates);

      this.logAudit(
        user.full_name,
        'استعادة نسخة احتياطية كاملة',
        'system',
        'backup',
        `تمت استعادة البيانات بنجاح (${summary.itemsCount} صنف، ${summary.salesInvoicesCount} فاتورة)`
      );
      return true;
    } catch (e: any) {
      throw new Error(e.message || 'فشلت عملية استعادة النسخة الاحتياطية.');
    }
  }

  public undoRestore(user: UserProfile): boolean {
    if (user.role !== 'admin') {
      throw new Error('التراجع متاح للمدير فقط.');
    }
    const preRestore = sessionStorage.getItem('amory_backup_pre_restore');
    if (!preRestore) {
      throw new Error('لا توجد نقطة استعادة سابقة متاحة للتراجع في هذه الجلسة.');
    }
    return this.importFullBackup(preRestore, user);
  }

  // --- تصدير إلى CSV صديق للغة العربية مع UTF-8 BOM ---
  public exportToCSV(type: 'items' | 'customers' | 'suppliers' | 'treasury' | 'sales'): string {
    const BOM = '\uFEFF';
    let headers: string[] = [];
    let rows: string[][] = [];

    if (type === 'items') {
      headers = ['كود الصنف', 'الباركود', 'اسم الصنف', 'الماركة', 'الموديل', 'رقم OEM', 'الرف', 'سعر التكلفة', 'سعر البيع قطاعي', 'سعر البيع جملة', 'الرصيد الحالي'];
      const items = this.getItems();
      rows = items.map((i) => [
        `"${i.code}"`,
        `"${i.barcode}"`,
        `"${i.name.replace(/"/g, '""')}"`,
        `"${(i.brand || '').replace(/"/g, '""')}"`,
        `"${(i.car_model || '').replace(/"/g, '""')}"`,
        `"${i.oem_number || ''}"`,
        `"${i.shelf_location || ''}"`,
        String(i.cost_price),
        String(i.retail_price),
        String(i.wholesale_price),
        String(i.current_stock ?? 0),
      ]);
    } else if (type === 'customers') {
      headers = ['اسم العميل', 'رقم الهاتف', 'العنوان', 'الحد الائتماني', 'الرصيد الحالي'];
      const custs = this.getCustomers();
      rows = custs.map((c) => [
        `"${c.name.replace(/"/g, '""')}"`,
        `"${c.phone || ''}"`,
        `"${(c.address || '').replace(/"/g, '""')}"`,
        String(c.credit_limit || 0),
        String(c.current_balance ?? 0),
      ]);
    } else if (type === 'suppliers') {
      headers = ['اسم المورد', 'رقم الهاتف', 'العنوان', 'الرصيد المستحق له'];
      const supps = this.getSuppliers();
      rows = supps.map((s) => [
        `"${s.name.replace(/"/g, '""')}"`,
        `"${s.phone || ''}"`,
        `"${(s.address || '').replace(/"/g, '""')}"`,
        String(s.current_balance ?? 0),
      ]);
    } else if (type === 'treasury') {
      headers = ['التاريخ', 'رقم الحركة', 'نوع الحركة', 'البيان والطرف', 'الوارد (ج.م)', 'المنصرف (ج.م)', 'الرصيد بعد الحركة'];
      const movs = this.getTreasuryMovements();
      rows = movs.map((m) => [
        `"${m.date}"`,
        `"${m.doc_number || ''}"`,
        `"${m.doc_type}"`,
        `"${(m.notes || m.party_name || '').replace(/"/g, '""')}"`,
        String(m.amount_in || 0),
        String(m.amount_out || 0),
        String(m.balance_after || 0),
      ]);
    } else if (type === 'sales') {
      headers = ['رقم الفاتورة', 'التاريخ', 'اسم العميل', 'الإجمالي', 'المدفوع نقداً', 'المتبقي آجل', 'الحالة'];
      const invoices = this.getSalesInvoices();
      rows = invoices.map((inv) => [
        `"${inv.invoice_number}"`,
        `"${inv.invoice_date}"`,
        `"${inv.customer_name.replace(/"/g, '""')}"`,
        String(inv.final_total),
        String(inv.paid_cash),
        String(inv.remaining_debt),
        `"${inv.status === 'cancelled' ? 'ملغاة' : 'مكتملة'}"`,
      ]);
    }

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    return BOM + csvContent;
  }

  // --- سجل التدقيق ---
  public logAudit(
    userName: string,
    action: string,
    entityType: string,
    entityId: string,
    details: string
  ) {
    const logs = this.get<AuditLog[]>('audit_log', []);
    logs.unshift({
      id: generateSecureId('log'),
      user_name: userName,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      created_at: new Date().toISOString(),
    });
    this.set('audit_log', logs.slice(0, 500)); // الاحتفاظ بآخر 500 حدث
  }

  // --- المستخدمون والصلاحيات (أمان + PIN) ---
  public getUsers(): UserProfile[] {
    return this.get<UserProfile[]>('users', INITIAL_USERS);
  }

  public saveUser(
    userData: {
      id?: string;
      name: string;
      username: string;
      role: UserRole;
      is_active: boolean;
      avatar_color?: string;
    },
    currentUser: UserProfile
  ): UserProfile {
    if (currentUser.role !== 'admin') {
      throw new Error('إدارة وتعديل المستخدمين للمدير فقط.');
    }

    const users = this.getUsers();
    const isEdit = Boolean(userData.id);

    // التحقق: منع تعطيل أو تخفيض رتبة آخر مدير نشط
    if (isEdit && userData.id) {
      const existingUser = users.find((u) => u.id === userData.id);
      if (existingUser && existingUser.role === 'admin') {
        const activeAdmins = users.filter((u) => u.role === 'admin' && u.is_active && u.id !== userData.id);
        if (activeAdmins.length === 0 && (!userData.is_active || userData.role !== 'admin')) {
          throw new Error('لا يمكن تعطيل أو تغيير دور آخر مدير نشط في النظام.');
        }
      }
    }

    let userToSave: UserProfile;
    if (isEdit) {
      const existing = users.find((u) => u.id === userData.id);
      userToSave = {
        ...existing,
        id: userData.id!,
        username: userData.username,
        full_name: userData.name,
        name: userData.name,
        role: userData.role,
        is_active: userData.is_active,
        avatar_color: userData.avatar_color || existing?.avatar_color || 'blue',
      };
      const idx = users.findIndex((u) => u.id === userData.id);
      if (idx !== -1) users[idx] = userToSave;
    } else {
      userToSave = {
        id: generateSecureId('usr'),
        username: userData.username,
        full_name: userData.name,
        name: userData.name,
        role: userData.role,
        is_active: userData.is_active,
        avatar_color: userData.avatar_color || 'blue',
      };
      users.push(userToSave);
    }

    this.set('users', users);
    this.logAudit(
      currentUser.full_name,
      isEdit ? 'تعديل بيانات مستخدم' : 'إضافة مستخدم جديد',
      'user',
      userToSave.id,
      `اسم: ${userToSave.full_name} (${userToSave.role})`
    );
    return userToSave;
  }

  public setUserPin(userId: string, pinHash: string, pinSalt: string): void {
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx !== -1) {
      users[idx].pin_hash = pinHash;
      users[idx].pin_salt = pinSalt;
      this.set('users', users);
    }
  }

  public deleteUser(userId: string, currentUser: UserProfile): boolean {
    if (currentUser.role !== 'admin') {
      throw new Error('حذف المستخدمين متاح للمدير فقط.');
    }
    const users = this.getUsers();
    const userToDelete = users.find((u) => u.id === userId);
    if (!userToDelete) return false;

    if (userToDelete.role === 'admin') {
      const activeAdmins = users.filter((u) => u.role === 'admin' && u.is_active && u.id !== userId);
      if (activeAdmins.length === 0) {
        throw new Error('لا يمكن حذف آخر مدير نشط في النظام.');
      }
    }

    this.set('users', users.filter((u) => u.id !== userId));
    this.logAudit(
      currentUser.full_name,
      'حذف مستخدم',
      'user',
      userId,
      `تم حذف المستخدم: ${userToDelete.full_name}`
    );
    return true;
  }
}

export const storage = new StorageEngine();
