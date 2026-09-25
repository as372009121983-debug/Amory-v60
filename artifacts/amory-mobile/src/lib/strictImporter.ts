/**
 * نظام استيراد البيانات (CSV / Excel) - إعادة بناء كاملة
 * ------------------------------------------------------
 * يستبدل النظام القديم بالكامل. مبني حول خريطة أعمدة واحدة لكل نوع بيانات
 * (أصناف / عملاء / موردين) بدل تكرار المنطق في ثلاث كتل منفصلة، مما يقلل
 * احتمال الأخطاء ويسهل الصيانة والاختبار.
 *
 * يقبل بالضبط تنسيق ملفات التصدير الفعلية للمحل:
 *   - الأصناف:  كود الصنف، الباركود، اسم الصنف، الماركة، الموديل، رقم OEM،
 *               الرف، سعر التكلفة، سعر البيع قطاعي، سعر البيع جملة، الرصيد الحالي
 *   - العملاء:  اسم العميل، رقم الهاتف، العنوان، الحد الائتماني، الرصيد الحالي
 *   - الموردين: اسم المورد، رقم الهاتف، العنوان، الرصيد المستحق له
 * كما يقبل رؤوس أعمدة بديلة شائعة (عربي/إنجليزي) عبر نفس خريطة الأعمدة.
 */

import { Item, Customer, Supplier, StockMovement, AccountMovement, UserProfile } from '../types';
import { storage } from './storage';
import { generateSecureId, normalizeArabicText } from './security';
import * as XLSX from 'xlsx';

export type ImportType = 'items' | 'customers' | 'suppliers';

export interface ImportOptions {
  mode: 'upsert' | 'skip' | 'replace';
}

export interface ImportProgress {
  totalRows: number;
  processedRows: number;
  percent: number;
  successCount: number;
  duplicateCount: number;
  errorCount: number;
  currentStage: string;
}

export interface ImportErrorRecord {
  line: number;
  data: Record<string, string>;
  reason: string;
}

export interface ImportResultSummary {
  type: ImportType;
  typeNameAr: string;
  totalRows: number;
  successCount: number;
  duplicateCount: number;
  errorCount: number;
  durationMs: number;
  errors: ImportErrorRecord[];
}

const TYPE_NAME_AR: Record<ImportType, string> = {
  items: 'الأصناف والمنتجات',
  customers: 'العملاء',
  suppliers: 'الموردين',
};

// ============================================================================
// قوالب التصدير/الاستيراد القياسية (مطابقة لملفات المحل الفعلية)
// ============================================================================

export const CSV_TEMPLATES = {
  items: {
    filename: 'منتجات_استيراد_العموري.csv',
    title: 'قالب استيراد المنتجات وقطع الغيار',
    headers: [
      'كود الصنف',
      'الباركود',
      'اسم الصنف',
      'الماركة',
      'الموديل',
      'رقم OEM',
      'الرف',
      'سعر التكلفة',
      'سعر البيع قطاعي',
      'سعر البيع جملة',
      'الرصيد الحالي',
      'حد أدنى',
      'الفئة',
      'الوحدة',
    ],
    sampleRow: [
      'TY-04465',
      '622100234501',
      'طقم تيل فرامل أمامي سيراميك',
      'Bosch (ألماني)',
      'تويوتا كورولا 2014 - 2021',
      '04465-02220',
      'الرف A-12',
      '650.0',
      '880.0',
      '780.0',
      '18',
      '4',
      'فرامل',
      'طقم',
    ],
  },
  customers: {
    filename: 'عملاء_استيراد.csv',
    title: 'قالب استيراد العملاء',
    headers: ['اسم العميل', 'رقم الهاتف', 'العنوان', 'الحد الائتماني', 'الرصيد الحالي'],
    sampleRow: ['الورشة الفنية الحديثة (المهندس أحمد)', '01012345678', 'شارع الجمهورية - الحرفيين', '5000', '900.0'],
  },
  suppliers: {
    filename: 'موردين_استيراد.csv',
    title: 'قالب استيراد الموردين',
    headers: ['اسم المورد', 'رقم الهاتف', 'العنوان', 'الرصيد المستحق له'],
    sampleRow: ['شركة الصفا لتوريد قطع الغيار الأصلية', '01123456789', 'التوفيقية - وسط البلد', '0.0'],
  },
};

