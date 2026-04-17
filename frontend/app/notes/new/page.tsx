'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { ArrowLeft, FileText, Tag, ChevronDown, Paperclip, X, Image as ImageIcon, File } from 'lucide-react';

interface Project {
  id: string;
  name: string;
}

interface AttachedFile {
  name: string;
  type: string;
  url: string;
  extractedText: string | null;
}

function fileIcon(type: string) {
  if (type.startsWith('image/')) return <ImageIcon size={13} />;
  if (type === 'application/pdf') return <FileText size={13} />;
  return <File size={13} />;
}

export default function NewNotePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [associatedProject, setAssociatedProject] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProjectDrop, setShowProjectDrop] = useState(false);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data: { projects?: Project[] } | Project[]) => {
        const list: Project[] = Array.isArray(data) ? data : (data?.projects ?? []);
        setProjects(list);
      })
      .catch(() => {});
  }, []);

  const handleUploadFile = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError(null);
    // Auto-fill title from filename if blank
    if (!title.trim()) {
      const name = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
      setTitle(name);
    }
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/notes/upload', { method: 'POST', body: formData });
      const data = await res.json() as { url?: string; name?: string; type?: string; extractedText?: string | null; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed');
      setAttachedFile({
        name: data.name ?? file.name,
        type: data.type ?? file.type,
        url: data.url,
        extractedText: data.extractedText ?? null,
      });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [title]);

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

  const handleDragLeave = () => setIsDragging(false);

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) { setError('Title is required'); return; }
    setCreating(true);
    setError(null);
    try {
      // Build initial content from file if attached
      let content = '';
      if (attachedFile) {
        const sep = '\n\n';
        const fileBlock = attachedFile.extractedText
          ? `**Fichier joint : ${attachedFile.name}**\n\n${attachedFile.extractedText}`
          : `**Fichier joint : [${attachedFile.name}](${attachedFile.url})**`;
        content = sep + fileBlock;
      }

      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmed,
          content,
          associatedProject: associatedProject || undefined,
        }),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error || 'Creation failed');
      router.push(`/notes/${encodeURIComponent(data.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Creation failed');
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate();
    if (e.key === 'Escape') router.push('/notes');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>
      <Sidebar />
      <main style={{ flex: 1, marginLeft: '240px', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* Top bar */}
        <div className="sona-page-topbar" style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '20px 32px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(15,15,26,0.6)', backdropFilter: 'blur(10px)',
          position: 'sticky', top: 0, zIndex: 40,
        }}>
          <button
            onClick={() => router.push('/notes')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'none', border: 'none', color: '#64748b',
              cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit',
            }}
          >
            <ArrowLeft size={14} />
            Notes
          </button>
          <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#94a3b8' }}>New Note</span>
        </div>

        {/* Form */}
        <div
          style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 32px' }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div style={{
            width: '100%', maxWidth: '520px',
            background: isDragging ? 'rgba(6,182,212,0.05)' : 'rgba(255,255,255,0.02)',
            border: isDragging ? '2px dashed rgba(6,182,212,0.5)' : '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px',
            padding: '32px',
            transition: 'all 200ms',
          }}>
            {/* Icon */}
            <div style={{
              width: '52px', height: '52px', borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(6,182,212,0.15))',
              border: '1px solid rgba(124,58,237,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '24px',
            }}>
              <FileText size={24} color="#a78bfa" />
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#f1f5f9', margin: '0 0 6px' }}>
              New Note
            </h2>
            <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 28px' }}>
              Give your note a title, or drop a file to attach it.
            </p>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '8px', padding: '10px 14px',
                fontSize: '13px', color: '#f87171', marginBottom: '20px',
              }}>
                {error}
              </div>
            )}

            {uploadError && (
              <div style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '8px', padding: '10px 14px',
                fontSize: '13px', color: '#f87171', marginBottom: '16px',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                {uploadError}
                <button onClick={() => setUploadError(null)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', marginLeft: 'auto' }}>
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Title input */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Title
              </label>
              <input
                ref={titleRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="My awesome note…"
                style={{
                  width: '100%', padding: '11px 14px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', color: '#f1f5f9',
                  fontSize: '15px', outline: 'none',
                  fontFamily: 'inherit', boxSizing: 'border-box',
                  transition: 'border-color 150ms',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'rgba(124,58,237,0.5)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              />
            </div>

            {/* File attachment zone */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Attach File <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — PDF, image, text…)</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.csv"
                style={{ display: 'none' }}
                onChange={handleFileInput}
              />
              {attachedFile ? (
                <div style={{
                  background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.25)',
                  borderRadius: '10px', padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px',
                }}>
                  <span style={{ color: '#67e8f9' }}>{fileIcon(attachedFile.type)}</span>
                  <span style={{ color: '#94a3b8', flex: 1, minWidth: 0 }}>
                    <strong style={{ color: '#67e8f9' }}>{attachedFile.name}</strong>
                    {attachedFile.extractedText
                      ? ` — ${attachedFile.extractedText.length.toLocaleString()} chars extracted`
                      : ' — will be attached as link'}
                  </span>
                  <button
                    onClick={() => setAttachedFile(null)}
                    style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    width: '100%', padding: '20px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1.5px dashed rgba(255,255,255,0.12)',
                    borderRadius: '10px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    transition: 'all 200ms', fontFamily: 'inherit',
                    color: '#475569',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(124,58,237,0.4)'; e.currentTarget.style.background = 'rgba(124,58,237,0.04)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                >
                  <Paperclip size={20} color={uploading ? '#334155' : '#475569'} />
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>
                    {uploading ? 'Uploading…' : 'Click or drag & drop a file here'}
                  </span>
                  <span style={{ fontSize: '11px', color: '#334155' }}>PDF, PNG, JPG, TXT, MD, DOCX, CSV</span>
                </button>
              )}
            </div>

            {/* Project association */}
            <div style={{ marginBottom: '28px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Associated Project <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
              </label>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowProjectDrop((v) => !v)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '11px 14px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px',
                    color: associatedProject ? '#67e8f9' : '#475569',
                    fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Tag size={13} />
                    {associatedProject
                      ? (projects.find((p) => p.id === associatedProject)?.name ?? associatedProject)
                      : 'None'}
                  </span>
                  <ChevronDown size={13} />
                </button>
                {showProjectDrop && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px', padding: '4px', zIndex: 50,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    maxHeight: '200px', overflowY: 'auto',
                  }}>
                    <button
                      onClick={() => { setAssociatedProject(''); setShowProjectDrop(false); }}
                      style={{
                        width: '100%', padding: '8px 12px', textAlign: 'left',
                        background: 'none', border: 'none', color: '#64748b',
                        fontSize: '13px', cursor: 'pointer', borderRadius: '6px', fontFamily: 'inherit',
                      }}
                    >
                      None
                    </button>
                    {projects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setAssociatedProject(p.id); setShowProjectDrop(false); }}
                        style={{
                          width: '100%', padding: '8px 12px', textAlign: 'left',
                          background: associatedProject === p.id ? 'rgba(6,182,212,0.1)' : 'none',
                          border: 'none',
                          color: associatedProject === p.id ? '#67e8f9' : '#94a3b8',
                          fontSize: '13px', cursor: 'pointer', borderRadius: '6px', fontFamily: 'inherit',
                        }}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => router.push('/notes')}
                style={{
                  flex: 1, padding: '11px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px', color: '#64748b',
                  fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || uploading || !title.trim()}
                style={{
                  flex: 2, padding: '11px',
                  background: !title.trim() ? 'rgba(124,58,237,0.08)' : 'linear-gradient(135deg, rgba(124,58,237,0.4), rgba(6,182,212,0.25))',
                  border: '1px solid rgba(124,58,237,0.4)',
                  borderRadius: '10px',
                  color: !title.trim() ? '#475569' : '#c4b5fd',
                  fontSize: '14px', fontWeight: 700,
                  cursor: creating || uploading || !title.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', transition: 'all 200ms',
                }}
              >
                {creating ? 'Creating…' : uploading ? 'Uploading file…' : 'Create Note →'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
