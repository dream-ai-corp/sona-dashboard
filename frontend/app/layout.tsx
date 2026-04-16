import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import SonaFloatingChat from '@/components/SonaFloatingChat';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Sona Dashboard',
  description: "Pierre's AI assistant dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={inter.variable}>
        <body style={{ background: '#0a0a0f', color: '#e2e8f0', minHeight: '100vh' }}>
          {children}
          <SonaFloatingChat />
        </body>
      </html>
    </ClerkProvider>
  );
}
