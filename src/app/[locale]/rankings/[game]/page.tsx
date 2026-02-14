import { setRequestLocale, getTranslations } from 'next-intl/server';

type Props = { params: Promise<{ locale: string; game: string }> };

export default async function RankingsPage({ params }: Props) {
  const { locale, game } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('rankings');

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-white">{t('title')} · {game}</h1>
      <p className="mt-2 text-white/60">{t('top100')}</p>
      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6">
        <p className="text-center text-white/60">랭킹 데이터는 다음 단계에서 연동됩니다.</p>
      </div>
    </div>
  );
}
