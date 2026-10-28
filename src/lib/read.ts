// Reads a receipt on the phone itself: photos with Tesseract text recognition, PDFs from their text layer
// (or recognition when scanned), Word files from their XML. The text recognition files are served with the app.
import type { Kind } from './model';
import { docxXmlToText, linesFromBoxes } from './parse';

export type Progress = (msg: string) => void;
const BASE = new URL(import.meta.env.BASE_URL, location.href).href;

export function kindOf(f: File): Kind | null {
  const n = f.name.toLowerCase();
  if (f.type === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.docx') || f.type.includes('wordprocessingml')) return 'docx';
  if (f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/.test(n)) return 'image';
  return null;
}

// ---- images --------------------------------------------------------------------------------

async function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions); }
  catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image(); img.src = url; await img.decode(); return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
}

function drawScaled(src: CanvasImageSource & { width: number; height: number }, maxSide: number): HTMLCanvasElement {
  const k = Math.min(1, maxSide / Math.max(src.width, src.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(src.width * k); cv.height = Math.round(src.height * k);
  cv.getContext('2d')!.drawImage(src, 0, 0, cv.width, cv.height);
  return cv;
}

const toBlob = (cv: HTMLCanvasElement, q = 0.85) => new Promise<Blob>((ok, no) => cv.toBlob(b => (b ? ok(b) : no(new Error('Could not save the image'))), 'image/jpeg', q));

/** Grey, contrast-stretched copy for text recognition: helps with crinkled or faint thermal receipts. */
function forOcr(cv: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height;
  const ctx = out.getContext('2d')!; ctx.drawImage(cv, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height); const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = g; hist[g]++; }
  const n = d.length / 4; let lo = 0, hi = 255, acc = 0;
  for (; lo < 255; lo++) { acc += hist[lo]; if (acc > n * 0.01) break; }
  acc = 0; for (; hi > 0; hi--) { acc += hist[hi]; if (acc > n * 0.01) break; }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span)); d[i] = d[i + 1] = d[i + 2] = v; }
  ctx.putImageData(img, 0, 0);
  return out;
}

// ---- text recognition ----------------------------------------------------------------------

type TWorker = { recognize: (img: HTMLCanvasElement) => Promise<{ data: any }> };
let worker: Promise<TWorker> | null = null;
let onProgress: Progress = () => {};

function getWorker(): Promise<TWorker> {
  if (!worker) {
    worker = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker('eng', 1, {
        workerPath: BASE + 'tess/worker.min.js', corePath: BASE + 'tess/', langPath: BASE + 'tess/lang', gzip: true, workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') onProgress(`Reading the text… ${Math.round(m.progress * 100)}%`);
          else if (/loading/.test(m.status)) onProgress('Getting text recognition ready (first time only)…');
        },
      }) as unknown as TWorker;
    })();
    worker.catch(() => { worker = null; });
  }
  return worker;
}

async function ocr(cv: HTMLCanvasElement, progress: Progress): Promise<string> {
  onProgress = progress;
  const w = await getWorker();
  const { data } = await w.recognize(forOcr(cv));
  const words: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[] = data.words || [];
  if (words.length) {
    return linesFromBoxes(words.filter(x => x.text.trim()).map(x => ({ text: x.text, left: x.bbox.x0, top: x.bbox.y0, height: x.bbox.y1 - x.bbox.y0 })));
  }
  return String(data.text || '');
}

// ---- PDF -----------------------------------------------------------------------------------

async function pdfjs() {
  const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  lib.GlobalWorkerOptions.workerSrc = workerUrl;
  return lib;
}

