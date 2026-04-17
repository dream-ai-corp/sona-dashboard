import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        padding: '24px',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f1f5f9', margin: '0 0 6px' }}>
          Sona Dashboard
        </h1>
        <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
          Sign in to your workspace
        </p>
      </div>
      <SignIn />
    </div>
  );
}
