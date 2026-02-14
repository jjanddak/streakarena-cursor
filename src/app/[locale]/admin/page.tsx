import { setRequestLocale, getTranslations } from 'next-intl/server';
import { AdminGameRequests } from '@/components/AdminGameRequests';

type Props = { params: Promise<{ locale: string }> };

export default async function AdminPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin');

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
      <p className="mt-1 text-sm text-white/60">{t('pending')}</p>
      <div className="mt-6">
        <AdminGameRequests />
      </div>
    </div>
  );
}
