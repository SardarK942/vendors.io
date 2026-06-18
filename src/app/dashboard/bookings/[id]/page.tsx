import { BookingDetail } from '@/components/dashboard/BookingDetail';

interface BookingDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BookingDetailPage({ params, searchParams }: BookingDetailPageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const rawAction = sp['action'];
  const initialAction = typeof rawAction === 'string' ? rawAction : undefined;
  return <BookingDetail bookingId={id} mode="page" initialAction={initialAction} />;
}
