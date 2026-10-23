// lib/agent/tools.ts
/**
 * Autonomous Tool Registry & Dispatcher for MetaGen Omnigent Live Agent.
 * Registers 8 standard microstock tools with strict schemas and execution handlers.
 */

import type { AgentToolResult, AgentToolSpec } from './types';

export const AGENT_TOOLS: AgentToolSpec[] = [
  {
    name: 'agent_generate_prompts',
    description: 'Menghasilkan paket prompt AI komersial terstruktur (Midjourney, FLUX, SDXL) untuk microstock.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Topik utama atau konsep visual (contoh: "Modern minimalist coffee shop interior")',
        },
        style: {
          type: 'string',
          description: 'Gaya visual atau genre (contoh: "commercial photographic", "cinematic lighting", "macro")',
        },
        aspectRatio: {
          type: 'string',
          description: 'Rasio aspek target (contoh: "16:9", "4:3", "1:1")',
        },
        targetPlatform: {
          type: 'string',
          description: 'Platform AI target',
          enum: ['Midjourney', 'FLUX', 'SDXL'],
        },
        count: {
          type: 'number',
          description: 'Jumlah variasi prompt yang dihasilkan (1 - 5)',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'agent_scan_renders',
    description: 'Memindai folder Downloads/MetaGen_Flow di komputer lokal melalui Local Bridge (:45678) untuk mendeteksi file render 2K baru.',
    parameters: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          description: 'Subfolder atau direktori target (default: "Downloads/MetaGen_Flow")',
        },
        limit: {
          type: 'number',
          description: 'Batas maksimal file yang diambil (default: 20)',
        },
      },
    },
  },
  {
    name: 'agent_run_qc',
    description: 'Menjalankan pemeriksaan kendali mutu (Preflight QC) Adobe Stock untuk mendeteksi cacat teknis, resolusi <4MP, atau ukuran file berlebih.',
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Nama file gambar yang diperiksa',
        },
        width: {
          type: 'number',
          description: 'Lebar gambar dalam piksel',
        },
        height: {
          type: 'number',
          description: 'Tinggi gambar dalam piksel',
        },
        sizeBytes: {
          type: 'number',
          description: 'Ukuran file dalam bytes',
        },
        mimeType: {
          type: 'string',
          description: 'MIME type file (image/jpeg, image/png, dll.)',
        },
      },
      required: ['filename', 'width', 'height', 'sizeBytes'],
    },
  },
  {
    name: 'agent_generate_metadata',
    description: 'Menghasilkan Judul SEO komersial, Deskripsi naratif, dan 49 Keyword terkonvergensi untuk pasar microstock.',
    parameters: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Deskripsi subjek gambar atau prompt asal',
        },
        category: {
          type: 'string',
          description: 'Kategori microstock (misal: "Business", "Technology", "Nature")',
        },
        extraContext: {
          type: 'string',
          description: 'Catatan atau preferensi kata kunci tambahan',
        },
      },
      required: ['subject'],
    },
  },
  {
    name: 'agent_embed_metadata',
    description: 'Menanamkan metadata IPTC/EXIF/XMP langsung ke biner file fisik di disk lokal via ExifTool Local Bridge (:45678).',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path absolut atau nama file lokal di folder MetaGen_Flow',
        },
        title: {
          type: 'string',
          description: 'Judul aset untuk ditanam ke EXIF/IPTC',
        },
        description: {
          type: 'string',
          description: 'Deskripsi aset untuk ditanam ke EXIF/IPTC',
        },
        keywords: {
          type: 'string',
          description: 'Daftar keyword dipisahkan koma',
        },
      },
      required: ['filePath', 'title', 'keywords'],
    },
  },
  {
    name: 'agent_upload_ftp',
    description: 'Mengirim file yang siap ke antrean server FTP/SFTP agensi microstock aktif (membutuhkan konfirmasi pengguna).',
    requiresConfirmation: true, // Zero-Accident Guard!
    parameters: {
      type: 'object',
      properties: {
        filePaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Daftar path file lokal yang akan diunggah',
        },
        agencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Agensi target (misal: "adobestock", "shutterstock", "freepik")',
        },
      },
      required: ['filePaths'],
    },
  },
  {
    name: 'agent_interact_browser_tab',
    description: 'Mengirim instruksi atau bertukar data dengan ekstensi browser Chrome di tab aktif (misal auto-paste prompt ke Google Flow).',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Jenis aksi tab browser',
          enum: ['paste_prompt_to_flow', 'trigger_flow_download', 'query_active_tab'],
        },
        promptText: {
          type: 'string',
          description: 'Teks prompt yang akan ditempelkan ke Google Flow',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'agent_get_system_status',
    description: 'Memeriksa status operasional sistem: koneksi Local Bridge (:45678), status ekstensi browser, pool API key aktif, dan antrean upload.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

const LOCAL_BRIDGE_URL = 'http://127.0.0.1:45678';

/**
 * Tool Dispatcher: Executes a tool by name with arguments.
 */
export async function dispatchAgentTool(
  name: string,
  args: Record<string, unknown>
): Promise<AgentToolResult> {
  switch (name) {
    case 'agent_generate_prompts': {
      const topic = String(args.topic || 'Commercial microstock subject');
      const style = String(args.style || 'commercial studio photography');
      const ar = String(args.aspectRatio || '16:9');
      const platform = String(args.targetPlatform || 'Midjourney');
      const count = Math.min(5, Math.max(1, Number(args.count) || 3));

      const variations = Array.from({ length: count }).map((_, i) => {
        const adjectives = [
          'pristine natural morning light, shallow depth of field, 85mm f/1.4 lens, clean commercial composition',
          'soft diffused ambient lighting, rich color grading, ultra crisp textures, high key minimalist studio backdrop',
          'dramatic cinematic rim lighting, atmospheric perspective, authentic real-world detail, editorial aesthetic',
        ];
        const adj = adjectives[i % adjectives.length];
        const suffix = platform === 'Midjourney' ? ` --ar ${ar} --v 6.1 --style raw` : ` [aspect: ${ar}]`;
        return `${topic}, ${style}, ${adj}${suffix}`;
      });

      return {
        success: true,
        data: {
          topic,
          platform,
          aspectRatio: ar,
          prompts: variations,
        },
        message: `Berhasil merancang ${variations.length} paket prompt komersial ${platform} untuk topik "${topic}".`,
      };
    }

    case 'agent_scan_renders': {
      try {
        const folder = String(args.folder || 'Downloads/MetaGen_Flow');
        const limit = Number(args.limit) || 20;

        const res = await fetch(`${LOCAL_BRIDGE_URL}/scan-downloads?limit=${limit}&folder=${encodeURIComponent(folder)}`, {
          signal: AbortSignal.timeout(3000),
        });

        if (res.ok) {
          const json = await res.json();
          return {
            success: true,
            data: json,
            message: `Terdeteksi ${json.files?.length || 0} file di folder "${folder}".`,
          };
        }
      } catch {
        // Fallback simulated response if bridge is offline
      }

      return {
        success: true,
        data: {
          isBridgeConnected: false,
          bridgeUrl: LOCAL_BRIDGE_URL,
          files: [],
          hint: 'Local Bridge (:45678) belum aktif. Jalankan "pnpm bridge" di terminal untuk memindai folder lokal langsung.',
        },
        message: 'Local Bridge (:45678) offline. Gunakan tombol jalankan bridge untuk pemindaian fisik disk.',
      };
    }

    case 'agent_run_qc': {
      const filename = String(args.filename || 'image.jpg');
      const width = Number(args.width) || 1920;
      const height = Number(args.height) || 1080;
      const sizeBytes = Number(args.sizeBytes) || 2_000_000;
      const mimeType = String(args.mimeType || 'image/jpeg');

      const megapixels = Number(((width * height) / 1_000_000).toFixed(2));
      const failReasons: string[] = [];

      if (megapixels < 4.0) {
        failReasons.push(`Resolusi gambar ${megapixels} MP di bawah batas minimum resmi Adobe Stock (Minimal 4.0 MP).`);
      } else if (megapixels > 100.0) {
        failReasons.push(`Resolusi gambar ${megapixels} MP melebihi batas maksimum resmi Adobe Stock (Maksimal 100.0 MP).`);
      }

      if (sizeBytes > 45 * 1024 * 1024) {
        const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
        failReasons.push(`Ukuran file ${sizeMb} MB melebihi batas maksimum unggahan Adobe Stock (Maksimal 45 MB).`);
      }

      const passes = failReasons.length === 0;
      const status = passes ? 'PASS' : 'BLOCK';

      return {
        success: true,
        data: {
          filename,
          status,
          width,
          height,
          megapixels,
          sizeBytes,
          passesHardTech: passes,
          failReasons,
        },
        message: passes
          ? `File "${filename}" LOLOS preflight QC (${megapixels.toFixed(1)} MP, ${(sizeBytes / 1024 / 1024).toFixed(2)} MB).`
          : `File "${filename}" ${status}: ${failReasons.join('; ')}`,
        actionCard: !passes
          ? {
              type: 'qc_alert',
              title: `Peringatan QC: ${filename}`,
              description: failReasons[0] || 'File melanggar standar teknis Adobe Stock.',
              payload: { filename, failReasons, megapixels },
            }
          : undefined,
      };
    }

    case 'agent_generate_metadata': {
      const subject = String(args.subject || 'Stock image');
      const category = String(args.category || 'Business');

      const title = `${subject.charAt(0).toUpperCase() + subject.slice(1)} in modern commercial aesthetic`;
      const description = `High angle detailed view of ${subject}, showcasing authentic textures, professional lighting, and clean copy space for commercial advertising and marketing.`;

      // 49 standard keywords with title convergence
      const baseWords = subject.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 2);
      const contextual = [
        'concept', 'background', 'copy space', 'clean', 'modern', 'professional',
        'commercial', 'minimal', 'design', 'lifestyle', 'detail', 'bright',
        'light', 'workspace', 'indoor', 'nobody', 'horizontal', 'composition',
        'photography', 'studio shot', 'isolated', 'sharp focus', 'contemporary',
        'creative', 'quality', 'style', 'view', 'texture', 'table', 'surface',
        'natural', 'elegance', 'simplicity', 'technology', 'success', 'office',
        'business', 'fresh', 'work', 'corporate', 'presentation', 'flat lay',
        'advertising', 'digital', 'space', 'white', 'calm', 'serene', 'authentic'
      ];

      const merged = Array.from(new Set([...baseWords, ...contextual])).slice(0, 49);
      const keywords = merged.join(', ');

      return {
        success: true,
        data: {
          title,
          description,
          keywords,
          keywordsCount: merged.length,
          category,
        },
        message: `Metadata dibuat: Judul (${title.length} karakter), ${merged.length} kata kunci terkonvergensi.`,
      };
    }

    case 'agent_embed_metadata': {
      const filePath = String(args.filePath || '');
      const title = String(args.title || '');
      const description = String(args.description || '');
      const keywords = String(args.keywords || '');

      try {
        const res = await fetch(`${LOCAL_BRIDGE_URL}/embed-metadata`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath, title, description, keywords }),
          signal: AbortSignal.timeout(4000),
        });

        if (res.ok) {
          const json = await res.json();
          return {
            success: true,
            data: json,
            message: `Berhasil menanamkan EXIF/IPTC ke file fisik "${filePath}".`,
          };
        }
      } catch {
        // Bridge unreachable
      }

      return {
        success: false,
        error: 'Gagal menghubungi Local Bridge (:45678). Pastikan server bridge lokal berjalan untuk menanam EXIF ke disk fisik.',
      };
    }

    case 'agent_upload_ftp': {
      const filePaths = Array.isArray(args.filePaths) ? args.filePaths : [String(args.filePaths)];
      const agencies = Array.isArray(args.agencies) ? args.agencies : ['adobestock'];

      return {
        success: true,
        data: {
          filePaths,
          agencies,
          status: 'ready_for_dispatch',
        },
        message: `${filePaths.length} file siap ditransfer ke server FTP (${agencies.join(', ')}).`,
        actionCard: {
          type: 'upload_confirm',
          title: `Konfirmasi Unggah FTP (${filePaths.length} File)`,
          description: `Target Agensi: ${agencies.join(', ')}. Klik konfirmasi untuk mulai mengirim file.`,
          payload: { filePaths, agencies },
        },
      };
    }

    case 'agent_interact_browser_tab': {
      const action = String(args.action || 'query_active_tab');
      const promptText = String(args.promptText || '');

      if (typeof window !== 'undefined') {
        window.postMessage(
          {
            type: 'METAGEN_AGENT_BROWSER_ACTION',
            action,
            promptText,
          },
          '*'
        );
      }

      return {
        success: true,
        data: { action, promptText },
        message: `Perintah browser "${action}" dikirimkan ke ekstensi Chrome.`,
      };
    }

    case 'agent_get_system_status': {
      let bridgeOnline = false;
      let bridgeDetails: unknown = null;

      try {
        const res = await fetch(`${LOCAL_BRIDGE_URL}/status`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) {
          bridgeOnline = true;
          bridgeDetails = await res.json();
        }
      } catch {
        bridgeOnline = false;
      }

      return {
        success: true,
        data: {
          timestamp: Date.now(),
          localBridge: {
            online: bridgeOnline,
            url: LOCAL_BRIDGE_URL,
            details: bridgeDetails,
          },
          platform: typeof window !== 'undefined' ? 'browser' : 'server',
          ready: true,
        },
        message: bridgeOnline
          ? 'Sistem sehat: Local Bridge (:45678) aktif, ExifTool siap, dan antrean online.'
          : 'Sistem aktif (Local Bridge offline; aktifkan via terminal "pnpm bridge" untuk fitur penanaman EXIF fisik).',
      };
    }

    default:
      return {
        success: false,
        error: `Tool "${name}" tidak terdaftar dalam registry.`,
      };
  }
}
