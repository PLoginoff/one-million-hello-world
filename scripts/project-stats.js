const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set([
  '.git',
  '.idea',
  '.vscode',
  '.github',
  '.windsurf',
  'node_modules',
  'dist',
  'build',
  '.cache',
  '.stryker-tmp',
  'coverage',
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
      files.push(path.join(dir, entry.name));
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

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function formatNum(n) {
  return n.toLocaleString('ru-RU');
}

function printHeader(title) {
  console.log('\n' + '='.repeat(50));
  console.log('  ' + title);
  console.log('='.repeat(50));
}

function printRow(label, value) {
  console.log(`  ${label.padEnd(35)} ${value}`);
}

// --- Collect data ---
const files = walk(ROOT);
const totalFiles = files.length;
let totalLines = 0;

const byExt = {};
const byDir = {};

for (const file of files) {
  const ext = path.extname(file) || '(no ext)';
  byExt[ext] = (byExt[ext] || 0) + 1;

  totalLines += countLines(file);

  const rel = path.relative(ROOT, file);
  const topDir = rel.split(path.sep)[0];
  byDir[topDir] = (byDir[topDir] || 0) + 1;
}

const totalCommits = git('rev-list --count HEAD');
const totalAuthors = git('log --format=%an | sort -u | wc -l');
const lastCommitDate = git('log -1 --format=%cd --date=short');

// --- Output report ---
printHeader('Общая статистика проекта');
printRow('Общее количество файлов', formatNum(totalFiles));
printRow('Примерное количество строк кода', formatNum(totalLines));
printRow('Общее количество коммитов', totalCommits || 'N/A');

printHeader('Git-метрики');
printRow('Количество авторов', totalAuthors || 'N/A');
printRow('Дата последнего коммита', lastCommitDate || 'N/A');

printHeader('Файлы по расширениям');
const sortedExt = Object.entries(byExt).sort((a, b) => b[1] - a[1]);
for (const [ext, count] of sortedExt.slice(0, 15)) {
  printRow(ext, formatNum(count));
}

printHeader('Файлы по директориям (верхний уровень)');
const sortedDir = Object.entries(byDir).sort((a, b) => b[1] - a[1]);
for (const [dir, count] of sortedDir) {
  printRow(dir + '/', formatNum(count));
}

console.log('\n');
