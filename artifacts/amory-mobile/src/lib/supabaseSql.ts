/**
 * Comprehensive PostgreSQL & Supabase SQL Schema for "نظام إدارة محل قطع غيار السيارات"
 * Contains all 18 tables, Foreign Keys, Performance Indexes, Row Level Security (RLS),
 * and Atomic Postgres Functions / RPCs for 3-way synchronization (Stock, Account, Treasury).
 */

export const SUPABASE_SQL_SCHEMA = `-- ==============================================================================
-- نظام إدارة محل قطع غيار السيارات - سكريبت إنشاء قاعدة البيانات Supabase (PostgreSQL)
-- ==============================================================================
-- قم بنسخ هذا السكريبت بالكامل وتشغيله في: Supabase Dashboard -> SQL Editor -> Run
-- ==============================================================================

-- 1. تفعيل الإضافات الضرورية لتوليد المعرفات
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. الجداول الأساسية
-- ==============================================================================

-- جدول ملفات المستخدمين والصلاحيات
CREATE TABLE IF NOT EXISTS public.users_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'accountant', 'cashier')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول الأصناف وقطع الغيار
CREATE TABLE IF NOT EXISTS public.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    barcode VARCHAR(100) UNIQUE,
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(100) NOT NULL,
    car_model VARCHAR(255) NOT NULL,
    oem_number VARCHAR(100),
    unit VARCHAR(50) DEFAULT 'قطعة',
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    retail_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    wholesale_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    min_stock NUMERIC(12, 2) NOT NULL DEFAULT 2.00,
    shelf_location VARCHAR(100),
    initial_stock NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول العملاء
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    address TEXT,
    opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- موجب عليه، سالب له
    credit_limit NUMERIC(12, 2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول الموردين
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    address TEXT,
    opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- موجب له، سالب عليه
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول تصنيفات المصروفات
CREATE TABLE IF NOT EXISTS public.expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول فواتير المبيعات
CREATE TABLE IF NOT EXISTS public.sales_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_type VARCHAR(20) DEFAULT 'fixed' CHECK (discount_type IN ('fixed', 'percentage')),
    discount_value NUMERIC(12, 2) DEFAULT 0.00,
    final_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    paid_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    remaining_debt NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    previous_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    balance_after NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
    notes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- بنود فواتير المبيعات
CREATE TABLE IF NOT EXISTS public.sales_invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.items(id),
    item_code VARCHAR(50) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(12, 2) DEFAULT 0.00,
    total NUMERIC(12, 2) NOT NULL
);

-- جدول فواتير المشتريات
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    supplier_name VARCHAR(255) NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_value NUMERIC(12, 2) DEFAULT 0.00,
    final_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    paid_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    remaining_credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    previous_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    balance_after NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    update_cost_price BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
    notes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- بنود فواتير المشتريات
CREATE TABLE IF NOT EXISTS public.purchase_invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.items(id),
    item_code VARCHAR(50) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    total NUMERIC(12, 2) NOT NULL
);

-- جدول المرتجعات (مبيعات ومشتريات)
CREATE TABLE IF NOT EXISTS public.returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_number VARCHAR(50) UNIQUE NOT NULL,
    return_type VARCHAR(50) NOT NULL CHECK (return_type IN ('sale_return', 'purchase_return')),
    original_doc_id UUID,
    original_doc_number VARCHAR(50),
    party_id UUID,
    party_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_amount NUMERIC(12, 2) NOT NULL,
    refunded_cash NUMERIC(12, 2) DEFAULT 0.00,
    credited_to_account NUMERIC(12, 2) DEFAULT 0.00,
    notes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول سندات القبض والصرف
CREATE TABLE IF NOT EXISTS public.receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number VARCHAR(50) UNIQUE NOT NULL,
    receipt_type VARCHAR(50) NOT NULL CHECK (receipt_type IN ('customer_receipt', 'supplier_payment')),
    party_id UUID NOT NULL,
    party_name VARCHAR(255) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    linked_invoice_id UUID,
    linked_invoice_number VARCHAR(50),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول المصروفات
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_number VARCHAR(50) UNIQUE NOT NULL,
    category_id UUID REFERENCES public.expense_categories(id),
    category_name VARCHAR(100) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول تسويات الجرد (زيادة أو عجز)
CREATE TABLE IF NOT EXISTS public.stock_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    adjustment_number VARCHAR(50) UNIQUE NOT NULL,
    item_id UUID NOT NULL REFERENCES public.items(id),
    item_name VARCHAR(255) NOT NULL,
    adjustment_type VARCHAR(20) NOT NULL CHECK (adjustment_type IN ('surplus', 'deficit')),
    quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 3. سجلات الحركة الثلاثية المتزامنة (حجر الأساس لكل الحسابات)
-- ==============================================================================

-- 1. حركة المخزون
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    item_name VARCHAR(255) NOT NULL,
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN ('sale', 'sale_return', 'purchase', 'purchase_return', 'adjustment_in', 'adjustment_out', 'initial')),
    doc_type VARCHAR(50) NOT NULL,
    doc_id UUID NOT NULL,
    doc_number VARCHAR(50) NOT NULL,
    party_name VARCHAR(255),
    quantity_in NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    quantity_out NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    unit_price NUMERIC(12, 2) DEFAULT 0.00,
    running_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. حركة الحسابات (عملاء وموردين)
CREATE TABLE IF NOT EXISTS public.account_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_type VARCHAR(20) NOT NULL CHECK (party_type IN ('customer', 'supplier')),
    party_id UUID NOT NULL,
    party_name VARCHAR(255) NOT NULL,
    movement_type VARCHAR(50) NOT NULL,
    doc_type VARCHAR(50) NOT NULL,
    doc_id UUID NOT NULL,
    doc_number VARCHAR(50) NOT NULL,
    debit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,   -- مدين (عليه)
    credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,  -- دائن (له)
    balance_after NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. حركة الخزينة
CREATE TABLE IF NOT EXISTS public.treasury_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_type VARCHAR(50) NOT NULL,
    doc_type VARCHAR(50) NOT NULL,
    doc_id UUID,
    doc_number VARCHAR(50),
    party_name VARCHAR(255),
    amount_in NUMERIC(12, 2) NOT NULL DEFAULT 0.00,  -- وارد للخزينة
    amount_out NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- منصرف من الخزينة
    balance_after NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول الأرصدة اليومية للخزينة
CREATE TABLE IF NOT EXISTS public.treasury_daily_balance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE UNIQUE NOT NULL,
    opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_in NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_out NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    closing_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول سجل النشاط والرقابة
CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_name VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 4. فهارس تحسين الأداء (Indexes)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_items_code ON public.items(code);
CREATE INDEX IF NOT EXISTS idx_items_barcode ON public.items(barcode);
CREATE INDEX IF NOT EXISTS idx_items_oem ON public.items(oem_number);
CREATE INDEX IF NOT EXISTS idx_items_car_model ON public.items(car_model);

CREATE INDEX IF NOT EXISTS idx_sales_inv_date ON public.sales_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_sales_inv_cust ON public.sales_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchase_inv_date ON public.purchase_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_purchase_inv_supp ON public.purchase_invoices(supplier_id);

CREATE INDEX IF NOT EXISTS idx_stock_mov_item ON public.stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_mov_date ON public.stock_movements(date);
CREATE INDEX IF NOT EXISTS idx_acc_mov_party ON public.account_movements(party_type, party_id);
CREATE INDEX IF NOT EXISTS idx_acc_mov_date ON public.account_movements(date);
CREATE INDEX IF NOT EXISTS idx_treasury_date ON public.treasury_movements(date);

-- ==============================================================================
-- 5. تفعيل سياسات الأمان والحماية (Row Level Security - RLS)
-- ==============================================================================
ALTER TABLE public.users_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasury_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasury_daily_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- سياسات الوصول العام (معدلة للعمل مع تطبيق الويب المتصل بمفتاح Anon / Authenticated)
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN 
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Enable all access for client" ON public.%I', tbl);
        EXECUTE format('CREATE POLICY "Enable all access for client" ON public.%I FOR ALL USING (true) WITH CHECK (true)', tbl);
    END LOOP;
END $$;

-- ==============================================================================
-- 6. دوال العمليات المركبة المتزامنة (Atomic Transaction RPCs)
-- ==============================================================================

-- دالة حفظ فاتورة المبيعات وتحديث الحركات الثلاث في معاملة واحدة
CREATE OR REPLACE FUNCTION public.save_sales_invoice(
    p_invoice_number VARCHAR,
    p_customer_id UUID,
    p_customer_name VARCHAR,
    p_invoice_date DATE,
    p_lines JSONB,
    p_subtotal NUMERIC,
    p_discount_type VARCHAR,
    p_discount_value NUMERIC,
    p_final_total NUMERIC,
    p_paid_cash NUMERIC,
    p_notes TEXT,
    p_created_by VARCHAR
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invoice_id UUID;
    v_line JSONB;
    v_item_id UUID;
    v_qty NUMERIC;
    v_price NUMERIC;
    v_cost NUMERIC;
    v_line_disc NUMERIC;
    v_line_total NUMERIC;
    v_prev_balance NUMERIC := 0.00;
    v_new_debt NUMERIC;
    v_balance_after NUMERIC;
    v_treasury_prev NUMERIC := 0.00;
    v_item_stock NUMERIC := 0.00;
BEGIN
    -- 1. حساب الرصيد السابق للعميل
    IF p_customer_id IS NOT NULL THEN
        SELECT COALESCE(
            (SELECT balance_after FROM public.account_movements 
             WHERE party_id = p_customer_id AND party_type = 'customer' 
             ORDER BY created_at DESC LIMIT 1),
            (SELECT opening_balance FROM public.customers WHERE id = p_customer_id),
            0.00
        ) INTO v_prev_balance;
    END IF;

    v_new_debt := p_final_total - p_paid_cash;
    v_balance_after := v_prev_balance + v_new_debt;

    -- 2. إدراج رأس الفاتورة
    INSERT INTO public.sales_invoices (
        invoice_number, customer_id, customer_name, invoice_date,
        subtotal, discount_type, discount_value, final_total,
        paid_cash, remaining_debt, previous_balance, balance_after,
        status, notes, created_by
    ) VALUES (
        p_invoice_number, p_customer_id, p_customer_name, p_invoice_date,
        p_subtotal, p_discount_type, p_discount_value, p_final_total,
        p_paid_cash, v_new_debt, v_prev_balance, v_balance_after,
        'completed', p_notes, p_created_by
    ) RETURNING id INTO v_invoice_id;

    -- 3. إدراج البنود وحركات المخزون
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := (v_line->>'quantity')::NUMERIC;
        v_price := (v_line->>'unit_price')::NUMERIC;
        v_cost := COALESCE((v_line->>'cost_price')::NUMERIC, 0.00);
        v_line_disc := COALESCE((v_line->>'discount')::NUMERIC, 0.00);
        v_line_total := (v_qty * v_price) - v_line_disc;

        -- حفظ سطر الفاتورة
        INSERT INTO public.sales_invoice_lines (
            invoice_id, item_id, item_code, item_name,
            quantity, unit_price, cost_price, discount, total
        ) VALUES (
            v_invoice_id, v_item_id, v_line->>'item_code', v_line->>'item_name',
            v_qty, v_price, v_cost, v_line_disc, v_line_total
        );

        -- حساب رصيد الصنف الحالي
        SELECT COALESCE(
            (SELECT running_balance FROM public.stock_movements WHERE item_id = v_item_id ORDER BY created_at DESC LIMIT 1),
            (SELECT initial_stock FROM public.items WHERE id = v_item_id),
            0.00
        ) INTO v_item_stock;

        -- تسجيل حركة المخزون
        INSERT INTO public.stock_movements (
            item_id, item_name, movement_type, doc_type, doc_id, doc_number,
            party_name, quantity_in, quantity_out, unit_price, running_balance, date, notes
        ) VALUES (
            v_item_id, v_line->>'item_name', 'sale', 'فاتورة مبيعات', v_invoice_id, p_invoice_number,
            p_customer_name, 0.00, v_qty, v_price, v_item_stock - v_qty, p_invoice_date, 'بيع بـ ' || p_invoice_number
        );
    END LOOP;

    -- 4. تسجيل حركة العميل في account_movements لو فيه أجل
    IF p_customer_id IS NOT NULL AND v_new_debt > 0 THEN
        INSERT INTO public.account_movements (
            party_type, party_id, party_name, movement_type, doc_type, doc_id, doc_number,
            debit, credit, balance_after, date, notes
        ) VALUES (
            'customer', p_customer_id, p_customer_name, 'invoice_debit', 'فاتورة مبيعات', v_invoice_id, p_invoice_number,
            v_new_debt, 0.00, v_balance_after, p_invoice_date, 'مبيعات أجل فاتورة رقم ' || p_invoice_number
        );
    END IF;

    -- 5. تسجيل حركة الخزينة لو فيه نقدية مدفوعة
    IF p_paid_cash > 0 THEN
        SELECT COALESCE(
            (SELECT balance_after FROM public.treasury_movements ORDER BY created_at DESC LIMIT 1),
            0.00
        ) INTO v_treasury_prev;

        INSERT INTO public.treasury_movements (
            movement_type, doc_type, doc_id, doc_number, party_name,
            amount_in, amount_out, balance_after, date, notes, created_by
        ) VALUES (
            'sale_cash', 'فاتورة مبيعات', v_invoice_id, p_invoice_number, p_customer_name,
            p_paid_cash, 0.00, v_treasury_prev + p_paid_cash, p_invoice_date,
            'دفعة نقدية مبيعات فاتورة ' || p_invoice_number, p_created_by
        );
    END IF;

    -- 6. تسجيل في سجل النشاط
    INSERT INTO public.audit_log (user_name, action, entity_type, entity_id, details)
    VALUES (p_created_by, 'إنشاء فاتورة مبيعات', 'sales_invoice', p_invoice_number, 'إجمالي: ' || p_final_total || ' ج.م، مسدد: ' || p_paid_cash);

    RETURN v_invoice_id;
END;
$$;

-- بيانات أولية للمحل لتجربة النظام فوراً
INSERT INTO public.expense_categories (name) VALUES 
('إيجار المحل'), ('كهرباء ومياه'), ('مرتبات عمال'), ('مصاريف شحن ونقل'), ('بوفيه وضيافة'), ('صيانة ومعدات')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.users_profiles (username, full_name, role) VALUES
('admin', 'المدير العام', 'admin'),
('accountant', 'المحاسب المسؤول', 'accountant'),
('cashier', 'كاشير المحل', 'cashier')
ON CONFLICT (username) DO NOTHING;


-- ==============================================================================
-- الحسابات السحابية ومزامنة الأجهزة (AMORY V5)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.cloud_workspaces (
    account_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    version BIGINT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.cloud_workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workspace_select_own" ON public.cloud_workspaces;
DROP POLICY IF EXISTS "workspace_insert_own" ON public.cloud_workspaces;
DROP POLICY IF EXISTS "workspace_update_own" ON public.cloud_workspaces;
DROP POLICY IF EXISTS "workspace_delete_own" ON public.cloud_workspaces;
CREATE POLICY "workspace_select_own" ON public.cloud_workspaces FOR SELECT USING (auth.uid() = account_id);
CREATE POLICY "workspace_insert_own" ON public.cloud_workspaces FOR INSERT WITH CHECK (auth.uid() = account_id);
CREATE POLICY "workspace_update_own" ON public.cloud_workspaces FOR UPDATE USING (auth.uid() = account_id) WITH CHECK (auth.uid() = account_id);
CREATE POLICY "workspace_delete_own" ON public.cloud_workspaces FOR DELETE USING (auth.uid() = account_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cloud_workspaces') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cloud_workspaces;
  END IF;
END $$;

-- انتهى السكريبت بنجاح
`;

export const SUPABASE_FULL_SQL = SUPABASE_SQL_SCHEMA;
