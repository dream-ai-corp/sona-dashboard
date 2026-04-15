'use client';
import Sidebar from '@/components/Sidebar';
import SonaFloatingChat from '@/components/SonaFloatingChat';

export default function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>
      <Sidebar />
      <main style={{ flex: 1, marginLeft: '240px', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {children}
      </main>
      <SonaFloatingChat />
    </div>
  );
}
