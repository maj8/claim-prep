// Draws a photo-like receipt image for the browser test.
import sharp from 'sharp';
const lines = ['OSCAR GOMEZ FERNANDEZ', 'NIF 30640527L', 'BARAKALDO', 'FECHA 12/10/2026  HORA 22:41', '', 'SERVICIO DE TAXI      35,00', '', 'TOTAL                 35,00 EUR', 'PAGO EFECTIVO', 'GRACIAS'];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1100"><rect width="100%" height="100%" fill="#e9e6df"/>
<rect x="120" y="60" width="660" height="980" fill="#fbfaf6"/>
${lines.map((l, i) => `<text x="160" y="${170 + i * 78}" font-family="DejaVu Sans Mono" font-size="34" fill="#222">${l}</text>`).join('')}</svg>`;
await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(process.argv[2]);
