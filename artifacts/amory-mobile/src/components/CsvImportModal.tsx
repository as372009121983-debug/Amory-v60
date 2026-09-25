import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  runStrictImport,
  downloadCsvTemplate,
  ImportOptions,
  ImportProgress,
  ImportResultSummary,
  ImportType,
  detectFileFingerprint,
  getNumericImportPreview,
  NumericImportPreview,
  parseCsvText,
  decodeImportFile,
} from '../lib/strictImporter';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Users2,
  Package,
  Layers,
  ArrowRightLeft,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: ImportType;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({ isOpen, onClose, defaultType = 'items' }) => {
  const { currentUser, refreshData, showToast, resetInactivityTimer } = useApp();

  const [selectedType, setSelectedType] = useState<ImportType>(defaultType);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [detectedTypeInfo, setDetectedTypeInfo] = useState<{ type: ImportType; typeNameAr: string } | null>(null);
  const [previewRowCount, setPreviewRowCount] = useState<number>(0);
  const [numericPreview, setNumericPreview] = useState<NumericImportPreview | null>(null);
  const [importMode, setImportMode] = useState<ImportOptions['mode']>('upsert');
  const [isReadingFile, setIsReadingFile] = useState(false);

  // Import Execution state
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [resultSummary, setResultSummary] = useState<ImportResultSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileReadSequenceRef = useRef(0);
  const selectedTypeRef = useRef<ImportType>(defaultType);

  useEffect(() => {
    if (isOpen) {
      fileReadSequenceRef.current++;
      if (defaultType) {
        selectedTypeRef.current = defaultType;
        setSelectedType(defaultType);
      }
      setSelectedFile(null);
      setFileContent('');
      setDetectedTypeInfo(null);
      setPreviewRowCount(0);
      setNumericPreview(null);
      setIsReadingFile(false);
      setIsImporting(false);
      setProgress(null);
      setResultSummary(null);
      setErrorMessage(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      resetInactivityTimer();
    }
  }, [defaultType, isOpen, resetInactivityTimer]);

  const parseAndAnalyzeText = (text: string, currentTargetType: ImportType) => {
    try {
      const { headers, rows } = parseCsvText(text);
      if (rows.length === 0) {
        throw new Error('الملف فارغ أو لا يحتوي على صفوف بيانات بعد العناوين.');
      }
      setPreviewRowCount(rows.length);

      const detected = detectFileFingerprint(headers, currentTargetType);
      setDetectedTypeInfo(detected);
      setNumericPreview(getNumericImportPreview(text, detected.type));
      selectedTypeRef.current = detected.type;
      setSelectedType(detected.type);
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err.message);
      setDetectedTypeInfo(null);
      setNumericPreview(null);
    }
  };

  const handleSelectedFile = (file: File) => {
    resetInactivityTimer();
    const requestId = ++fileReadSequenceRef.current;

    setSelectedFile(file);
    setFileContent('');
    setDetectedTypeInfo(null);
    setPreviewRowCount(0);
    setNumericPreview(null);
    setErrorMessage(null);
    setResultSummary(null);
    setProgress(null);
    setIsReadingFile(true);

    void (async () => {
      try {
        const { text } = await decodeImportFile(file);
        if (requestId !== fileReadSequenceRef.current) return;
        setFileContent(text);
        parseAndAnalyzeText(text, selectedTypeRef.current);
        resetInactivityTimer();
      } catch (err: any) {
        if (requestId !== fileReadSequenceRef.current) return;
        setSelectedFile(null);
        setFileContent('');
        setErrorMessage(err?.message || 'تعذر قراءة الملف. تأكد أن الملف CSV أو Excel سليم.');
        if (fileInputRef.current) fileInputRef.current.value = '';
      } finally {
        if (requestId === fileReadSequenceRef.current) setIsReadingFile(false);
      }
    })();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleSelectedFile(file);
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isImporting || isReadingFile) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleSelectedFile(file);
  };

  const handleTypeTabChange = (newType: ImportType) => {
    if (isReadingFile) return;
    selectedTypeRef.current = newType;
    setSelectedType(newType);
    if (fileContent) {
      parseAndAnalyzeText(fileContent, newType);
    }
  };

  const handleStartImport = async () => {
    if (!fileContent) return;
    setIsImporting(true);
    setErrorMessage(null);
    setProgress({
      totalRows: previewRowCount,
      processedRows: 0,
      percent: 0,
      successCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      currentStage: 'جاري بدء استيراد البيانات وتجهيز الفهارس...',
    });
    setResultSummary(null);
    resetInactivityTimer();

    try {
      const summary = await runStrictImport(
        fileContent,
        { mode: importMode },
        currentUser,
        (prog) => {
          setProgress(prog);
          resetInactivityTimer();
        },
        selectedType
      );

      setResultSummary(summary);
      refreshData();
      showToast(
        'success',
        'اكتمل الاستيراد بنجاح',
        `تم استيراد ${summary.successCount.toLocaleString('ar-EG')} سجل بنجاح في ${(summary.durationMs / 1000).toFixed(1)} ثانية`
      );
    } catch (err: any) {
      setErrorMessage(err.message);
      showToast('error', 'فشل الاستيراد', err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    fileReadSequenceRef.current++;
    setIsReadingFile(false);
    setSelectedFile(null);
    setFileContent('');
    setDetectedTypeInfo(null);
    setPreviewRowCount(0);
    setNumericPreview(null);
    setProgress(null);
    setResultSummary(null);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadErrorReport = () => {
    if (!resultSummary || resultSummary.errors.length === 0) return;
    const content =
      'رقم السطر,سبب الخطأ,البيانات\n' +
      resultSummary.errors
        .map((e) => `"${e.line}","${e.reason.replace(/"/g, '""')}","${JSON.stringify(e.data).replace(/"/g, '""')}"`)
        .join('\n');

    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `تقرير_أخطاء_استيراد_${resultSummary.type}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Guard against silently discarding a file the user already picked and
  // previewed. Previously the X button (and Android's back gesture, which
  // triggers the same onClose) would close the whole modal instantly with
  // no warning whenever a file was selected but "بدء الاستيراد الآن" had not
  // been tapped yet - losing the selection with zero feedback, so it looked
  // like the import silently did nothing.
  const requestClose = () => {
    if (isImporting) return;
    const hasUnsavedSelection = !!selectedFile && !resultSummary;
    if (hasUnsavedSelection) {
      const confirmed = window.confirm(
        'لم يتم إتمام الاستيراد بعد. سيتم تجاهل الملف الذي اخترته إذا أغلقت الآن. هل تريد الإغلاق فعلاً؟'
      );
      if (!confirmed) return;
    }
    fileReadSequenceRef.current++;
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={requestClose}
      title="استيراد المنتجات والعملاء والموردين"
      maxWidth="lg"
      closeOnBackdropClick={false}
      showCloseButton={!isImporting}
    >
      <div className="space-y-5 text-right">
        {/* Destination Target Tabs */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-300 block">حدد وجهة البيانات المراد استيرادها:</label>
          <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-100 dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800">
            <button
              type="button"
              disabled={isImporting || isReadingFile}
              onClick={() => handleTypeTabChange('items')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                selectedType === 'items'
                  ? 'bg-amber-500 text-zinc-950 shadow-md font-black'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-zinc-900'
              }`}
            >
              <Package className="w-4 h-4 shrink-0" />
              <span>المنتجات والمخزون</span>
            </button>

            <button
              type="button"
              disabled={isImporting || isReadingFile}
              onClick={() => handleTypeTabChange('customers')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                selectedType === 'customers'
                  ? 'bg-blue-600 text-white shadow-md font-black'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-zinc-900'
              }`}
            >
              <Users2 className="w-4 h-4 shrink-0" />
              <span>العملاء</span>
            </button>

            <button
              type="button"
              disabled={isImporting || isReadingFile}
              onClick={() => handleTypeTabChange('suppliers')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                selectedType === 'suppliers'
                  ? 'bg-emerald-600 text-white shadow-md font-black'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-zinc-900'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span>الموردين</span>
            </button>
          </div>
        </div>

        {/* Step 1: Download Template */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-xs">
              <Download className="w-4 h-4" />
              <span>تحميل القالب المطابق لبياناتك (CSV)</span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-zinc-500">CSV وExcel مدعومان • العربية مدعومة</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => downloadCsvTemplate('items')}
              className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                selectedType === 'items'
                  ? 'bg-amber-500/10 border-amber-500/50 text-amber-700 dark:text-amber-300'
                  : 'bg-white dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 text-slate-700 dark:text-zinc-300'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-amber-500" />
                <span>قالب الأصناف</span>
              </div>
              <Download className="w-3.5 h-3.5 opacity-70" />
            </button>

            <button
              type="button"
              onClick={() => downloadCsvTemplate('customers')}
              className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                selectedType === 'customers'
                  ? 'bg-blue-500/10 border-blue-500/50 text-blue-700 dark:text-blue-300'
                  : 'bg-white dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 text-slate-700 dark:text-zinc-300'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Users2 className="w-3.5 h-3.5 text-blue-500" />
                <span>قالب العملاء</span>
              </div>
              <Download className="w-3.5 h-3.5 opacity-70" />
            </button>

            <button
              type="button"
              onClick={() => downloadCsvTemplate('suppliers')}
              className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                selectedType === 'suppliers'
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-700 dark:text-emerald-300'
                  : 'bg-white dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 text-slate-700 dark:text-zinc-300'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                <span>قالب الموردين</span>
              </div>
              <Download className="w-3.5 h-3.5 opacity-70" />
            </button>
          </div>
        </div>

        {/* Step 2: Upload File Dropzone */}
        {!selectedFile && (
          <div
            aria-busy={isReadingFile}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={handleFileDrop}
            className="border-2 border-dashed border-slate-300 dark:border-zinc-700 rounded-2xl p-4 sm:p-7 text-center bg-slate-50/70 dark:bg-zinc-900/40 transition-all space-y-2.5"
          >
            <input
              type="file"
              ref={fileInputRef}
              aria-label="اختيار ملف بيانات للاستيراد"
              accept=".csv,.txt,.tsv,.xlsx,.xls,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={handleFileChange}
              className="sr-only"
            />
            <button
              type="button"
              disabled={isReadingFile || isImporting}
              onClick={() => fileInputRef.current?.click()}
              className="w-full min-h-14 rounded-xl px-4 py-3 flex items-center justify-center gap-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 font-black text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
            >
              <Upload className="w-5 h-5 shrink-0" />
              <span>اختيار ملف من الهاتف أو الكمبيوتر</span>
            </button>
            <div className="text-xs text-slate-500 dark:text-zinc-400">
              يدعم CSV وExcel (.xlsx/.xls). على الكمبيوتر يمكنك أيضاً سحب الملف وإفلاته هنا.
            </div>
          </div>
        )}
        {isReadingFile && (
          <div
            role="status"
            className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-200 text-sm"
          >
            جاري قراءة الملف وتحليل صفوفه...
          </div>
        )}

        {/* Error notice if format verification fails */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-800 dark:text-red-200 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-red-600 dark:text-red-300">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>تنبيه بخصوص تنسيق الملف:</span>
            </div>
            <pre className="whitespace-pre-wrap font-sans leading-relaxed text-slate-700 dark:text-zinc-300">{errorMessage}</pre>
            <Button variant="outline" size="sm" onClick={handleReset} className="mt-2 text-xs">
              اختيار ملف آخر
            </Button>
          </div>
        )}

        {/* Step 3: File Detected & Options */}
        {selectedFile && detectedTypeInfo && !resultSummary && (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                    <span>{selectedFile.name}</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/30">
                      وجهة الحفظ: {selectedType === 'items' ? 'الأصناف والمنتجات' : selectedType === 'customers' ? 'العملاء' : 'الموردين'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    عدد الصفوف: {previewRowCount.toLocaleString('ar-EG')} سجل جاهز للمعالجة
                  </div>
                </div>
              </div>

              {!isImporting && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 cursor-pointer"
                >
                  تغيير الملف
                </button>
              )}
            </div>

            {numericPreview && (
              <div
                role="status"
                className={`p-3 rounded-xl border text-xs space-y-1 ${
                  !numericPreview.header || numericPreview.invalidRows > 0
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                    : 'bg-slate-100 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
                }`}
              >
                <div className="font-bold">
                  مراجعة {numericPreview.label} قبل الحفظ
                  {numericPreview.header ? ` • العمود: ${numericPreview.header}` : ' • لم يتم العثور على عمود معروف'}
                </div>
                {!numericPreview.header ? (
                  <div>
                    {selectedType === 'items'
                      ? 'لم يتم التعرف على عمود للكمية؛ ستُضاف المنتجات بمخزون صفر. أعد اختيار الملف إذا كانت الكميات موجودة فيه.'
                      : 'لم يتم التعرف على عمود للرصيد؛ لن يُضاف رصيد افتتاحي للأطراف.'}
                  </div>
                ) : (
                  <div>
                    قيم مقروءة: {numericPreview.populatedRows.toLocaleString('ar-EG')} • قيم غير صالحة: {numericPreview.invalidRows.toLocaleString('ar-EG')} • غير الصفرية: {numericPreview.nonZeroRows.toLocaleString('ar-EG')} • الإجمالي: {numericPreview.total.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}
                  </div>
                )}
                {numericPreview.invalidRows > 0 && (
                  <div>الصفوف التي تحتوي رقماً غير مفهوم ستُستبعد ويظهر سببها في تقرير الأخطاء.</div>
                )}
              </div>
            )}

            {/* Note on Party files */}
            {(selectedType === 'customers' || selectedType === 'suppliers') && (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs">
                <span className="text-slate-700 dark:text-zinc-300">
                  تنسيق السجلات: الاسم، الهاتف، الموقع، الملاحظات، الرصيد.
                </span>
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={() => handleTypeTabChange(selectedType === 'customers' ? 'suppliers' : 'customers')}
                  className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-bold cursor-pointer"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>التحويل إلى {selectedType === 'customers' ? 'الموردين' : 'العملاء'}</span>
                </button>
              </div>
            )}

            {/* Import Mode Options */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block">طريقة معالجة السجلات</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={() => setImportMode('upsert')}
                  className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                    importMode === 'upsert'
                      ? 'bg-amber-500/15 border-amber-500 text-amber-800 dark:text-amber-300 font-bold'
                      : 'bg-white dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-800 dark:text-zinc-200">دمج وتحديث (Upsert)</div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-500 mt-0.5">تحديث الكميات والأسعار إذا تكرر الاسم</div>
                </button>

                <button
                  type="button"
                  disabled={isImporting}
                  onClick={() => setImportMode('skip')}
                  className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                    importMode === 'skip'
                      ? 'bg-amber-500/15 border-amber-500 text-amber-800 dark:text-amber-300 font-bold'
                      : 'bg-white dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-800 dark:text-zinc-200">تخطي المكرر (Skip)</div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-500 mt-0.5">إضافة السجلات الجديدة فقط وإهمال المكرر</div>
                </button>

                <button
                  type="button"
                  disabled={isImporting}
                  onClick={() => setImportMode('replace')}
                  className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                    importMode === 'replace'
                      ? 'bg-red-500/15 border-red-500 text-red-800 dark:text-red-300 font-bold'
                      : 'bg-white dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-800 dark:text-zinc-200">استبدال كامل (Replace)</div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-500 mt-0.5">تفريغ الجدول الحالي واستبداله بالملف تماماً</div>
                </button>
              </div>
            </div>

            {/* Progress Bar while importing */}
            {isImporting && progress && (
              <div className="p-4 bg-zinc-900/90 rounded-2xl border border-amber-500/30 shadow-lg space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-amber-400 flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                    {progress.currentStage}
                  </span>
                  <span className="font-mono text-base font-black text-amber-300">{progress.percent}%</span>
                </div>
                <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden p-0.5 border border-zinc-700/50">
                  <div
                    className="h-full bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-400 rounded-full transition-all duration-200 shadow-[0_0_12px_rgba(245,158,11,0.5)]"
                    style={{ width: `${Math.max(3, progress.percent)}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-[11px] pt-1 border-t border-zinc-800/80">
                  <span className="text-emerald-400 font-medium">تم بنجاح: {progress.successCount.toLocaleString('ar-EG')}</span>
                  <span className="text-amber-400 font-medium">مكرر: {progress.duplicateCount.toLocaleString('ar-EG')}</span>
                  <span className="text-red-400 font-medium">أخطاء: {progress.errorCount.toLocaleString('ar-EG')}</span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {!isImporting && (
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="outline" onClick={handleReset}>
                  إلغاء
                </Button>
                <Button
                  variant="primary"
                  onClick={handleStartImport}
                  className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold px-6 shadow-md shadow-amber-500/20"
                >
                  بدء الاستيراد الآن
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Import Complete Summary */}
        {resultSummary && (
          <div className="p-6 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/40">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">اكتمل استيراد {resultSummary.typeNameAr}</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                استغرقت العملية {(resultSummary.durationMs / 1000).toFixed(2)} ثانية
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 p-3 bg-white dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs">
              <div className="p-2">
                <div className="text-slate-500 dark:text-zinc-500">تمت بنجاح</div>
                <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                  {resultSummary.successCount.toLocaleString('ar-EG')}
                </div>
              </div>
              <div className="p-2">
                <div className="text-slate-500 dark:text-zinc-500">سجلات مكررة</div>
                <div className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5">
                  {resultSummary.duplicateCount.toLocaleString('ar-EG')}
                </div>
              </div>
              <div className="p-2">
                <div className="text-slate-500 dark:text-zinc-500">أخطاء استبعدت</div>
                <div className="text-base font-bold text-rose-600 dark:text-red-400 font-mono mt-0.5">
                  {resultSummary.errorCount.toLocaleString('ar-EG')}
                </div>
              </div>
            </div>

            {resultSummary.errors.length > 0 && (
              <div className="p-3 bg-red-950/20 border border-red-800/40 rounded-xl text-xs text-red-300 flex items-center justify-between">
                <span>يوجد {resultSummary.errors.length} صفوف واجهت أخطاء في البيانات</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadErrorReport}
                  className="text-xs border-red-700 text-red-200 hover:bg-red-900/40"
                >
                  تحميل تقرير الأخطاء (CSV)
                </Button>
              </div>
            )}

            <div className="flex justify-center gap-3 pt-2">
              <Button variant="outline" onClick={handleReset}>
                استيراد ملف آخر
              </Button>
              <Button
                variant="primary"
                onClick={onClose}
                className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold"
              >
                إغلاق والعودة للبيانات
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
