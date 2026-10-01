#!/usr/bin/env node
/**
 * Archives the entire workspace into a zip file and saves it
 * inside the project as `project.zip`, so it appears in the
 * file-explorer sidebar for easy download.
 *
 * Usage:  node download_project.js
 */
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = __dirname;

const outputPath = join(projectRoot, 'project.zip');

// Remove any previous archive so we always get a fresh one
if (existsSync(outputPath)) {
  rmSync(outputPath, { force: true });
}

const excludeArgs = [
  '"node_modules/*"',
  '"node_modules"',
  '"dist/*"',
  '"dist"',
  '".git/*"',
  '".git"',
  '"project.zip"',
].join(' ');

// Use the system zip binary — fast and universally available on Linux/macOS
execSync(`zip -r "${outputPath}" . -x ${excludeArgs}`, {
  cwd: projectRoot,
  stdio: 'inherit',
});

console.log(`\nDone! Archive created at: ${outputPath}`);
console.log('You can now download project.zip from the file-explorer sidebar.');
