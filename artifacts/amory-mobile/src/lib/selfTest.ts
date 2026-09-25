import { StorageEngine } from './storage';
import { UserProfile } from '../types';

export interface SelfTestResult {
  id: string;
  name: string;
  category: string;
  status: 'pass' | 'fail';
  durationMs: number;
  message?: string;
  details?: string;
}

export interface SelfTestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  allPassed: boolean;
  totalDurationMs: number;
  results: SelfTestResult[];
}

const TEST_ADMIN_USER: UserProfile = {
  id: 'test-admin-1',
  username: 'test_admin',
  full_name: 'مدير الاختبار الذاتي',
  role: 'admin',
  is_active: true,
};

/**
 * Runs all 9 isolated validation scenarios required by Phase 0
 * Uses a completely isolated StorageEngine with prefix 'autoparts_test_' and 'autoparts_test_db'
 * Automatically destroys and cleans up all test data afterwards.
 */
export async function runSelfTests(): Promise<SelfTestSuiteSummary> {
  const startTime = performance.now();
  const results: SelfTestResult[] = [];

  // Create isolated test storage instance
  const testStorage = new StorageEngine('autoparts_test_', 'autoparts_test_db', true);
  await testStorage.ready;

  try {
    // Helper to log test step
    const record = (
      id: string,
      name: string,
      status: 'pass' | 'fail',
      startMs: number,
      message?: string,
      details?: string
    ) => {
      results.push({
        id,
        name,
        category: 'المرحلة 0 - شبكة الأمان',
        status,
        durationMs: Math.round(performance.now() - startMs),
        message,
        details,
      });
    };

    // Prepare fresh test environment
    const items = testStorage.getItems();
    const testItem = items[0];
    if (!testItem) {
      throw new Error('لا توجد أصناف في بيانات التهيئة للاختبار');
    }
    const initialStock = testStorage.calculateItemStock(testItem.id);
    const initialTreasury = testStorage.calculateTreasuryBalance();

    // -------------------------------------------------------------
    // Scenario 1: بيع نقدي كامل
    // -------------------------------------------------------------
    {
      const t0 = performance.now();
      try {
        const sellQty = 2;
        const unitPrice = testItem.retail_price || 150;
        const total = sellQty * unitPrice;

        const inv = testStorage.saveSalesInvoice(
          {
            customer_id: null,
            customer_name: 'عميل نقدي تجريبي',
            invoice_date: new Date().toISOString().split('T')[0],
            lines: [
              {
                id: 'line-1',
                item_id: testItem.id,
                item_code: testItem.code,
                item_name: testItem.name,
                brand: testItem.brand,
                oem_number: testItem.oem_number,
                quantity: sellQty,
                unit_price: unitPrice,
                cost_price: testItem.cost_price || 100,
                discount: 0,
                total: total,
              },
            ],
            subtotal: total,
            discount_type: 'fixed',
            discount_value: 0,
            final_total: total,
            paid_cash: total,
            notes: 'اختبار بيع نقدي كامل',
          },
          TEST_ADMIN_USER
        );

        const newStock = testStorage.calculateItemStock(testItem.id);
        const newTreasury = testStorage.calculateTreasuryBalance();

        const stockOk = Math.abs(newStock - (initialStock - sellQty)) < 0.01;
        const treasuryOk = Math.abs(newTreasury - (initialTreasury + total)) < 0.01;
        const invOk = inv.status === 'completed' && inv.remaining_debt === 0;

        if (stockOk && treasuryOk && invOk) {
          record(
            'test_cash_sale',
            'بيع نقدي كامل',
            'pass',
            t0,
            `خصم المخزون بنجاح (${initialStock} -> ${newStock}) وأضيفت النقدية (${total} ج.م)`
          );
        } else {
          record(
            'test_cash_sale',
            'بيع نقدي كامل',
            'fail',
            t0,
            `فشل التحقق: مخزون (${newStock} vs متوقع ${initialStock - sellQty}), خزينة (${newTreasury} vs متوقع ${initialTreasury + total})`
          );
        }
      } catch (err: any) {
        record('test_cash_sale', 'بيع نقدي كامل', 'fail', t0, err.message);
      }
    }

    // -------------------------------------------------------------
    // Scenario 2: بيع آجل لعميل
    // -------------------------------------------------------------
    let creditInvoiceId = '';
    let testCustomerId = '';
    {
      const t0 = performance.now();
      try {
        const customers = testStorage.getCustomers();
        const cust = customers.find((c) => c.name.includes('العميل') || c.id !== 'cust-4') || customers[0];
        testCustomerId = cust.id;

        const prevCustBal = testStorage.calculateCustomerBalance(cust.id);
        const prevStock = testStorage.calculateItemStock(testItem.id);
        const prevTreasury = testStorage.calculateTreasuryBalance();

        const qty = 1;
        const price = 200;
        const paidCash = 50;
        const expectedDebt = price - paidCash; // 150

        const inv = testStorage.saveSalesInvoice(
          {
            customer_id: cust.id,
            customer_name: cust.name,
            invoice_date: new Date().toISOString().split('T')[0],
            lines: [
              {
                id: 'line-2',
                item_id: testItem.id,
                item_code: testItem.code,
                item_name: testItem.name,
                brand: testItem.brand,
                oem_number: testItem.oem_number,
                quantity: qty,
                unit_price: price,
                cost_price: 120,
                discount: 0,
                total: price * qty,
              },
            ],
            subtotal: price,
            discount_type: 'fixed',
            discount_value: 0,
            final_total: price,
            paid_cash: paidCash,
            notes: 'اختبار بيع آجل',
          },
          TEST_ADMIN_USER
        );

        creditInvoiceId = inv.id;
        const newCustBal = testStorage.calculateCustomerBalance(cust.id);
        const newStock = testStorage.calculateItemStock(testItem.id);
        const newTreasury = testStorage.calculateTreasuryBalance();

        const custOk = Math.abs(newCustBal - (prevCustBal + expectedDebt)) < 0.01;
        const stockOk = Math.abs(newStock - (prevStock - qty)) < 0.01;
        const treasuryOk = Math.abs(newTreasury - (prevTreasury + paidCash)) < 0.01;

        if (custOk && stockOk && treasuryOk) {
          record(
            'test_credit_sale',
            'بيع آجل لعميل',
            'pass',
            t0,
            `أضيف المتبقي (${expectedDebt} ج.م) لرصيد العميل والنقدية (${paidCash} ج.م) للخزينة`
          );
        } else {
          record(
            'test_credit_sale',
            'بيع آجل لعميل',
            'fail',
            t0,
            `خطأ في الحسابات: رصيد عميل ${newCustBal} (متوقع ${prevCustBal + expectedDebt})`
          );
        }
      } catch (err: any) {
        record('test_credit_sale', 'بيع آجل لعميل', 'fail', t0, err.message);
      }
    }

    // -------------------------------------------------------------
    // Scenario 3: مدفوع زائد مع رد باقي
    // -------------------------------------------------------------
    {
      const t0 = performance.now();
      try {
        const prevTreasury = testStorage.calculateTreasuryBalance();
        const total = 100;
        const paidCash = 150; // Extra 50 paid as change to return

        const inv = testStorage.saveSalesInvoice(
          {
            customer_id: null,
            customer_name: 'عميل كاش دفع زيادة',
            invoice_date: new Date().toISOString().split('T')[0],
            lines: [
              {
                id: 'line-3',
                item_id: testItem.id,
                item_code: testItem.code,
                item_name: testItem.name,
                brand: testItem.brand,
                oem_number: testItem.oem_number,
                quantity: 1,
                unit_price: total,
                cost_price: 60,
                discount: 0,
                total: total,
              },
            ],
            subtotal: total,
            discount_type: 'fixed',
            discount_value: 0,
            final_total: total,
            paid_cash: paidCash,
            extra_paid_as_credit: false, // Return change immediately
          },
          TEST_ADMIN_USER
        );

        const newTreasury = testStorage.calculateTreasuryBalance();
        const treasuryOk = Math.abs(newTreasury - (prevTreasury + total)) < 0.01;
        const invOk = inv.remaining_debt === 0;

        if (treasuryOk && invOk) {
          record(
            'test_change_return',
            'مدفوع زائد مع رد باقي',
            'pass',
            t0,
            `تم رد الباقي للعميل واحتساب صافي الفاتورة (${total} ج.م) فقط في الخزينة`
          );
        } else {
          record(
            'test_change_return',
            'مدفوع زائد مع رد باقي',
            'fail',
            t0,
            `الخزينة تأثرت بـ ${newTreasury - prevTreasury} بدلاً من صافي ${total}`
          );
        }
      } catch (err: any) {
        record('test_change_return', 'مدفوع زائد مع رد باقي', 'fail', t0, err.message);
      }
    }

    // -------------------------------------------------------------
    // Scenario 4: إلغاء فاتورة وعودة الأرصدة الثلاثة
    // -------------------------------------------------------------
    {
      const t0 = performance.now();
      try {
        if (!creditInvoiceId || !testCustomerId) {
          throw new Error('لم يتم العثور على الفاتورة الآجلة من السيناريو السابق');
        }
        const prevStock = testStorage.calculateItemStock(testItem.id);
        const prevCustBal = testStorage.calculateCustomerBalance(testCustomerId);
        const prevTreasury = testStorage.calculateTreasuryBalance();

        // Cancel the credit invoice
        testStorage.cancelSalesInvoice(creditInvoiceId, 'اختبار إلغاء الفاتورة بالكامل', TEST_ADMIN_USER);

        const newStock = testStorage.calculateItemStock(testItem.id);
        const newCustBal = testStorage.calculateCustomerBalance(testCustomerId);
        const newTreasury = testStorage.calculateTreasuryBalance();

        const stockRestored = Math.abs(newStock - (prevStock + 1)) < 0.01;
        const custRestored = Math.abs(newCustBal - (prevCustBal - 150)) < 0.01;
        const treasuryRestored = Math.abs(newTreasury - (prevTreasury - 50)) < 0.01;

        if (stockRestored && custRestored && treasuryRestored) {
          record(
            'test_invoice_cancellation',
            'إلغاء فاتورة وعودة الأرصدة الثلاثة',
            'pass',
            t0,
            `عادت الأرصدة الثلاثة بدقة تامة: المخزون (+1)، حساب العميل (-150)، الخزينة (-50)`
          );
        } else {
          record(
            'test_invoice_cancellation',
            'إلغاء فاتورة وعودة الأرصدة الثلاثة',
            'fail',
            t0,
            `فشل استعادة الأرصدة: مخزون (${stockRestored}), عميل (${custRestored}), خزينة (${treasuryRestored})`
          );
        }
      } catch (err: any) {
        record('test_invoice_cancellation', 'إلغاء فاتورة وعودة الأرصدة الثلاثة', 'fail', t0, err.message);
      }
    }

    // -------------------------------------------------------------
    // Scenario 5: بيع أكثر من المتاح يُرفض
    // -------------------------------------------------------------
    {
      const t0 = performance.now();
      try {
        const curStock = testStorage.calculateItemStock(testItem.id);
        // Ensure negative stock is disallowed in settings
        const settings = testStorage.getSettings();
        settings.allow_negative_stock = false;
        testStorage.set('settings', settings);

        const excessiveQty = curStock + 999;
        let rejected = false;
        try {
          testStorage.saveSalesInvoice(
            {
              customer_id: null,
              customer_name: 'محاولة سحب زائد',
              invoice_date: new Date().toISOString().split('T')[0],
              lines: [
                {
                  id: 'line-5',
                  item_id: testItem.id,
                  item_code: testItem.code,
                  item_name: testItem.name,
                  quantity: excessiveQty,
                  unit_price: 100,
                  cost_price: 50,
                  discount: 0,
                  total: excessiveQty * 100,
                },
              ],
              subtotal: excessiveQty * 100,
              discount_type: 'fixed',
              discount_value: 0,
              final_total: excessiveQty * 100,
              paid_cash: excessiveQty * 100,
            },
            TEST_ADMIN_USER
          );
        } catch {
          rejected = true;
        }

        if (rejected) {
          record(
            'test_reject_excess_stock',
            'بيع أكتر من المتاح يُرفض',
            'pass',
            t0,
            `تم رفض العملية فوراً ومنع المخزون السالب بنجاح (المتاح: ${curStock}، المطلوب: ${excessiveQty})`
          );
        } else {
          record(
            'test_reject_excess_stock',
            'بيع أكتر من المتاح يُرفض',
            'fail',
            t0,
            'تم قبول البيع بالرغم من تجاوز الرصيد المتاح وتعطيل البيع بالسالب!'
          );
        }
      } catch (err: any) {
        record('test_reject_excess_stock', 'بيع أكتر من المتاح يُرفض', 'fail', t0, err.message);
      }
    }

    // -------------------------------------------------------------
    // Scenario 6: سند قبض
    // -------------------------------------------------------------
    {
      const t0 = performance.now();
      try {
        const prevCustBal = testStorage.calculateCustomerBalance(testCustomerId);
        const prevTreasury = testStorage.calculateTreasuryBalance();
        const receiptAmount = 250;

        testStorage.saveReceipt(
          {
            receipt_type: 'customer_receipt',
            party_id: testCustomerId,
            party_name: 'عميل اختبار السند',
            amount: receiptAmount,
            date: new Date().toISOString().split('T')[0],
            notes: 'سند قبض تجريبي لاختبار التأثير المحاسبي',
          },
          TEST_ADMIN_USER
        );

        const newCustBal = testStorage.calculateCustomerBalance(testCustomerId);
        const newTreasury = testStorage.calculateTreasuryBalance();

        const custOk = Math.abs(newCustBal - (prevCustBal - receiptAmount)) < 0.01;
        const treasuryOk = Math.abs(newTreasury - (prevTreasury + receiptAmount)) < 0.01;

        if (custOk && treasuryOk) {
          record(
            'test_receipt_voucher',
            'سند قبض',
            'pass',
            t0,
            `خُفض رصيد العميل (${receiptAmount} ج.م) وزادت الخزينة بنفس القيمة`
          );
        } else {
          record(
            'test_receipt_voucher',
            'سند قبض',
            'fail',
            t0,
            `عدم تطابق السند: عميل ${newCustBal} vs ${prevCustBal - receiptAmount}`
          );
        }
      } catch (err: any) {
        record('test_receipt_voucher', 'سند قبض', 'fail', t0, err.message);
      }
    }

    // -------------------------------------------------------------
    // Scenario 7: مرتجع جزئي ثم رفض تجاوز الكمية
    // -------------------------------------------------------------
    {
      const t0 = performance.now();
      try {
        const sellQty = 5;
        const price = 80;
        const total = sellQty * price;

        // Make initial invoice
        const inv = testStorage.saveSalesInvoice(
          {
            customer_id: null,
            customer_name: 'عميل مرتجع تجريبي',
            invoice_date: new Date().toISOString().split('T')[0],
            lines: [
              {
                id: 'line-7',
                item_id: testItem.id,
                item_code: testItem.code,
                item_name: testItem.name,
                quantity: sellQty,
                unit_price: price,
                cost_price: 50,
                discount: 0,
                total: total,
              },
            ],
            subtotal: total,
            discount_type: 'fixed',
            discount_value: 0,
            final_total: total,
            paid_cash: total,
          },
          TEST_ADMIN_USER
        );

        const stockBeforeReturn = testStorage.calculateItemStock(testItem.id);
        const treasuryBeforeReturn = testStorage.calculateTreasuryBalance();

        // 1. Partial return 2 pieces
        const retRecord = testStorage.saveReturn(
          {
            return_type: 'sale_return',
            original_doc_id: inv.id,
            original_doc_number: inv.invoice_number,
            party_id: undefined,
            party_name: inv.customer_name,
            date: new Date().toISOString().split('T')[0],
            lines: [
              {
                id: 'ret-1',
                item_id: testItem.id,
                item_name: testItem.name,
                quantity: 2,
                unit_price: price,
                total: 2 * price,
              },
            ],
            total_amount: 2 * price,
            refunded_cash: 2 * price,
            credited_to_account: 0,
            notes: 'مرتجع جزئي تجريبي سليم',
          },
          TEST_ADMIN_USER
        );

        const stockAfterReturn = testStorage.calculateItemStock(testItem.id);
        const treasuryAfterReturn = testStorage.calculateTreasuryBalance();

        const part1StockOk = Math.abs(stockAfterReturn - (stockBeforeReturn + 2)) < 0.01;
        const part1TreasuryOk = Math.abs(treasuryAfterReturn - (treasuryBeforeReturn - 160)) < 0.01;

        // 2. Try to return 4 pieces (available left is only 3)
        let rejectExceeded = false;
        try {
          testStorage.saveReturn(
            {
              return_type: 'sale_return',
              original_doc_id: inv.id,
              original_doc_number: inv.invoice_number,
              party_id: undefined,
              party_name: inv.customer_name,
              date: new Date().toISOString().split('T')[0],
              lines: [
                {
                  id: 'ret-2',
                  item_id: testItem.id,
                  item_name: testItem.name,
                  quantity: 4, // Exceeds 3!
                  unit_price: price,
                  total: 4 * price,
                },
              ],
              total_amount: 4 * price,
              refunded_cash: 4 * price,
              credited_to_account: 0,
              notes: 'محاولة إرجاع كمية فائضة',
            },
            TEST_ADMIN_USER
          );
        } catch {
          rejectExceeded = true;
        }

        if (part1StockOk && part1TreasuryOk && rejectExceeded && retRecord.status === 'completed') {
          record(
            'test_partial_return_and_limit',
            'مرتجع جزئي ثم رفض تجاوز الكمية',
            'pass',
            t0,
            `تم قبول المرتجع الجزئي (2 ق) وعكس الرصيد والخزينة، ورُفضت بنجاح محاولة إرجاع 4 قطع لتجاوز المتبقي (3 ق)`
          );
        } else {
          record(
            'test_partial_return_and_limit',
            'مرتجع جزئي ثم رفض تجاوز الكمية',
            'fail',
            t0,
            `خلل بالمرتجع: استعادة مخزون (${part1StockOk}), سحب نقدية (${part1TreasuryOk}), رفض الزيادة (${rejectExceeded})`
          );
        }
      } catch (err: any) {
        record('test_partial_return_and_limit', 'مرتجع جزئي ثم رفض تجاوز الكمية', 'fail', t0, err.message);
      }
    }

    // -------------------------------------------------------------
    // Scenario 8: تسوية جرد
    // -------------------------------------------------------------
    {
      const t0 = performance.now();
      try {
        const curStock = testStorage.calculateItemStock(testItem.id);

        // 1. Surplus adjustment +3
        testStorage.saveStockAdjustment(
          {
            item_id: testItem.id,
            item_name: testItem.name,
            adjustment_type: 'surplus',
            quantity: 3,
            cost_price: 50,
            notes: 'زيادة جرد دوري',
            date: new Date().toISOString().split('T')[0],
          },
          TEST_ADMIN_USER
        );
        const stockAfterSurplus = testStorage.calculateItemStock(testItem.id);

        // 2. Deficit adjustment -1
        testStorage.saveStockAdjustment(
          {
            item_id: testItem.id,
            item_name: testItem.name,
            adjustment_type: 'deficit',
            quantity: 1,
            cost_price: 50,
            notes: 'تلف صنف',
            date: new Date().toISOString().split('T')[0],
          },
          TEST_ADMIN_USER
        );
        const stockAfterDeficit = testStorage.calculateItemStock(testItem.id);

        const surplusOk = Math.abs(stockAfterSurplus - (curStock + 3)) < 0.01;
        const deficitOk = Math.abs(stockAfterDeficit - (stockAfterSurplus - 1)) < 0.01;

        if (surplusOk && deficitOk) {
          record(
            'test_stock_adjustment',
            'تسوية جرد',
            'pass',
            t0,
            `تمت إضافة الزيادة (+3) وخصم العجز (-1) وانعكست على بطاقة الصنف بدقة`
          );
        } else {
          record(
            'test_stock_adjustment',
            'تسوية جرد',
            'fail',
            t0,
            `فشل التسوية: زيادة (${surplusOk}), عجز (${deficitOk})`
          );
        }
      } catch (err: any) {
        record('test_stock_adjustment', 'تسوية جرد', 'fail', t0, err.message);
      }
    }

    // -------------------------------------------------------------
    // Scenario 9: نسخة احتياطية ثم استعادة بنفس الأرقام
    // -------------------------------------------------------------
    {
      const t0 = performance.now();
      try {
        const statsBefore = {
          itemsCount: testStorage.getItems().length,
          customersCount: testStorage.getCustomers().length,
          suppliersCount: testStorage.getSuppliers().length,
          salesCount: testStorage.getSalesInvoices().length,
          receiptsCount: testStorage.getReceipts().length,
          treasuryBal: testStorage.calculateTreasuryBalance(),
        };

        const backupJson = testStorage.exportFullBackup();

        // Wipe or modify something
        testStorage.set('customers', []);
        testStorage.set('sales_invoices', []);

        // Restore backup
        const restoreResult = testStorage.importFullBackup(backupJson, TEST_ADMIN_USER);

        const statsAfter = {
          itemsCount: testStorage.getItems().length,
          customersCount: testStorage.getCustomers().length,
          suppliersCount: testStorage.getSuppliers().length,
          salesCount: testStorage.getSalesInvoices().length,
          receiptsCount: testStorage.getReceipts().length,
          treasuryBal: testStorage.calculateTreasuryBalance(),
        };

        const itemsMatch = statsBefore.itemsCount === statsAfter.itemsCount;
        const custMatch = statsBefore.customersCount === statsAfter.customersCount;
        const salesMatch = statsBefore.salesCount === statsAfter.salesCount;
        const treasuryMatch = Math.abs(statsBefore.treasuryBal - statsAfter.treasuryBal) < 0.01;

        if (restoreResult && itemsMatch && custMatch && salesMatch && treasuryMatch) {
          record(
            'test_backup_restore',
            'نسخة احتياطية ثم استعادة بنفس الأرقام',
            'pass',
            t0,
            `تطابقت كافة الأرقام تماماً قبل وبعد الاستعادة (الأصناف: ${statsAfter.itemsCount}، الفواتير: ${statsAfter.salesCount}، الخزينة: ${statsAfter.treasuryBal.toFixed(2)} ج.م)`
          );
        } else {
          record(
            'test_backup_restore',
            'نسخة احتياطية ثم استعادة بنفس الأرقام',
            'fail',
            t0,
            `عدم تطابق الأرقام بعد الاستعادة: أصناف (${itemsMatch}), عملاء (${custMatch}), فواتير (${salesMatch}), خزينة (${treasuryMatch})`
          );
        }
      } catch (err: any) {
        record('test_backup_restore', 'نسخة احتياطية ثم استعادة بنفس الأرقام', 'fail', t0, err.message);
      }
    }
  } finally {
    // ALWAYS destroy isolated test database cleanly
    await testStorage.destroy();
  }

  const passedCount = results.filter((r) => r.status === 'pass').length;
  const failedCount = results.length - passedCount;

  return {
    total: results.length,
    passed: passedCount,
    failed: failedCount,
    allPassed: failedCount === 0,
    totalDurationMs: Math.round(performance.now() - startTime),
    results,
  };
}