export function downloadCsvTemplate(type: ImportType) {
  const tpl = CSV_TEMPLATES[type];
  const csvContent = '\uFEFF' + [tpl.headers.join(','), tpl.sampleRow.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = tpl.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================================================================
// أدوات تطبيع النصوص والأرقام
// ============================================================================

/** يحول ٠-٩ العربية إلى 0-9 ويزيل رموز العملة/الفواصل، ويتعامل مع علامات الفراغ مثل "-" */
export function parseArabicNumber(val: any, defaultVal = 0): number {
  if (val === undefined || val === null || val === '') return defaultVal;
  let str = String(val).trim();
  if (['-', '--', '---', 'n/a', 'null', 'undefined', ''].includes(str.toLowerCase())) {
    return defaultVal;
  }
  str = str.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
  str = str.replace(/ج\.م|egp|usd|\$|€|£/gi, '').replace(/[,،\s]/g, '');
  if (str === '' || str === '.') return defaultVal;
  const num = parseFloat(str);
  if (!Number.isFinite(num)) return defaultVal;
  if (Math.abs(num) < 0.0001) return 0;
  const rounded = Math.round(num * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

/** يطبّع مفتاح عمود (رأس الجدول) لمقارنة مرنة بلا حساسية لصيغة الهمزة/التاء المربوطة/الفراغات */
export function cleanKey(k: string): string {
  if (!k) return '';
  return normalizeArabicText(k)
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/[_\s\-\/]+/g, '_')
    .toLowerCase();
}

const EMPTY_MARKERS = new Set([
  '-',
  '--',
  '---',
  'لا يوجد',
  'لايوجد',
  'غير محدد',
  'بدون',
  'n/a',
  'null',
  'undefined',
]);

/** يحوّل علامات الفراغ الشائعة في تصدير المحلات (مثل "-") إلى نص فارغ فعلي */
export function cleanVal(val: any): string {
  if (val === undefined || val === null) return '';
  const trimmed = String(val).trim();
  if (EMPTY_MARKERS.has(trimmed) || EMPTY_MARKERS.has(trimmed.toLowerCase())) return '';
  return trimmed;
}

// ============================================================================
// قراءة الملف: كشف الترميز تلقائيًا (UTF-8 / UTF-16 / Windows-1256) أو تحويل Excel
// ============================================================================

export async function decodeImportFile(file: File): Promise<{ text: string; sourceFormat: 'csv' | 'xlsx' }> {
  const lower = file.name.toLowerCase();
  const isXlsx =
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel';

  if (isXlsx) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('ملف Excel لا يحتوي على أي ورقة بيانات.');
    const sheet = workbook.Sheets[sheetName];
    const text = XLSX.utils.sheet_to_csv(sheet, { FS: ',', RS: '\n', blankrows: false });
    if (!text.trim()) throw new Error('ملف Excel فارغ أو لا يحتوي على بيانات.');
    return { text, sourceFormat: 'xlsx' };
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) throw new Error('الملف فارغ.');

  let encoding = 'utf-8';
  let offset = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    encoding = 'utf-8';
    offset = 3;
  } else if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = 'utf-16le';
    offset = 2;
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = 'utf-16be';
    offset = 2;
  } else {
    // لا يوجد BOM: تخمين UTF-16 من كثافة البايتات الصفرية
    const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
    let evenNul = 0;
    let oddNul = 0;
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) {
        if (i % 2 === 0) evenNul++;
        else oddNul++;
      }
    }
    if (oddNul > sample.length * 0.15) encoding = 'utf-16le';
    else if (evenNul > sample.length * 0.15) encoding = 'utf-16be';
  }

  let text: string;
  try {
    text = new TextDecoder(encoding as any, { fatal: false }).decode(bytes.subarray(offset));
  } catch {
    text = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(offset));
  }

  // إذا ظهرت رموز فساد ترميز كثيرة ولم يظهر نص عربي متوقع، جرّب Windows-1256 كبديل
  const looksBroken = (text.match(/\uFFFD/g)?.length || 0) > 3 && !/[ء-ي]/.test(text);
  if (looksBroken) {
    try {
      const fallback = new TextDecoder('windows-1256', { fatal: false }).decode(bytes.subarray(offset));
      if ((fallback.match(/\uFFFD/g)?.length || 0) < (text.match(/\uFFFD/g)?.length || 0)) text = fallback;
    } catch {
      /* windows-1256 غير مدعوم في هذه البيئة، تجاهل */
    }
  }

  return { text: text.replace(/^\uFEFF/, ''), sourceFormat: 'csv' };
}

// ============================================================================
// محلل CSV: يدعم الفواصل (, ; Tab |) والاقتباس والأسطر متعددة الأسطر داخل الحقل
// ============================================================================

const CSV_DELIMITERS = [',', ';', '\t', '|', '،', '؛'] as const;

function detectCsvDelimiter(text: string): (typeof CSV_DELIMITERS)[number] {
  const counts = new Map<(typeof CSV_DELIMITERS)[number], number>(
    CSV_DELIMITERS.map((candidate) => [candidate, 0]),
  );
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes) {
      if (char === '\r' || char === '\n') break;
      if (counts.has(char as (typeof CSV_DELIMITERS)[number])) {
        const candidate = char as (typeof CSV_DELIMITERS)[number];
        counts.set(candidate, (counts.get(candidate) || 0) + 1);
      }
    }
  }

  let selected: (typeof CSV_DELIMITERS)[number] = ',';
  let bestCount = 0;
  for (const candidate of CSV_DELIMITERS) {
    const count = counts.get(candidate) || 0;
    if (count > bestCount) {
      selected = candidate;
      bestCount = count;
    }
  }
  return selected;
}

