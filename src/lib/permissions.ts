import type { UserRole } from '@/lib/types';

/** الصلاحيات كما تحدّدها مصفوفة SPEC §10. */
export type Permission =
  | 'manual_activation'   // تفعيل يدوي للمناسبات غير المدفوعة
  | 'review_templates'    // مراجعة القوالب
  | 'impersonate'         // الدخول كالعميل
  | 'finance'             // المالية والتقارير
  | 'whatsapp_settings'   // إعدادات واتساب ومراقبة الجودة
  | 'manage_team';        // إدارة الفريق

const MATRIX: Record<string, Permission[]> = {
  // متوافق مع v1: الأدمن القديم يملك كل شيء
  admin: ['manual_activation', 'review_templates', 'impersonate', 'finance', 'whatsapp_settings', 'manage_team'],
  admin_owner: ['manual_activation', 'review_templates', 'impersonate', 'finance', 'whatsapp_settings', 'manage_team'],
  admin_support: ['manual_activation', 'impersonate'],
  admin_reviewer: ['review_templates'],
  admin_finance: ['finance'],
};

export function can(role: UserRole, permission: Permission): boolean {
  return (MATRIX[role] ?? []).includes(permission);
}

export function permissionsOf(role: UserRole): Permission[] {
  return MATRIX[role] ?? [];
}

export const ROLE_LABELS: Partial<Record<UserRole, string>> = {
  admin: 'مدير (قديم)',
  admin_owner: 'مدير',
  admin_support: 'دعم',
  admin_reviewer: 'مراجع',
  admin_finance: 'محاسب',
  user: 'عميل',
  owner: 'عميل (قديم)',
  scanner: 'ماسح',
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  manual_activation: 'تفعيل يدوي (غير المدفوع)',
  review_templates: 'مراجعة القوالب',
  impersonate: 'الدخول كالعميل',
  finance: 'المالية والتقارير',
  whatsapp_settings: 'إعدادات واتساب',
  manage_team: 'إدارة الفريق',
};

/** عناصر القائمة تُبنى من صلاحيات المستخدم لا ثابتة (SPEC §9.3). */
export interface AdminNavItem {
  href: string;
  label: string;
  group: 'daily' | 'management' | 'system';
  requires?: Permission;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: '/admin', label: 'اليوم', group: 'daily' },
  { href: '/admin/events', label: 'المناسبات', group: 'daily' },
  { href: '/admin/whatsapp', label: 'مراقبة واتساب', group: 'daily', requires: 'whatsapp_settings' },
  { href: '/admin/template-requests', label: 'طلبات القوالب', group: 'daily', requires: 'review_templates' },
  { href: '/admin/clients', label: 'العملاء', group: 'management' },
  { href: '/admin/finance', label: 'المالية', group: 'management', requires: 'finance' },
  { href: '/admin/team', label: 'الفريق', group: 'system', requires: 'manage_team' },
  { href: '/admin/activity', label: 'سجل النشاط', group: 'system' },
  { href: '/admin/settings', label: 'الإعدادات', group: 'system', requires: 'whatsapp_settings' },
];

export const GROUP_LABELS = {
  daily: 'التشغيل اليومي',
  management: 'الإدارة',
  system: 'النظام',
} as const;

export function navFor(role: UserRole): AdminNavItem[] {
  return ADMIN_NAV.filter((item) => !item.requires || can(role, item.requires));
}
