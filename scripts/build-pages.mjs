import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const appApiDir = path.join(rootDir, 'app', 'api');
const tempApiDir = path.join(rootDir, '.api_temp');

let apiMoved = false;

try {
  if (fs.existsSync(appApiDir)) {
    console.log('[build-pages] Temporarily moving app/api for clean static export...');
    try {
      fs.renameSync(appApiDir, tempApiDir);
    } catch {
      fs.cpSync(appApiDir, tempApiDir, { recursive: true });
      fs.rmSync(appApiDir, { recursive: true, force: true });
    }
    apiMoved = true;
  }

  const dotNextDir = path.join(rootDir, '.next');
  if (fs.existsSync(dotNextDir)) {
    console.log('[build-pages] Cleaning stale .next cache...');
    try {
      fs.rmSync(dotNextDir, { recursive: true, force: true });
    } catch {
      // Ignore if some file is locked
    }
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
    try {
      if (fs.existsSync(appApiDir)) {
        fs.rmSync(appApiDir, { recursive: true, force: true });
      }
      fs.renameSync(tempApiDir, appApiDir);
    } catch {
      fs.cpSync(tempApiDir, appApiDir, { recursive: true, force: true });
      fs.rmSync(tempApiDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
}
