#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');
const TYPES_PATH = 'layers/http-parser/types/http-parser-types';

function relativeImport(fromFile, toModule) {
  const fromDir = path.dirname(fromFile);
  const relative = path.relative(fromDir, path.join(ROOT, toModule));
  return relative
    .replace(/\\/g, '/')
    .replace(/^/, './')
    .replace(/\/index$/, '');
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  const needsHttpMethod = /'(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)' as const/.test(content);
  const needsHttpVersion = /'HTTP\/[0-9]\.[0-9]' as const/.test(content);

  if (!needsHttpMethod && !needsHttpVersion) {
    return false;
  }

  const imports = [];
  if (needsHttpMethod) imports.push('HttpMethod');
  if (needsHttpVersion) imports.push('HttpVersion');

  const importPath = relativeImport(filePath, TYPES_PATH);
  const importLine = `import { ${imports.join(', ')} } from '${importPath}';\n`;

  if (!content.includes('HttpMethod') && !content.includes('HttpVersion')) {
    // Insert after the last import statement block, or at the top if no imports
    const lines = content.split('\n');
    let lastImportEndIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('import ')) {
        lastImportEndIndex = i;
      }
      if (lastImportEndIndex >= 0 && line.includes("from '")) {
        lastImportEndIndex = i;
      }
    }
    if (lastImportEndIndex >= 0) {
      lines.splice(lastImportEndIndex + 1, 0, importLine.trim());
    } else {
      lines.unshift(importLine.trim());
    }
    content = lines.join('\n');
  }

  content = content.replace(/'GET' as const/g, 'HttpMethod.GET');
  content = content.replace(/'POST' as const/g, 'HttpMethod.POST');
  content = content.replace(/'PUT' as const/g, 'HttpMethod.PUT');
  content = content.replace(/'DELETE' as const/g, 'HttpMethod.DELETE');
  content = content.replace(/'PATCH' as const/g, 'HttpMethod.PATCH');
  content = content.replace(/'HEAD' as const/g, 'HttpMethod.HEAD');
  content = content.replace(/'OPTIONS' as const/g, 'HttpMethod.OPTIONS');

  content = content.replace(/'HTTP\/1\.0' as const/g, 'HttpVersion.HTTP_1_0');
  content = content.replace(/'HTTP\/1\.1' as const/g, 'HttpVersion.HTTP_1_1');
  content = content.replace(/'HTTP\/2\.0' as const/g, 'HttpVersion.HTTP_2_0');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
}

function walk(dir) {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += walk(fullPath);
    } else if (entry.name.endsWith('.test.ts')) {
      if (processFile(fullPath)) {
        count++;
      }
    }
  }
  return count;
}

const modifiedCount = walk(ROOT);
console.log(`Fixed enum literals in ${modifiedCount} test files`);