export function parseCsvText(rawText: string): { headers: string[]; rows: Record<string, string>[] } {
  const text = rawText.replace(/^\uFEFF/, '');
  if (!text.trim()) return { headers: [], rows: [] };

  const delimiter = detectCsvDelimiter(text);

  const rawRows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let currentLine = 1;
  let openingQuoteLine = 1;

  const pushField = () => {
    currentRow.push(currentField.trim());
    currentField = '';
  };
  const pushRow = () => {
    pushField();
    if (currentRow.some((f) => f.length > 0)) rawRows.push(currentRow);
    currentRow = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
      if (ch === '\n') currentLine++;
      continue;
    }

    if (ch === '"' && currentField.trim() === '') {
      currentField = '';
      openingQuoteLine = currentLine;
      inQuotes = true;
    } else if (ch === delimiter) {
      pushField();
    } else if (ch === '\r') {
      // يُعالَج مع \n
    } else if (ch === '\n') {
      pushRow();
      currentLine++;
    } else {
      currentField += ch;
    }
  }
  if (inQuotes) {
    throw new Error(`علامة اقتباس غير مكتملة في الملف عند السطر ${openingQuoteLine}.`);
  }
  if (currentField.length > 0 || currentRow.length > 0) pushRow();

  if (rawRows.length === 0) return { headers: [], rows: [] };

  const rawHeaders = rawRows[0].map((h) => h.replace(/^\uFEFF/, '').trim());
  const cleanHeaders = rawHeaders.map(cleanKey);

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < rawRows.length; r++) {
    const rowData = rawRows[r];
    const obj: Record<string, string> = {};
    for (let idx = 0; idx < rawHeaders.length; idx++) {
      const val = rowData[idx] !== undefined ? rowData[idx].trim() : '';
      const cKey = cleanHeaders[idx];
      const rKey = rawHeaders[idx];
      if (cKey) obj[cKey] = val;
      if (rKey && rKey !== cKey) obj[rKey] = val;
    }
    rows.push(obj);
  }

  return { headers: cleanHeaders, rows };
}

/** يبحث عن قيمة أول عمود متطابق من عدة أسماء بديلة محتملة لنفس الحقل */
function getCol(row: Record<string, string>, keys: readonly string[]): string {
  for (const k of keys) {
    const ck = cleanKey(k);
    if (row[ck] !== undefined && row[ck] !== '') return row[ck];
    if (row[k] !== undefined && row[k] !== '') return row[k];
  }
  return '';
}

// ============================================================================
// خرائط الأعمدة لكل نوع بيانات: الاسم القياسي في ملفات المحل أولًا، ثم البدائل
// ============================================================================

const ITEM_COLUMNS = {
  code: ['كود الصنف', 'كود القطعة', 'رقم الصنف', 'رقم القطعة', 'كود', 'الكود', 'code', 'item_code', 'part_number', 'part_no'],
  barcode: ['الباركود', 'باركود', 'كود الباركود', 'رقم الباركود', 'barcode'],
  name: ['اسم الصنف', 'الاسم', 'اسم', 'الصنف', 'اسم المنتج', 'المنتج', 'بيان الصنف', 'الوصف', 'name', 'item_name', 'product_name'],
  brand: ['الماركة', 'ماركة', 'الشركة', 'المصنع', 'الشركة المصنعة', 'brand', 'make', 'manufacturer'],
  carModel: ['الموديل', 'موديل', 'موديل السيارة', 'موديلات السيارات', 'السيارات', 'السيارة', 'نوع السيارة', 'car_model', 'car_models', 'model'],
  oem: ['رقم OEM', 'oem', 'oem_number', 'كود oem', 'رقم القطعة الأصلي', 'رقم القطعة الاصلي', 'الاصلي', 'الأصلي'],
  location: ['الرف', 'رف', 'مكان التخزين', 'الموقع', 'موقع', 'مكان الصنف', 'اللوكيشن', 'shelf', 'shelf_location', 'location'],
  costPrice: ['سعر التكلفة', 'سعر التكلفه', 'التكلفة', 'التكلفه', 'سعر الشراء', 'سعر شراء', 'الشراء', 'شراء', 'تكلفة الوحدة', 'cost_price', 'purchase_price', 'cost'],
  retailPrice: ['سعر البيع قطاعي', 'سعر البيع قطاعى', 'سعر بيع قطاعي', 'قطاعي', 'قطاعى', 'سعر البيع', 'سعر بيع', 'البيع', 'بيع', 'retail_price', 'selling_price', 'price'],
  wholesalePrice: ['سعر البيع جملة', 'سعر البيع جمله', 'سعر بيع جملة', 'بيع جملة', 'سعر الجملة', 'سعر الجمله', 'الجملة', 'الجمله', 'جملة', 'جمله', 'wholesale_price'],
  minSellingPrice: ['اقل سعر بيع', 'أقل سعر بيع', 'اقل سعر', 'أقل سعر', 'min_selling_price'],
  maxSellingPrice: ['اعلى سعر بيع', 'اعلي سعر بيع', 'أعلى سعر بيع', 'اعلى سعر', 'أعلى سعر', 'max_selling_price'],
  stock: ['الرصيد الحالي', 'الرصيد الحالى', 'رصيد حالي', 'الرصيد', 'رصيد', 'الكمية', 'الكميه', 'كمية', 'كميه', 'العدد', 'عدد', 'المخزون', 'مخزون', 'رصيد أول المدة', 'رصيد اول المدة', 'initial_stock', 'current_stock', 'quantity', 'qty', 'stock', 'balance'],
  minStock: ['حد أدنى', 'حد ادنى', 'حد ادني', 'الحد الادنى', 'الحد الادني', 'الحد الأدنى', 'حد الطلب', 'min_stock'],
  category: ['الفئة', 'الفئه', 'فئة', 'فئه', 'القسم', 'قسم', 'التصنيف', 'تصنيف', 'المجموعة', 'category'],
  unit: ['الوحدة', 'الوحده', 'وحدة', 'وحده', 'unit'],
  notes: ['الملاحظات', 'ملاحظات', 'البيان', 'بيان', 'notes', 'description'],
} as const;

