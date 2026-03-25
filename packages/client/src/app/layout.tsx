import type { Metadata } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'Argentum — Medieval Banking Simulator',
  description: 'A persistent multiplayer medieval banking strategy game',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-800 text-parch-100 font-serif">
        {children}
      </body>
    </html>
  );
}
