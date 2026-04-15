export interface BacklogItem {
  index: number;
  lineIndex: number;
  text: string;
  checked: boolean;
}

export interface BacklogSection {
  header: string | null;
  level: number; // 0 = pre-header; 1/2/3 = #/##/###
  items: BacklogItem[];
}

export function parseBacklog(content: string): BacklogItem[] {
  const items: BacklogItem[] = [];
  const lines = content.split('\n');
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const checked = /^- \[x\]/i.test(line);
    const unchecked = /^- \[ \]/.test(line);
    if (!checked && !unchecked) continue;
    const text = line.replace(/^- \[.\]\s*/, '').replace(/\s*\(job:[^)]+\)/, '').trim();
    items.push({ index: idx++, lineIndex: i, text, checked });
  }
  return items;
}

/**
 * Parse backlog content into sections grouped by markdown headers (# / ## / ###).
 * Items before any header land in a section with header=null, level=0.
 * Item indices are globally sequential (matching parseBacklog) for API compatibility.
 */
export function parseBacklogSections(content: string): BacklogSection[] {
  const sections: BacklogSection[] = [];
  const lines = content.split('\n');
  let current: BacklogSection = { header: null, level: 0, items: [] };
  let itemIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const hm = line.match(/^(#{1,3})\s+(.+)$/);
    if (hm) {
      if (current.header !== null || current.items.length > 0) {
        sections.push(current);
      }
      current = { header: hm[2].trim(), level: hm[1].length, items: [] };
      continue;
    }

    const checked = /^- \[x\]/i.test(line);
    const unchecked = /^- \[ \]/.test(line);
    if (!checked && !unchecked) continue;

    const text = line.replace(/^- \[.\]\s*/, '').replace(/\s*\(job:[^)]+\)/, '').trim();
    current.items.push({ index: itemIdx++, lineIndex: i, text, checked });
  }

  if (current.header !== null || current.items.length > 0) {
    sections.push(current);
  }

  return sections;
}
