import React, { useState } from 'react';
import { Cloud, LockKeyhole, Mail, RefreshCw, ShieldCheck, UserPlus, LogIn } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const CloudAccountView: React.FC = () => {
  const { cloudEnabled, cloudLoading, cloudSession, cloudError, signInCloud, signUpCloud, signOutCloud, cloudSyncing, lastCloudSync } = useApp();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  if (cloudLoading) {
    return <div className="min-h-[100dvh] grid place-items-center bg-zinc-950 text-zinc-200"><RefreshCw className="w-6 h-6 animate-spin text-amber-400" /></div>;
  }

  if (!cloudEnabled) {
    return <div className="min-h-[100dvh] grid place-items-center bg-zinc-950 p-5 text-center"><div className="max-w-md rounded-3xl border border-amber-500/30 bg-zinc-900 p-7"><Cloud className="w-10 h-10 mx-auto text-amber-400 mb-4" /><h1 className="text-xl font-black text-white">الحساب السحابي غير مفعّل</h1><p className="text-sm text-zinc-400 mt-2">أضف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في إعدادات Environment Variables على Vercel ثم أعد النشر.</p></div></div>;
  }

  if (cloudSession) {
    return <div className="min-h-[100dvh] grid place-items-center bg-zinc-950 p-5 text-center"><div className="max-w-md rounded-3xl border border-emerald-500/30 bg-zinc-900 p-7"><ShieldCheck className="w-10 h-10 mx-auto text-emerald-400 mb-4" /><h1 className="text-xl font-black text-white">الحساب متصل</h1><p className="text-sm text-zinc-400 mt-2">{cloudSession.user.email}</p><p className="text-xs text-zinc-500 mt-2">{cloudSyncing ? 'جاري مزامنة البيانات...' : lastCloudSync ? `آخر مزامنة: ${new Date(lastCloudSync).toLocaleTimeString('ar-EG')}` : 'المزامنة جاهزة'}</p><button onClick={signOutCloud} className="mt-5 px-4 py-2 rounded-xl bg-zinc-800 text-zinc-200 font-bold">تسجيل الخروج السحابي</button></div></div>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMessage('');
    const result = mode === 'login' ? await signInCloud(email, password) : await signUpCloud(email, password);
    setMessage(result.message);
    setBusy(false);
  };

  return <div className="min-h-[100dvh] grid place-items-center bg-zinc-950 p-4 font-cairo" dir="rtl">
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl space-y-5">
      <div className="text-center"><div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/15 grid place-items-center text-amber-400"><Cloud className="w-8 h-8" /></div><h1 className="text-2xl font-black text-white mt-4">حساب المحل السحابي</h1><p className="text-sm text-zinc-400 mt-1">بياناتك تظهر على الموبايل واللاب وكل الأجهزة</p></div>
      <label className="block"><span className="text-xs font-bold text-zinc-400">البريد الإلكتروني</span><div className="mt-1 flex items-center gap-2 rounded-xl bg-zinc-950 border border-zinc-800 px-3"><Mail className="w-4 h-4 text-zinc-500" /><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full bg-transparent py-3 text-white outline-none" autoComplete="email" /></div></label>
      <label className="block"><span className="text-xs font-bold text-zinc-400">كلمة المرور</span><div className="mt-1 flex items-center gap-2 rounded-xl bg-zinc-950 border border-zinc-800 px-3"><LockKeyhole className="w-4 h-4 text-zinc-500" /><input required minLength={6} type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full bg-transparent py-3 text-white outline-none" autoComplete={mode==='login'?'current-password':'new-password'} /></div></label>
      {message && <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3 text-sm text-amber-300">{message}</div>}
      {cloudError && <div className="rounded-xl bg-rose-950/40 border border-rose-500/30 p-3 text-sm text-rose-300">{cloudError}</div>}
      <button disabled={busy} className="w-full rounded-xl bg-amber-500 text-zinc-950 py-3 font-black disabled:opacity-50 flex items-center justify-center gap-2">{busy ? <RefreshCw className="w-4 h-4 animate-spin"/> : mode==='login' ? <LogIn className="w-4 h-4"/> : <UserPlus className="w-4 h-4"/>}{mode==='login'?'دخول للحساب':'إنشاء حساب'}</button>
      <button type="button" onClick={()=>{setMode(mode==='login'?'signup':'login');setMessage('')}} className="w-full text-sm text-zinc-400 hover:text-white">{mode==='login'?'أول مرة؟ إنشاء حساب جديد':'لديك حساب بالفعل؟ تسجيل الدخول'}</button>
    </form>
  </div>;
};
