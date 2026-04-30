import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const TARGET_DIRS = [
  'src/app',
  'supabase/functions/server',
];

const ALLOWED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

const IGNORE_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  '.deploy-temp',
  '.playwright-cli',
  'output',
  '.next',
  '.temp',
  'assets',
]);

const MOJIBAKE_REGEX = /(Ã¡|Ã¢|Ã£|Ã§|Ã©|Ãª|Ã­|Ã³|Ã´|Ãµ|Ãº|Ã|Ã‚|Ãƒ|Ã‡|Ã‰|ÃŠ|Ã|Ã“|Ã”|Ã•|Ãš|â€“|â€”|â€|�)/u;

function shouldInspectFile(filePath) {
  return ALLOWED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function walkDirectory(dirPath, files) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIR_NAMES.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkDirectory(fullPath, files);
      continue;
    }
    if (entry.isFile() && shouldInspectFile(fullPath)) {
      files.push(fullPath);
    }
  }
}

function isLikelyTextLiteralLine(line) {
  return line.includes('"') || line.includes("'") || line.includes('`');
}

function main() {
  const files = [];
  for (const target of TARGET_DIRS) {
    const abs = path.join(ROOT, target);
    if (fs.existsSync(abs)) {
      walkDirectory(abs, files);
    }
  }

  const findings = [];

  for (const filePath of files) {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/u);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      if (!isLikelyTextLiteralLine(line)) continue;
      if (!MOJIBAKE_REGEX.test(line)) continue;

      findings.push({
        file: path.relative(ROOT, filePath),
        line: lineIndex + 1,
        snippet: line.trim(),
      });
    }
  }

  if (findings.length === 0) {
    console.log('Portuguese text check passed: no mojibake found.');
    return;
  }

  console.error(`Portuguese text check failed: ${findings.length} mojibake issue(s) found.`);
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line}`);
    console.error(`  ${finding.snippet}`);
  }
  process.exit(1);
}

main();
