/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  eslint: { ignoreDuringBuilds: true },
  // مولّد صورة الدعوة: resvg ثنائي أصلي لا يُجمَّع مع الحزمة؛ sharp لضغط صورة المعاينة
  serverExternalPackages: ['@resvg/resvg-js', 'sharp'],
  // الخطوط تُقرأ من public/fonts وقت التشغيل — تُضمَّن مع دوال التوليد
  outputFileTracingIncludes: {
    '/api/invite-card/[kind]/[id]': ['./public/fonts/**'],
    '/api/invite-og/[kind]/[id]': ['./public/fonts/**'],
  },
};
export default nextConfig;
