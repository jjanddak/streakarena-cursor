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
  return children;
}
