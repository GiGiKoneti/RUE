#!/usr/bin/env node
/**
 * Bundles Hackat12 workspace (RUE app + root docs) into one JSON ≤10MB.
 * Excludes: node_modules, .git, dist, caches, .env
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUE_ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(RUE_ROOT, '..');
const OUT = path.join(WORKSPACE_ROOT, 'hackat12-submission.json');
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const MAX_FILE_BYTES = 512 * 1024;

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
  '.turbo',
  '.cache',
  '.vite',
  '.cursor',
]);

const BANNED_FILES = new Set(['.env', '.env.local', '.env.production', '.env.development']);

const ALLOW_EXT = new Set([
  '',
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.txt',
  '.html',
  '.css',
  '.scss',
  '.svg',
  '.yml',
  '.yaml',
  '.toml',
  '.sql',
  '.sh',
  '.example',
]);

const ALLOW_DOTFILES = new Set([
  '.gitignore',
  '.gitattributes',
  '.env.example',
  '.editorconfig',
]);

function includeFile(name) {
  if (BANNED_FILES.has(name)) return false;
  if (name.endsWith('.tsbuildinfo')) return false;
  const ext = path.extname(name).toLowerCase();
  if (name.startsWith('.')) return ALLOW_DOTFILES.has(name);
  if (!ALLOW_EXT.has(ext)) return false;
  return true;
}

function walk(dir, pathPrefix, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    const rel = path.posix.join(pathPrefix.replace(/\\/g, '/'), ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      if (ent.name.startsWith('.') && !ALLOW_DOTFILES.has(ent.name)) continue;
      walk(full, rel, out);
    } else if (ent.isFile()) {
      if (!includeFile(ent.name)) continue;
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      let content;
      if (st.size > MAX_FILE_BYTES) {
        content = `/* OMITTED: ${rel} (${st.size} bytes) */\n`;
      } else {
        try {
          content = fs.readFileSync(full, 'utf8');
        } catch {
          continue;
        }
      }
      out.push({ path: rel, content });
    }
  }
}

function addWorkspaceRootDocs(out) {
  const names = ['design.md', 'RUE_CONTEXT.md', 'Implement.md'];
  for (const name of names) {
    const full = path.join(WORKSPACE_ROOT, name);
    if (!fs.existsSync(full)) continue;
    const st = fs.statSync(full);
    if (!st.isFile() || st.size > MAX_FILE_BYTES) continue;
    out.push({
      path: name,
      content: fs.readFileSync(full, 'utf8'),
    });
  }
}

const files = [];
addWorkspaceRootDocs(files);
walk(RUE_ROOT, 'RUE', files);
files.sort((a, b) => a.path.localeCompare(b.path));

const bundle = {
  export: {
    tool: 'RUE/scripts/export-submission-json.mjs',
    workspace: 'Hackat12',
    generatedAt: new Date().toISOString(),
    fileCount: files.length,
    note: 'Regenerate: `node RUE/scripts/export-submission-json.mjs`. Secrets (.env) omitted.',
  },
  files,
};

let json = JSON.stringify(bundle);
if (Buffer.byteLength(json, 'utf8') > MAX_OUTPUT_BYTES) {
  let low = 0,
    high = files.length;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    const trial = {
      export: {
        ...bundle.export,
        truncated: true,
        keptFileCount: mid,
        originalFileCount: files.length,
      },
      files: files.slice(0, mid),
    };
    if (Buffer.byteLength(JSON.stringify(trial), 'utf8') <= MAX_OUTPUT_BYTES * 0.98) low = mid;
    else high = mid - 1;
  }
  json = JSON.stringify({
    export: {
      ...bundle.export,
      truncated: true,
      keptFileCount: low,
      originalFileCount: files.length,
      warning: 'Trimmed to fit 10MB.',
    },
    files: files.slice(0, low),
  });
}

fs.writeFileSync(OUT, json, 'utf8');
const bytes = Buffer.byteLength(json, 'utf8');
console.log(
  JSON.stringify(
    { out: OUT, mb: +(bytes / (1024 * 1024)).toFixed(3), files: JSON.parse(json).files.length },
    null,
    2
  )
);
if (bytes > MAX_OUTPUT_BYTES) {
  console.error('FATAL: exceeds 10MB');
  process.exit(1);
}
