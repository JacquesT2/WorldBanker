import type { Metadata } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'Argentum — Medieval Banking Simulator',
  description: 'A persistent multiplayer medieval banking strategy game',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-parch-100 text-ink-800 font-serif">
        {children}
      </body>
    </html>
  );
}