const PARTY_COLUMNS = {
  customers: {
    name: ['اسم العميل', 'الاسم', 'اسم', 'العميل', 'name'],
    phone: ['رقم الهاتف', 'الهاتف', 'هاتف', 'الموبايل', 'موبايل', 'تليفون', 'التليفون', 'الجوال', 'phone'],
    address: ['العنوان', 'عنوان', 'الموقع', 'موقع', 'البلد', 'المدينة', 'address', 'location'],
    balance: ['الرصيد الحالي', 'الرصيد الحالى', 'الرصيد', 'رصيد', 'الرصيد الافتتاحي', 'رصيد افتتاحي', 'opening_balance', 'initial_balance', 'balance'],
    creditLimit: ['الحد الائتماني', 'حد الائتمان', 'حد ائتماني', 'سقف الائتمان', 'credit_limit'],
    notes: ['الملاحظات', 'ملاحظات', 'البيان', 'بيان', 'notes'],
  },
  suppliers: {
    name: ['اسم المورد', 'الاسم', 'اسم', 'المورد', 'name'],
    phone: ['رقم الهاتف', 'الهاتف', 'هاتف', 'الموبايل', 'موبايل', 'تليفون', 'التليفون', 'الجوال', 'phone'],
    address: ['العنوان', 'عنوان', 'الموقع', 'موقع', 'البلد', 'المدينة', 'address', 'location'],
    balance: ['الرصيد المستحق له', 'الرصيد الحالي', 'الرصيد الحالى', 'الرصيد', 'رصيد', 'الرصيد الافتتاحي', 'رصيد افتتاحي', 'opening_balance', 'initial_balance', 'balance'],
    notes: ['الملاحظات', 'ملاحظات', 'البيان', 'بيان', 'notes'],
  },
} as const;

// ============================================================================
// كشف نوع الملف تلقائيًا من رؤوس الأعمدة
// ============================================================================

