/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  eslint: { ignoreDuringBuilds: true },
  // مولّد صورة الدعوة: resvg ثنائي أصلي لا يُجمَّع مع الحزمة
  serverExternalPackages: ['@resvg/resvg-js'],
  // الخطوط تُقرأ من public/fonts وقت التشغيل — تُضمَّن مع دالة التوليد
  outputFileTracingIncludes: {
    '/api/invite-card/[kind]/[id]': ['./public/fonts/**'],
  },
};
export default nextConfig;
