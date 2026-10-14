import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ channel: 'chrome', baseURL: 'http://localhost:3000' });

test.describe('Video Metadata Generation Test', () => {
  test('should extract 5 keyframes and generate metadata for video', async ({ page }) => {
    test.setTimeout(90000); // Beri waktu 90 detik untuk LLM multimodal
    const videoPath = path.resolve('motion-graphic-1790695578328.mp4');
    console.log('Video target path:', videoPath);

    // Tangkap console log browser
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[Video Extraction]') || text.includes('Proxy') || text.includes('Error')) {
        console.log(`[Browser Console] ${msg.type()}: ${text}`);
      }
    });

    // Tangkap request API
    let requestPayload: any = null;
    page.on('request', (req) => {
      if (req.url().includes('/api/generate')) {
        try {
          requestPayload = JSON.parse(req.postData() || '{}');
          console.log('[API Request] Model:', requestPayload.model);
          console.log('[API Request] Image keyframes count:', requestPayload.imageDataUrls?.length);
        } catch (e) {}
      }
    });

    // Tangkap response API
    let responseData: any = null;
    page.on('response', async (res) => {
      if (res.url().includes('/api/generate')) {
        console.log('[API Response] Status:', res.status());
        try {
          responseData = await res.json();
          console.log('[API Response] Title:', responseData.title);
          console.log('[API Response] Description:', responseData.description);
          console.log('[API Response] Keywords count:', responseData.keywords?.split(',').length);
        } catch (e) {
          const txt = await res.text().catch(() => '');
          console.log('[API Response Text]:', txt.slice(0, 200));
        }
      }
    });

    // Buka halaman aplikasi di dev server port 3000
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Unggah video ke input file
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(videoPath);

    // Pastikan tombol generate menjadi aktif (enabled) setelah file dipilih
    const genButton = page.locator('button:has-text("Generate Metadata")');
    await expect(genButton).toBeEnabled({ timeout: 10000 });
    console.log('File video berhasil dimuat, tombol Generate aktif.');

    // Klik tombol generate
    await genButton.click();
    console.log('Tombol Generate diklik. Menunggu ekstraksi frame dan respons model AI...');

    // Tunggu sampai strip frame kunci muncul di kartu hasil (maks 90 detik)
    await expect(page.locator('text=Frame Kunci Dianalisis')).toBeVisible({ timeout: 90000 });
    console.log('BERHASIL: Elemen "Frame Kunci Dianalisis" berhasil tampil di UI!');

    // Verifikasi bahwa 5 frame kunci diekstrak dan dikirim
    expect(requestPayload?.imageDataUrls?.length).toBe(5);

    // Ambil screenshot hasil tampilan
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'screenshot_video_result.png', fullPage: true });
    console.log('Screenshot berhasil diambil: screenshot_video_result.png');
  });
});
