import { readdir } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const RED = "#FE3821";

async function loadSharp() {
  const pnpmDir = join(process.cwd(), "node_modules", ".pnpm");
  const entries = await readdir(pnpmDir);
  const sharpDir = entries.find((e) => e.startsWith("sharp@"));
  if (!sharpDir) throw new Error("sharp not found in node_modules/.pnpm");
  const mod = await import(
    pathToFileURL(join(pnpmDir, sharpDir, "node_modules", "sharp", "lib", "index.js")).href
  );
  return mod.default;
}

const sharp = await loadSharp();

function brandMarkSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${RED}"/>
  <rect x="156" y="116" width="88" height="280" rx="12" fill="#FFFFFF"/>
  <rect x="156" y="116" width="188" height="134" rx="67" fill="#FFFFFF"/>
  <rect x="156" y="250" width="212" height="146" rx="73" fill="#FFFFFF"/>
  <ellipse cx="248" cy="183" rx="44" ry="34" fill="${RED}"/>
  <ellipse cx="258" cy="323" rx="50" ry="38" fill="${RED}"/>
</svg>`;
}

async function renderPng(size) {
  return sharp(Buffer.from(brandMarkSvg()))
    .resize(size, size)
    .png()
    .toBuffer();
}

async function buildIco(sizes) {
  const pngs = [];
  for (const size of sizes) pngs.push(await renderPng(size));
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  let offset = 6 + 16 * count;
  const entries = [];
  for (let i = 0; i < count; i++) {
    const entry = Buffer.alloc(16);
    const size = sizes[i];
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(pngs[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...pngs]);
}

const targets = [
  ["public/favicon.png", 64],
  ["public/favicon-16x16.png", 16],
  ["public/favicon-32x32.png", 32],
  ["public/apple-touch-icon.png", 180],
  ["public/android-chrome-192x192.png", 192],
  ["public/android-chrome-512x512.png", 512],
  ["public/transparent-logo.png", 512],
];

for (const [path, size] of targets) {
  await writeFile(path, await renderPng(size));
  console.log(`${path} (${size}x${size})`);
}

await writeFile("public/favicon.ico", await buildIco([16, 32]));
console.log("public/favicon.ico (16+32)");

const probe = await sharp(await renderPng(512)).extract({ left: 200, top: 150, width: 1, height: 1 }).raw().toBuffer();
const bg = await sharp(await renderPng(512)).extract({ left: 5, top: 5, width: 1, height: 1 }).raw().toBuffer();
console.log(`probe bowl rgb: ${probe[0]},${probe[1]},${probe[2]} | bg rgb: ${bg[0]},${bg[1]},${bg[2]}`);
if (probe[0] < 200 || probe[1] > 100 || bg[1] > 100) {
  console.error("verification failed: expected white glyph on red tile");
  process.exit(1);
}
