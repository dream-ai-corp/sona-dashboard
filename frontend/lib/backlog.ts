export interface BacklogItem {
  index: number;
  lineIndex: number;
  text: string;
  checked: boolean;
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
