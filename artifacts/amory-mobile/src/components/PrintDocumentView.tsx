import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate, formatNumber } from '../lib/formatters';
import { SalesInvoice, PurchaseInvoice, Receipt, ReturnRecord } from '../types';
import { Printer, X, FileText, Smartphone, Share2, Download, MessageCircle, Copy, Check } from 'lucide-react';

export const PrintDocumentView: React.FC = () => {
  const { printDoc, setPrintDoc, settings, showToast } = useApp();

  const [printFormat, setPrintFormat] = useState<'thermal' | 'a4'>(() => {
    if (printDoc && 'format' in printDoc && printDoc.format) {
      return printDoc.format;
    }
    return settings.default_print_format || 'thermal';
  });

  const [copied, setCopied] = useState(false);

  if (!printDoc) return null;

  const isThermal = printFormat === 'thermal';

  const handlePrint = () => {
    window.print();
  };

  const handleClose = () => {
    setPrintDoc(null);
  };

  // Determine doc type and payload
  const docType = printDoc.type;
  const docData: any = 'data' in printDoc && printDoc.data ? printDoc.data : printDoc;
  const isCancelled = Boolean(
    docData.status === 'cancelled' ||
      docData.isCancelled ||
      (docData.data && docData.data.status === 'cancelled')
  );

  // Generate plain Arabic text receipt for WhatsApp / Clipboard
  const generateFormattedText = (): string => {
    const store = settings.store_name || 'العموري لقطع غيار السيارات';
    const phone = settings.phone ? `\n📞 هاتف: ${settings.phone}` : '';
    const address = settings.address ? `\n📍 العنوان: ${settings.address}` : '';

    if (docType === 'sales_invoice' || docType === 'purchase_invoice') {
      const isSales = docType === 'sales_invoice';
      const typeTitle = isSales ? 'فاتورة مبيعات' : 'فاتورة مشتريات';
      const partyTitle = isSales ? 'العميل' : 'المورد';
      const party = docData.customer_name || docData.supplier_name || 'نقدي';

      let itemsText = '';
      if (docData.lines && docData.lines.length > 0) {
        itemsText = docData.lines
          .map(
            (l: any, idx: number) =>
              `${idx + 1}. ${l.item_name} ${l.part_number ? `[${l.part_number}]` : ''}\n   الكمية: ${l.quantity} × السعر: ${formatCurrency(l.unit_price)} = ${formatCurrency(l.total || l.subtotal || l.quantity * l.unit_price)}`
          )
          .join('\n');
      }

      return `🧾 *${store}*
📋 *${typeTitle}*
🔢 رقم الفاتورة: ${docData.invoice_number}
📅 التاريخ: ${formatDate(docData.invoice_date)}
👤 ${partyTitle}: ${party}
--------------------------------
${itemsText}
--------------------------------
💰 إجمالي الأصناف: ${formatCurrency(docData.subtotal)}
${docData.discount_value > 0 ? `🔻 الخصم: -${formatCurrency(docData.discount_value)}\n` : ''}💵 صافي الفاتورة: ${formatCurrency(docData.final_total)}
💳 المدفوع نقداً: ${formatCurrency(docData.paid_cash)}
${docData.remaining_debt > 0 ? `⚠️ المتبقي آجل: ${formatCurrency(docData.remaining_debt)}\n` : ''}${docData.balance_after !== undefined ? `📊 إجمالي الحساب: ${formatCurrency(docData.balance_after)}\n` : ''}--------------------------------${phone}${address}
شكراً لتعاملكم معنا!`;
    }

    if (docType === 'return') {
      return `🔄 *${store}*
📋 إيصال استرجاع بضاعة
🔢 رقم المرتجع: ${docData.docNumber}
📅 التاريخ: ${docData.date}
👤 الطرف: ${docData.partyName}
--------------------------------
💰 إجمالي المرتجع: ${formatCurrency(docData.totalAmount)}
💵 المسترد نقداً: ${formatCurrency(docData.paidAmount)}
💳 مقيد بالحساب: ${formatCurrency(docData.remainingAmount)}
--------------------------------${phone}`;
    }

    if (docType === 'receipt') {
      return `💵 *${store}*
📋 ${docData.receipt_type === 'customer_receipt' ? 'إيصال استلام نقدية (سند قبض)' : 'إيصال صرف نقدية (سند صرف)'}
🔢 رقم السند: ${docData.receipt_number}
📅 التاريخ: ${formatDate(docData.date)}
👤 الطرف: ${docData.party_name}
💰 المبلغ: ${formatCurrency(docData.amount)}
${docData.notes ? `📝 البيان: ${docData.notes}\n` : ''}--------------------------------${phone}`;
    }

    return `${store} - مستند`;
  };

  // Share via WhatsApp
  const handleShareWhatsApp = () => {
    const text = generateFormattedText();
    const encoded = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  // Share via Web Share API or copy
  const handleShareNative = async () => {
    const text = generateFormattedText();
    const title = `${settings.store_name || 'العموري'} - ${docData.invoice_number || 'مستند'}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text,
        });
        return;
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          // fallback to clipboard
        }
      }
    }

    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast('success', 'تم النسخ', 'تم نسخ بيانات الفاتورة إلى الحافظة للمشاركة');
    setTimeout(() => setCopied(false), 2500);
  };

  // Download Standalone Printable HTML
  const handleDownloadHtml = () => {
    const paperEl = document.getElementById('printable-paper-doc');
    if (!paperEl) return;

    // Clone element to inject bulletproof inline styles for all table grid lines
    const clone = paperEl.cloneNode(true) as HTMLElement;

    // Force inline styles on all tables and cells
    clone.querySelectorAll('table').forEach((t) => {
      t.style.width = '100%';
      t.style.borderCollapse = 'collapse';
      t.style.border = '2px solid #000000';
      t.style.margin = '12px 0';
    });

    clone.querySelectorAll('th').forEach((th) => {
      th.style.border = '1.5px solid #000000';
      th.style.backgroundColor = '#f1f5f9';
      th.style.color = '#000000';
      th.style.fontWeight = 'bold';
      th.style.padding = '8px 10px';
    });

    clone.querySelectorAll('td').forEach((td) => {
      td.style.border = '1.5px solid #000000';
      td.style.color = '#000000';
      td.style.padding = '8px 10px';
    });

    const invoiceTitle = docData.invoice_number || `doc-${Date.now()}`;
    const storeName = settings.store_name || 'العموري لقطع غيار السيارات';
    const htmlContent = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${storeName} - ${invoiceTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      font-family: 'Cairo', system-ui, -apple-system, Arial, sans-serif;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 20px;
      background: #f1f5f9;
      color: #000000;
      direction: rtl;
    }
    .no-print {
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    .print-btn {
      background: #f59e0b;
      color: #000;
      font-weight: 800;
      padding: 10px 24px;
      border-radius: 12px;
      border: none;
      cursor: pointer;
      font-size: 14px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    .print-btn:hover {
      background: #d97706;
    }
    .paper-box {
      max-width: ${isThermal ? '80mm' : '210mm'};
      margin: 0 auto;
      background: #ffffff;
      padding: ${isThermal ? '12px' : '28px'};
      border: 1.5px solid #cbd5e1;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08);
      border-radius: 8px;
    }
    /* Guaranteed High-Contrast Table Grid Lines */
    table, .invoice-grid-table {
      width: 100% !important;
      border-collapse: collapse !important;
      margin: 12px 0 !important;
      border: 2px solid #000000 !important;
    }
    table th, .invoice-grid-table th {
      background-color: #f1f5f9 !important;
      color: #000000 !important;
      font-weight: 800 !important;
      padding: 8px 10px !important;
      border: 1.5px solid #000000 !important;
      text-align: right !important;
      font-size: 12px !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    table td, .invoice-grid-table td {
      padding: 8px 10px !important;
      border: 1.5px solid #000000 !important;
      text-align: right !important;
      font-size: 12px !important;
      vertical-align: middle !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .text-center { text-align: center !important; }
    .text-left { text-align: left !important; }
    .text-right { text-align: right !important; }
    .font-mono { font-family: monospace, sans-serif !important; font-variant-numeric: tabular-nums !important; }
    .font-bold { font-weight: bold !important; }
    .font-black { font-weight: 900 !important; }
    .wrap-text { word-break: break-word !important; overflow-wrap: anywhere !important; }
    .flex { display: flex !important; }
    .justify-between { justify-content: space-between !important; }
    .items-center { align-items: center !important; }
    .border-b { border-bottom: 1px solid #000 !important; }
    .border-t { border-top: 1px solid #000 !important; }
    .border-dashed { border-style: dashed !important; }
    .space-y-1 > * + * { margin-top: 4px !important; }
    .space-y-2 > * + * { margin-top: 8px !important; }
    .space-y-3 > * + * { margin-top: 12px !important; }
    @media print {
      body { background: #fff !important; padding: 0 !important; }
      .no-print { display: none !important; }
      .paper-box { box-shadow: none !important; border: none !important; max-width: 100% !important; width: 100% !important; padding: 0 !important; }
      table, .invoice-grid-table, table th, table td, .invoice-grid-table th, .invoice-grid-table td {
        border: 1.5px solid #000000 !important;
        border-color: #000000 !important;
      }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="print-btn" onclick="window.print()">🖨️ طباعة الفاتورة أو حفظ كـ PDF</button>
  </div>
  <div class="paper-box">
    ${clone.innerHTML}
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `فاتورة_${invoiceTitle}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('success', 'تم التنزيل', `تم تنزيل الفاتورة مع خطوط الجدول الكاملة الواضحة`);
  };

  return (
    <div className="fixed inset-0 bg-zinc-950/85 backdrop-blur-xs z-50 flex flex-col items-center justify-start p-2 sm:p-4 overflow-y-auto min-h-[100dvh]">
      {/* Print Control Toolbar */}
      <div className="no-print bg-white dark:bg-zinc-900 rounded-2xl p-3 shadow-xl mb-4 max-w-2xl w-full flex flex-wrap items-center justify-between gap-3 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
        <div className="flex items-center gap-2">
          <Printer className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700">
            <button
              onClick={() => setPrintFormat('thermal')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                isThermal ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              حراري 80mm
            </button>
            <button
              onClick={() => setPrintFormat('a4')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                !isThermal ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              ورق A4
            </button>
          </div>
        </div>

        {/* Share & Download Actions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* WhatsApp Share */}
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-bold shadow transition-colors cursor-pointer"
            title="مشاركة الفاتورة عبر واتساب مباشرة"
          >
            <MessageCircle className="w-4 h-4" />
            <span className="hidden sm:inline">واتساب</span>
          </button>

          {/* Web Share or Copy */}
          <button
            type="button"
            onClick={handleShareNative}
            className="flex items-center gap-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 px-3 py-2 rounded-xl text-xs font-bold border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer"
            title="مشاركة أو نسخ الفاتورة"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{copied ? 'تم النسخ' : 'مشاركة'}</span>
          </button>

          {/* Download HTML/PDF */}
          <button
            type="button"
            onClick={handleDownloadHtml}
            className="flex items-center gap-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 px-3 py-2 rounded-xl text-xs font-bold border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer"
            title="تنزيل الفاتورة كملف للطباعة والحفظ"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">تنزيل</span>
          </button>

          {/* Print Button */}
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-zinc-950 px-4 py-2 rounded-xl text-xs font-black shadow transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة</span>
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Printable Paper Area (Thermal 80mm vs A4) */}
      <div className="w-full flex justify-center overflow-x-auto pb-8">
        <div
          id="printable-paper-doc"
          className={`relative bg-white text-black transition-all ${
            isThermal
              ? 'thermal-receipt w-[78mm] max-w-[78mm] p-3 text-[11px] leading-relaxed font-sans border border-zinc-300 shadow-xl'
              : 'a4-invoice w-full max-w-[210mm] min-h-[297mm] p-8 text-xs border border-zinc-300 shadow-xl rounded-xl leading-relaxed'
          }`}
        >
          {/* Watermark for Cancelled Invoices */}
          {isCancelled && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden z-20">
              <span className="text-zinc-300/40 text-7xl sm:text-9xl font-black rotate-[-35deg] select-none border-8 border-dashed border-zinc-300/40 px-12 py-4 rounded-3xl">
                ملغاة
              </span>
            </div>
          )}

          {/* Clean Black & White Header (NO heavy solid black blocks) */}
          <div className="text-center border-b border-black pb-2 mb-3">
            <h1 className={`${isThermal ? 'text-base font-black' : 'text-2xl font-black'} tracking-tight`}>
              {settings.store_name || 'العموري لقطع غيار السيارات'}
            </h1>
            <p className="text-[11px] text-zinc-700 mt-0.5 font-medium">
              تويوتا - هيونداي - كيا - ميتسوبيشي - نيسان
            </p>
            {settings.phone && (
              <p className="text-[10px] text-zinc-600 font-mono mt-0.5">
                خدمة العملاء: {settings.phone}
              </p>
            )}
            {settings.address && (
              <p className="text-[10px] text-zinc-500">{settings.address}</p>
            )}
            <p className="text-[9px] text-zinc-500 font-mono mt-0.5">
              س.ت: {settings.tax_number || '89452'} | ب.ض: 450-231-908
            </p>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* Sales or Purchase Invoice */}
          {/* ------------------------------------------------------------- */}
          {(docType === 'sales_invoice' || docType === 'purchase_invoice') && (
            <div className="space-y-3">
              {/* Document Meta */}
              <div className="flex justify-between items-center text-[11px] border-b border-dashed border-zinc-300 pb-2">
                <div>
                  <span className="font-bold">
                    {docType === 'sales_invoice' ? 'فاتورة مبيعات: ' : 'فاتورة مشتريات: '}
                  </span>
                  <span className="font-mono font-bold">{docData.invoice_number}</span>
                </div>
                <div>
                  <span className="font-bold">التاريخ: </span>
                  <span className="font-mono">{formatDate(docData.invoice_date)}</span>
                </div>
              </div>

              <div className="text-[11px] space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-zinc-600">
                    {docType === 'sales_invoice' ? 'العميل: ' : 'المورد: '}
                  </span>
                  <span className="font-bold wrap-text min-w-0">
                    {docData.customer_name || docData.supplier_name || 'نقدي'}
                  </span>
                </div>
                {docData.notes && (
                  <div className="text-[10px] text-zinc-600">
                    <span>ملاحظات: </span>
                    <span className="wrap-text">{docData.notes}</span>
                  </div>
                )}
              </div>

              {/* LINES: Thermal 2-Row Pattern vs A4 Table */}
              {isThermal ? (
                /* Thermal 80mm Two-Row Clean Layout */
                <div className="border-t border-b border-black py-2 space-y-2">
                  <div className="flex justify-between text-[11px] font-black border-b border-zinc-300 pb-1.5 text-zinc-700">
                    <span>بيان البند والكمية</span>
                    <span>الإجمالي</span>
                  </div>

                  {docData.lines &&
                    docData.lines.map((l: any, i: number) => {
                      const total = l.subtotal || l.total || l.quantity * l.unit_price;
                      return (
                        <div key={i} className="space-y-1 py-1.5 border-b border-dashed border-zinc-200 last:border-0">
                          {/* Row 1: Full item name with generous line height and word break */}
                          <div className="font-bold wrap-text text-[12px] leading-relaxed text-black">
                            <span className="font-mono text-zinc-500 text-[10px] ml-1">{i + 1}.</span>
                            {l.item_name}
                            {l.part_number && (
                              <span className="text-[10px] font-mono text-zinc-600 mr-1 font-semibold block sm:inline">
                                [OEM: {l.part_number}]
                              </span>
                            )}
                          </div>
                          {/* Row 2: Qty x Unit Price on Right, Total on Left */}
                          <div className="flex items-center justify-between text-[11px] text-zinc-700 font-mono pt-0.5">
                            <span className="tabular-nums">
                              {l.quantity} ق × {formatNumber(l.unit_price)} ج.م
                            </span>
                            <span className="font-black text-black text-[12px] tabular-nums">
                              {formatNumber(total)} ج.م
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                /* A4 Elegant Spacious Table with Explicit Grid Borders */
                <div className="py-2 my-2">
                  <table className="invoice-grid-table w-full text-right text-xs table-auto border-collapse border-2 border-black">
                    <thead>
                      <tr className="font-black text-black bg-zinc-100">
                        <th className="py-2 px-2.5 text-center w-10 font-mono border border-black">#</th>
                        <th className="py-2 px-3 border border-black">بيان الصنف والقطعة</th>
                        <th className="py-2 px-2.5 text-center font-mono w-28 border border-black">كود القطعة</th>
                        <th className="py-2 px-2 text-center font-mono w-16 border border-black">الكمية</th>
                        <th className="py-2 px-2.5 text-center font-mono w-24 border border-black">سعر الوحدة</th>
                        <th className="py-2 px-3 text-left font-mono w-28 border border-black">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docData.lines &&
                        docData.lines.map((l: any, i: number) => {
                          const total = l.subtotal || l.total || l.quantity * l.unit_price;
                          return (
                            <tr key={i} className="align-top hover:bg-zinc-50/50">
                              <td className="py-2.5 px-2 text-center font-mono text-zinc-700 font-bold border border-black">{i + 1}</td>
                              <td className="py-2.5 px-3 wrap-text font-bold text-black leading-relaxed min-w-[180px] border border-black">
                                <div>{l.item_name}</div>
                                {l.brand && <span className="text-[10px] text-zinc-600 font-normal">ماركة: {l.brand}</span>}
                              </td>
                              <td className="py-2.5 px-2.5 text-center font-mono text-zinc-800 text-[11px] font-bold wrap-text min-w-[100px] border border-black">
                                {l.part_number || l.item_code || '-'}
                              </td>
                              <td className="py-2.5 px-2 text-center font-mono font-bold text-black tabular-nums border border-black">
                                {l.quantity}
                              </td>
                              <td className="py-2.5 px-2.5 text-center font-mono tabular-nums text-zinc-900 border border-black">
                                {formatNumber(l.unit_price)} ج.م
                              </td>
                              <td className="py-2.5 px-3 text-left font-mono font-black tabular-nums text-black text-sm border border-black">
                                {formatNumber(total)} ج.م
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Financial Totals */}
              <div className="space-y-1 text-[11px] border-b border-black pb-2">
                <div className="flex justify-between">
                  <span>إجمالي الأصناف:</span>
                  <span className="font-mono font-bold">{formatCurrency(docData.subtotal)}</span>
                </div>

                {docData.discount_value > 0 && (
                  <div className="flex justify-between text-zinc-700">
                    <span>قيمة الخصم:</span>
                    <span className="font-mono">- {formatCurrency(docData.discount_value)}</span>
                  </div>
                )}

                <div className="flex justify-between font-black text-xs pt-1 border-t border-zinc-300">
                  <span>صافي الفاتورة:</span>
                  <span className="font-mono">{formatCurrency(docData.final_total)}</span>
                </div>

                <div className="flex justify-between pt-1">
                  <span>المسدد نقداً:</span>
                  <span className="font-mono font-bold">{formatCurrency(docData.paid_cash)}</span>
                </div>

                {docData.remaining_debt > 0 && (
                  <div className="flex justify-between pt-0.5">
                    <span>المتبقي آجل:</span>
                    <span className="font-mono font-bold">{formatCurrency(docData.remaining_debt)}</span>
                  </div>
                )}

                {docData.previous_balance !== undefined && (
                  <div className="flex justify-between text-zinc-600 pt-1 border-t border-dashed border-zinc-200">
                    <span>رصيد سابق:</span>
                    <span className="font-mono">{formatCurrency(docData.previous_balance)}</span>
                  </div>
                )}

                {docData.balance_after !== undefined && (
                  <div className="flex justify-between font-bold pt-1 border-t border-zinc-300">
                    <span>إجمالي الحساب بعد الفاتورة:</span>
                    <span className="font-mono">{formatCurrency(docData.balance_after)}</span>
                  </div>
                )}
              </div>

              {/* Footer Policy Notes */}
              <div className="text-center text-[10px] text-zinc-600 pt-2 space-y-0.5">
                <p>البضاعة المباعة ترد أو تستبدل خلال 14 يوماً بحالتها الأصلية مع أصل الفاتورة.</p>
                <p className="font-bold text-black">شكراً لتعاملكم مع العموري لقطع الغيار</p>
                <p className="text-[9px] text-zinc-400 font-mono">طبع بواسطة: {docData.created_by || 'الكاشير'}</p>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* Return Document (مرتجع) */}
          {/* ------------------------------------------------------------- */}
          {docType === 'return' && (
            <div className="space-y-3">
              <div className="text-center font-bold text-sm border-b border-black pb-1.5">
                إيصال استرجاع بضاعة ({docData.docNumber})
              </div>

              <div className="flex justify-between text-[11px] border-b border-dashed border-zinc-300 pb-1.5">
                <div>
                  <span className="font-bold">التاريخ: </span>
                  <span className="font-mono">{docData.date}</span>
                </div>
                <div>
                  <span className="font-bold">الطرف: </span>
                  <span>{docData.partyName}</span>
                </div>
              </div>

              {/* Return Lines */}
              {isThermal ? (
                <div className="border-t border-b border-black py-1.5 space-y-1.5">
                  {docData.lines &&
                    docData.lines.map((l: any, i: number) => (
                      <div key={i} className="space-y-0.5 py-1 border-b border-dotted border-zinc-200 last:border-0">
                        <div className="font-bold wrap-text text-[11px]">{l.itemName}</div>
                        <div className="flex justify-between text-[10px] font-mono text-zinc-600">
                          <span>
                            {l.quantity} ق × {formatNumber(l.unitPrice)}
                          </span>
                          <span className="font-bold text-black">{formatNumber(l.subtotal)}</span>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="py-2 my-2">
                  <table className="invoice-grid-table w-full text-right text-xs table-fixed border-collapse border-2 border-black">
                    <thead>
                      <tr className="font-black text-black bg-zinc-100">
                        <th style={{ width: '45%' }} className="py-2 px-2.5 border border-black">
                          الصنف
                        </th>
                        <th style={{ width: '15%' }} className="py-2 px-2 text-center font-mono border border-black">
                          الكمية
                        </th>
                        <th style={{ width: '20%' }} className="py-2 px-2 text-center font-mono border border-black">
                          السعر
                        </th>
                        <th style={{ width: '20%' }} className="py-2 px-2 text-left font-mono border border-black">
                          الإجمالي
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {docData.lines &&
                        docData.lines.map((l: any, i: number) => (
                          <tr key={i} className="align-top hover:bg-zinc-50/50">
                            <td className="py-2 px-2.5 wrap-text font-bold border border-black text-black">{l.itemName}</td>
                            <td className="py-2 px-2 text-center font-mono border border-black text-black">{l.quantity}</td>
                            <td className="py-2 px-2 text-center font-mono border border-black text-zinc-900">{formatNumber(l.unitPrice)}</td>
                            <td className="py-2 px-2 text-left font-mono font-bold border border-black text-black">{formatNumber(l.subtotal)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Settlement Info */}
              <div className="space-y-1 text-[11px] border-b border-black pb-2">
                <div className="flex justify-between font-bold">
                  <span>إجمالي المرتجع:</span>
                  <span className="font-mono">{formatCurrency(docData.totalAmount)}</span>
                </div>
                {docData.paidAmount > 0 && (
                  <div className="flex justify-between">
                    <span>مسترد نقداً من الخزينة:</span>
                    <span className="font-mono">{formatCurrency(docData.paidAmount)}</span>
                  </div>
                )}
                {docData.remainingAmount > 0 && (
                  <div className="flex justify-between">
                    <span>مقيد في كشف الحساب:</span>
                    <span className="font-mono">{formatCurrency(docData.remainingAmount)}</span>
                  </div>
                )}
                {docData.notes && (
                  <div className="text-[10px] text-zinc-600 pt-1">
                    <span>السبب / ملاحظات: </span>
                    <span className="wrap-text">{docData.notes}</span>
                  </div>
                )}
              </div>

              <div className="text-center text-[10px] text-zinc-500 pt-1 font-mono">
                المسؤول: {docData.cashierName || 'الإدارة'}
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* Receipt / Voucher */}
          {/* ------------------------------------------------------------- */}
          {docType === 'receipt' && (
            <div className="space-y-4">
              <div className="text-center font-bold text-sm border-b border-black pb-2">
                {docData.receipt_type === 'customer_receipt'
                  ? 'إيصال استلام نقدية (سند قبض)'
                  : 'إيصال صرف نقدية (سند صرف)'}
              </div>

              <div className="flex justify-between text-[11px] border-b border-dashed border-zinc-300 pb-2">
                <div>
                  <span className="font-bold">رقم السند: </span>
                  <span className="font-mono font-bold">{docData.receipt_number}</span>
                </div>
                <div>
                  <span className="font-bold">التاريخ: </span>
                  <span className="font-mono">{formatDate(docData.date)}</span>
                </div>
              </div>

              <div className="p-3 border border-zinc-300 rounded-xl space-y-2 text-[11px]">
                <div>
                  <span className="text-zinc-600">
                    {docData.receipt_type === 'customer_receipt' ? 'استلمنا من السيد: ' : 'صرفنا إلى السيد: '}
                  </span>
                  <span className="font-bold text-xs">{docData.party_name}</span>
                </div>

                <div className="flex justify-between items-center py-1">
                  <span className="text-zinc-600">مبلغ وقدره:</span>
                  <span className="font-mono font-black text-sm">{formatCurrency(docData.amount)}</span>
                </div>

                {docData.notes && (
                  <div>
                    <span className="text-zinc-600">البيان: </span>
                    <span className="wrap-text">{docData.notes}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 pt-8 text-center text-[11px]">
                <div>
                  <div className="font-bold mb-8">توقيع المستلم</div>
                  <div className="border-t border-black w-28 mx-auto"></div>
                </div>
                <div>
                  <div className="font-bold mb-8">أمين الخزينة / الإدارة</div>
                  <div className="border-t border-black w-28 mx-auto"></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
