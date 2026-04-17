#!/usr/bin/env node
/**
 * Migrate existing <!-- audit: STATUS — detail --> comments from backlog.md files
 * into the audit_reports table via POST /api/audits.
 *
 * Usage:
 *   node migrate-audit-comments.js [--dry-run]
 *   BACKEND_URL=http://localhost:3011 node migrate-audit-comments.js
 *
 * Run on host or inside backend container. The DB is accessed via HTTP API.
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const PROJECTS_DIR = process.env.PROJECTS_DIR || '/home/beniben/sona-workspace/projects';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3011';

console.log(`[migrate-audit-comments] starting (dry-run=${DRY_RUN})`);
console.log(`[migrate-audit-comments] projects: ${PROJECTS_DIR}`);
console.log(`[migrate-audit-comments] backend:  ${BACKEND_URL}`);

function parseAuditComments(content, projectSlug) {
  const lines = content.split('\n');
  const results = [];
  let currentSprint = '';
  let lastItemId = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track ## heading = sprint
    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      currentSprint = h2Match[1].trim();
      lastItemId = null;
      continue;
    }

    // Track last backlog item
    const itemMatch = line.match(/^- \[.\]\s+(.+)/);
    if (itemMatch) {
      const itemText = itemMatch[1]
        .replace(/^\(job:[^)]+\)\s*/, '')
        .replace(/^\[P[123]\]\s*/, '')
        .trim();
      const idMatch = itemText.match(/\*\*([A-Z][A-Z0-9-]+)\*\*/);
      lastItemId = idMatch ? idMatch[1] : itemText.slice(0, 80);
      continue;
    }

    // Parse <!-- audit: PASS/PARTIAL/FAIL — optional detail -->
    const auditMatch = line.match(/<!--\s*audit:\s*(PASS|PARTIAL|FAIL)(?:\s*[—–-]+\s*(.+?))?\s*-->/i);
    if (auditMatch) {
      if (!currentSprint) {
        console.warn(`  [skip] line ${i + 1}: no sprint context`);
        continue;
      }
      results.push({
        project: projectSlug,
        sprint: currentSprint,
        item_id: lastItemId ?? null,
        status: auditMatch[1].toLowerCase(),
        detail: auditMatch[2]?.trim() ?? null,
      });
    }
  }
  return results;
}

async function run() {
  const slugs = fs.existsSync(PROJECTS_DIR)
    ? fs.readdirSync(PROJECTS_DIR).filter((name) => {
        if (name.startsWith('_')) return false;
        const dir = path.join(PROJECTS_DIR, name);
        try { return fs.statSync(dir).isDirectory(); } catch { return false; }
      })
    : [];

  let inserted = 0;
  let skipped = 0;

  for (const slug of slugs) {
    const backlogPath = path.join(PROJECTS_DIR, slug, 'backlog.md');
    if (!fs.existsSync(backlogPath)) continue;

    const content = fs.readFileSync(backlogPath, 'utf-8');
    const audits = parseAuditComments(content, slug);
    if (audits.length === 0) continue;

    console.log(`\n[${slug}] ${audits.length} audit comment(s) found`);

    for (const a of audits) {
      const label = `${a.sprint} / ${a.item_id ?? '(sprint)'} = ${a.status}`;
      if (DRY_RUN) {
        console.log(`  [dry-run] ${label}`);
        inserted++;
        continue;
      }
      try {
        const res = await fetch(`${BACKEND_URL}/api/audits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(a),
        });
        const data = await res.json();
        if (res.ok) {
          console.log(`  [ok] ${label}`);
          inserted++;
        } else {
          console.error(`  [err] ${label}: ${data.error ?? res.status}`);
          skipped++;
        }
      } catch (err) {
        console.error(`  [err] ${label}: ${err.message}`);
        skipped++;
      }
    }
  }

  console.log(`\n[migrate-audit-comments] done. inserted=${inserted} skipped=${skipped}`);
}

run().catch((err) => { console.error(err); process.exit(1); });
