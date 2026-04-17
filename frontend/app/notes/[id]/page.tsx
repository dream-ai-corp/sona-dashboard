'use client';

import { useEffect, useState, useCallback, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { marked } from 'marked';
import {
  Save,
  Trash2,
  ArrowLeft,
  Eye,
  Edit3,
  Tag,
  ChevronDown,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  File,
} from 'lucide-react';

interface NoteData {
  id: string;
  content: string;
  frontmatter: Record<string, string>;
  updatedAt: number;
}

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

marked.setOptions({ breaks: true });

function MarkdownPreview({ content }: { content: string }) {
  const html = marked.parse(content) as string;
  return (
    <div
      style={{
        color: '#cbd5e1',
        fontSize: '14px',
        lineHeight: 1.8,
        fontFamily: 'inherit',
      }}
      className="md-preview"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function fileIcon(type: string) {
  if (type.startsWith('image/')) return <ImageIcon size={13} />;
  if (type === 'application/pdf') return <FileText size={13} />;
  return <File size={13} />;
}

export default function NoteEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [content, setContent] = useState('');
  const [associatedProject, setAssociatedProject] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [showProjectDrop, setShowProjectDrop] = useState(false);

  // File upload state
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchNote = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error('Note not found');
      const data = await res.json() as NoteData;
      setContent(data.content);
      setAssociatedProject(data.frontmatter?.associatedProject ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load note');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchNote(); }, [fetchNote]);

  useEffect(() => {
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
  }, []);

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

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      // If file is attached, append extracted content or reference
      let finalContent = content;
      if (attachedFile) {
        const sep = '\n\n---\n\n';
        const fileBlock = attachedFile.extractedText
          ? `**Fichier joint : ${attachedFile.name}**\n\n${attachedFile.extractedText}`
          : `**Fichier joint : [${attachedFile.name}](${attachedFile.url})**`;
        if (!finalContent.includes(`Fichier joint : ${attachedFile.name}`)) {
          finalContent = finalContent + sep + fileBlock;
        }
      }

      const res = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: finalContent, associatedProject: associatedProject || undefined }),
      });
      if (!res.ok) throw new Error('Save failed');
      if (attachedFile) {
        setContent(finalContent);
        setAttachedFile(null);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await fetch(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      router.push('/notes');
    } catch {
      setDeleting(false);
    }
  };

  // Derive title from first H1
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : id;

  // Auto-save on Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>
      <Sidebar />
      <main style={{ flex: 1, marginLeft: '240px', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* Top bar */}
        <div className="sona-page-topbar" style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '14px 28px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(15,15,26,0.8)', backdropFilter: 'blur(10px)',
          position: 'sticky', top: 0, zIndex: 40,
          flexWrap: 'wrap',
        }}>
          <button
            onClick={() => router.push('/notes')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'none', border: 'none', color: '#64748b',
              cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit',
              padding: '4px 0',
            }}
          >
            <ArrowLeft size={14} />
            Notes
          </button>

          <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.08)' }} />

          {/* Title display */}
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </span>

          {/* Project association */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowProjectDrop((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '5px 10px', borderRadius: '8px',
                background: associatedProject ? 'rgba(6,182,212,0.1)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${associatedProject ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.08)'}`,
                color: associatedProject ? '#67e8f9' : '#475569',
                fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <Tag size={11} />
              {associatedProject || 'No project'}
              <ChevronDown size={11} />
            </button>
            {showProjectDrop && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', right: 0,
                background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px', padding: '4px', zIndex: 50,
                minWidth: '180px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}>
                <button
                  onClick={() => { setAssociatedProject(''); setShowProjectDrop(false); }}
                  style={{
                    width: '100%', padding: '7px 12px', textAlign: 'left',
                    background: 'none', border: 'none', color: '#64748b',
                    fontSize: '12px', cursor: 'pointer', borderRadius: '6px',
                    fontFamily: 'inherit',
                  }}
                >
                  None
                </button>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setAssociatedProject(p.id); setShowProjectDrop(false); }}
                    style={{
                      width: '100%', padding: '7px 12px', textAlign: 'left',
                      background: associatedProject === p.id ? 'rgba(6,182,212,0.1)' : 'none',
                      border: 'none',
                      color: associatedProject === p.id ? '#67e8f9' : '#94a3b8',
                      fontSize: '12px', cursor: 'pointer', borderRadius: '6px',
                      fontFamily: 'inherit',
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mode switcher */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '2px' }}>
            {(['edit', 'split', 'preview'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: '4px 10px', borderRadius: '6px', fontSize: '11px',
                  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  background: mode === m ? 'rgba(124,58,237,0.3)' : 'none',
                  border: 'none',
                  color: mode === m ? '#c4b5fd' : '#475569',
                  display: 'flex', alignItems: 'center', gap: '4px',
                  transition: 'all 150ms',
                }}
              >
                {m === 'edit' && <Edit3 size={10} />}
                {m === 'preview' && <Eye size={10} />}
                {m === 'split' && <span style={{ fontSize: '10px' }}>⊞</span>}
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          {/* Attach file button */}
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
            title="Attach a file (PDF, image, text…)"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px',
              borderRadius: '10px',
              border: attachedFile ? '1px solid rgba(6,182,212,0.4)' : '1px solid rgba(255,255,255,0.1)',
              background: attachedFile ? 'rgba(6,182,212,0.1)' : 'rgba(255,255,255,0.04)',
              color: attachedFile ? '#67e8f9' : '#64748b',
              fontSize: '12px', fontWeight: 600,
              cursor: uploading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'all 200ms',
            }}
          >
            <Paperclip size={13} />
            {uploading ? 'Uploading…' : attachedFile ? attachedFile.name.slice(0, 20) + (attachedFile.name.length > 20 ? '…' : '') : 'Attach'}
          </button>

          {/* Action buttons */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px',
              borderRadius: '10px',
              border: `1px solid ${saved ? 'rgba(34,197,94,0.4)' : 'rgba(124,58,237,0.4)'}`,
              background: saved ? 'rgba(34,197,94,0.15)' : 'rgba(124,58,237,0.15)',
              color: saved ? '#4ade80' : '#a78bfa',
              fontSize: '12px', fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'all 200ms',
            }}
          >
            <Save size={13} />
            {saved ? 'Saved!' : saving ? 'Saving…' : 'Save'}
          </button>

          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(239,68,68,0.3)',
              background: 'rgba(239,68,68,0.08)',
              color: '#f87171',
              fontSize: '12px', fontWeight: 600,
              cursor: deleting ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'all 200ms',
            }}
          >
            <Trash2 size={13} />
            Delete
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            margin: '16px 28px 0',
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '10px', padding: '12px 16px', fontSize: '13px', color: '#f87171',
          }}>
            {error}
          </div>
        )}

        {/* Upload error */}
        {uploadError && (
          <div style={{
            margin: '8px 28px 0',
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: '#f87171',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            {uploadError}
            <button onClick={() => setUploadError(null)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', marginLeft: 'auto' }}><X size={13} /></button>
          </div>
        )}

        {/* Attached file banner */}
        {attachedFile && (
          <div style={{
            margin: '8px 28px 0',
            background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)',
            borderRadius: '10px', padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px',
          }}>
            <span style={{ color: '#67e8f9' }}>{fileIcon(attachedFile.type)}</span>
            <span style={{ color: '#94a3b8', flex: 1 }}>
              <strong style={{ color: '#67e8f9' }}>{attachedFile.name}</strong>
              {attachedFile.extractedText
                ? ` — text extracted (${attachedFile.extractedText.length} chars)`
                : ' — will be attached as link'}
            </span>
            <span style={{ color: '#475569', fontSize: '11px' }}>Will be inserted on Save</span>
            <button
              onClick={() => setAttachedFile(null)}
              style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Editor area */}
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: '13px', color: '#475569' }}>Loading…</div>
          </div>
        ) : (
          <div
            style={{
              flex: 1, display: 'flex',
              height: 'calc(100vh - 65px)',
              overflow: 'hidden',
            }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            {/* Drag overlay */}
            {isDragging && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 100,
                background: 'rgba(6,182,212,0.08)',
                border: '2px dashed rgba(6,182,212,0.5)',
                borderRadius: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{ textAlign: 'center', color: '#67e8f9' }}>
                  <Paperclip size={32} style={{ marginBottom: '8px', opacity: 0.7 }} />
                  <p style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Drop file to attach</p>
                </div>
              </div>
            )}

            {/* Editor pane */}
            {(mode === 'edit' || mode === 'split') && (
              <div style={{
                flex: 1,
                display: 'flex', flexDirection: 'column',
                borderRight: mode === 'split' ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}>
                <div style={{
                  padding: '8px 20px',
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
                  color: '#334155', textTransform: 'uppercase',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  Markdown
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  style={{
                    flex: 1, resize: 'none', outline: 'none',
                    background: 'transparent',
                    border: 'none',
                    color: '#e2e8f0',
                    fontSize: '14px', lineHeight: 1.8,
                    padding: '20px 24px',
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    caretColor: '#a78bfa',
                  }}
                  placeholder={`# Note title\n\nStart writing your note in Markdown…`}
                />
              </div>
            )}

            {/* Preview pane */}
            {(mode === 'preview' || mode === 'split') && (
              <div style={{
                flex: 1,
                display: 'flex', flexDirection: 'column',
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '8px 20px',
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
                  color: '#334155', textTransform: 'uppercase',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  Preview
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
                  {content.trim() ? (
                    <MarkdownPreview content={content} />
                  ) : (
                    <p style={{ color: '#1e293b', fontSize: '13px', fontStyle: 'italic' }}>Nothing to preview yet…</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <style jsx global>{`
        .md-preview h1 { font-size: 22px; font-weight: 700; color: #f1f5f9; margin: 0 0 12px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px; }
        .md-preview h2 { font-size: 18px; font-weight: 600; color: #e2e8f0; margin: 20px 0 8px; }
        .md-preview h3 { font-size: 15px; font-weight: 600; color: #cbd5e1; margin: 16px 0 6px; }
        .md-preview p { margin: 0 0 12px; }
        .md-preview ul, .md-preview ol { margin: 0 0 12px; padding-left: 20px; }
        .md-preview li { margin-bottom: 4px; }
        .md-preview code { background: rgba(124,58,237,0.15); color: #c4b5fd; padding: 1px 5px; border-radius: 4px; font-size: 12px; font-family: monospace; }
        .md-preview pre { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 14px; overflow-x: auto; margin: 0 0 14px; }
        .md-preview pre code { background: none; padding: 0; color: #94a3b8; }
        .md-preview blockquote { border-left: 3px solid rgba(124,58,237,0.5); margin: 0 0 12px; padding: 4px 14px; color: #64748b; }
        .md-preview a { color: #67e8f9; }
        .md-preview hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 16px 0; }
        .md-preview strong { color: #f1f5f9; font-weight: 700; }
        .md-preview em { color: #94a3b8; }
        .md-preview table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 13px; }
        .md-preview th { background: rgba(255,255,255,0.04); color: #94a3b8; padding: 8px 12px; text-align: left; border: 1px solid rgba(255,255,255,0.08); }
        .md-preview td { padding: 7px 12px; border: 1px solid rgba(255,255,255,0.06); color: #cbd5e1; }
      `}</style>
    </div>
  );
}
