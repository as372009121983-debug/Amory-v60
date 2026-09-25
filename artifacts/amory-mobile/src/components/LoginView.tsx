import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { UserProfile } from '../types';
import { ShieldCheck, Lock, Delete, RotateCcw, AlertTriangle, KeyRound, Wrench } from 'lucide-react';
import { Button } from './ui/Button';
import { getAppBrandName } from '../lib/cloudSync';

export const LoginView: React.FC = () => {
  const {
    users,
    loginWithPin,
    setupUserPin,
    lockoutRemainingSeconds,
    failedLoginAttempts,
    settings,
  } = useApp();

  const anyUserHasPin = React.useMemo(() => {
    return users.some((u) => Boolean(u.pin_hash && u.pin_salt));
  }, [users]);

  // If system has configured PINs, only users with a PIN appear.
  // If system has zero PINs, show active users so initial admin can set up PIN.
  const availableUsers = React.useMemo(() => {
    if (!anyUserHasPin) {
      return users.filter((u) => u.is_active);
    }
    return users.filter((u) => u.is_active && Boolean(u.pin_hash && u.pin_salt));
  }, [users, anyUserHasPin]);

  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(() => {
    const hasAny = users.some((u) => Boolean(u.pin_hash && u.pin_salt));
    if (!hasAny) return users.find((u) => u.role === 'admin' && u.is_active) || users[0] || null;
    return users.find((u) => u.is_active && Boolean(u.pin_hash && u.pin_salt)) || null;
  });

  const [pin, setPin] = useState<string>('');
  const [isSettingUpPin, setIsSettingUpPin] = useState<boolean>(false);
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [step, setStep] = useState<'enter_new' | 'confirm_new'>('enter_new');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Check if initial PIN setup is needed (only when zero PINs exist in system)
  useEffect(() => {
    if (!anyUserHasPin && selectedUser) {
      setIsSettingUpPin(true);
      setStep('enter_new');
      setPin('');
      setConfirmPin('');
      setErrorMsg('');
    } else {
      setIsSettingUpPin(false);
      setPin('');
      setErrorMsg('');
    }
  }, [selectedUser, anyUserHasPin]);

  // Handle number pad button click
  const handleDigitClick = (digit: string) => {
    if (lockoutRemainingSeconds > 0) return;
    setErrorMsg('');
    if (pin.length < 6) {
      const nextPin = pin + digit;
      setPin(nextPin);

      // Auto-submit if standard 4-digit PIN is entered and not in setup mode
      if (!isSettingUpPin && nextPin.length >= 4 && nextPin.length <= 6) {
        // We will allow manual submit or auto-submit on 4/6
      }
    }
  };

  const handleBackspace = () => {
    if (lockoutRemainingSeconds > 0) return;
    setErrorMsg('');
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (lockoutRemainingSeconds > 0) return;
    setErrorMsg('');
    setPin('');
  };

  // Keyboard support for numpad / digits
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lockoutRemainingSeconds > 0) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigitClick(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const handleSubmit = async () => {
    if (!selectedUser) {
      setErrorMsg('يرجى اختيار المستخدم أولاً');
      return;
    }

    if (pin.length < 4) {
      setErrorMsg('رمز PIN يجب أن يتكون من 4 أرقام على الأقل');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    if (isSettingUpPin) {
      if (step === 'enter_new') {
        setConfirmPin(pin);
        setPin('');
        setStep('confirm_new');
        setIsSubmitting(false);
        return;
      }

      if (step === 'confirm_new') {
        if (pin !== confirmPin) {
          setErrorMsg('الرمزان غير متطابقين. يرجى إعادة المحاولة.');
          setPin('');
          setConfirmPin('');
          setStep('enter_new');
          setIsSubmitting(false);
          return;
        }

        const res = await setupUserPin(selectedUser.id, pin);
        if (res.success) {
          setIsSettingUpPin(false);
          setPin('');
        } else {
          setErrorMsg(res.message || 'حدث خطأ أثناء حفظ الرمز');
        }
        setIsSubmitting(false);
        return;
      }
    } else {
      const res = await loginWithPin(selectedUser.id, pin);
      if (!res.success) {
        if (res.message === 'needs_setup') {
          if (!anyUserHasPin) {
            setIsSettingUpPin(true);
            setStep('enter_new');
            setPin('');
          } else {
            setErrorMsg('هذا الحساب لم يتم تعيين رمز PIN له بعد. يرجى مراجعة مدير النظام لتعيين الرمز.');
            setPin('');
          }
        } else {
          setErrorMsg(res.message || 'رمز PIN غير صحيح');
          setPin('');
        }
      }
      setIsSubmitting(false);
    }
  };

  const roleLabels: Record<string, { label: string; color: string }> = {
    admin: { label: 'مدير النظام', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    accountant: { label: 'محاسب عام', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
    cashier: { label: 'كاشير مبيعات', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  };

  return (
    <div className="min-h-[100dvh] w-full bg-slate-100 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 flex items-center justify-center p-4 selection:bg-amber-500 selection:text-black font-cairo relative overflow-hidden transition-colors duration-200">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-slate-100 to-slate-100 dark:from-amber-500/10 dark:via-zinc-950 dark:to-zinc-950 pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white dark:bg-zinc-900 border border-amber-500/40 shadow-xl shadow-amber-500/10 text-amber-500 dark:text-amber-400 mb-2">
            <Wrench className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            {settings.store_name || 'العموري لقطع غيار السيارات'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 font-medium">
            تسجيل الدخول الآمن لنظام نقاط البيع والمحاسبة
          </p>
        </div>

        {/* User Selection Carousel / Cards */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-600 dark:text-zinc-400 block text-right px-1">
            اختر المستخدم:
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            {availableUsers.map((u) => {
              const isSelected = selectedUser?.id === u.id;
              const roleInfo = roleLabels[u.role] || { label: u.role, color: 'bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300' };

              return (
                <button
                  key={u.id}
                  disabled={!u.is_active}
                  onClick={() => setSelectedUser(u)}
                  className={`p-3 rounded-2xl border text-right transition-all flex flex-col items-center justify-center gap-2 cursor-pointer ${
                    !u.is_active
                      ? 'opacity-40 border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/40 cursor-not-allowed'
                      : isSelected
                      ? 'border-amber-500 bg-white dark:bg-zinc-900 shadow-lg shadow-amber-500/10 ring-2 ring-amber-500/30'
                      : 'border-slate-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/50 hover:bg-white dark:hover:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-base border shadow-xs ${
                      isSelected
                        ? 'bg-amber-500 text-zinc-950 border-amber-400'
                        : 'bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-300 border-slate-200 dark:border-zinc-700'
                    }`}
                  >
                    {u.full_name.charAt(0)}
                  </div>
                  <div className="w-full text-center">
                    <div className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate w-full">
                      {u.full_name.split(' ')[0]} {u.full_name.split(' ')[1] || ''}
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border mt-1 inline-block ${roleInfo.color}`}>
                      {roleInfo.label.split(' ')[0]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* PIN Entry Area */}
        <div className="bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 shadow-2xl backdrop-blur-md space-y-4">
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 dark:text-zinc-300">
              <KeyRound className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              <span>
                {isSettingUpPin
                  ? step === 'enter_new'
                    ? 'تعيين رمز PIN جديد (من 4 إلى 6 أرقام)'
                    : 'أعد إدخال الرمز لتأكيده'
                  : 'أدخل رمز PIN للدخول'}
              </span>
            </div>
            {isSettingUpPin && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                أول تشغيل: يرجى كتابة رمز سري سهل التذكر خاص بك
              </p>
            )}
          </div>

          {/* Dots Indicator */}
          <div className="flex items-center justify-center gap-3 py-2" dir="ltr">
            {[0, 1, 2, 3, 4, 5].map((idx) => {
              const isFilled = idx < pin.length;
              return (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full transition-all duration-200 border ${
                    isFilled
                      ? 'bg-amber-500 border-amber-500 scale-110 shadow-md shadow-amber-500/50'
                      : 'bg-slate-200 dark:bg-zinc-800/80 border-slate-300 dark:border-zinc-700'
                  }`}
                />
              );
            })}
          </div>

          {/* Error Message & Lockout Notice */}
          {lockoutRemainingSeconds > 0 ? (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-600 dark:text-rose-400 text-xs text-center flex items-center justify-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                النظام مقفل مؤقتاً. يرجى الانتظار {lockoutRemainingSeconds} ثانية.
              </span>
            </div>
          ) : errorMsg ? (
            <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs text-center font-bold">
              {errorMsg}
            </div>
          ) : null}

          {/* Numeric Keypad (Large Touch Buttons) */}
          <div className="grid grid-cols-3 gap-2.5 pt-1" dir="ltr">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={lockoutRemainingSeconds > 0}
                onClick={() => handleDigitClick(digit)}
                className="h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 active:bg-amber-500 active:text-zinc-950 active:scale-95 text-xl font-bold font-mono text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-zinc-700/60 shadow-xs transition-all flex items-center justify-center cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {digit}
              </button>
            ))}

            <button
              type="button"
              disabled={lockoutRemainingSeconds > 0}
              onClick={handleClear}
              className="h-14 rounded-2xl bg-slate-100/60 hover:bg-slate-200 dark:bg-zinc-800/50 dark:hover:bg-zinc-800 active:scale-95 text-xs font-bold text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700/40 transition-all flex items-center justify-center cursor-pointer select-none disabled:opacity-50"
              title="مسح الكل"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            <button
              type="button"
              disabled={lockoutRemainingSeconds > 0}
              onClick={() => handleDigitClick('0')}
              className="h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 active:bg-amber-500 active:text-zinc-950 active:scale-95 text-xl font-bold font-mono text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-zinc-700/60 shadow-xs transition-all flex items-center justify-center cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              0
            </button>

            <button
              type="button"
              disabled={lockoutRemainingSeconds > 0}
              onClick={handleBackspace}
              className="h-14 rounded-2xl bg-slate-100/60 hover:bg-slate-200 dark:bg-zinc-800/50 dark:hover:bg-zinc-800 active:scale-95 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700/40 transition-all flex items-center justify-center cursor-pointer select-none disabled:opacity-50"
              title="مسح رقم واحد"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          {/* Action Submit Button */}
          <Button
            variant="primary"
            size="lg"
            className="w-full mt-2 font-black"
            isLoading={isSubmitting}
            disabled={pin.length < 4 || lockoutRemainingSeconds > 0}
            onClick={handleSubmit}
          >
            {isSettingUpPin
              ? step === 'enter_new'
                ? 'التالي (تأكيد الرمز)'
                : 'حفظ وتثبيت رمز PIN'
              : 'تسجيل الدخول'}
          </Button>
        </div>

        {/* Footer info */}
        <div className="text-center text-[11px] text-slate-500 dark:text-zinc-400 space-y-1">
          <div>{getAppBrandName()} · الإصدار الاحترافي</div>
          <div>تطبيق محلي سريع يعمل بدون إنترنت مع حماية كاملة للبيانات</div>
        </div>
      </div>
    </div>
  );
};
