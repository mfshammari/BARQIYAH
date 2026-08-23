import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

/** تحديث جلسة Supabase مع كل طلب (تجديد التوكن في الكوكيز). */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  // تجديد الجلسة مجرّد تحسين: أي فشل هنا (مفتاح خاطئ، مشروع متوقف،
  // انقطاع شبكة) يجب ألا يُسقط الموقع كله. الصفحات نفسها تتحقق من
  // الجلسة وتوجّه لتسجيل الدخول عند الحاجة.
  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    await supabase.auth.getUser();
  } catch (err) {
    console.error('[middleware] تعذّر تجديد الجلسة:', err);
    return NextResponse.next({ request });
  }

  return response;
}

export const config = {
  matcher: [
    // كل المسارات عدا الملفات الثابتة والصور والمسارات العامة للمدعو
    '/((?!_next/static|_next/image|favicon.ico|landing.html|api/whatsapp|api/payments|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
