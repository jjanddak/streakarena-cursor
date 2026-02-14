'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';

const ICONS = [
  // Realtime
  <svg key="rt" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
  // Global
  <svg key="gl" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>,
  // Rankings
  <svg key="rk" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
];

export function Features() {
  const t = useTranslations('features');

  const items = [
    { title: t('realtimeTitle'), desc: t('realtimeDesc'), icon: ICONS[0] },
    { title: t('globalTitle'), desc: t('globalDesc'), icon: ICONS[1] },
    { title: t('rankingsTitle'), desc: t('rankingsDesc'), icon: ICONS[2] },
  ];

  return (
    <section className="border-t border-white/[0.06] bg-white/[0.01] py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            {t('heading')}
          </h2>
          <p className="mt-2 text-white/50">{t('subheading')}</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          {items.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="rounded-2xl glass glass-hover p-6"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
                {item.icon}
              </div>
              <h3 className="text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/45">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
