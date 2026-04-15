import { type LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  title: string;
  value: string;
  sub?: string;
  trend?: string;
  trendUp?: boolean;
  accent?: 'violet' | 'cyan' | 'green' | 'red';
}

const accentMap = {
  violet: { color: '#a78bfa', glow: 'rgba(124,58,237,0.3)', bg: 'rgba(124,58,237,0.1)' },
  cyan:   { color: '#67e8f9', glow: 'rgba(6,182,212,0.3)',   bg: 'rgba(6,182,212,0.1)'  },
  green:  { color: '#4ade80', glow: 'rgba(34,197,94,0.3)',   bg: 'rgba(34,197,94,0.1)'  },
  red:    { color: '#f87171', glow: 'rgba(239,68,68,0.3)',   bg: 'rgba(239,68,68,0.1)'  },
};

export default function StatCard({ icon: Icon, title, value, sub, trend, trendUp, accent = 'violet' }: StatCardProps) {
  const a = accentMap[accent];

  return (
    <div
      className="glass"
      style={{
        flex: 1,
        borderRadius: '16px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        transition: 'all 200ms ease',
        cursor: 'default',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 24px ${a.glow}`;
        (e.currentTarget as HTMLElement).style.borderColor = a.glow;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
      }}
    >
      {/* Icon + trend row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: a.bg,
            border: `1px solid ${a.glow}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={18} color={a.color} />
        </div>
        {trend && (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '20px',
              background: trendUp ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              color: trendUp ? '#4ade80' : '#f87171',
              border: `1px solid ${trendUp ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}
          >
            {trend}
          </span>
        )}
      </div>

      {/* Value */}
      <div>
        <div style={{ fontSize: '11px', color: '#64748b', letterSpacing: '0.05em', marginBottom: '4px', fontWeight: 500 }}>
          {title.toUpperCase()}
        </div>
        <div style={{ fontSize: '28px', fontWeight: 700, color: a.color, lineHeight: 1 }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
