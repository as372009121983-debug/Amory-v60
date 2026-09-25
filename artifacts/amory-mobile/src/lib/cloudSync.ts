import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import type { StorageEngine } from './storage';

export const CLOUD_KEYS = [
  'items', 'customers', 'suppliers', 'sales_invoices', 'purchase_invoices',
  'returns', 'receipts', 'expenses', 'expense_categories', 'stock_adjustments',
  'stock_movements', 'account_movements', 'treasury_movements', 'audit_log',
  'settings', 'users', 'counters',
] as const;

export type CloudSnapshot = Record<string, unknown>;

// Public Supabase client configuration. VITE_* values can override these defaults on Vercel.
// The anon/publishable key is designed for browser use; database access is still protected by RLS.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/rest\/v1\/?$/, '') || 'https://peesevozbkxhhqioagou.supabase.co';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlZXNldm96Ymt4aGhxaW9hZ291Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyODQ5MTcsImV4cCI6MjEwNTg2MDkxN30.9Uvsahvn_qDbleOCeC3o8s0AE8sulUVcKNy-x7Cyjis';

export const cloudEnabled = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

export interface CloudWorkspaceRow {
  account_id: string;
  snapshot: CloudSnapshot;
  version: number;
  updated_at: string;
}

export function buildCloudSnapshot(storage: StorageEngine): CloudSnapshot {
  const snapshot: CloudSnapshot = {};
  for (const key of CLOUD_KEYS) {
    const value = storage.get<any>(key, null);
    if (key === 'users' && Array.isArray(value)) {
      // PIN hashes are device-local secrets; never copy them to the cloud snapshot.
      snapshot[key] = value.map((user: any) => {
        const copy = { ...user };
        delete copy.pin_hash;
        delete copy.pin_salt;
        return copy;
      });
    } else {
      snapshot[key] = value;
    }
  }
  return snapshot;
}

export function isMeaningfulSnapshot(snapshot: CloudSnapshot | null | undefined): boolean {
  if (!snapshot) return false;
  return Array.isArray(snapshot.items) || Array.isArray(snapshot.sales_invoices) || Array.isArray(snapshot.users);
}

export async function getWorkspace(accountId: string): Promise<CloudWorkspaceRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('cloud_workspaces')
    .select('account_id,snapshot,version,updated_at')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) throw error;
  return data as CloudWorkspaceRow | null;
}

export async function upsertWorkspace(accountId: string, snapshot: CloudSnapshot): Promise<CloudWorkspaceRow> {
  if (!supabase) throw new Error('Supabase غير مهيأ');
  const { data, error } = await supabase
    .from('cloud_workspaces')
    .upsert({ account_id: accountId, snapshot, version: 1 }, { onConflict: 'account_id' })
    .select('account_id,snapshot,version,updated_at')
    .single();
  if (error) throw error;
  return data as CloudWorkspaceRow;
}

export async function updateWorkspace(
  accountId: string,
  snapshot: CloudSnapshot,
  expectedVersion: number,
): Promise<CloudWorkspaceRow> {
  if (!supabase) throw new Error('Supabase غير مهيأ');
  const nextVersion = expectedVersion + 1;
  const { data, error } = await supabase
    .from('cloud_workspaces')
    .update({ snapshot, version: nextVersion, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('version', expectedVersion)
    .select('account_id,snapshot,version,updated_at')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('حدث تغيير على جهاز آخر. تم منع الكتابة فوق البيانات لحمايتها.');
  return data as CloudWorkspaceRow;
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('لم يتم إعداد Supabase في Vercel بعد.');
  return supabase.auth.signInWithPassword({ email: email.trim(), password });
}

export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error('لم يتم إعداد Supabase في Vercel بعد.');
  return supabase.auth.signUp({ email: email.trim(), password });
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export function subscribeToWorkspace(accountId: string, onChange: (row: CloudWorkspaceRow) => void) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`cloud-workspace-${accountId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'cloud_workspaces', filter: `account_id=eq.${accountId}` },
      (payload) => {
        if (payload.new) onChange(payload.new as CloudWorkspaceRow);
      },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

const PENDING_KEY = 'amory_cloud_pending_sync';

export function markCloudSyncPending() {
  try { localStorage.setItem(PENDING_KEY, '1'); } catch {}
}

export function clearCloudSyncPending() {
  try { localStorage.removeItem(PENDING_KEY); } catch {}
}

export function hasCloudSyncPending(): boolean {
  try { return localStorage.getItem(PENDING_KEY) === '1'; } catch { return false; }
}

export function getAppBrandName(): string {
  return (import.meta.env.VITE_APP_NAME as string | undefined)?.trim() || 'AMORY';
}

export function getAppBrandShortName(): string {
  return (import.meta.env.VITE_APP_SHORT_NAME as string | undefined)?.trim() || getAppBrandName();
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}
