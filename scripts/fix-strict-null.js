#!/usr/bin/env node

const { Project } = require('ts-morph');
const ts = require('typescript');
const path = require('path');

const project = new Project({
  tsConfigFilePath: path.join(__dirname, '..', 'tsconfig.json'),
});

const diagnostics = project.getPreEmitDiagnostics();

let fixedCount = 0;
let skippedCount = 0;

for (const diagnostic of diagnostics) {
  const code = diagnostic.getCode();
  const sourceFile = diagnostic.getSourceFile();
  const start = diagnostic.getStart();

  if (!sourceFile || start === undefined) {
    continue;
  }

  if (code !== 2532 && code !== 18048 && code !== 2322) {
    continue;
  }

  const filePath = sourceFile.getFilePath();
  const file = project.getSourceFile(filePath);
  if (!file) {
    continue;
  }

  let node = file.getDescendantAtPos(start);
  if (!node) {
    continue;
  }

  let target = findNonNullTarget(node);
  if (!target) {
    skippedCount++;
    continue;
  }

  const text = target.getText();
  if (text.endsWith('!')) {
    continue;
  }

  const replacement = `${needsParens(target) ? `(${text})` : text}!`;
  target.replaceWithText(replacement);
  fixedCount++;
}

project.saveSync();
console.log(`Added non-null assertions: ${fixedCount}`);
console.log(`Skipped (could not find target): ${skippedCount}`);

function findNonNullTarget(node) {
  let current = node;
  while (current) {
    const kind = current.getKind();
    if (
      kind === ts.SyntaxKind.PropertyAccessExpression ||
      kind === ts.SyntaxKind.ElementAccessExpression ||
      kind === ts.SyntaxKind.CallExpression ||
      kind === ts.SyntaxKind.NewExpression
    ) {
      return current;
    }
    if (kind === ts.SyntaxKind.Identifier) {
      const parent = current.getParent();
      if (!parent) {
        return current;
      }
      const parentKind = parent.getKind();
      if (
        parentKind === ts.SyntaxKind.PropertyAccessExpression ||
        parentKind === ts.SyntaxKind.ElementAccessExpression ||
        parentKind === ts.SyntaxKind.CallExpression ||
        parentKind === ts.SyntaxKind.NewExpression
      ) {
        current = parent;
        continue;
      }
      return current;
    }
    current = current.getParent();
  }
  return null;
}

function needsParens(node) {
  const kind = node.getKind();
  return kind === ts.SyntaxKind.ElementAccessExpression;
}
