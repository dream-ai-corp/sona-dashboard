'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Bot,
  Briefcase,
  Cpu,
  Brain,
  Settings,
  Zap,
} from 'lucide-react';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', route: '/' },
  { icon: Bot,             label: 'Agents',    route: '/agents' },
  { icon: Briefcase,       label: 'Jobs',      route: '/jobs' },
  { icon: Cpu,             label: 'System',    route: '/system' },
  { icon: Brain,           label: 'Memory',    route: '/memory' },
  { icon: Settings,        label: 'Settings',  route: '/system' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: '240px',
        minHeight: '100vh',
        background: 'rgba(15, 15, 26, 0.95)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 50,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: '28px 24px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(124, 58, 237, 0.5)',
              flexShrink: 0,
            }}
          >
            <Zap size={20} color="white" />
          </div>
          <div>
            <div
              style={{
                fontSize: '20px',
                fontWeight: 800,
                letterSpacing: '0.08em',
                background: 'linear-gradient(135deg, #a78bfa, #67e8f9)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                lineHeight: 1.1,
              }}
            >
              SONA
            </div>
            <div style={{ fontSize: '10px', color: '#64748b', letterSpacing: '0.1em', marginTop: '2px' }}>
              AI CONTROL
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map(({ icon: Icon, label, route }) => {
            const isActive = route === '/' ? pathname === '/' : pathname.startsWith(route);
            return (
              <Link
                key={label}
                href={route}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  transition: 'all 200ms ease',
                  background: isActive
                    ? 'rgba(124, 58, 237, 0.15)'
                    : 'transparent',
                  color: isActive ? '#a78bfa' : '#64748b',
                  boxShadow: isActive
                    ? 'inset 0 0 0 1px rgba(124, 58, 237, 0.3), 0 0 12px rgba(124, 58, 237, 0.1)'
                    : 'none',
                  textDecoration: 'none',
                }}
              >
                <Icon size={17} />
                <span style={{ fontSize: '14px', fontWeight: isActive ? 600 : 400 }}>
                  {label}
                </span>
                {isActive && (
                  <div
                    style={{
                      marginLeft: 'auto',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#7c3aed',
                      boxShadow: '0 0 8px rgba(124, 58, 237, 0.8)',
                    }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom status */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            className="status-dot-pulse"
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#22c55e',
              boxShadow: '0 0 8px rgba(34, 197, 94, 0.6)',
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>Online</div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>srv1589372</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
