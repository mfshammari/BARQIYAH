import 'server-only';
import { env } from '@/lib/env';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';

const GRAPH_VERSION = 'v21.0';

export interface MetaTemplateStatus {
  ok: boolean;
  /** APPROVED | PENDING | REJECTED | … أو null إن لم يُعثر عليه */
  status: string | null;
  category: string | null;
  error?: string;
}

/** مفاتيح WABA: من البيئة أولاً ثم من إعدادات الأدمن. */
async function wabaCredentials(): Promise<{ wabaId: string; accessToken: string } | null> {
  if (env.metaWabaId && env.metaAccessToken) {
    return { wabaId: env.metaWabaId, accessToken: env.metaAccessToken };
  }
  if (!adminClientAvailable) return null;
  try {
    const { data } = await createAdminClient()
      .from('integration_settings').select('waba_id, access_token').limit(1).maybeSingle();
    if (data?.waba_id && data?.access_token) {
      return { wabaId: data.waba_id, accessToken: data.access_token };
    }
  } catch { /* تجاهل */ }
  return null;
}

/**
 * يقرأ حالة قالب باسمه من Meta (message_templates على WABA).
 * بلا مفاتيح → وضع المحاكاة: لا اتصال، ويُعاد ذلك صراحةً.
 */
export async function fetchMetaTemplateStatus(name: string): Promise<MetaTemplateStatus> {
  const creds = await wabaCredentials();
  if (!creds) return { ok: false, status: null, category: null, error: 'MOCK_MODE' };

  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${creds.wabaId}/message_templates`);
    url.searchParams.set('name', name);
    url.searchParams.set('fields', 'name,status,category,language');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${creds.accessToken}` } });
    const json = (await res.json()) as {
      data?: { name: string; status?: string; category?: string }[];
      error?: { message?: string };
    };
    if (!res.ok || json.error) {
      return { ok: false, status: null, category: null, error: json.error?.message ?? `HTTP ${res.status}` };
    }
    const match = (json.data ?? []).find((t) => t.name === name) ?? json.data?.[0];
    if (!match) return { ok: true, status: null, category: null };
    return { ok: true, status: match.status ?? null, category: match.category ?? null };
  } catch (err) {
    return {
      ok: false, status: null, category: null,
      error: err instanceof Error ? err.message : 'تعذّر الاتصال بـ Meta',
    };
  }
}
