export type UserRole = 'admin' | 'accountant' | 'cashier';

export interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  name?: string;
  role: UserRole;
  is_active: boolean;
  pin_hash?: string;
  pin_salt?: string;
  avatar_color?: string;
}

export type User = UserProfile;

export interface RolePermissions {
  can_view_costs: boolean;
  can_view_profits: boolean;
  can_view_treasury_balance: boolean;
  can_delete_invoices: boolean;
  can_cancel_invoices: boolean;
  can_sell_below_cost: boolean;
  can_manage_users: boolean;
  can_manage_settings: boolean;
}

export interface Item {
  id: string;
  code: string;
  barcode: string;
  name: string;
  brand: string;            // مثل: Bosch, Denso, Valeo, Mobis, Toyota Genuine
  car_model: string;        // مثل: تويوتا كورولا 2014-2020، هيونداي فيرنا، كيا سيراتو
  car_models?: string[];    // قائمة موديلات متعددة للصنف
  oem_number: string;       // رقم القطعة الأصلي
  unit: string;             // قطعة، طقم، زوج، لتر، كرتونة
  cost_price: number;       // سعر التكلفة / الشراء
  retail_price: number;     // سعر البيع قطاعي
  wholesale_price: number;  // سعر البيع جملة
  min_stock: number;        // حد أدنى للمخزون للتنبيه
  shelf_location: string;   // الرف / مكان الصنف في المحل
  initial_stock: number;    // رصيد أول المدة
  current_stock?: number;   // يُحسب من الحركات
  notes?: string;
  category?: string;        // الفئة / القسم
  min_selling_price?: number; // أقل سعر بيع
  max_selling_price?: number; // أعلى سعر بيع
  created_at: string;
}

export type PartyType = 'customer' | 'supplier';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  opening_balance: number;   // موجب = عليه، سالب = له
  credit_limit?: number;    // حد ائتماني
  notes?: string;
  created_at: string;
  current_balance?: number; // يُحسب من الحركات
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address: string;
  opening_balance: number;   // موجب = له علينا، سالب = سلف
  notes?: string;
  created_at: string;
  current_balance?: number; // يُحسب من الحركات
}

export interface InvoiceLine {
  id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  brand?: string;
  oem_number?: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  discount: number;         // خصم على البند
  total: number;            // (quantity * unit_price) - discount
}

export interface SalesInvoice {
  id: string;
  invoice_number: string;
  customer_id?: string | null;
  customer_name: string;
  invoice_date: string;
  lines: InvoiceLine[];
  subtotal: number;
  discount_type: 'fixed' | 'percentage';
  discount_value: number;
  final_total: number;
  paid_cash: number;
  remaining_debt: number;
  previous_balance: number; // حساب سابق قبل الفاتورة
  balance_after: number;    // الرصيد بعد الفاتورة
  status: 'completed' | 'cancelled';
  cancellation_reason?: string;
  cancelled_at?: string;
  cancelled_by?: string;
  notes?: string;
  created_by: string;
  created_at: string;
}

export interface PurchaseInvoiceLine {
  id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface PurchaseInvoice {
  id: string;
  invoice_number: string;
  supplier_id: string;
  supplier_name: string;
  invoice_date: string;
  lines: PurchaseInvoiceLine[];
  subtotal: number;
  discount_value: number;
  final_total: number;
  paid_cash: number;
  remaining_credit: number;
  previous_balance: number; // حساب سابق للمورد
  balance_after: number;
  update_cost_price?: boolean;
  status: 'completed' | 'cancelled';
  cancellation_reason?: string;
  cancelled_at?: string;
  cancelled_by?: string;
  notes?: string;
  created_by: string;
  created_at: string;
}

export interface ReturnItemLine {
  id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface ReturnRecord {
  id: string;
  return_number: string;
  return_type: 'sale_return' | 'purchase_return';
  original_doc_id?: string;
  original_doc_number?: string;
  party_id?: string;
  party_name: string;
  date: string;
  lines: ReturnItemLine[];
  total_amount: number;
  refunded_cash: number;
  credited_to_account: number;
  status?: 'completed' | 'cancelled';
  cancelled_at?: string;
  cancelled_by?: string;
  cancellation_reason?: string;
  notes?: string;
  created_by: string;
  created_at: string;
}

export interface Receipt {
  id: string;
  receipt_number: string;
  receipt_type: 'customer_receipt' | 'supplier_payment'; // قبض عميل | صرف مورد
  party_id: string;
  party_name: string;
  amount: number;
  linked_invoice_id?: string;
  linked_invoice_number?: string;
  date: string;
  notes?: string;
  created_by: string;
  created_at: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
}

export interface Expense {
  id: string;
  expense_number: string;
  category_id: string;
  category_name: string;
  amount: number;
  date: string;
  notes?: string;
  created_by: string;
  created_at: string;
}

export interface StockAdjustment {
  id: string;
  adjustment_number: string;
  item_id: string;
  item_name: string;
  adjustment_type: 'surplus' | 'deficit'; // زيادة | عجز
  quantity: number;
  cost_price: number;
  notes?: string;
  date: string;
  created_by: string;
  created_at: string;
}

// 1. حركة المخزون
export interface StockMovement {
  id: string;
  item_id: string;
  item_name: string;
  movement_type: 'sale' | 'sale_return' | 'purchase' | 'purchase_return' | 'adjustment_in' | 'adjustment_out' | 'initial' | 'cancellation';
  doc_type: string;
  doc_id: string;
  doc_number: string;
  party_name?: string;
  quantity_in: number;
  quantity_out: number;
  unit_price: number;
  running_balance: number;
  date: string;
  notes?: string;
  created_at: string;
}

// 2. حركة الحساب (عميل أو مورد)
export interface AccountMovement {
  id: string;
  party_type: PartyType;
  party_id: string;
  party_name: string;
  movement_type: 'invoice_credit' | 'invoice_debit' | 'receipt' | 'payment' | 'return_debit' | 'return_credit' | 'initial' | 'cancellation';
  doc_type: string;
  doc_id: string;
  doc_number: string;
  debit: number;        // مدين (عليه)
  credit: number;       // دائن (له)
  balance_after: number;
  date: string;
  notes?: string;
  created_at: string;
}

// 3. حركة الخزينة
export interface TreasuryMovement {
  id: string;
  movement_type: 
    | 'sale_cash' 
    | 'sale_return_cash' 
    | 'purchase_cash' 
    | 'purchase_return_cash' 
    | 'customer_receipt' 
    | 'supplier_payment' 
    | 'expense' 
    | 'manual_deposit' 
    | 'manual_withdraw'
    | 'initial'
    | 'cancellation';
  doc_type: string;
  doc_id?: string;
  doc_number?: string;
  party_name?: string;
  amount_in: number;   // وارد
  amount_out: number;  // منصرف
  balance_after: number;
  date: string;
  notes?: string;
  created_by: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  created_at: string;
}

export interface StoreSettings {
  store_name: string;
  phone: string;
  address: string;
  commercial_number: string;
  tax_number: string;
  invoice_footer: string;
  thermal_footer: string;
  allow_negative_stock?: boolean;
  default_cash_customer_id?: string;
  sales_prefix?: string;
  purchase_prefix?: string;
  auto_lock_minutes?: number;
  logo_base64?: string;
  last_backup_at?: string;
  prevent_negative_treasury?: boolean;
  default_print_format?: 'a4' | 'thermal';
}

export interface DocumentCounters {
  sales: number;
  purchases: number;
  receipts: number;
  payments: number;
  expenses: number;
  returns: number;
  adjustments: number;
}

