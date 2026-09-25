import { describe, expect, it } from 'vitest';
import {
  CSV_TEMPLATES,
  detectFileFingerprint,
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