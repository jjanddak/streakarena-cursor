import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getGames, getWaitingCount } from '@/lib/games';
import { GameCard } from '@/components/GameCard';
import { HeroSection } from '@/components/HeroSection';
import { Features } from '@/components/Features';
import { Footer } from '@/components/Footer';

type Props = { params: Promise<{ locale: string }> };

const GAME_EMOJI: Record<string, string> = {
  rps: '✊',
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const tGame = await getTranslations('game');
  const games = await getGames();

  const gamesWithCount = await Promise.all(
    games.map(async (game) => ({
      ...game,
      waitingCount: await getWaitingCount(game.id),
    }))
  );

  const champion = games[0]?.current_champion;

  return (
    <div className="relative">
      {/* Hero */}
      <HeroSection />

      {/* Champion Banner */}
      <section className="relative border-y border-white/[0.06] bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-lg shadow-lg shadow-amber-500/25">
                👑
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-white/40">
                  {t('currentChampion')}
                </p>
                {champion?.player_name ? (
                  <p className="text-base font-semibold text-white">
                    {champion.country_flag ?? ''} {champion.player_name}
                    <span className="ml-2 text-sm font-normal text-brand-400">
                      {tGame('streak', { count: champion.streak ?? 0 })}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-white/50">{t('noChampion')}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Games */}
      <section className="relative py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              {t('gameList')}
            </h2>
            <p className="mt-2 text-white/50">{t('gameListDesc')}</p>
          </div>
          <div className="mx-auto grid max-w-2xl gap-5 sm:grid-cols-2">
            {gamesWithCount.map((game) => (
              <GameCard
                key={game.id}
                name={game.name}
                slug={game.slug}
                waitingCount={game.waitingCount}
                emoji={GAME_EMOJI[game.slug] ?? '🎮'}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <Features />

      {/* Footer */}
      <Footer />
    </div>
  );
}