export function detectFileFingerprint(
  headers: string[],
  fallbackType?: ImportType
): { type: ImportType; typeNameAr: string } {
  const hSet = new Set(headers.map(cleanKey));

  const customerSpecific = ['اسم العميل', 'العميل', 'عميل', 'الحد الائتماني', 'حد الائتمان', 'كود العميل', 'نوع العميل', 'مديونية', 'سقف الائتمان', 'تليفون العميل'].map(cleanKey);
  const supplierSpecific = ['اسم المورد', 'المورد', 'مورد', 'كود المورد', 'الرقم الضريبي', 'رقم تسجيل ضريبي', 'اسم المسؤول', 'الرصيد المستحق له', 'تليفون المورد'].map(cleanKey);
  const itemSpecific = [
    'كود الصنف', 'اسم الصنف', 'سعر الشراء', 'سعر البيع', 'سعر البيع قطاعي', 'سعر البيع جملة',
    'سعر التكلفة', 'كود القطعة', 'الباركود', 'رقم oem', 'الرف', 'اقل سعر بيع', 'اعلى سعر بيع',
    'الموديل', 'الماركة',
  ].map(cleanKey);

  const hasCust = customerSpecific.some((k) => hSet.has(k));
  const hasSupp = supplierSpecific.some((k) => hSet.has(k));
  const hasItem = itemSpecific.some((k) => hSet.has(k));

  // تطابق واضح لا لبس فيه
  if (hasItem && !hasCust && !hasSupp) return { type: 'items', typeNameAr: TYPE_NAME_AR.items };
  if (hasCust && !hasItem && !hasSupp) return { type: 'customers', typeNameAr: TYPE_NAME_AR.customers };
  if (hasSupp && !hasItem && !hasCust) return { type: 'suppliers', typeNameAr: TYPE_NAME_AR.suppliers };

  // تنسيق عام لبيانات طرف (اسم، هاتف، عنوان، رصيد) بدون أعمدة أصناف مميزة
  const partyKeywords = ['الاسم', 'اسم', 'الهاتف', 'هاتف', 'رقم الهاتف', 'الموبايل', 'العنوان', 'عنوان', 'الموقع', 'الرصيد', 'رصيد', 'الرصيد الحالي', 'الملاحظات', 'ملاحظات'].map(cleanKey);
  const partyMatches = partyKeywords.filter((k) => hSet.has(k)).length;
  if (partyMatches >= 2 && !hasItem) {
    if (fallbackType === 'suppliers' || hasSupp) return { type: 'suppliers', typeNameAr: TYPE_NAME_AR.suppliers };
    return { type: 'customers', typeNameAr: TYPE_NAME_AR.customers };
  }

  // إذا كانت الوجهة محددة يدويًا من التبويب المفتوح (أصناف/عملاء/موردين)، اعتمد عليها كحل أخير
  if (fallbackType) {
    return { type: fallbackType, typeNameAr: TYPE_NAME_AR[fallbackType] };
  }

  throw new Error(
    'تعذر تحديد نوع الملف بدقة.\nتأكد أن الملف يحتوي على أحد القوالب المعتمدة:\n' +
      '• للمنتجات: اسم الصنف، كود الصنف، سعر التكلفة، سعر البيع قطاعي، الرصيد الحالي، الرف...\n' +
      '• للعملاء أو الموردين: الاسم، الهاتف، العنوان، الرصيد'
  );
}

// ============================================================================
// المحرك الرئيسي للاستيراد
// ============================================================================

const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function makeInitialMovementDoc(id: string): string {
  return `OPEN-${id.slice(-4)}`;
}

