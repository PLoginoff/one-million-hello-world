#!/usr/bin/env node

/* eslint-disable no-console */

import { Command } from 'commander';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface PkgJson {
  version: string;
  name: string;
  description: string;
}

const program = new Command();
const pkg: PkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')) as PkgJson;

program.name('omhw').description('One Million Hello World CLI').version(pkg.version);

program
  .command('generate')
  .argument('<layer>', 'layer name in kebab-case')
  .description('Generate a new layer')
  .action((layerName: string) => {
    const script = path.join(__dirname, '../../scripts/generate-new-layers.js');
    execSync(`node ${script} layer ${layerName}`, { stdio: 'inherit' });
  });

program
  .command('deepen')
  .argument('<layer>', 'layer name to deepen')
  .description('Deepen a layer with health, metrics, and error mapper')
  .action((layerName: string) => {
    const script = path.join(__dirname, '../../scripts/deepen-horizontal.js');
    execSync(`node ${script} ${layerName}`, { stdio: 'inherit' });
  });

program
  .command('stats')
  .description('Show project statistics')
  .action(() => {
    const layersPath = path.join(__dirname, '../../src/layers');
    const testsPath = path.join(__dirname, '../../src');

    const layers = fs.existsSync(layersPath)
      ? fs.readdirSync(layersPath).filter((d: string) => fs.statSync(path.join(layersPath, d)).isDirectory()).length
      : 0;

    const countFiles = (dir: string, ext: string): number => {
      if (!fs.existsSync(dir)) return 0;
      let count = 0;
      const walk = (d: string): void => {
        for (const entry of fs.readdirSync(d)) {
          const full = path.join(d, entry);
          if (fs.statSync(full).isDirectory()) walk(full);
          else if (entry.endsWith(ext)) count++;
        }
      };
      walk(dir);
      return count;
    };

    const testFiles = countFiles(testsPath, '.test.ts');

    console.log(`Layers: ${layers}`);
    console.log(`Test files: ${testFiles}`);
  });

program
  .command('lint')
  .description('Run ESLint')
  .action(() => {
    execSync('npm run lint', { stdio: 'inherit' });
  });

program
  .command('test')
  .description('Run all tests')
  .option('-w, --watch', 'Run in watch mode')
  .action((options: { watch?: boolean }) => {
    const watch = options.watch === true;
    const cmd = watch ? 'npm run test:watch' : 'npm test';
    execSync(cmd, { stdio: 'inherit' });
  });

program
  .command('docs')
  .description('Generate documentation')
  .action(() => {
    const script = path.join(__dirname, '../../scripts/generate-docs.js');
    execSync(`node ${script}`, { stdio: 'inherit' });
  });

program.parse();
