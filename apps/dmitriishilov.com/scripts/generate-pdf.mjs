import { copyFileSync, readFileSync, statSync } from 'fs';
import { createServer } from 'http';
import { resolve, join, extname } from 'path';
import { chromium } from 'playwright';
const DIST = resolve('dist');
const PUBLIC = resolve('public');
const PORT = 4321;
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
// Simple static file server
const server = createServer((req, res) => {
  let filePath = join(DIST, req.url === '/' ? '/index.html' : req.url);
  // If path ends without extension, try /index.html
  if (!extname(filePath)) filePath = join(filePath, 'index.html');
  try {
    const data = readFileSync(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
async function generatePdf(page, url, outputPath) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: false,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  const size = statSync(outputPath).size;
  console.log(`  ✓ ${outputPath} (${(size / 1024).toFixed(1)} KB)`);
  if (size < 10240) throw new Error(`PDF too small: ${outputPath} is ${size} bytes`);
}
server.listen(PORT, async () => {
  console.log(`Static server on http://localhost:${PORT}`);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    const distPdfPath = resolve('dist/cv-en.pdf');
    const publicPdfPath = join(PUBLIC, 'cv-en.pdf');

    await generatePdf(page, `http://localhost:${PORT}/`, distPdfPath);
    // Keep a copy in public so the same /cv-en.pdf link works in astro dev.
    copyFileSync(distPdfPath, publicPdfPath);
    console.log(`  ✓ ${publicPdfPath} (synced from dist)`);
  } finally {
    await browser.close();
    server.close();
  }
  console.log('PDF generation complete!');
});
