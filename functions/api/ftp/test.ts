// Cloudflare Pages Function: /api/ftp/test

export async function onRequestPost() {
  return new Response(
    JSON.stringify({
      ok: false,
      message: 'Pengujian koneksi FTP via cloud dialihkan ke Local FTP Bridge. Silakan jalankan start-ftp-bridge.bat di komputer Anda.',
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
