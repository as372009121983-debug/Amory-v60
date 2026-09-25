import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { runSelfTests, runBulk50kItemsBenchmark, SelfTestSuiteSummary } from '../lib/selfTest';
import { storage } from '../lib/storage';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  Zap,
  HardDrive,
  Database,
  ArrowRight,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

export const SelfTestView: React.FC<{ onBackToApp: () => void }> = ({ onBackToApp }) => {
  const { currentUser, showToast } = useApp();
  const [isRunning, setIsRunning] = useState(false);
  const [testSummary, setTestSummary] = useState<SelfTestSuiteSummary | null>(null);

  // 50k benchmark states
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [benchmarkProgress, setBenchmarkProgress] = useState(0);
  const [benchmarkResult, setBenchmarkResult] = useState<{
    success: boolean;
    totalItems: number;
    durationMs: number;
    memoryEstimate?: string;
  } | null>(null);

  // Storage info
  const [storageUsage, setStorageUsage] = useState(() => storage.getStorageUsage());
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  useEffect(() => {
    storage.updateStorageEstimate().then(setStorageUsage);
  }, []);

  const handleRunTests = async () => {
    setIsRunning(true);
    try {
      const summary = await runSelfTests();
      setTestSummary(summary);
      if (summary.allPassed) {
        showToast('success', 'اجتياز تام', `نجحت جميع السيناريوهات التسعة بنسبة 100% (${summary.totalDurationMs}ms)`);
      } else {
        showToast('error', 'تنبيه أمان', `فشل ${summary.failed} سيناريو من أصل ${summary.total}`);
      }
    } catch (err: any) {
      showToast('error', 'خطأ في الاختبار الذاتي', err.message);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRun50kBenchmark = async () => {
    setIsBenchmarking(true);
    setBenchmarkProgress(0);
    setBenchmarkResult(null);
    try {
      const res = await runBulk50kItemsBenchmark((pct) => {
        setBenchmarkProgress(pct);
      });
      setBenchmarkResult(res);
      showToast('success', 'تم اختبار 50,000 صنف', `اكتمل الاختبار في ${(res.durationMs / 1000).toFixed(2)} ثانية`);
    } catch (err: any) {
      showToast('error', 'خطأ في اختبار الضغط', err.message);
    } finally {
      setIsBenchmarking(false);
    }
  };

  const handleConfirmCleanup = () => {
    const res = storage.confirmMigrationCleanup();
    if (res.success) {
      setCleanupResult(`تم تنظيف ${res.removedCount} مفتاح قديم بنجاح بعد التأكد من اكتمال الترحيل.`);
      showToast('success', 'تنظيف التخزين', `تم تنظيف ${res.removedCount} مفتاح`);
      storage.updateStorageEstimate().then(setStorageUsage);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 p-3 sm:p-8 space-y-5 sm:space-y-8 font-sans transition-colors duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-zinc-800">
        <div className="flex items-start gap-3">
          <div className="p-2.5 sm:p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-600 dark:text-amber-400">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">منظومة الفحص والاختبار الذاتي</h1>
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                المرحلة 0 & 1
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 mt-1">
              فحص معزول بالكامل على بادئة <code className="bg-slate-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-amber-700 dark:text-amber-300">autoparts_test_</code> بدون المساس ببيانات المحل الفعلية
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:flex items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
          <Button variant="outline" onClick={onBackToApp} className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4" />
            العودة للبرنامج
          </Button>
          <Button
            variant="primary"
            onClick={handleRunTests}
            disabled={isRunning}
            className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold"
          >
            {isRunning ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                جاري إجراء الفحص...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                تشغيل الاختبارات الذاتية (9 سيناريوهات)
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Storage & Environment Health Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4 bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-600 dark:text-blue-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">محرك قاعدة البيانات النشط</div>
              <div className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mt-0.5">
                <span>IndexedDB + RAM Cache</span>
                <span className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-full font-mono">
                  Active
                </span>
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500 dark:text-zinc-400 mt-3 border-t border-slate-200 dark:border-zinc-800/80 pt-2">
            عمليات ذرية مع دعم الـ Rollback الفوري عند حدوث أي خطأ
          </div>
        </Card>

        <Card className="p-4 bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">المساحة الفعلية (Storage Quota)</div>
              <div className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                {storageUsage.formattedUsed} <span className="text-xs font-normal text-slate-500 dark:text-zinc-400">مستخدمة</span>
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500 dark:text-zinc-400 mt-3 border-t border-slate-200 dark:border-zinc-800/80 pt-2 flex items-center justify-between">
            <span>المتاح للمتصفح: {storageUsage.formattedAvailable || 'غير محدود'}</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{storageUsage.percent}% مستهلك</span>
          </div>
        </Card>

        <Card className="p-4 bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/10 rounded-xl text-purple-600 dark:text-purple-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">صلاحيات التشغيل</div>
              <div className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                {currentUser?.full_name || 'مدير النظام'}
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500 dark:text-zinc-400 mt-3 border-t border-slate-200 dark:border-zinc-800/80 pt-2 flex items-center justify-between">
            <span>الرول: {currentUser?.role}</span>
            <span className="text-amber-600 dark:text-amber-400 font-bold">Admin Mode</span>
          </div>
        </Card>
      </div>

      {/* Test Results Summary & Detailed Cards */}
      {testSummary && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>نتائج الفحص الذاتي للعمليات المحاسبية والمخزنية</span>
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                  testSummary.allPassed
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}
              >
                {testSummary.passed} ناجح / {testSummary.failed} فاشل ({testSummary.totalDurationMs} ms)
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {testSummary.results.map((r, idx) => (
              <div
                key={r.id}
                className={`p-4 rounded-xl border transition-all ${
                  r.status === 'pass'
                    ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                    : 'bg-red-950/30 border-red-800/50 text-red-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-white">
                    {r.status === 'pass' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                    )}
                    <span>
                      {idx + 1}. {r.name}
                    </span>
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-900/60 text-zinc-400 border border-zinc-800">
                    {r.durationMs}ms
                  </span>
                </div>

                {r.message && (
                  <p className="text-xs text-zinc-300 mt-2 leading-relaxed bg-zinc-950/40 p-2 rounded-lg border border-zinc-800/50">
                    {r.message}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase 1 & 2 Stress Benchmark: 50,000 Items */}
      <Card className="p-6 bg-zinc-900/40 border-zinc-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-400">
              <Sparkles className="w-5 h-5" />
              <h3 className="font-bold text-white text-base">
                اختبار أداء وسعة قاعدة البيانات (50,000 صنف تجريبي)
              </h3>
            </div>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
              يقوم هذا الاختبار بإنشاء 50,000 صنف مع حركاتهم المخزنية داخل قاعدة IndexedDB معزولة بالكامل لقياس سرعة المعالجة والذاكرة واستجابة الفهارس، ثم إتلافها فوراً بدون المساس بالبيانات الأصلية.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={handleRun50kBenchmark}
            disabled={isBenchmarking}
            className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 font-bold shrink-0"
          >
            {isBenchmarking ? `جاري المحاكاة... ${benchmarkProgress}%` : 'تشغيل اختبار الـ 50,000 صنف'}
          </Button>
        </div>

        {isBenchmarking && (
          <div className="space-y-2 pt-2">
            <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-200"
                style={{ width: `${benchmarkProgress}%` }}
              />
            </div>
            <div className="text-xs text-zinc-400 text-left font-mono">{benchmarkProgress}% مكتمل</div>
          </div>
        )}

        {benchmarkResult && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-amber-400 shrink-0" />
              <div>
                <div className="text-sm font-bold text-white">
                  نجاح معالجة {benchmarkResult.totalItems.toLocaleString('ar-EG')} صنف دفعة واحدة!
                </div>
                <div className="text-xs text-zinc-300 mt-0.5">
                  استغرق الإنشاء والكتابة والتحقق: {(benchmarkResult.durationMs / 1000).toFixed(2)} ثانية | الحجم التقديري: {benchmarkResult.memoryEstimate}
                </div>
              </div>
            </div>
            <span className="text-xs px-3 py-1 bg-amber-500 text-zinc-950 font-bold rounded-lg">
              معدل سرعة فائق: ~{Math.round(50000 / (benchmarkResult.durationMs / 1000))} صنف/ثانية
            </span>
          </div>
        )}
      </Card>

      {/* Safe Migration Cleanup Option */}
      <Card className="p-6 bg-zinc-900/40 border-zinc-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-zinc-200 font-bold">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <span>تنظيف مفاتيح التخزين القديم (localStorage) بعد نجاح الترحيل</span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              تم ترحيل البيانات تلقائياً وبأمان إلى IndexedDB. يمكنك تأكيد تنظيف النسخة القديمة في localStorage لتفريغ ذاكرة المتصفح.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={handleConfirmCleanup}
            className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs shrink-0"
          >
            تأكيد تنظيف التخزين القديم
          </Button>
        </div>

        {cleanupResult && (
          <div className="text-xs text-emerald-400 bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-800/40">
            {cleanupResult}
          </div>
        )}
      </Card>
    </div>
  );
};
