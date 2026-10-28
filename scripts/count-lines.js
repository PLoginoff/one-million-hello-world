#!/usr/bin/env node

/**
 * Line counter for One Million Hello World project
 * Counts ALL lines (code, docs, tests, config, etc.)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set([
  '.git', '.idea', '.vscode', '.github', '.windsurf',
  'node_modules', 'dist', 'build', '.cache', '.stryker-tmp', 'coverage'
]);

const SKIP_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2',
  '.ttf', '.eot', '.map', '.lock', '.log'
]);

function walk(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        files.push(...walk(path.join(dir, entry.name)));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!SKIP_EXTS.has(ext)) {
        files.push(path.join(dir, entry.name));
      }
    }
  }
  return files;
}

function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split(/\r?\n/).length;
  } catch {
    return 0;
  }
}

function formatNum(n) {
  return n.toLocaleString('ru-RU');
}

function printHeader(title) {
  console.log('\n' + '='.repeat(60));
  console.log('  ' + title);
  console.log('='.repeat(60));
}

function printRow(label, value, align = 35) {
  console.log(`  ${label.padEnd(align)} ${value}`);
}

function printProgress(current, target) {
  const pct = ((current / target) * 100).toFixed(1);
  const barLen = 40;
  const filled = Math.round((current / target) * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
  console.log(`  Progress: [${bar}] ${pct}% (${formatNum(current)}/${formatNum(target)})`);
}

// --- Collect data ---
const files = walk(ROOT);
const totalFiles = files.length;
let totalLines = 0;

const byExt = {};
const byDir = {};
const byCategory = {
  'TypeScript (src)': 0,
  'TypeScript (tests)': 0,
  'Markdown (docs)': 0,
  'Infrastructure (tf/yml)': 0,
  'Config/Other': 0,
};

for (const file of files) {
  const ext = path.extname(file) || '(no ext)';
  byExt[ext] = (byExt[ext] || 0) + 1;

  const lines = countLines(file);
  totalLines += lines;

  const rel = path.relative(ROOT, file);
  const topDir = rel.split(path.sep)[0];
  byDir[topDir] = (byDir[topDir] || 0) + 1;

  // Categorize
  if (file.includes('/src/') && ext === '.ts') {
    if (file.includes('.test.ts') || file.includes('.spec.ts') || file.includes('/__tests__/')) {
      byCategory['TypeScript (tests)'] += lines;
    } else {
      byCategory['TypeScript (src)'] += lines;
    }
  } else if (ext === '.md') {
    byCategory['Markdown (docs)'] += lines;
  } else if (['.tf', '.yml', '.yaml'].includes(ext)) {
    byCategory['Infrastructure (tf/yml)'] += lines;
  } else {
    byCategory['Config/Other'] += lines;
  }
}

const TARGET = 1_000_000;
const remaining = TARGET - totalLines;

// --- Output report ---
printHeader('One Million Hello World — Line Count');
printProgress(totalLines, TARGET);

printHeader('Общая статистика');
printRow('Всего файлов', formatNum(totalFiles));
printRow('Всего строк', formatNum(totalLines));
printRow('Цель', formatNum(TARGET));
printRow('Осталось', formatNum(remaining));

printHeader('По категориям');
for (const [cat, lines] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
  const pct = ((lines / totalLines) * 100).toFixed(1);
  printRow(cat, `${formatNum(lines)} (${pct}%)`);
}

printHeader('Топ расширений');
const sortedExt = Object.entries(byExt).sort((a, b) => b[1] - a[1]);
for (const [ext, count] of sortedExt.slice(0, 15)) {
  printRow(ext, formatNum(count));
}

printHeader('Топ директории');
const sortedDir = Object.entries(byDir).sort((a, b) => b[1] - a[1]);
for (const [dir, count] of sortedDir.slice(0, 15)) {
  printRow(dir + '/', formatNum(count));
}

// Per-layer breakdown for src/layers
printHeader('Слои (src/layers) — топ-20 по строкам');
const layerStats = {};
const layersPath = path.join(ROOT, 'src/layers');
if (fs.existsSync(layersPath)) {
  for (const layer of fs.readdirSync(layersPath)) {
    const layerPath = path.join(layersPath, layer);
    if (fs.statSync(layerPath).isDirectory()) {
      const layerFiles = walk(layerPath);
      let layerLines = 0;
      for (const f of layerFiles) layerLines += countLines(f);
      if (layerLines > 0) layerStats[layer] = layerLines;
    }
  }
}
const sortedLayers = Object.entries(layerStats).sort((a, b) => b[1] - a[1]);
for (const [layer, lines] of sortedLayers.slice(0, 20)) {
  printRow(layer, formatNum(lines));
}

console.log('\n');