export async function runStrictImport(
  rawCsvText: string,
  options: ImportOptions,
  user: UserProfile,
  onProgress?: (progress: ImportProgress) => void,
  targetType?: ImportType
): Promise<ImportResultSummary> {
  const startTime = performance.now();
  const { headers, rows } = parseCsvText(rawCsvText);

  if (rows.length === 0) {
    throw new Error('الملف فارغ أو لا يحتوي على أي صفوف بيانات بعد صف العناوين.');
  }

  const { type, typeNameAr } = targetType
    ? { type: targetType, typeNameAr: TYPE_NAME_AR[targetType] }
    : detectFileFingerprint(headers, targetType);

  const errors: ImportErrorRecord[] = [];
  let successCount = 0;
  let duplicateCount = 0;

  const PROGRESS_STEP = Math.max(5, Math.min(50, Math.floor(rows.length / 50)));
  const nowIso = new Date().toISOString();
  const todayDate = nowIso.split('T')[0];

  const reportProgress = async (i: number, stage: string, percent?: number) => {
    if (i % PROGRESS_STEP !== 0 && i !== rows.length - 1) return;
    if (onProgress) {
      onProgress({
        totalRows: rows.length,
        processedRows: i + 1,
        percent: percent ?? Math.min(95, Math.round(((i + 1) / rows.length) * 100)),
        successCount,
        duplicateCount,
        errorCount: errors.length,
        currentStage: stage,
      });
    }
    await yieldToMain();
  };

  if (onProgress) {
    onProgress({
      totalRows: rows.length,
      processedRows: 0,
      percent: 0,
      successCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      currentStage: `بدء استيراد ${typeNameAr} (${rows.length.toLocaleString('ar-EG')} سجل)...`,
    });
    await yieldToMain();
  }

  // --------------------------------------------------------------------------
  // استيراد الأصناف
  // --------------------------------------------------------------------------
  if (type === 'items') {
    let existingItems = storage.getItems();
    let existingStockMovements = storage.getStockMovements();
    if (options.mode === 'replace') {
      existingItems = [];
      existingStockMovements = [];
    }

    const itemByCode = new Map<string, Item>();
    const itemByName = new Map<string, Item>();
    existingItems.forEach((it) => {
      if (it.code) itemByCode.set(cleanKey(it.code), it);
      if (it.oem_number) itemByCode.set(cleanKey(it.oem_number), it);
      if (it.barcode) itemByCode.set(cleanKey(it.barcode), it);
      itemByName.set(cleanKey(it.name), it);
    });

    const newItems: Item[] = [];
    const newMovements: StockMovement[] = [];

    for (let i = 0; i < rows.length; i++) {
      const lineNum = i + 2;
      const row = rows[i];
      try {
        const name = cleanVal(getCol(row, ITEM_COLUMNS.name));
        if (!name) {
          errors.push({ line: lineNum, data: row, reason: 'اسم الصنف إجباري ومفقود' });
          await reportProgress(i, `جاري معالجة الأصناف (${(i + 1).toLocaleString('ar-EG')} من ${rows.length.toLocaleString('ar-EG')})...`);
          continue;
        }

        const code = cleanVal(getCol(row, ITEM_COLUMNS.code));
        const barcode = cleanVal(getCol(row, ITEM_COLUMNS.barcode));
        const brand = cleanVal(getCol(row, ITEM_COLUMNS.brand));
        const carModel = cleanVal(getCol(row, ITEM_COLUMNS.carModel));
        const oemNumber = cleanVal(getCol(row, ITEM_COLUMNS.oem));
        const location = cleanVal(getCol(row, ITEM_COLUMNS.location));
        const category = cleanVal(getCol(row, ITEM_COLUMNS.category));
        const unit = cleanVal(getCol(row, ITEM_COLUMNS.unit)) || 'قطعة';
        const notes = cleanVal(getCol(row, ITEM_COLUMNS.notes));

        const costPrice = parseArabicNumber(getCol(row, ITEM_COLUMNS.costPrice), 0);
        const retailPrice = parseArabicNumber(getCol(row, ITEM_COLUMNS.retailPrice), 0);
        const wholesalePrice = parseArabicNumber(getCol(row, ITEM_COLUMNS.wholesalePrice), retailPrice);
        const minSellingPrice = parseArabicNumber(getCol(row, ITEM_COLUMNS.minSellingPrice), 0);
        const maxSellingPrice = parseArabicNumber(getCol(row, ITEM_COLUMNS.maxSellingPrice), 0);
        const initialStock = parseArabicNumber(getCol(row, ITEM_COLUMNS.stock), 0);
        const minStock = parseArabicNumber(getCol(row, ITEM_COLUMNS.minStock), 0);

        const codeKey = code ? cleanKey(code) : null;
        const oemKey = oemNumber ? cleanKey(oemNumber) : null;
        const barcodeKey = barcode ? cleanKey(barcode) : null;
        const nameKey = cleanKey(name);
        const existingMatch =
          (codeKey && itemByCode.get(codeKey)) ||
          (oemKey && itemByCode.get(oemKey)) ||
          (barcodeKey && itemByCode.get(barcodeKey)) ||
          itemByName.get(nameKey);

        if (existingMatch) {
          duplicateCount++;
          if (options.mode === 'skip') {
            await reportProgress(i, `جاري معالجة الأصناف (${(i + 1).toLocaleString('ar-EG')} من ${rows.length.toLocaleString('ar-EG')})...`);
            continue;
          }
          if (options.mode === 'upsert') {
            existingMatch.name = name;
            if (code) existingMatch.code = code;
            if (oemNumber) existingMatch.oem_number = oemNumber;
            else if (code && !existingMatch.oem_number) existingMatch.oem_number = code;
            if (barcode) existingMatch.barcode = barcode;
            if (brand) existingMatch.brand = brand;
            if (carModel) {
              existingMatch.car_model = carModel;
              existingMatch.car_models = [carModel];
            }
            if (category) existingMatch.category = category;
            if (location) existingMatch.shelf_location = location;
            if (costPrice > 0) existingMatch.cost_price = costPrice;
            if (retailPrice > 0) existingMatch.retail_price = retailPrice;
            if (wholesalePrice > 0) existingMatch.wholesale_price = wholesalePrice;
            if (minSellingPrice > 0) existingMatch.min_selling_price = minSellingPrice;
            if (maxSellingPrice > 0) existingMatch.max_selling_price = maxSellingPrice;
            if (minStock >= 0) existingMatch.min_stock = minStock;
            if (notes) existingMatch.notes = notes;
            existingMatch.initial_stock = initialStock;

            const existingMvt = existingStockMovements.find(
              (m) => m.item_id === existingMatch.id && m.movement_type === 'initial'
            );
            if (existingMvt) {
              existingMvt.quantity_in = initialStock;
              existingMvt.unit_price = costPrice > 0 ? costPrice : existingMvt.unit_price;
              existingMvt.running_balance = initialStock;
            } else if (initialStock > 0) {
              newMovements.push({
                id: generateSecureId('sm-init'),
                item_id: existingMatch.id,
                item_name: name,
                movement_type: 'initial',
                doc_type: 'رصيد أول المدة',
                doc_id: existingMatch.id,
                doc_number: `INIT-${existingMatch.code}`,
                party_name: 'جرد افتتاحي',
                quantity_in: initialStock,
                quantity_out: 0,
                unit_price: costPrice,
                running_balance: initialStock,
                date: todayDate,
                notes: 'استيراد رصيد افتتاحي عبر ملف',
                created_at: nowIso,
              });
            }
            successCount++;
            await reportProgress(i, `جاري معالجة الأصناف (${(i + 1).toLocaleString('ar-EG')} من ${rows.length.toLocaleString('ar-EG')})...`);
            continue;
          }
        }

        const newId = generateSecureId('item');
        const itemCode = code || `ITM-${String(i + 1).padStart(5, '0')}`;
        const newItem: Item = {
          id: newId,
          code: itemCode,
          barcode,
          name,
          brand,
          car_model: carModel,
          car_models: carModel ? [carModel] : undefined,
          oem_number: oemNumber || code || '',
          unit,
          cost_price: costPrice,
          retail_price: retailPrice,
          wholesale_price: wholesalePrice || retailPrice,
          min_stock: minStock,
          shelf_location: location,
          initial_stock: initialStock,
          category: category || undefined,
          min_selling_price: minSellingPrice > 0 ? minSellingPrice : undefined,
          max_selling_price: maxSellingPrice > 0 ? maxSellingPrice : undefined,
          notes: notes || undefined,
          created_at: nowIso,
        };

        newItems.push(newItem);
        if (codeKey) itemByCode.set(codeKey, newItem);
        if (oemKey) itemByCode.set(oemKey, newItem);
        if (barcodeKey) itemByCode.set(barcodeKey, newItem);
        itemByName.set(nameKey, newItem);

        if (initialStock > 0) {
          newMovements.push({
            id: generateSecureId('sm-init'),
            item_id: newId,
            item_name: name,
            movement_type: 'initial',
            doc_type: 'رصيد أول المدة',
            doc_id: newId,
            doc_number: `INIT-${itemCode}`,
            party_name: 'جرد افتتاحي',
            quantity_in: initialStock,
            quantity_out: 0,
            unit_price: costPrice,
            running_balance: initialStock,
            date: todayDate,
            notes: 'استيراد رصيد افتتاحي عبر ملف',
            created_at: nowIso,
          });
        }
        successCount++;
      } catch (rowErr: any) {
        errors.push({ line: lineNum, data: row, reason: `خطأ في معالجة السطر: ${rowErr?.message || String(rowErr)}` });
      }
      await reportProgress(i, `جاري معالجة الأصناف (${(i + 1).toLocaleString('ar-EG')} من ${rows.length.toLocaleString('ar-EG')})...`);
    }

    if (onProgress) {
      onProgress({ totalRows: rows.length, processedRows: rows.length, percent: 98, successCount, duplicateCount, errorCount: errors.length, currentStage: 'جاري الحفظ الآمن في قاعدة البيانات...' });
    }
    await yieldToMain();

    storage.batch(() => {
      storage.set('items', [...existingItems, ...newItems]);
      storage.set('stock_movements', [...existingStockMovements, ...newMovements]);
    });
  }

  // --------------------------------------------------------------------------
  // استيراد العملاء أو الموردين (منطق مشترك، فرق فقط في اسم الجدول ونوع الطرف)
  // --------------------------------------------------------------------------
  else {
    const partyType: 'customer' | 'supplier' = type === 'customers' ? 'customer' : 'supplier';
    const cols = type === 'customers' ? PARTY_COLUMNS.customers : PARTY_COLUMNS.suppliers;

    let existingParties: (Customer | Supplier)[] =
      type === 'customers' ? storage.getCustomers() : storage.getSuppliers();
    let existingAccMovements = storage.getAccountMovements();
    if (options.mode === 'replace') existingParties = [];

    const byName = new Map<string, Customer | Supplier>();
    const byPhone = new Map<string, Customer | Supplier>();
    existingParties.forEach((p) => {
      byName.set(cleanKey(p.name), p);
      if (p.phone) byPhone.set(cleanKey(p.phone), p);
    });

    const newParties: (Customer | Supplier)[] = [];
    const newAccMovements: AccountMovement[] = [];

    for (let i = 0; i < rows.length; i++) {
      const lineNum = i + 2;
      const row = rows[i];
      try {
        const name = cleanVal(getCol(row, cols.name));
        if (!name) {
          errors.push({ line: lineNum, data: row, reason: `اسم ${type === 'customers' ? 'العميل' : 'المورد'} إجباري ومفقود` });
          await reportProgress(i, `جاري معالجة ${typeNameAr} (${(i + 1).toLocaleString('ar-EG')} من ${rows.length.toLocaleString('ar-EG')})...`);
          continue;
        }
        const phone = cleanVal(getCol(row, cols.phone));
        const address = cleanVal(getCol(row, cols.address));
        const notes = cleanVal(getCol(row, cols.notes));
        const balance = parseArabicNumber(getCol(row, cols.balance), 0);
        const creditLimit =
          type === 'customers' ? parseArabicNumber(getCol(row, (cols as typeof PARTY_COLUMNS.customers).creditLimit), 0) : 0;

        const nameKey = cleanKey(name);
        const phoneKey = phone ? cleanKey(phone) : null;
        const existingMatch = byName.get(nameKey) || (phoneKey ? byPhone.get(phoneKey) : undefined);

        const buildInitialMovement = (party: Customer | Supplier, isNew: boolean) => {
          if (balance === 0) return;
          const existingMvt = !isNew
            ? existingAccMovements.find((m) => m.party_id === party.id && m.movement_type === 'initial')
            : undefined;
          if (existingMvt) {
            existingMvt.debit = balance < 0 ? Math.abs(balance) : 0;
            existingMvt.credit = balance > 0 ? balance : 0;
            existingMvt.balance_after = balance;
            return;
          }
          newAccMovements.push({
            id: generateSecureId('am-init'),
            party_id: party.id,
            party_name: party.name,
            party_type: partyType,
            movement_type: 'initial',
            doc_type: 'رصيد افتتاحي',
            doc_id: party.id,
            doc_number: makeInitialMovementDoc(party.id),
            debit: balance < 0 ? Math.abs(balance) : 0,
            credit: balance > 0 ? balance : 0,
            balance_after: balance,
            date: todayDate,
            notes: notes || `رصيد افتتاحي مستورد عبر ملف`,
            created_at: nowIso,
          });
        };

        if (existingMatch) {
          duplicateCount++;
          if (options.mode === 'skip') {
            await reportProgress(i, `جاري معالجة ${typeNameAr} (${(i + 1).toLocaleString('ar-EG')} من ${rows.length.toLocaleString('ar-EG')})...`);
            continue;
          }
          if (options.mode === 'upsert') {
            if (phone) existingMatch.phone = phone;
            if (address) existingMatch.address = address;
            if (notes) existingMatch.notes = notes;
            if (type === 'customers' && creditLimit > 0) (existingMatch as Customer).credit_limit = creditLimit;
            if (balance !== 0) {
              existingMatch.opening_balance = balance;
              buildInitialMovement(existingMatch, false);
            }
            successCount++;
            await reportProgress(i, `جاري معالجة ${typeNameAr} (${(i + 1).toLocaleString('ar-EG')} من ${rows.length.toLocaleString('ar-EG')})...`);
            continue;
          }
        }

        const newId = generateSecureId(type === 'customers' ? 'cust' : 'supp');
        const base = {
          id: newId,
          name,
          phone,
          address,
          opening_balance: balance,
          notes: notes || undefined,
          created_at: nowIso,
        };
        const newParty: Customer | Supplier =
          type === 'customers' ? { ...base, credit_limit: creditLimit > 0 ? creditLimit : undefined } : base;

        newParties.push(newParty);
        byName.set(nameKey, newParty);
        if (phoneKey) byPhone.set(phoneKey, newParty);
        buildInitialMovement(newParty, true);
        successCount++;
      } catch (rowErr: any) {
        errors.push({
          line: lineNum,
          data: row,
          reason: `خطأ في معالجة بيانات ${type === 'customers' ? 'العميل' : 'المورد'}: ${rowErr?.message || String(rowErr)}`,
        });
      }
      await reportProgress(i, `جاري معالجة ${typeNameAr} (${(i + 1).toLocaleString('ar-EG')} من ${rows.length.toLocaleString('ar-EG')})...`);
    }

    if (onProgress) {
      onProgress({ totalRows: rows.length, processedRows: rows.length, percent: 98, successCount, duplicateCount, errorCount: errors.length, currentStage: 'جاري الحفظ الآمن في قاعدة البيانات...' });
    }
    await yieldToMain();

    storage.batch(() => {
      if (type === 'customers') {
        storage.set('customers', [...existingParties, ...newParties] as Customer[]);
      } else {
        storage.set('suppliers', [...existingParties, ...newParties] as Supplier[]);
      }
      storage.set('account_movements', [...existingAccMovements, ...newAccMovements]);
    });
  }

  if (onProgress) {
    onProgress({ totalRows: rows.length, processedRows: rows.length, percent: 100, successCount, duplicateCount, errorCount: errors.length, currentStage: 'تم الانتهاء بنجاح!' });
  }
  await yieldToMain();

  storage.logAudit(
    user.full_name,
    `استيراد ${typeNameAr}`,
    type === 'items' ? 'items' : 'parties',
    `CSV-${Date.now().toString().slice(-6)}`,
    `إجمالي الصفوف: ${rows.length}، تم بنجاح: ${successCount}، مكرر: ${duplicateCount}، أخطاء: ${errors.length}`
  );

  return {
    type,
    typeNameAr,
    totalRows: rows.length,
    successCount,
    duplicateCount,
    errorCount: errors.length,
    durationMs: Math.round(performance.now() - startTime),
    errors,
  };
}