/**
 * Synthetic benchmark: generates and tests 50,000 items in isolated IndexedDB storage
 */
export async function runBulk50kItemsBenchmark(
  onProgress?: (percent: number, currentCount: number) => void
): Promise<{ success: boolean; totalItems: number; durationMs: number; memoryEstimate?: string }> {
  const start = performance.now();
  const testStorage = new StorageEngine('autoparts_bench_', 'autoparts_bench_db', true);
  await testStorage.ready;

  try {
    const TOTAL_ITEMS = 50000;
    const CHUNK_SIZE = 5000;
    const generatedItems: any[] = [];
    const stockMovements: any[] = [];

    const now = new Date().toISOString();

    for (let i = 1; i <= TOTAL_ITEMS; i++) {
      const id = `bench-item-${i}`;
      generatedItems.push({
        id,
        part_number: `PARTS-${100000 + i}`,
        barcode: `6221000${String(i).padStart(6, '0')}`,
        name: `صنف تجريبي رقم ${i} فحص الضغط والأداء`,
        category: i % 3 === 0 ? 'مكابح وفحمات' : i % 3 === 1 ? 'فلاتر وزيوت' : 'عفشة ومساعدين',
        car_models: 'تويوتا كورولا / هيونداي النترا / كيا سيراتو',
        cost_price: 100 + (i % 200),
        selling_price: 150 + (i % 250),
        min_stock: 5,
        location: `A-${Math.floor(i / 1000)}-${i % 50}`,
        notes: 'بيانات اختبارية لاختبار قدرة المحرك',
        created_at: now,
      });

      // Stock movement
      stockMovements.push({
        id: `bench-sm-${i}`,
        item_id: id,
        item_name: `صنف تجريبي رقم ${i}`,
        movement_type: 'initial',
        doc_type: 'رصيد افتتاحي تجريبي',
        doc_number: 'BENCH-INIT',
        quantity_in: 20 + (i % 10),
        quantity_out: 0,
        unit_cost: 100,
        balance_after: 20 + (i % 10),
        date: now.split('T')[0],
        notes: 'رصيد تجريبي',
        created_by: 'نظام الفحص',
        created_at: now,
      });

      if (i % CHUNK_SIZE === 0 || i === TOTAL_ITEMS) {
        if (onProgress) {
          onProgress(Math.round((i / TOTAL_ITEMS) * 70), i);
        }
      }
    }

    // Save in batch
    testStorage.batch(() => {
      testStorage.set('items', generatedItems);
      testStorage.set('stock_movements', stockMovements);
    });

    if (onProgress) onProgress(85, TOTAL_ITEMS);

    // Verify fast lookup and stock calculation
    const readItems = testStorage.getItems();
    const countMatch = readItems.length === TOTAL_ITEMS;
    const sampleStock = testStorage.calculateItemStock('bench-item-25000');

    if (onProgress) onProgress(100, TOTAL_ITEMS);

    return {
      success: countMatch && sampleStock > 0,
      totalItems: readItems.length,
      durationMs: Math.round(performance.now() - start),
      memoryEstimate: `${(JSON.stringify(generatedItems).length / (1024 * 1024)).toFixed(1)} MB`,
    };
  } finally {
    await testStorage.destroy();
  }
}
