// Cloudflare Pages Function: /api/ftp/upload

export async function onRequestPost() {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'Pengunggahan file FTP via cloud dialihkan ke Local FTP Bridge. Silakan jalankan start-ftp-bridge.bat di komputer Anda agar file terunggah tanpa batas kuota.',
    }),
    {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
