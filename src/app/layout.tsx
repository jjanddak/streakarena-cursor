import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'StreakArena.io',
  description: 'Global streak challenge platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)] antialiased">
        {children}
      </body>
    </html>
  );
}
