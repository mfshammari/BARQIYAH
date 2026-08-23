import { redirect } from 'next/navigation';

export default function LegacyNewEventPage() {
  redirect('/app/events/new');
}