/** Join the PDF's text pieces into printed lines, keeping words that the PDF split into letters together. */
function pdfLines(items: { str: string; transform: number[]; width: number; height: number }[], pageHeight: number): string {
  const parts = items.filter(i => i.str.trim()).map(i => ({ t: i.str, x: i.transform[4], y: pageHeight - i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || i.height || 10 }));
  parts.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: { y: number; h: number; p: typeof parts }[] = [];
  for (const p of parts) {
    const row = rows.find(r => Math.abs(r.y - p.y) < Math.max(r.h, p.h) * 0.5);
    if (row) row.p.push(p); else rows.push({ y: p.y, h: p.h, p: [p] });
  }
  return rows.sort((a, b) => a.y - b.y).map(r => {
    r.p.sort((a, b) => a.x - b.x);
    let s = '', end = -Infinity;
    for (const p of r.p) {
      const gap = p.x - end;
      s += s ? (gap < p.h * 0.15 ? '' : gap < p.h * 1.2 ? ' ' : '  ') : '';
      s += p.t; end = p.x + p.w;
    }
    return s.replace(/\s{3,}/g, '  ').trim();
  }).join('\n');
}

async function readPdf(blob: Blob, progress: Progress): Promise<{ text: string; preview: Blob | null }> {
  progress('Opening the PDF…');
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, standardFontDataUrl: BASE + 'pdfjs/standard_fonts/', cMapUrl: BASE + 'pdfjs/cmaps/', cMapPacked: true }).promise;
  let text = '';
  for (let n = 1; n <= Math.min(doc.numPages, 3); n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    text += (text ? '\n' : '') + pdfLines(tc.items as any, vp.height);
  }
  const page1 = await doc.getPage(1);
  const render = async (scale: number) => {
    const vp = page1.getViewport({ scale });
    const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    const ctx = cv.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await page1.render({ canvasContext: ctx, viewport: vp }).promise;
    return cv;
  };
  let preview: Blob | null = null;
  try { preview = await toBlob(await render(1.5), 0.8); } catch (e) { console.error('PDF preview failed', e); }
  if ((text.match(/[A-Za-z]/g) || []).length < 20) {
    // A scanned PDF: no text inside, so read the picture of the page.
    text = await ocr(await render(2.6), progress);
  }
  return { text, preview };
}

// ---- Word ----------------------------------------------------------------------------------

async function readDocx(blob: Blob): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')?.async('string');
  return xml ? docxXmlToText(xml) : '';
}

// ---- entry point ---------------------------------------------------------------------------

export interface Imported { kind: Kind; stored: Blob; mime: string; preview: Blob | null; text: string; problem: string }

/** Keep a copy of the receipt (photos shrunk to a sensible size for email) and read its text. */
export async function importFile(f: File, progress: Progress): Promise<Imported> {
  const kind = kindOf(f);
  if (!kind) throw new Error(`${f.name} is not a photo, PDF or Word file.`);
  if (kind === 'image') {
    progress('Preparing the photo…');
    let bmp: ImageBitmap | HTMLImageElement;
    try { bmp = await loadBitmap(f); }
    catch { throw new Error('This phone cannot open that picture format. Take the photo again, or save it as JPEG.'); }
    const big = drawScaled(bmp as any, 2000);
    const stored = await toBlob(big, 0.85);
    const preview = await toBlob(drawScaled(big, 900), 0.75);
    let text = '', problem = '';
    try { text = await ocr(big, progress); } catch (e: any) { problem = 'Text recognition did not run: ' + (e?.message || e); }
    return { kind, stored, mime: 'image/jpeg', preview, text, problem };
  }
  if (kind === 'pdf') {
    try { const { text, preview } = await readPdf(f, progress); return { kind, stored: f, mime: 'application/pdf', preview, text, problem: '' }; }
    catch (e: any) { return { kind, stored: f, mime: 'application/pdf', preview: null, text: '', problem: 'The PDF could not be read: ' + (e?.message || e) }; }
  }
  try { return { kind, stored: f, mime: f.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', preview: null, text: await readDocx(f), problem: '' }; }
  catch (e: any) { return { kind, stored: f, mime: f.type, preview: null, text: '', problem: 'The Word file could not be read: ' + (e?.message || e) }; }
}
