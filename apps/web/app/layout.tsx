import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Veo Farm',
  description: 'AI video workflow builder',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
