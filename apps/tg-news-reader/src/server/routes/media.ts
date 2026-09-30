import { createReadStream, existsSync, statSync } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';
import { Hono } from 'hono';

const router = new Hono();

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

// GET /api/media/:channel/:filename
// Supports HTTP Range requests (required for video seeking in browsers)
router.get('/:channel/:filename', (c) => {
  const channel = c.req.param('channel');
  const filename = c.req.param('filename');

  // Prevent path traversal
  if (channel.includes('..') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return c.json({ error: 'Invalid path' }, 400);
  }

  const filepath = join(process.cwd(), 'data', channel, filename);
  if (!existsSync(filepath)) return c.json({ error: 'Not found' }, 404);

  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const contentType = MIME[ext] ?? 'application/octet-stream';
  const { size: totalSize } = statSync(filepath);

  const rangeHeader = c.req.header('range');

  if (rangeHeader) {
    const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (!match || totalSize === 0 || (!match[1] && !match[2])) {
      return c.body(null, 416, {
        'Content-Range': `bytes */${totalSize}`,
      });
    }

    let start: number;
    let end: number;

    if (!match[1]) {
      const suffixLength = parseInt(match[2], 10);
      if (suffixLength <= 0) {
        return c.body(null, 416, {
          'Content-Range': `bytes */${totalSize}`,
        });
      }
      start = Math.max(totalSize - suffixLength, 0);
      end = totalSize - 1;
    } else {
      start = parseInt(match[1], 10);
      end = match[2] ? Math.min(parseInt(match[2], 10), totalSize - 1) : totalSize - 1;
    }

    if (start >= totalSize || start > end) {
      return c.body(null, 416, {
        'Content-Range': `bytes */${totalSize}`,
      });
    }

    const chunkSize = end - start + 1;
    const nodeStream = createReadStream(filepath, { start, end });
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return c.body(webStream, 206, {
      'Content-Type': contentType,
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Content-Length': String(chunkSize),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
    });
  }

  // Full file response — stream instead of buffering the whole file in memory
  const nodeStream = createReadStream(filepath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return c.body(webStream, 200, {
    'Content-Type': contentType,
    'Content-Length': String(totalSize),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=86400',
  });
});

export default router;
