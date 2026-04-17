'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import ImageGenModal from '@/components/ImageGenModal';
import { ImageIcon, Video, Music, Layers } from 'lucide-react';

type Tab = 'image' | 'video' | 'audio';

const TABS: { id: Tab; label: string; icon: React.ReactNode; color: string; bg: string }[] = [
  { id: 'image', label: 'Image', icon: <ImageIcon size={15} />, color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  { id: 'video', label: 'Vidéo', icon: <Video size={15} />,     color: '#67e8f9', bg: 'rgba(103,232,249,0.12)' },
  { id: 'audio', label: 'Audio', icon: <Music size={15} />,     color: '#4ade80', bg: 'rgba(74,222,128,0.12)'  },
];

function ComingSoon({ label, color }: { label: string; color: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '80px 32px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '600px',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: `${color}18`,
          border: `1px solid ${color}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        🚧
      </div>
      <p style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>{label}</p>
      <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>Bientôt disponible — Sprint 3</p>
    </div>
  );
}

function MediaContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('tab') as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(
    tabParam === 'video' || tabParam === 'audio' ? tabParam : 'image'
  );

  useEffect(() => {
    if (tabParam === 'video' || tabParam === 'audio' || tabParam === 'image') {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab);
    router.push(`/media?tab=${tab}`);
  };

  const activeInfo = TABS.find((t) => t.id === activeTab)!;

  return (
    <div data-testid="media-page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Top bar */}
      <div
        className="sona-page-topbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '20px 32px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(15,15,26,0.6)',
          backdropFilter: 'blur(10px)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Layers size={18} color="#a78bfa" />
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>
              Média
            </h1>
          </div>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>
            Génération d&apos;images, vidéos et audio via IA
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: '2px',
          padding: '0 32px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(10,10,15,0.5)',
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            data-testid={`media-tab-${tab.id}`}
            onClick={() => handleTabClick(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '12px 20px',
              borderRadius: 0,
              border: 'none',
              borderBottom: activeTab === tab.id ? `2px solid ${tab.color}` : '2px solid transparent',
              background: activeTab === tab.id ? tab.bg : 'transparent',
              color: activeTab === tab.id ? tab.color : '#64748b',
              fontSize: '13px',
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 150ms ease',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        style={{
          flex: 1,
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: activeInfo.color }}>{activeInfo.icon}</span>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
            {activeTab === 'image'
              ? 'Générer une image'
              : activeTab === 'video'
              ? 'Générer une vidéo'
              : 'Générer un audio'}
          </h2>
        </div>

        {/* Panel */}
        {activeTab === 'image' && <ImageGenModal />}
        {activeTab === 'video' && <ComingSoon label="Génération vidéo" color="#67e8f9" />}
        {activeTab === 'audio' && <ComingSoon label="Génération audio" color="#4ade80" />}
      </div>
    </div>
  );
}

export default function MediaPage() {
  return (
    <PageShell>
      <Suspense fallback={<div style={{ padding: '40px', color: '#64748b' }}>Chargement…</div>}>
        <MediaContent />
      </Suspense>
    </PageShell>
  );
}
