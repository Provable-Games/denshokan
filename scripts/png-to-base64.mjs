#!/usr/bin/env node

/**
 * Resize PNG images to a target size and output base64 data URIs.
 *
 * Usage:
 *   node scripts/png-to-base64.mjs [--size 32] [--output dir] file1.png file2.png ...
 *
 * Options:
 *   --size    Target width & height in pixels (default: 32)
 *   --output  Output directory for .txt files (default: same directory as input)
 *
 * Examples:
 *   node scripts/png-to-base64.mjs client/public/number-guess.png client/public/tic-tac-toe.png
 *   node scripts/png-to-base64.mjs --size 128 --output out/ client/public/*.png
 */

import sharp from "sharp";
import { readFile, writeFile, mkdir } from "fs/promises";
import { basename, dirname, join, resolve } from "path";

function parseArgs(argv) {
  const args = argv.slice(2);
  let size = 32;
  let outputDir = null;
  const files = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--size" && args[i + 1]) {
      size = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--output" && args[i + 1]) {
      outputDir = args[i + 1];
      i++;
    } else if (!args[i].startsWith("--")) {
      files.push(args[i]);
    }
  }

  if (files.length === 0) {
    console.error("Usage: png-to-base64.mjs [--size 32] [--output dir] file1.png ...");
    process.exit(1);
  }

  return { size, outputDir, files };
}

async function processImage(filePath, size, outputDir) {
  const resolved = resolve(filePath);
  const name = basename(resolved, ".png");
  const outDir = outputDir ? resolve(outputDir) : dirname(resolved);

  const buffer = await readFile(resolved);
  const resized = await sharp(buffer)
    .resize(size, size, { fit: "cover" })
    .png({ quality: 80, compressionLevel: 9 })
    .toBuffer();

  const base64 = resized.toString("base64");
  const dataUri = `data:image/png;base64,${base64}`;

  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `${name}-base64.txt`);
  await writeFile(outPath, dataUri);

  const originalKB = (buffer.length / 1024).toFixed(1);
  const resizedKB = (resized.length / 1024).toFixed(1);
  const base64KB = (base64.length / 1024).toFixed(1);

  console.log(`${name}.png`);
  console.log(`  original: ${originalKB} KB`);
  console.log(`  resized:  ${size}x${size} → ${resizedKB} KB`);
  console.log(`  base64:   ${base64KB} KB`);
  console.log(`  saved:    ${outPath}`);
}

const { size, outputDir, files } = parseArgs(process.argv);

console.log(`Resizing to ${size}x${size}...\n`);

for (const file of files) {
  await processImage(file, size, outputDir);
  console.log();
}
