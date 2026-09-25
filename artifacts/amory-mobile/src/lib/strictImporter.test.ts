import { describe, expect, it } from 'vitest';
import {
  CSV_TEMPLATES,
  detectFileFingerprint,
  parseArabicNumber,
  parseCsvText,
  runStrictImport,
} from './strictImporter';
import { storage } from './storage';

describe('strict importer', () => {
  it('ignores separators inside quoted CSV headers and values', () => {
    const csv = [
      '"اسم الصنف, النوع, التفاصيل";"ملاحظات, إضافية";"سعر البيع"',
      '"فلتر زيت, أصلي, كامل";"مناسب، ممتاز";"25"',
    ].join('\r\n');

    const parsed = parseCsvText(csv);

    expect(parsed.headers).toHaveLength(3);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]['اسم الصنف, النوع, التفاصيل']).toBe('فلتر زيت, أصلي, كامل');
    expect(parsed.rows[0]['ملاحظات, إضافية']).toBe('مناسب، ممتاز');
  });

  it('keeps embedded newlines inside quoted cells', () => {
    const parsed = parseCsvText(
      'اسم الصنف,ملاحظات\r\n"فلتر زيت","سطر أول\r\nسطر ثان"',
    );

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]['ملاحظات']).toBe('سطر أول\r\nسطر ثان');
  });

  it('allows whitespace before quoted cells and reports unclosed quotes', () => {
    const parsed = parseCsvText('اسم الصنف,ملاحظات\n "فلتر, زيت" , "ممتاز"');

    expect(parsed.rows[0]['اسم الصنف']).toBe('فلتر, زيت');
    expect(parsed.rows[0]['ملاحظات']).toBe('ممتاز');
    expect(() => parseCsvText('اسم الصنف,ملاحظات\n"فلتر, زيت')).toThrow('السطر 2');
  });

  it('recognizes Arabic punctuation used as a field separator', () => {
    const parsed = parseCsvText('اسم الصنف؛ملاحظات\nفلتر؛مهم');

    expect(parsed.headers).toHaveLength(2);
    expect(parsed.rows[0]['ملاحظات']).toBe('مهم');
  });

  it('parses Arabic/Persian digits, locale separators, and accounting negatives', () => {
    expect(parseArabicNumber('١٬٢٣٤٫٥٠')).toBe(1234.5);
    expect(parseArabicNumber('۱۲۳')).toBe(123);
    expect(parseArabicNumber('1,234')).toBe(1234);
    expect(parseArabicNumber('12,5')).toBe(12.5);
    expect(parseArabicNumber('(1,234.50)')).toBe(-1234.5);
  });

  it('round-trips each supplied CSV template through the parser', () => {
    for (const type of ['items', 'customers', 'suppliers'] as const) {
      const template = CSV_TEMPLATES[type];
      const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
      const csv = [
        template.headers.map(quote).join(','),
        template.sampleRow.map(quote).join(','),
      ].join('\n');
      const parsed = parseCsvText(csv);

      expect(detectFileFingerprint(parsed.headers, type).type).toBe(type);
      expect(parsed.rows).toHaveLength(1);
    }
  });

  it('saves imported items, customers, and suppliers', async () => {
    await storage.ready;
    const user = storage.getUsers()[0];
    expect(user).toBeDefined();
    if (!user) throw new Error('The test storage was not initialized.');

    const itemResult = await runStrictImport(
      'كود الصنف,اسم الصنف,سعر التكلفة,سعر البيع قطاعي,الرصيد الحالي\nTEST-IMP-001,"وحدة اختبار الاستيراد",12.5,20,3',
      { mode: 'upsert' },
      user,
      undefined,
      'items',
    );
    expect(itemResult.successCount).toBe(1);
    expect(storage.getItems().some((item) => item.code === 'TEST-IMP-001')).toBe(true);

    const customerResult = await runStrictImport(
      'اسم العميل,رقم الهاتف,العنوان,الحد الائتماني,الرصيد الحالي\nعميل اختبار الاستيراد,01098765432,عنوان اختبار,5000,250',
      { mode: 'upsert' },
      user,
      undefined,
      'customers',
    );
    expect(customerResult.successCount).toBe(1);
    expect(storage.getCustomers().some((customer) => customer.name === 'عميل اختبار الاستيراد')).toBe(true);

    const supplierResult = await runStrictImport(
      'اسم المورد,رقم الهاتف,العنوان,الرصيد المستحق له\nمورد اختبار الاستيراد,01198765432,عنوان اختبار,400',
      { mode: 'upsert' },
      user,
      undefined,
      'suppliers',
    );
    expect(supplierResult.successCount).toBe(1);
    expect(storage.getSuppliers().some((supplier) => supplier.name === 'مورد اختبار الاستيراد')).toBe(true);
  });

  it('imports localized stock values and reconciles later imports to the file quantity', async () => {
    await storage.ready;
    const user = storage.getUsers()[0];
    if (!user) throw new Error('The test storage was not initialized.');

    await runStrictImport(
      'كود الصنف,اسم الصنف,كمية المخزون\nSTOCK-LOCALE-001,اختبار كمية محلية,١٬٢٣٤',
      { mode: 'upsert' },
      user,
      undefined,
      'items',
    );
    let importedItem = storage.getItems().find((item) => item.code === 'STOCK-LOCALE-001');
    expect(importedItem?.current_stock).toBe(1234);

    await runStrictImport(
      'كود الصنف,اسم الصنف,الكمية الحالية\nSTOCK-LOCALE-001,اختبار كمية محلية,5',
      { mode: 'upsert' },
      user,
      undefined,
      'items',
    );
    importedItem = storage.getItems().find((item) => item.code === 'STOCK-LOCALE-001');
    expect(importedItem?.current_stock).toBe(5);

    await runStrictImport(
      'كود الصنف,اسم الصنف\nSTOCK-LOCALE-001,اختبار كمية محلية بدون عمود كمية',
      { mode: 'upsert' },
      user,
      undefined,
      'items',
    );
    importedItem = storage.getItems().find((item) => item.code === 'STOCK-LOCALE-001');
    expect(importedItem?.current_stock).toBe(5);
  });

  it('keeps customer debts positive, preserves explicit credit balances, and updates one opening movement', async () => {
    await storage.ready;
    const user = storage.getUsers()[0];
    if (!user) throw new Error('The test storage was not initialized.');

    const debtResult = await runStrictImport(
      'اسم العميل,مديونية\nعميل اختبار رصيد مدين,-250\nعميل اختبار رصيد مدين,-300',
      { mode: 'upsert' },
      user,
      undefined,
      'customers',
    );
    expect(debtResult.duplicateCount).toBe(1);

    const debtor = storage.getCustomers().find((customer) => customer.name === 'عميل اختبار رصيد مدين');
    expect(debtor?.current_balance).toBe(300);
    const debtorMovements = storage.getAccountMovements().filter(
      (movement) => movement.party_id === debtor?.id && movement.movement_type === 'initial',
    );
    expect(debtorMovements).toHaveLength(1);
    expect(debtorMovements[0].debit).toBe(300);
    expect(debtorMovements[0].credit).toBe(0);

    await runStrictImport(
      'اسم العميل,الرصيد الحالي\nعميل اختبار رصيد دائن,-75',
      { mode: 'upsert' },
      user,
      undefined,
      'customers',
    );
    const creditor = storage.getCustomers().find((customer) => customer.name === 'عميل اختبار رصيد دائن');
    expect(creditor?.current_balance).toBe(-75);
    const creditorMovement = storage.getAccountMovements().find(
      (movement) => movement.party_id === creditor?.id && movement.movement_type === 'initial',
    );
    expect(creditorMovement?.debit).toBe(0);
    expect(creditorMovement?.credit).toBe(75);

    await runStrictImport(
      'اسم العميل,الرصيد الحالي\nعميل اختبار رصيد دائن,0',
      { mode: 'upsert' },
      user,
      undefined,
      'customers',
    );
    expect(storage.getCustomers().find((customer) => customer.id === creditor?.id)?.current_balance).toBe(0);
  });

  it('imports supplier payable balances using the supplier sign convention', async () => {
    await storage.ready;
    const user = storage.getUsers()[0];
    if (!user) throw new Error('The test storage was not initialized.');

    await runStrictImport(
      'اسم المورد,الرصيد المستحق له\nمورد اختبار مستحق,400',
      { mode: 'upsert' },
      user,
      undefined,
      'suppliers',
    );
    const supplier = storage.getSuppliers().find((entry) => entry.name === 'مورد اختبار مستحق');
    expect(supplier?.current_balance).toBe(400);
    const movement = storage.getAccountMovements().find(
      (entry) => entry.party_id === supplier?.id && entry.movement_type === 'initial',
    );
    expect(movement?.debit).toBe(0);
    expect(movement?.credit).toBe(400);
  });

  it('continues reporting progress when duplicate rows are skipped', async () => {
    await storage.ready;
    const existingItem = storage.getItems()[0];
    const user = storage.getUsers()[0];

    expect(existingItem).toBeDefined();
    expect(user).toBeDefined();
    if (!existingItem || !user) throw new Error('The test storage was not initialized.');

    const csv = [
      'كود الصنف,اسم الصنف',
      ...Array.from({ length: 20 }, () => `${existingItem.code},"${existingItem.name}"`),
    ].join('\n');
    const progress: number[] = [];

    const summary = await runStrictImport(
      csv,
      { mode: 'skip' },
      user,
      (update) => progress.push(update.processedRows),
      'items',
    );

    expect(summary.duplicateCount).toBe(20);
    expect(summary.successCount).toBe(0);
    expect(progress).toContain(6);
    expect(progress.some((processedRows) => processedRows > 0 && processedRows < 20)).toBe(true);
  });
});