import { redirect } from 'next/navigation';

/** اختيار القالب أُلغي — القالب واحد للمنصة، والمالك يكتب نصّه في «دعوتي». */
export default async function LegacyTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/e/${id}/invite`);
}
