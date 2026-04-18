'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import {
  Images,
  ImageIcon,
  Video,
  Music,
  Download,
  Trash2,
  RefreshCw,
  Filter,
} from 'lucide-react';

type MediaType = 'all' | 'image' | 'video' | 'audio';

interface GalleryItem {
  id: string;
  type: 'image' | 'video' | 'audio';
  prompt: string;
  model: string;
  provider: string | null;
  url: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const TYPE_TABS: { id: MediaType; label: string; icon: React.ReactNode; color: string; bg: string }[] = [
  { id: 'all',   label: 'Tout',   icon: <Images size={14} />,    color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  { id: 'image', label: 'Images', icon: <ImageIcon size={14} />, color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  { id: 'video', label: 'Vidéos', icon: <Video size={14} />,     color: '#67e8f9', bg: 'rgba(103,232,249,0.12)' },
  { id: 'audio', label: 'Audio',  icon: <Music size={14} />,     color: '#4ade80', bg: 'rgba(74,222,128,0.12)'  },
];

function typeColor(t: string) {
  if (t === 'image') return '#a78bfa';
  if (t === 'video') return '#67e8f9';
  return '#4ade80';
}

function typeIcon(t: string, size = 14) {
  if (t === 'image') return <ImageIcon size={size} />;
  if (t === 'video') return <Video size={size} />;
  return <Music size={size} />;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function GalleryCard({
  item,
  onDelete,
}: {
  item: GalleryItem;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const color = typeColor(item.type);
  const isImage = item.type === 'image';
  const isVideo = item.type === 'video';

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = item.url;
    a.download = `${item.type}-${item.id.slice(0, 8)}.${isImage ? 'png' : isVideo ? 'mp4' : 'mp3'}`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/gallery/${item.id}`, { method: 'DELETE' });
      onDelete(item.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      data-testid="gallery-item"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid rgba(255,255,255,0.07)`,
        borderRadius: '14px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 180ms ease, box-shadow 180ms ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = `${color}40`;
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 16px ${color}18`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
      }}
    >
      {/* Media preview */}
      <div
        style={{
          width: '100%',
          aspectRatio: '16/9',
          background: 'rgba(10,10,20,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt={item.prompt}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : isVideo ? (
          <video
            src={item.url}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            muted
            preload="metadata"
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              color: color,
            }}
          >
            <Music size={32} />
            <span style={{ fontSize: '11px', color: '#64748b' }}>Audio</span>
          </div>
        )}

        {/* Type badge */}
        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '20px',
            background: 'rgba(10,10,20,0.75)',
            backdropFilter: 'blur(8px)',
            color: color,
            fontSize: '11px',
            fontWeight: 600,
            border: `1px solid ${color}30`,
          }}
        >
          {typeIcon(item.type, 11)}
          {item.type}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <p
          style={{
            margin: 0,
            fontSize: '13px',
            color: '#cbd5e1',
            lineHeight: 1.45,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {item.prompt}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '10px',
              color: '#475569',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '6px',
              padding: '2px 6px',
            }}
          >
            {item.model}
          </span>
          {item.provider && (
            <span
              style={{
                fontSize: '10px',
                color: '#475569',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '6px',
                padding: '2px 6px',
              }}
            >
              {item.provider}
            </span>
          )}
        </div>

        <p style={{ margin: 0, fontSize: '11px', color: '#475569' }}>{formatDate(item.created_at)}</p>
      </div>

      {/* Actions */}
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          gap: '8px',
        }}
      >
        <button
          data-testid="download-btn"
          onClick={handleDownload}
          title="Télécharger"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '7px 10px',
            borderRadius: '8px',
            border: `1px solid ${color}30`,
            background: `${color}12`,
            color: color,
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'background 150ms ease',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = `${color}22`)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = `${color}12`)}
        >
          <Download size={13} />
          Télécharger
        </button>

        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Supprimer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '7px 10px',
            borderRadius: '8px',
            border: '1px solid rgba(248,113,113,0.25)',
            background: 'rgba(248,113,113,0.08)',
            color: '#f87171',
            cursor: deleting ? 'not-allowed' : 'pointer',
            opacity: deleting ? 0.5 : 1,
            fontFamily: 'inherit',
            transition: 'background 150ms ease',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.16)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.08)')}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function GalleryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const typeParam = (searchParams.get('type') ?? 'all') as MediaType;
  const fromParam = searchParams.get('from') ?? '';
  const toParam = searchParams.get('to') ?? '';

  const validType = TYPE_TABS.find((t) => t.id === typeParam) ? typeParam : 'all';
  const [activeTab, setActiveTab] = useState<MediaType>(validType);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(fromParam);
  const [toDate, setToDate] = useState(toParam);

  const fetchItems = useCallback(
    async (type: MediaType, from: string, to: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (type !== 'all') params.set('type', type);
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        const res = await fetch(`/api/gallery?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setItems(data.items ?? []);
          setTotal(data.total ?? 0);
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const t = TYPE_TABS.find((x) => x.id === typeParam) ? typeParam : 'all';
    setActiveTab(t);
    fetchItems(t, fromParam, toParam);
  }, [typeParam, fromParam, toParam, fetchItems]);

  const handleTabClick = (tab: MediaType) => {
    setActiveTab(tab);
    const params = new URLSearchParams();
    if (tab !== 'all') params.set('type', tab);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    router.push(`/gallery${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const handleFilterApply = () => {
    const params = new URLSearchParams();
    if (activeTab !== 'all') params.set('type', activeTab);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    router.push(`/gallery${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
  };

  const activeTabInfo = TYPE_TABS.find((t) => t.id === activeTab)!;

  return (
    <div data-testid="gallery-page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Top bar */}
      <div
        className="sona-page-topbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 32px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(15,15,26,0.6)',
          backdropFilter: 'blur(10px)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Images size={18} color="#a78bfa" />
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>
              Galerie
            </h1>
            <span
              data-testid="gallery-count"
              style={{
                fontSize: '11px',
                fontWeight: 700,
                background: 'rgba(167,139,250,0.15)',
                color: '#a78bfa',
                border: '1px solid rgba(167,139,250,0.3)',
                borderRadius: '10px',
                padding: '2px 8px',
              }}
            >
              {total}
            </span>
          </div>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>
            Historique de toutes les générations IA
          </p>
        </div>

        {/* Date filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Filter size={14} color="#64748b" />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#94a3b8',
              fontSize: '12px',
              padding: '6px 10px',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <span style={{ color: '#475569', fontSize: '12px' }}>–</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#94a3b8',
              fontSize: '12px',
              padding: '6px 10px',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <button
            onClick={handleFilterApply}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(167,139,250,0.3)',
              background: 'rgba(167,139,250,0.12)',
              color: '#a78bfa',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <RefreshCw size={12} />
            Filtrer
          </button>
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
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            data-testid={`gallery-tab-${tab.id}`}
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

      {/* Grid */}
      <div
        style={{
          flex: 1,
          padding: '32px',
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '80px 32px',
              color: '#475569',
              gap: '10px',
            }}
          >
            <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Chargement…</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : items.length === 0 ? (
          <div
            data-testid="gallery-empty"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              padding: '80px 32px',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                background: `${activeTabInfo.color}18`,
                border: `1px solid ${activeTabInfo.color}30`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: activeTabInfo.color,
              }}
            >
              {activeTabInfo.icon}
            </div>
            <p style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
              Aucune création pour l&apos;instant
            </p>
            <p style={{ fontSize: '13px', color: '#475569', margin: 0, textAlign: 'center', maxWidth: '320px' }}>
              Générez des images, vidéos ou audio depuis la page Média — elles apparaîtront ici automatiquement.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '20px',
            }}
          >
            {items.map((item) => (
              <GalleryCard key={item.id} item={item} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GalleryPage() {
  return (
    <PageShell>
      <Suspense fallback={<div style={{ padding: '40px', color: '#64748b' }}>Chargement…</div>}>
        <GalleryContent />
      </Suspense>
    </PageShell>
  );
}
