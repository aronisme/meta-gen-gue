import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const appApiDir = path.join(rootDir, 'app', 'api');
const tempApiDir = path.join(rootDir, '.api_temp');

let apiMoved = false;

try {
  if (fs.existsSync(appApiDir)) {
    console.log('[build-pages] Temporarily moving app/api to app/.api_disabled for clean static export...');
    fs.renameSync(appApiDir, tempApiDir);
    apiMoved = true;
  }

  console.log('[build-pages] Running next build with NEXT_EXPORT=true...');
  execSync('npx next build', {
    stdio: 'inherit',
    env: { ...process.env, NEXT_EXPORT: 'true' },
  });

  console.log('[build-pages] Build succeeded! Static assets ready in out/');
} finally {
  if (apiMoved && fs.existsSync(tempApiDir)) {
    console.log('[build-pages] Restoring app/api for local development...');
    fs.renameSync(tempApiDir, appApiDir);
  }
}
