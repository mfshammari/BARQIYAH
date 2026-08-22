'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { homePathForRole } from '@/lib/auth';
import type { Profile } from '@/lib/types';

export interface AuthState { error?: string; notice?: string }

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '');

  if (!email || !password) return { error: 'أدخل البريد وكلمة المرور.' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: 'بيانات الدخول غير صحيحة. تأكّد من البريد وكلمة المرور.' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle<Profile>();

  revalidatePath('/', 'layout');
  redirect(next || homePathForRole(profile?.role ?? 'owner'));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
