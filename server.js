import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import { promisify } from 'util';

dotenv.config({ override: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const execFileAsync = promisify(execFile);
const PUBLIC_DIR = path.join(__dirname, 'public');
const HIGGSFIELD_BIN = (() => {
  if (process.platform !== 'win32') return 'higgsfield';
  const vendorBin = path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@higgsfield', 'cli', 'vendor', 'hf.exe');
  if (existsSync(vendorBin)) return vendorBin;
  const npmBin = path.join(process.env.APPDATA || '', 'npm', 'higgsfield.cmd');
  return existsSync(npmBin) ? npmBin : 'higgsfield.cmd';
})();

// 40 MB cap supports a 32 MB PDF + base64 expansion overhead. Anthropic's PDF
// limit is 32 MB; we leave headroom for base64 (~+33 %) plus message JSON.
app.use(express.json({ limit: '40mb' }));

function parseCliJson(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const start = [...text].reduce((best, char, index) => (
    best >= 0 ? best : (char === '{' || char === '[' ? index : -1)
  ), -1);
  if (start < 0) return null;
  try { return JSON.parse(text.slice(start)); } catch {}
  return null;
}

async function runHiggsfield(args, timeoutMs = 10 * 60 * 1000) {
  const { stdout, stderr } = await execFileAsync(HIGGSFIELD_BIN, args, {
    cwd: __dirname,
    timeout: timeoutMs,
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
  return { stdout, stderr, json: parseCliJson(stdout) };
}

function safeSlug(value, fallback = 'higgsfield-media') {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || fallback;
}

function firstJob(payload) {
  if (Array.isArray(payload)) return payload[0] || null;
  if (Array.isArray(payload?.jobs)) return payload.jobs[0] || null;
  if (Array.isArray(payload?.data)) return payload.data[0] || null;
  return payload || null;
}

function extractResultUrl(payload) {
  const job = firstJob(payload);
  return job?.result_url || job?.url || job?.output_url || job?.result?.url || job?.outputs?.[0]?.url || null;
}

async function saveRemoteAsset(url, filenameHint) {
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download Higgsfield result (${response.status})`);
  const contentType = response.headers.get('content-type') || '';
  const urlExt = path.extname(new URL(url).pathname).replace(/[^a-z0-9.]/gi, '');
  const ext = urlExt || (contentType.includes('webm') ? '.webm' : contentType.includes('image') ? '.png' : '.mp4');
  const dir = path.join(PUBLIC_DIR, 'generated', 'higgsfield');
  await fs.mkdir(dir, { recursive: true });
  const filename = `${safeSlug(filenameHint)}${ext}`;
  const filePath = path.join(dir, filename);
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, bytes);
  return {
    file_path: filePath,
    public_url: `/generated/higgsfield/${filename}`,
    bytes: bytes.length,
    mime: contentType || (ext === '.mp4' ? 'video/mp4' : 'application/octet-stream'),
  };
}

app.get('/api/higgsfield/status', async (_req, res) => {
  try {
    const result = await runHiggsfield(['account', 'status', '--json', '--no-color'], 60 * 1000);
    res.json(result.json || { raw: result.stdout });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Higgsfield status failed' });
  }
});

app.get('/api/higgsfield/jobs', async (req, res) => {
  try {
    const size = Math.max(1, Math.min(50, Number(req.query.size) || 12));
    const args = ['generate', 'list', '--size', String(size), '--json', '--no-color'];
    if (req.query.type === 'video') args.splice(2, 0, '--video');
    if (req.query.type === 'image') args.splice(2, 0, '--image');
    const result = await runHiggsfield(args, 90 * 1000);
    res.json(result.json || []);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Higgsfield job list failed' });
  }
});

app.post('/api/higgsfield/video-cost', async (req, res) => {
  try {
    const {
      prompt,
      model = 'veo3_1',
      aspect_ratio = '16:9',
      duration = 6,
      quality = 'ultra',
      resolution,
      mode,
      sound,
      veo_model,
    } = req.body || {};
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt is required' });
    const args = ['generate', 'cost', model, '--prompt', prompt, '--aspect_ratio', String(aspect_ratio), '--duration', String(duration), '--json', '--no-color'];
    if (model.startsWith('veo')) {
      args.push('--quality', String(quality));
      if (veo_model) args.push('--model', String(veo_model));
    }
    if (resolution) args.push('--resolution', String(resolution));
    if (mode) args.push('--mode', String(mode));
    if (sound) args.push('--sound', String(sound));
    const result = await runHiggsfield(args, 90 * 1000);
    res.json(result.json || { raw: result.stdout });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Higgsfield cost estimate failed' });
  }
});

app.post('/api/higgsfield/generate-video', async (req, res) => {
  try {
    const {
      prompt,
      model = 'veo3_1',
      slot = 'generic',
      filename,
      aspect_ratio = '16:9',
      duration = 6,
      quality = 'ultra',
      resolution,
      mode,
      sound = 'off',
      veo_model = 'veo-3-1-preview',
      timeout_minutes = 20,
      confirmed = false,
    } = req.body || {};
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt is required' });
    if (!confirmed) return res.status(400).json({ error: 'confirmed=true is required before spending Higgsfield credits' });

    const timeoutMs = Math.max(1, Math.min(45, Number(timeout_minutes) || 20)) * 60 * 1000;
    const args = [
      'generate', 'create', model,
      '--prompt', prompt,
      '--aspect_ratio', String(aspect_ratio),
      '--duration', String(duration),
      '--wait',
      '--wait-timeout', `${Math.ceil(timeoutMs / 60000)}m`,
      '--wait-interval', '5s',
      '--json',
      '--no-color',
    ];
    if (model.startsWith('veo')) {
      args.push('--quality', String(quality));
      if (veo_model) args.push('--model', String(veo_model));
    }
    if (resolution) args.push('--resolution', String(resolution));
    if (mode) args.push('--mode', String(mode));
    if (sound && model.startsWith('kling')) args.push('--sound', String(sound));

    const result = await runHiggsfield(args, timeoutMs + 60 * 1000);
    const resultUrl = extractResultUrl(result.json);
    const job = firstJob(result.json);
    const saved = resultUrl
      ? await saveRemoteAsset(resultUrl, filename || `${slot}-${job?.id || Date.now()}`)
      : null;

    res.json({
      ok: Boolean(resultUrl),
      slot,
      model,
      job,
      result_url: resultUrl,
      saved,
      stdout: result.json ? undefined : result.stdout,
      warning: resultUrl ? undefined : 'Higgsfield finished but no result_url was found in CLI output. Use higgsfield generate list to inspect the job.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Higgsfield video generation failed' });
  }
});

app.post('/api/claude', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in .env' });
  }
  const isStream = req.body?.stream === true;
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    if (!isStream) {
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    }

    res.status(upstream.status);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
        if (typeof res.flush === 'function') res.flush();
      }
    } finally {
      res.end();
    }
  } catch (err) {
    console.error('Proxy error:', err);
    if (res.headersSent) res.end();
    else res.status(500).json({ error: err.message });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\u2713 Server running on http://localhost:${PORT}`);
});
