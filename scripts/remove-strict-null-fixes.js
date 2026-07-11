#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');

function removeNonNullAssertions(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // Remove non-null assertions in expression contexts.
  // Pattern: identifier/expression followed by ! then terminator or operator.
  // We do not touch unary ! (e.g. !value).
  // Valid targets:
  //   foo!;
  //   foo!,
  //   foo!)
  //   foo!]
  //   foo! =
  //   foo! as
  //   foo! ??
  //   foo! ||
  //   foo! &&
  //   foo! ?
  //   (expr)!
  const patterns = [
    /([A-Za-z0-9_\)\]])!([;),\]=\?]|\s+as|\s+\?\?|\s+\|\||\s+&&|\s+\?)/g,
  ];

  for (const pattern of patterns) {
    content = content.replace(pattern, '$1$2');
  }

  // Handle multiline or unusual spacing:  foo!
  //                                      something
  content = content.replace(/([A-Za-z0-9_\)\]])!\n/g, '$1\n');

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
    } else if (entry.name.endsWith('.ts')) {
      if (removeNonNullAssertions(fullPath)) {
        count++;
      }
    }
  }
  return count;
}

const modifiedCount = walk(root);
console.log(`Removed non-null assertions from ${modifiedCount} files`);
