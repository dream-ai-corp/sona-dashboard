'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Download, FolderOpen, RefreshCw } from 'lucide-react';

interface ProjectFile {
  name: string;
  fullPath?: string;
  size: number;
  modified: number;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function groupByFolder(files: ProjectFile[]): Record<string, ProjectFile[]> {
  const groups: Record<string, ProjectFile[]> = {};
  for (const f of files) {
    const slash = f.name.lastIndexOf('/');
    const folder = slash >= 0 ? f.name.slice(0, slash) : '(root)';
    if (!groups[folder]) groups[folder] = [];
    groups[folder].push(f);
  }
  return groups;
}

export default function FilesPanel({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaths, setShowPaths] = useState(false);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/files`);
      if (res.ok) setFiles(await res.json());
    } catch {}
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const groups = groupByFolder(files);
  const folderNames = Object.keys(groups).sort();

  return (
    <div className="glass" style={{ borderRadius: 16, padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FolderOpen size={15} color="#67e8f9" />
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Files</h3>
          <span style={{ fontSize: 11, color: '#64748b' }}>({files.length})</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>          <button onClick={() => setShowPaths(v => !v)} style={{            background: showPaths ? "rgba(103,232,249,0.1)" : "none",            border: showPaths ? "1px solid rgba(103,232,249,0.2)" : "1px solid transparent",            color: showPaths ? "#67e8f9" : "#475569", cursor: "pointer", padding: "3px 8px",            borderRadius: 6, fontSize: 10, fontFamily: "monospace",          }}>path</button>          <button onClick={fetchFiles} disabled={loading} style={{            background: "none", border: "none", color: "#475569", cursor: "pointer", padding: 4,          }}><RefreshCw size={13} /></button>        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', padding: 16 }}>Loading...</div>
      ) : files.length === 0 ? (
        <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', padding: 16 }}>No files found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 400, overflowY: 'auto' }}>
          {folderNames.map(folder => (
            <div key={folder}>
              {folder !== '(root)' && (
                <div style={{ fontSize: 11, color: '#a78bfa', fontFamily: 'monospace', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <FolderOpen size={11} /> {folder}/
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {groups[folder].map(f => {
                  const fileName = f.name.includes('/') ? f.name.split('/').pop()! : f.name;
                  return (
                    <div key={f.name} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 10px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.04)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                        <FileText size={13} color="#67e8f9" style={{ flexShrink: 0 }} />
                        <div style={{ overflow: 'hidden', minWidth: 0 }}>
                          <span style={{ fontSize: 12, color: '#e2e8f0', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
                          {showPaths && <span style={{ fontSize: 9, color: '#475569', fontFamily: 'monospace', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fullPath || f.name}</span>}
                        </div>
                        <span style={{ fontSize: 10, color: '#475569', flexShrink: 0 }}>{humanSize(f.size)}</span>
                      </div>
                      <a
                        href={`/api/projects/${projectId}/files/download?file=${encodeURIComponent(f.name)}`}
                        download
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontSize: 11, color: '#67e8f9', textDecoration: 'none',
                          padding: '4px 8px', borderRadius: 6,
                          background: 'rgba(6,182,212,0.08)',
                          border: '1px solid rgba(6,182,212,0.15)',
                          flexShrink: 0,
                        }}
                      >
                        <Download size={11} /> Download
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
