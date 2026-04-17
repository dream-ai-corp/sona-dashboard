import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const UPLOADS_DIR = '/home/beniben/sona-workspace/uploads';

export async function POST(req: NextRequest) {
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    const originalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const filename = `${timestamp}_${originalName}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);

    let extractedText: string | null = null;
    const mime = file.type;

    if (mime === 'application/pdf' || originalName.endsWith('.pdf')) {
      try {
        // Dynamic import to avoid build-time issues with pdf-parse
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
        const result = await pdfParse(buffer);
        extractedText = result.text.trim().slice(0, 50000); // cap at 50k chars
      } catch {
        extractedText = null;
      }
    } else if (
      mime === 'text/plain' ||
      originalName.endsWith('.txt') ||
      originalName.endsWith('.md')
    ) {
      extractedText = buffer.toString('utf-8').trim().slice(0, 50000);
    }

    return Response.json({
      url: `/api/uploads/${filename}`,
      name: file.name,
      type: mime,
      extractedText,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    return Response.json({ error: msg }, { status: 500 });
  }
}
