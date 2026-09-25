import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { User, UserRole } from '../types';
import { storage } from '../lib/storage';
import { hashPin, generateSalt } from '../lib/security';
import { SUPABASE_FULL_SQL } from '../lib/supabaseSql';
import {
  Users,
  ShieldCheck,
  UserPlus,
  Edit2,
  Database,
  Copy,
  Check,
  AlertCircle,
  KeyRound,
  X,
  Lock,
  CheckCircle2,
  XCircle,
  Trash2,
  ShieldAlert,
  Download,
  Upload,
  RotateCcw,
  FileSpreadsheet,
  HardDrive,
  AlertTriangle,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Modal } from './ui/Modal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { CsvImportModal } from './CsvImportModal';
import { downloadCsvTemplate } from '../lib/strictImporter';

export const UsersView: React.FC = () => {
  const { users, currentUser, refreshData, showToast } = useApp();

  const [activeTab, setActiveTab] = useState<'users' | 'backup_storage' | 'supabase_sql'>('users');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [name, setName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [role, setRole] = useState<UserRole>('cashier');
  const [newPin, setNewPin] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);

  // Delete Confirm
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // SQL Copy state
  const [copied, setCopied] = useState<boolean>(false);

  // Backup & Storage state
  const [storageUsage, setStorageUsage] = useState(() => storage.getStorageUsage());
  const [backupFileText, setBackupFileText] = useState<string | null>(null);
  const [backupSummary, setBackupSummary] = useState<{
    isValid: boolean;
    error?: string;
    itemsCount: number;
    salesInvoicesCount: number;
    customersCount: number;
    exportedAt?: string;
    storeName?: string;
  } | null>(null);
  const [restoreConfirmInput, setRestoreConfirmInput] = useState<string>('');
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Guard: Admin Only
  if (currentUser.role !== 'admin') {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-3">
        <ShieldAlert className="w-16 h-16 text-rose-500 mx-auto" />
        <h3 className="text-lg font-black text-white">صلاحيات غير كافية</h3>
        <p className="text-xs text-zinc-400">
          هذه الصفحة مخصصة لمدير النظام فقط لإدارة حسابات الموظفين والصلاحيات وتأمين النظام.
        </p>
      </div>
    );
  }

  const activeAdminsCount = users.filter((u) => u.role === 'admin' && u.is_active !== false).length;

  const handleOpenAdd = () => {
    setEditingUser(null);
    setName('');
    setUsername('');
    setRole('cashier');
    setNewPin('');
    setIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (u: User) => {
    setEditingUser(u);
    setName(u.full_name || u.name || '');
    setUsername(u.username);
    setRole(u.role);
    setNewPin('');
    setIsActive(u.is_active !== false);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim()) {
      showToast('error', 'بيانات ناقصة', 'الاسم واسم المستخدم مطلوبان');
      return;
    }

    // Require PIN for new users
    if (!editingUser && !newPin.trim()) {
      showToast('error', 'رمز PIN مطلوب', 'يجب تعيين رمز PIN مبدئي (من 4 إلى 6 أرقام) عند إنشاء مستخدم جديد.');
      return;
    }

    // Protection: do not allow deactivating or changing role of the last active admin
    if (editingUser && editingUser.role === 'admin' && (role !== 'admin' || !isActive)) {
      if (activeAdminsCount <= 1) {
        showToast('error', 'محظور', 'لا يمكن تعطيل أو تخفيض رتبة آخر مدير نشط في النظام');
        return;
      }
    }

    try {
      let pinHash = editingUser?.pin_hash;
      let pinSalt = editingUser?.pin_salt;

      // If new PIN was provided
      if (newPin.trim()) {
        if (newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
          showToast('error', 'رمز PIN غير صالح', 'يجب أن يتكون رمز PIN من 4 إلى 6 أرقام فقط');
          return;
        }
        pinSalt = generateSalt();
        pinHash = await hashPin(newPin.trim(), pinSalt);
      }

      const savedUser = storage.saveUser(
        {
          id: editingUser?.id,
          name,
          username,
          role,
          is_active: isActive,
        },
        currentUser
      );

      if (pinHash && pinSalt) {
        storage.setUserPin(savedUser.id, pinHash, pinSalt);
      }

      refreshData();
      setIsModalOpen(false);
      showToast(
        'success',
        editingUser ? 'تم التعديل' : 'تمت الإضافة',
        `تم حفظ بيانات المستخدم (${name}) بنجاح`
      );
    } catch (err: any) {
      showToast('error', 'خطأ في الحفظ', err.message);
    }
  };

  const handleDeleteUser = () => {
    if (!userToDelete) return;

    if (userToDelete.role === 'admin' && activeAdminsCount <= 1) {
      showToast('error', 'محظور', 'لا يمكن حذف آخر مدير نشط في النظام');
      setUserToDelete(null);
      return;
    }

    try {
      storage.deleteUser(userToDelete.id, currentUser);
      refreshData();
      showToast('success', 'تم الحذف', `تم حذف حساب المستخدم (${userToDelete.name}) بنجاح`);
      setUserToDelete(null);
    } catch (err: any) {
      showToast('error', 'خطأ في الحذف', err.message);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_FULL_SQL);
    setCopied(true);
    showToast('success', 'تم النسخ', 'تم نسخ سكربت Supabase SQL كاملاً للحافظة');
    setTimeout(() => setCopied(false), 3000);
  };

  const handleDownloadBackup = () => {
    try {
      const jsonStr = storage.exportFullBackup();
      const dateStr = new Date().toISOString().split('T')[0];
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `amory_backup_${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStorageUsage(storage.getStorageUsage());
      refreshData();
      showToast('success', 'تم التحميل', 'تم تنزيل النسخة الاحتياطية بنجاح.');
    } catch (err: any) {
      showToast('error', 'فشل التحميل', err.message);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      const summary = storage.getBackupSummary(text);
      if (!summary.isValid) {
        showToast('error', 'ملف غير صالح', summary.error || 'الملف المختار ليس نسخة احتياطية صالحة.');
        return;
      }
      setBackupFileText(text);
      setBackupSummary(summary);
      setRestoreConfirmInput('');
      setIsRestoreModalOpen(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmRestore = () => {
    if (restoreConfirmInput.trim() !== 'استعادة' || !backupFileText) {
      showToast('error', 'تأكيد غير صحيح', 'يرجى كتابة كلمة "استعادة" للتأكيد');
      return;
    }
    setIsRestoring(true);
    try {
      storage.importFullBackup(backupFileText, currentUser);
      refreshData();
      setStorageUsage(storage.getStorageUsage());
      setIsRestoreModalOpen(false);
      setBackupFileText(null);
      setBackupSummary(null);
      setRestoreConfirmInput('');
      showToast('success', 'تمت الاستعادة بنجاح', 'تمت استعادة كافة البيانات بنجاح من النسخة الاحتياطية.');
    } catch (err: any) {
      showToast('error', 'فشل الاستعادة', err.message);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleUndoRestore = () => {
    try {
      storage.undoRestore(currentUser);
      refreshData();
      setStorageUsage(storage.getStorageUsage());
      showToast('success', 'تم التراجع بنجاح', 'تم التراجع عن آخر عملية استعادة بنجاح.');
    } catch (err: any) {
      showToast('error', 'تعذر التراجع', err.message);
    }
  };

  const handleExportCSV = (type: 'items' | 'customers' | 'suppliers' | 'treasury' | 'sales', label: string) => {
    try {
      const csv = storage.exportToCSV(type);
      const dateStr = new Date().toISOString().split('T')[0];
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `amory_${type}_${dateStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('success', 'تم التصدير', `تم تصدير ملف CSV (${label}) بنجاح.`);
    } catch (err: any) {
      showToast('error', 'فشل التصدير', err.message);
    }
  };

  const roleLabels: Record<UserRole, { label: string; variant: 'amber' | 'blue' | 'zinc' }> = {
    admin: { label: 'مدير عام', variant: 'amber' },
    accountant: { label: 'محاسب', variant: 'blue' },
    cashier: { label: 'كاشير / مبيعات', variant: 'zinc' },
  };

  return (
    <div className="p-3 sm:p-5 w-full max-w-full 2xl:max-w-[1920px] mx-auto space-y-3 sm:space-y-4 pb-28 md:pb-8 text-slate-900 dark:text-zinc-100">
      {/* Top Switcher Strip */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 p-3 sm:p-4 rounded-2xl shadow-xs">
        <div className="flex items-center overflow-x-auto scrollbar-none bg-slate-100 dark:bg-zinc-950 p-1 rounded-xl border border-slate-200 dark:border-zinc-800 gap-1">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              activeTab === 'users'
                ? 'bg-amber-500 text-zinc-950 shadow-xs font-black'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>المستخدمين والصلاحيات ({users.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('backup_storage')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              activeTab === 'backup_storage'
                ? 'bg-amber-500 text-zinc-950 shadow-xs font-black'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>النسخ الاحتياطي والتخزين</span>
          </button>
          <button
            onClick={() => setActiveTab('supabase_sql')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              activeTab === 'supabase_sql'
                ? 'bg-amber-500 text-zinc-950 shadow-xs font-black'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>سكربت Supabase SQL</span>
          </button>
        </div>

        {activeTab === 'users' && (
          <Button
            variant="primary"
            size="md"
            icon={<UserPlus className="w-4 h-4" />}
            onClick={handleOpenAdd}
            className="w-full sm:w-auto font-black shadow-md shadow-amber-500/20"
          >
            مستخدم جديد
          </Button>
        )}
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {users.map((u) => {
            const roleInfo = roleLabels[u.role] || { label: u.role, variant: 'zinc' };
            const isActiveUser = u.is_active !== false;

            return (
              <Card
                key={u.id}
                className="mobile-readable-card hover:border-slate-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between gap-3"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-2xl bg-amber-500/10 dark:bg-zinc-800 border border-amber-500/30 dark:border-zinc-700 flex items-center justify-center font-black text-amber-600 dark:text-amber-400 text-sm">
                        {(u.full_name || u.name || u.username).slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">{u.full_name || u.name}</h4>
                        <span className="text-xs text-slate-500 dark:text-zinc-400 font-mono">@{u.username}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Badge variant={roleInfo.variant} size="sm">
                        {roleInfo.label}
                      </Badge>
                      <Badge variant={isActiveUser ? 'emerald' : 'rose'} size="sm">
                        {isActiveUser ? 'نشط' : 'معطل'}
                      </Badge>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-zinc-400 space-y-1 bg-slate-50 dark:bg-zinc-950/60 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between">
                      <span>حالة رمز الدخول (PIN):</span>
                      <span className="font-bold text-slate-800 dark:text-zinc-200">
                        {u.pin_hash ? 'مضبوط ومشفّر' : 'لم يضبط بعد'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-zinc-800 gap-2">
                  <button
                    onClick={() => handleOpenEdit(u)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-bold rounded-xl border border-slate-200 dark:border-zinc-700 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>تعديل الصلاحيات و PIN</span>
                  </button>

                  {u.id !== currentUser.id && (
                    <button
                      onClick={() => setUserToDelete(u)}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-rose-100 dark:bg-zinc-800 dark:hover:bg-rose-500/20 text-slate-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 border border-slate-200 dark:border-zinc-700 transition-colors cursor-pointer"
                      title="حذف المستخدم"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Backup & Storage Tab */}
      {activeTab === 'backup_storage' && (
        <div className="space-y-4">
          {/* Storage Usage Card */}
          <Card className="space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">مساحة التخزين المحلي (LocalStorage)</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    استهلاك البيانات المخزنة محلياً في هذا المتصفح
                  </p>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <span className="text-xs font-mono font-bold text-slate-700 dark:text-zinc-300">
                  {storageUsage.formattedUsed} / 5.00 ميجابايت ({storageUsage.percent}%)
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-3 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-zinc-700/60">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  storageUsage.percent >= 70
                    ? 'bg-rose-500 shadow-sm shadow-rose-500/50'
                    : storageUsage.percent >= 50
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(2, storageUsage.percent))}%` }}
              />
            </div>

            {/* Warning if >= 70% */}
            {storageUsage.percent >= 70 && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  تحذير: استهلاك الذاكرة المحلية تجاوز 70%! يُرجى تحميل نسخة احتياطية على جهازك فوراً لحماية بيانات المحل من الامتلاء.
                </span>
              </div>
            )}
          </Card>

          {/* Full Backup & Restore Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <Download className="w-5 h-5" />
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">نسخة احتياطية كاملة (JSON)</h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                  احفظ نسخة كاملة من جميع الأصناف والفواتير والخزينة وحسابات العملاء والموردين والإعدادات في ملف JSON آمن يمكنك نقله أو الاحتفاظ به على فلاشة أو جهازك.
                </p>
              </div>

              <Button
                variant="primary"
                size="md"
                icon={<Download className="w-4 h-4" />}
                onClick={handleDownloadBackup}
                className="w-full font-black shadow-md shadow-amber-500/20"
              >
                تحميل نسخة احتياطية الآن
              </Button>
            </Card>

            <Card className="space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                  <Upload className="w-5 h-5" />
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">استعادة نسخة احتياطية</h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                  استرجع بياناتك من ملف نسخة احتياطية سابقة. يتم فحص الملف وعرض ملخص كامل قبل التأكيد، مع إمكانية التراجع الفوري عن الاستعادة.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json,application/json"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  variant="secondary"
                  size="md"
                  icon={<Upload className="w-4 h-4" />}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 font-bold"
                >
                  رفع ملف للاستعادة
                </Button>

                <Button
                  variant="ghost"
                  size="md"
                  icon={<RotateCcw className="w-4 h-4" />}
                  onClick={handleUndoRestore}
                  className="text-slate-500 hover:text-amber-600 dark:text-zinc-400 dark:hover:text-amber-400"
                  title="تراجع عن آخر استعادة تمت في هذه الجلسة"
                >
                  تراجع
                </Button>
              </div>
            </Card>
          </div>

          {/* Export to CSV Section */}
          <Card className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white">تصدير الجداول إلى Excel / CSV</h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  تصدير بيانات منفصلة بصيغة CSV تدعم الحروف العربية لفتحها في برنامج Excel أو Google Sheets
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-2">
              <button
                onClick={() => handleExportCSV('items', 'الأصناف')}
                className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-emerald-500/50 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-bold text-slate-800 dark:text-zinc-200 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group"
              >
                <FileSpreadsheet className="w-5 h-5 text-emerald-500 group-hover:scale-110 transition-transform" />
                <span>الأصناف والمخزون</span>
              </button>

              <button
                onClick={() => handleExportCSV('customers', 'العملاء')}
                className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-emerald-500/50 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-bold text-slate-800 dark:text-zinc-200 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group"
              >
                <FileSpreadsheet className="w-5 h-5 text-blue-500 group-hover:scale-110 transition-transform" />
                <span>العملاء والمديونيات</span>
              </button>

              <button
                onClick={() => handleExportCSV('suppliers', 'الموردين')}
                className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-emerald-500/50 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-bold text-slate-800 dark:text-zinc-200 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group"
              >
                <FileSpreadsheet className="w-5 h-5 text-amber-500 group-hover:scale-110 transition-transform" />
                <span>الموردين والأرصدة</span>
              </button>

              <button
                onClick={() => handleExportCSV('treasury', 'الخزينة')}
                className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-emerald-500/50 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-bold text-slate-800 dark:text-zinc-200 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group"
              >
                <FileSpreadsheet className="w-5 h-5 text-purple-500 group-hover:scale-110 transition-transform" />
                <span>حركات الخزينة</span>
              </button>

              <button
                onClick={() => handleExportCSV('sales', 'المبيعات')}
                className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-emerald-500/50 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-bold text-slate-800 dark:text-zinc-200 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group col-span-2 sm:col-span-1"
              >
                <FileSpreadsheet className="w-5 h-5 text-rose-500 group-hover:scale-110 transition-transform" />
                <span>فواتير المبيعات</span>
              </button>
            </div>
          </Card>

          {/* Strict CSV Import Section */}
          <Card className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <Upload className="w-5 h-5" />
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">منظومة الاستيراد الصارم بلا حد (CSV)</h4>
                  <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">
                    استيراد آلاف الأصناف والعملاء والموردين بدون سقف وبفحص صارم للبصمة وحفظ مقسم (Chunks)
                  </p>
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                icon={<Upload className="w-4 h-4" />}
                onClick={() => setIsCsvImportOpen(true)}
                className="font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-md shadow-amber-500/20"
              >
                معالج الاستيراد الصارم
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
              <span className="text-xs text-slate-600 dark:text-zinc-400 font-bold">تحميل القوالب المعتمدة:</span>
              <button
                onClick={() => downloadCsvTemplate('items')}
                className="text-xs text-amber-600 dark:text-amber-400 hover:underline px-2.5 py-1 rounded bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 cursor-pointer font-bold"
              >
                قالب المنتجات (CSV)
              </button>
              <button
                onClick={() => downloadCsvTemplate('customers')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline px-2.5 py-1 rounded bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 cursor-pointer font-bold"
              >
                قالب العملاء (CSV)
              </button>
              <button
                onClick={() => downloadCsvTemplate('suppliers')}
                className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline px-2.5 py-1 rounded bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 cursor-pointer font-bold"
              >
                قالب الموردين (CSV)
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Supabase SQL Tab */}
      {activeTab === 'supabase_sql' && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">سكربت تهيئة قاعدة بيانات Supabase (PostgreSQL)</h3>
              <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">
                يمكنك نسخ هذا السكربت وتنفيذه في SQL Editor الخاص بـ Supabase لإنشاء الجداول وسياسات الحماية بالكامل.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              icon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              onClick={handleCopySql}
            >
              {copied ? 'تم النسخ' : 'نسخ الكود'}
            </Button>
          </div>

          <div className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 max-h-[500px] overflow-y-auto">
            <pre className="text-[11px] font-mono text-slate-800 dark:text-zinc-300 text-left whitespace-pre">
              {SUPABASE_FULL_SQL}
            </pre>
          </div>
        </Card>
      )}

      {/* Add / Edit User Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        maxWidth="md"
        title={editingUser ? `تعديل المستخدم: ${editingUser.name}` : 'إضافة مستخدم جديد'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">الاسم بالكامل:</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: أحمد محمود"
              className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">اسم الدخول (Username):</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ahmed"
                className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">الدور والصلاحيات:</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="admin">مدير عام (كامل الصلاحيات)</option>
                <option value="accountant">محاسب (تقارير وحسابات)</option>
                <option value="cashier">كاشير (مبيعات فقط)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
              {editingUser ? 'تعديل رمز PIN (اختياري):' : 'تعيين رمز PIN المبدئي (مطلوب - من 4 إلى 6 أرقام) *:'}
            </label>
            <input
              type="password"
              maxLength={6}
              required={!editingUser}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder={editingUser ? 'اتركه فارغاً للإبقاء على الـ PIN الحالي' : 'اكتب من 4 إلى 6 أرقام'}
              className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded accent-amber-500"
              />
              <span>الحساب نشط ويستطيع تسجيل الدخول</span>
            </label>
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
            <Button variant="primary" type="submit" className="flex-1">
              {editingUser ? 'حفظ التعديلات' : 'إضافة المستخدم'}
            </Button>
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete User Confirm */}
      <ConfirmDialog
        isOpen={Boolean(userToDelete)}
        onClose={() => setUserToDelete(null)}
        onConfirm={handleDeleteUser}
        title="حذف حساب مستخدم"
        message={`هل أنت متأكد من حذف حساب (${userToDelete?.name})؟ لن يتمكن من الدخول للنظام مجدداً.`}
        variant="danger"
        confirmText="تأكيد الحذف"
      />

      {/* Restore Backup Modal */}
      <Modal
        isOpen={isRestoreModalOpen}
        onClose={() => {
          if (!isRestoring) {
            setIsRestoreModalOpen(false);
            setBackupFileText(null);
            setBackupSummary(null);
          }
        }}
        maxWidth="md"
        title="تأكيد استعادة النسخة الاحتياطية"
      >
        <div className="space-y-4">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-amber-700 dark:text-amber-400 text-xs">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-sm">تنبيه هام جداً:</div>
              <p className="leading-relaxed">
                استعادة النسخة الاحتياطية ستقوم باستبدال كافة البيانات الحالية (الأصناف، الفواتير، الحسابات، الخزينة) بالبيانات الموجودة في الملف.
              </p>
            </div>
          </div>

          {backupSummary && (
            <div className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-2 text-xs">
              <h5 className="font-black text-slate-900 dark:text-white text-sm mb-2 pb-1 border-b border-slate-200 dark:border-zinc-800">
                بيانات النسخة المحددة:
              </h5>
              <div className="flex justify-between py-1 border-b border-slate-200 dark:border-zinc-900">
                <span className="text-slate-500 dark:text-zinc-400">اسم المنشأة:</span>
                <span className="font-bold text-slate-900 dark:text-white">{backupSummary.storeName || 'العموري لقطع غيار السيارات'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200 dark:border-zinc-900">
                <span className="text-slate-500 dark:text-zinc-400">تاريخ إنشاء النسخة:</span>
                <span className="font-bold text-amber-600 dark:text-amber-400 font-mono">
                  {backupSummary.exportedAt ? new Date(backupSummary.exportedAt).toLocaleString('ar-EG') : 'غير محدد'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200 dark:border-zinc-900">
                <span className="text-slate-500 dark:text-zinc-400">عدد الأصناف:</span>
                <span className="font-bold text-slate-900 dark:text-white font-mono">{backupSummary.itemsCount} صنف</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200 dark:border-zinc-900">
                <span className="text-slate-500 dark:text-zinc-400">عدد فواتير المبيعات:</span>
                <span className="font-bold text-slate-900 dark:text-white font-mono">{backupSummary.salesInvoicesCount} فاتورة</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500 dark:text-zinc-400">عدد العملاء:</span>
                <span className="font-bold text-slate-900 dark:text-white font-mono">{backupSummary.customersCount} عميل</span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block">
              لتأكيد الاستبدال، يرجى كتابة كلمة <span className="text-rose-600 dark:text-rose-400 font-black">استعادة</span> أدناه:
            </label>
            <input
              type="text"
              value={restoreConfirmInput}
              onChange={(e) => setRestoreConfirmInput(e.target.value)}
              placeholder='اكتب كلمة "استعادة" هنا'
              className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-center font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
            <Button
              variant="danger"
              className="flex-1 font-black"
              isLoading={isRestoring}
              disabled={restoreConfirmInput.trim() !== 'استعادة' || isRestoring}
              onClick={handleConfirmRestore}
            >
              استبدال واستعادة البيانات
            </Button>
            <Button
              variant="secondary"
              disabled={isRestoring}
              onClick={() => {
                setIsRestoreModalOpen(false);
                setBackupFileText(null);
                setBackupSummary(null);
              }}
            >
              إلغاء
            </Button>
          </div>
        </div>
      </Modal>

      {/* Strict CSV Import Modal */}
      <CsvImportModal
        isOpen={isCsvImportOpen}
        onClose={() => setIsCsvImportOpen(false)}
      />
    </div>
  );
};
