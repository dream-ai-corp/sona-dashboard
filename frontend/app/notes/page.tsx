'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import {
  FileText,
  Plus,
  RefreshCw,
  Tag,
  Clock,
  Search,
  Paperclip,
  Upload,
} from 'lucide-react';

interface Note {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
  associatedProject: string | null;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: diffDays > 365 ? 'numeric' : undefined });
}

function NoteCard({ note }: { note: Note }) {
  return (
    <Link href={`/notes/${encodeURIComponent(note.id)}`} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '14px',
          padding: '18px 20px',
          cursor: 'pointer',
          transition: 'all 200ms ease',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          height: '100%',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(124,58,237,0.06)';
          e.currentTarget.style.borderColor = 'rgba(124,58,237,0.3)';
          e.currentTarget.style.boxShadow = '0 0 20px rgba(124,58,237,0.08)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(6,182,212,0.2))',
            border: '1px solid rgba(124,58,237,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FileText size={15} color="#a78bfa" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{
              fontSize: '14px', fontWeight: 700, color: '#f1f5f9',
              margin: 0, lineHeight: 1.3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {note.title}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
              <Clock size={10} color="#475569" />
              <span style={{ fontSize: '10px', color: '#475569' }}>{formatDate(note.updatedAt)}</span>
            </div>
          </div>
        </div>

        {/* Preview */}
        {note.preview && (
          <p style={{
            fontSize: '12px', color: '#64748b', margin: 0, lineHeight: 1.6,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {note.preview}
          </p>
        )}

        {/* Project badge */}
        {note.associatedProject && (
          <div style={{ marginTop: 'auto' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              fontSize: '10px', padding: '2px 8px', borderRadius: '20px',
              background: 'rgba(6,182,212,0.08)', color: '#67e8f9',
              border: '1px solid rgba(6,182,212,0.2)',
            }}>
              <Tag size={8} />
              {note.associatedProject}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

export default function NotesPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchNotes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/notes');
      const data = await res.json() as Note[] | { error: string };
      if (!Array.isArray(data)) throw new Error((data as { error: string }).error || 'Failed to load');
      setNotes(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNotes(); }, []);

  const handleNewNote = () => {
    router.push('/notes/new');
  };

  // Upload a file and create a note from it
  const handleUploadFile = useCallback(async (file: File) => {
    setUploading(true);
    setUploadStatus(`Uploading ${file.name}…`);
    try {
      // 1. Upload the file
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/notes/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json() as { url?: string; name?: string; type?: string; extractedText?: string | null; error?: string };
      if (!uploadRes.ok || !uploadData.url) throw new Error(uploadData.error || 'Upload failed');

      // 2. Create a note from the file
      const noteName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
      const fileBlock = uploadData.extractedText
        ? `**Fichier joint : ${file.name}**\n\n${uploadData.extractedText}`
        : `**Fichier joint : [${file.name}](${uploadData.url})**`;
      const content = fileBlock;

      setUploadStatus('Creating note…');
      const noteRes = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: noteName, content }),
      });
      const noteData = await noteRes.json() as { id?: string; error?: string };
      if (!noteRes.ok || !noteData.id) throw new Error(noteData.error || 'Note creation failed');

      router.push(`/notes/${encodeURIComponent(noteData.id)}`);
    } catch (e) {
      setUploadStatus(null);
      setError(e instanceof Error ? e.message : 'Upload failed');
      setUploading(false);
    }
  }, [router]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUploadFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUploadFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the main area, not a child
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const filtered = search.trim()
    ? notes.filter((n) =>
        n.title.toLowerCase().includes(search.toLowerCase()) ||
        n.preview.toLowerCase().includes(search.toLowerCase()) ||
        (n.associatedProject ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : notes;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>
      <Sidebar />
      <main style={{ flex: 1, marginLeft: '240px', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* Top bar */}
        <div className="sona-page-topbar" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 32px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(15,15,26,0.6)', backdropFilter: 'blur(10px)',
          position: 'sticky', top: 0, zIndex: 40,
          gap: '16px',
        }}>
          <div style={{ flexShrink: 0 }}>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>
              Notes
            </h1>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>
              {filtered.length} note{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Search */}
          <div style={{ flex: 1, maxWidth: '360px', position: 'relative' }}>
            <Search size={13} color="#475569" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px 8px 32px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px', color: '#e2e8f0',
                fontSize: '13px', outline: 'none',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              onClick={fetchNotes}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
                borderRadius: '10px', border: '1px solid rgba(124,58,237,0.3)',
                background: 'rgba(124,58,237,0.1)', color: '#a78bfa',
                fontSize: '12px', fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1, transition: 'all 200ms', fontFamily: 'inherit',
              }}
            >
              <RefreshCw size={13} />
              Refresh
            </button>
            {/* Upload file button */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.csv"
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
                borderRadius: '10px', border: '1px solid rgba(6,182,212,0.3)',
                background: 'rgba(6,182,212,0.08)', color: '#67e8f9',
                fontSize: '12px', fontWeight: 600,
                cursor: uploading ? 'not-allowed' : 'pointer',
                opacity: uploading ? 0.7 : 1, transition: 'all 200ms', fontFamily: 'inherit',
              }}
            >
              <Upload size={13} />
              {uploading ? uploadStatus ?? 'Uploading…' : 'Upload File'}
            </button>
            <button
              onClick={handleNewNote}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px',
                borderRadius: '10px', border: '1px solid rgba(124,58,237,0.5)',
                background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(6,182,212,0.15))',
                color: '#c4b5fd',
                fontSize: '12px', fontWeight: 600,
                cursor: 'pointer', transition: 'all 200ms', fontFamily: 'inherit',
              }}
            >
              <Plus size={13} />
              New Note
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          style={{ flex: 1, padding: '28px 32px' }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 200,
              background: 'rgba(6,182,212,0.07)',
              border: '3px dashed rgba(6,182,212,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{ textAlign: 'center', color: '#67e8f9' }}>
                <Paperclip size={48} style={{ marginBottom: '12px', opacity: 0.8 }} />
                <p style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px' }}>Drop to create note</p>
                <p style={{ fontSize: '14px', color: '#22d3ee', margin: 0 }}>PDF, image, text, doc…</p>
              </div>
            </div>
          )}

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '12px', padding: '16px', marginBottom: '24px',
              fontSize: '13px', color: '#f87171',
            }}>
              {error}
            </div>
          )}

          {/* Drop zone hint (always visible, subtle) */}
          {!loading && (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '1.5px dashed rgba(255,255,255,0.07)',
                borderRadius: '14px',
                padding: '18px 24px',
                marginBottom: '20px',
                display: 'flex', alignItems: 'center', gap: '14px',
                cursor: uploading ? 'not-allowed' : 'pointer',
                transition: 'all 200ms',
                background: 'rgba(255,255,255,0.01)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(6,182,212,0.35)'; e.currentTarget.style.background = 'rgba(6,182,212,0.03)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.background = 'rgba(255,255,255,0.01)'; }}
            >
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Upload size={16} color="#67e8f9" />
              </div>
              <div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#475569', margin: '0 0 2px' }}>
                  {uploading ? uploadStatus ?? 'Uploading…' : 'Drop a file here or click to upload'}
                </p>
                <p style={{ fontSize: '11px', color: '#334155', margin: 0 }}>
                  PDF, PNG, JPG, TXT, MD, DOCX — creates a new note automatically
                </p>
              </div>
            </div>
          )}

          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '14px', padding: '20px', height: '140px',
                  animation: 'pulse 2s ease-in-out infinite',
                }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <FileText size={44} color="#1e2535" style={{ margin: '0 auto 14px', display: 'block' }} />
              <p style={{ fontSize: '15px', color: '#334155', margin: '0 0 6px', fontWeight: 600 }}>
                {search ? 'No notes match your search' : 'No notes yet'}
              </p>
              <p style={{ fontSize: '12px', color: '#1e293b', margin: 0 }}>
                {search ? (
                  <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px' }}>
                    Clear search
                  </button>
                ) : (
                  <button onClick={handleNewNote} style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px' }}>
                    Create your first note →
                  </button>
                )}
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
              {filtered.map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
