'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ImageIcon, Video, Music, X } from 'lucide-react';

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  href: string;
  color: string;
  bg: string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    label: 'Image',
    icon: <ImageIcon size={16} />,
    href: '/media?tab=image',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.12)',
  },
  {
    label: 'Vidéo',
    icon: <Video size={16} />,
    href: '/media?tab=video',
    color: '#67e8f9',
    bg: 'rgba(103,232,249,0.12)',
  },
  {
    label: 'Audio',
    icon: <Music size={16} />,
    href: '/media?tab=audio',
    color: '#4ade80',
    bg: 'rgba(74,222,128,0.12)',
  },
];

export default function SonaCreateFab() {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close menu on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handleItem = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div ref={containerRef} style={{ position: 'fixed', right: '92px', bottom: '20px', zIndex: 9998, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>

      {/* Menu items — animate in from bottom */}
      {open && (
        <div
          data-testid="create-fab-menu"
          style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}
        >
          {MENU_ITEMS.map((item) => (
            <button
              key={item.label}
              onClick={() => handleItem(item.href)}
              onMouseEnter={() => setHovered(item.label)}
              onMouseLeave={() => setHovered(null)}
              aria-label={`Créer ${item.label}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px 8px 10px',
                borderRadius: '20px',
                background: hovered === item.label ? item.bg : 'rgba(10,15,26,0.95)',
                border: `1px solid ${hovered === item.label ? item.color : 'rgba(255,255,255,0.1)'}`,
                color: item.color,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                backdropFilter: 'blur(12px)',
                transition: 'background 120ms ease, border-color 120ms ease',
                animation: 'sona-fab-slide-in 180ms ease both',
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* FAB trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Fermer le menu Créer' : 'Créer — Image, Vidéo, Audio'}
        data-testid="create-fab-button"
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '28px',
          background: open
            ? 'linear-gradient(135deg, #0a0f1a, #1e1b4b)'
            : 'linear-gradient(135deg, #6d28d9, #a78bfa, #67e8f9)',
          border: open ? '1px solid rgba(167,139,250,0.5)' : 'none',
          boxShadow: open
            ? '0 4px 16px rgba(124,58,237,0.2)'
            : '0 6px 20px rgba(109,40,217,0.5)',
          color: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 200ms ease, box-shadow 200ms ease, transform 150ms ease',
          transform: open ? 'rotate(15deg)' : 'rotate(0deg)',
        }}
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>

      <style jsx global>{`
        @keyframes sona-fab-slide-in {
          from { opacity: 0; transform: translateY(10px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
      `}</style>
    </div>
  );
}
