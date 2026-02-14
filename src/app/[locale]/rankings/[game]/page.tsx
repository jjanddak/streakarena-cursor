import { setRequestLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getGameBySlug, getRankingsByGameId } from '@/lib/games';

type Props = { params: Promise<{ locale: string; game: string }> };

function formatAchieved(dateStr: string, locale: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default async function RankingsPage({ params }: Props) {
  const { locale, game: gameSlug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('rankings');

  const game = await getGameBySlug(gameSlug);
  if (!game) notFound();

  const rankings = await getRankingsByGameId(game.id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-white">{t('title')} · {game.name}</h1>
      <p className="mt-2 text-white/60">{t('top100')}</p>
      <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-white/5">
        {rankings.length === 0 ? (
          <p className="p-8 text-center text-white/60">{t('noRecordsYet')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/50">
                  <th className="px-4 py-3 font-medium">{t('rank')}</th>
                  <th className="px-4 py-3 font-medium">{t('player')}</th>
                  <th className="px-4 py-3 font-medium">{t('streak')}</th>
                  <th className="px-4 py-3 font-medium">{t('achieved')}</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((row, index) => (
                  <tr key={row.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                    <td className="px-4 py-3 font-medium text-white">
                      #{index + 1}
                    </td>
                    <td className="px-4 py-3 text-white">
                      <span className="mr-1.5">{row.country_flag ?? ''}</span>
                      {row.player_name}
                    </td>
                    <td className="px-4 py-3 font-semibold text-brand-400">
                      {row.streak_count}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {formatAchieved(row.achieved_at, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
