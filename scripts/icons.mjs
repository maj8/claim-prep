// Draws the app icon (a receipt with a tick) and writes the PNG sizes the phones need.
import sharp from 'sharp';
const icon = (pad, bg = true) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${bg ? '<rect width="512" height="512" rx="' + (pad ? 0 : 112) + '" fill="#0f4c5c"/>' : ''}
  <g transform="translate(256 256) scale(${pad ? 0.72 : 0.86}) translate(-256 -256)">
    <path d="M150 92h212v318l-26-18-27 18-26-18-27 18-26-18-27 18-26-18-27 18z" fill="#f6f4ef"/>
    <rect x="186" y="150" width="140" height="18" rx="9" fill="#9fb9bf"/>
    <rect x="186" y="196" width="104" height="18" rx="9" fill="#9fb9bf"/>
    <rect x="186" y="242" width="124" height="18" rx="9" fill="#9fb9bf"/>
    <circle cx="352" cy="352" r="78" fill="#e8a33d"/>
    <path d="M318 352l24 24 46-50" fill="none" stroke="#0f4c5c" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
  </g></svg>`;
const out = 'public/icons/';
await sharp(Buffer.from(icon(false))).resize(192).png().toFile(out + 'icon-192.png');
await sharp(Buffer.from(icon(false))).resize(512).png().toFile(out + 'icon-512.png');
await sharp(Buffer.from(icon(true))).resize(512).png().toFile(out + 'icon-maskable-512.png');
await sharp(Buffer.from(icon(true))).resize(180).png().toFile(out + 'apple-touch-icon.png');
console.log('icons written');
