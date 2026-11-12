// Production-build guard for VITE_PREVIEW_ROLE.
//
// VITE_PREVIEW_ROLE lets local QA browse any portal without an account
// (see src/contexts/AuthContext.tsx, src/components/common/RoleGuard.tsx).
// It must never ship in a production build: a baked-in preview role
// bypasses RoleGuard for every visitor of the deployed bundle.
//
// This script runs ONLY from `npm run build` — never from
// `npm run dev:plain` — so local QA with a preview role in .env.local
// keeps working in dev. A production build with the role set fails
// loudly here instead of silently shipping the backdoor.
//
// Sources checked, in precedence order: process.env (CI / Vercel),
// .env.production, .env.local, .env. To build for production, unset
// VITE_PREVIEW_ROLE (or remove it from the env file) and rebuild.

import { existsSync, readFileSync } from 'node:fs';

const KEY = 'VITE_PREVIEW_ROLE';

function readEnvFile(path) {
  if (!existsSync(path)) return undefined;
  const line = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith(`${KEY}=`) && !l.startsWith('#'));
  if (!line) return undefined;
  return line.slice(KEY.length + 1).trim().replace(/^["']|["']$/g, '');
}

const sources = [
  ['process.env', process.env[KEY]],
  ['.env.production', readEnvFile('.env.production')],
  ['.env.local', readEnvFile('.env.local')],
  ['.env', readEnvFile('.env')],
];

const found = sources.find(([, value]) => value && value.length > 0);

if (found) {
  console.error(
    `[check-preview-role] REFUSING production build: ${KEY}=${found[1]} is set via ${found[0]}.\n` +
      `  VITE_PREVIEW_ROLE bypasses RoleGuard and must never ship in a production bundle.\n` +
      `  Unset it (or remove it from ${found[0]}) and rebuild.\n` +
      `  Local QA is unaffected: \`npm run dev:plain\` does not run this check.`,
  );
  process.exit(1);
}

console.log('[check-preview-role] ok: VITE_PREVIEW_ROLE is not set.');
