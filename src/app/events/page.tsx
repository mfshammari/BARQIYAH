import { redirect } from 'next/navigation';

/** «مناسباتي» انتقلت إلى مستوى الحساب (SPEC §8.2). */
export default function LegacyEventsPage() {
  redirect('/app');
}
