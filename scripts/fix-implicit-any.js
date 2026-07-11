#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');

// Properties that commonly appear as empty arrays in test objects and cause TS7018.
const TYPED_ARRAY_PROPS = new Map([
  ['sorts', 'SortClause[]'],
  ['projections', 'ProjectionClause[]'],
  ['groups', 'GroupClause[]'],
  ['aggregations', 'AggregationClause[]'],
  ['having', 'HavingClause[]'],
  ['joins', 'JoinClause[]'],
  ['warnings', 'ValidationWarning[]'],
  ['errors', 'ValidationError[]'],
]);

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  for (const [prop, type] of TYPED_ARRAY_PROPS.entries()) {
    // Match: prop: []
    const regex = new RegExp(`(${prop}:\\s*)\\[\\]`, 'g');
    content = content.replace(regex, `$1[] as ${type}`);
  }

  // Generic fallback for remaining object-literal empty arrays that lack context.
  // We only touch lines that contain a known property name pattern to avoid overreach.
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
console.log(`Fixed implicit any array literals in ${modifiedCount} test files`);
