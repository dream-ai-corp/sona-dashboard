"use client";

import { useEffect, useState, useCallback } from "react";
import PageShell from "@/components/PageShell";
import { Brain, RefreshCw, FolderOpen, Volume2 } from "lucide-react";

interface BrainVoice {
  brain: string;
  voice: string;
}

export default function MemoryPage() {
  const [brain, setBrain] = useState<BrainVoice | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_SONA_API_URL ?? '';
      const [brainRes, voiceRes] = await Promise.allSettled([
        fetch(`${apiUrl}/api/brain`).then(r => r.json()),
        fetch(`${apiUrl}/api/voice`).then(r => r.json()),
      ]);
      const b = brainRes.status === "fulfilled" ? brainRes.value : null;
      const v = voiceRes.status === "fulfilled" ? voiceRes.value : null;
      // /api/voice returns {ok, en, fr} — show both in human-friendly form.
      const voiceLabel = v?.en && v?.fr ? `${v.en} / ${v.fr}` : (v?.language ?? v?.voice ?? "n/a");
      setBrain({
        brain: b?.mode ?? b?.brain ?? "n/a",
        voice: voiceLabel,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const memPaths = [
    { label: "Brain config", path: "/home/beniben/sona-workspace/.sona-brain.json" },
    { label: "Voice config", path: "/home/beniben/sona-workspace/.sona-voice.json" },
    { label: "Long-term memory (vector store)", path: "/home/beniben/sona-workspace/memory/" },
    { label: "Claude Code memory", path: "/home/beniben/.claude/projects/" },
  ];

  return (
    <PageShell>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 32px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(15,15,26,0.6)", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 40 }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Memory</h1>
          <p style={{ fontSize: "12px", color: "#64748b", margin: "3px 0 0" }}>Brain config and memory file locations</p>
        </div>
        <button onClick={fetchData} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "10px", border: "1px solid rgba(124,58,237,0.3)", background: "rgba(124,58,237,0.1)", color: "#a78bfa", fontSize: "12px", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>
      <div style={{ flex: 1, padding: "28px 32px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {brain && (
          <div style={{ display: "flex", gap: "16px" }}>
            <div className="glass" style={{ flex: 1, borderRadius: "16px", padding: "20px", display: "flex", alignItems: "center", gap: "16px" }}>
              <Brain size={28} color="#a78bfa" />
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Brain Mode</div>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#a78bfa", fontFamily: "monospace" }}>{brain.brain}</div>
              </div>
            </div>
            <div className="glass" style={{ flex: 1, borderRadius: "16px", padding: "20px", display: "flex", alignItems: "center", gap: "16px" }}>
              <Volume2 size={28} color="#67e8f9" />
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Voice Language</div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#67e8f9", fontFamily: "monospace", wordBreak: "break-word" }}>{brain.voice}</div>
              </div>
            </div>
          </div>
        )}
        <div className="glass" style={{ borderRadius: "16px", padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <FolderOpen size={15} color="#a78bfa" />
            <h2 style={{ fontSize: "14px", fontWeight: 600, color: "#e2e8f0", margin: 0 }}>Memory Files</h2>
          </div>
          <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px", lineHeight: 1.6 }}>
            Memory files are managed server-side at the paths below. They are not directly editable from this dashboard.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {memPaths.map(({ label, path }) => (
              <div key={path} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "12px 16px", display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>{label}</span>
                <code style={{ fontSize: "11px", color: "#475569", fontFamily: "monospace" }}>{path}</code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
