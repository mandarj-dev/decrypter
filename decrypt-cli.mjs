#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { decryptAES } from './lib/decrypt.mjs';

function usage() {
  console.error(`Usage:
  node decrypt-cli.mjs --key <secret> --data <base64>
  node decrypt-cli.mjs --json '{"key":"...","data":"..."}'
  echo <base64> | node decrypt-cli.mjs --key <secret>

Options:
  --key, -k     Secret key
  --data, -d    Base64 encrypted payload
  --json, -j    JSON object with "key" and "data" fields
  --help, -h    Show this help`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { key: '', data: '' };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage();
    if (arg === '--key' || arg === '-k') opts.key = argv[++i] ?? '';
    else if (arg === '--data' || arg === '-d') opts.data = argv[++i] ?? '';
    else if (arg === '--json' || arg === '-j') {
      const raw = argv[++i];
      if (!raw) usage();
      const parsed = JSON.parse(raw);
      opts.key = String(parsed.key ?? '').trim();
      opts.data = String(parsed.data ?? '').trim();
    }
  }

  return opts;
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  return readFileSync(0, 'utf8').trim();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.data) {
    opts.data = (await readStdin()).trim();
  }

  if (!opts.key || !opts.data) usage();

  try {
    const decrypted = decryptAES(opts.data, opts.key);
    process.stdout.write(decrypted);
    if (!decrypted.endsWith('\n')) process.stdout.write('\n');
  } catch (error) {
    console.error(error.message || 'Decryption failed');
    process.exit(1);
  }
}

main();
