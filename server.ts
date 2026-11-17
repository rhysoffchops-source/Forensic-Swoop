import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const SCRIPT_PATH = path.resolve(__dirname, 'scripts', 'v19.py');

function runPythonScript(args: string[], timeoutMs = 20000): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}> {
  return new Promise((resolve) => {
    const start = Date.now();
    const proc = spawn('python3', [SCRIPT_PATH, ...args], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
    }, timeoutMs);

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - start,
      });
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        stdout,
        stderr: err.message,
        durationMs: Date.now() - start,
      });
    });
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, engine: 'v19.0.0' });
  });

  app.get('/api/v19/script', async (_req, res) => {
    try {
      const source = await fs.readFile(SCRIPT_PATH, 'utf8');
      res.json({
        filename: 'v19.py',
        version: '19.0.0',
        lines: source.split('\n').length,
        source,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load v19.py',
      });
    }
  });

  app.get('/api/v19/download', async (_req, res) => {
    try {
      const source = await fs.readFile(SCRIPT_PATH, 'utf8');
      res.setHeader('Content-Type', 'text/x-python; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="v19.py"');
      res.send(source);
    } catch (err) {
      res.status(500).send(err instanceof Error ? err.message : 'Download failed');
    }
  });

  app.post('/api/v19/self-test', async (_req, res) => {
    const execRes = await runPythonScript(['--self-test', '--json']);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(execRes.stdout);
    } catch {
      parsed = null;
    }
    res.status(execRes.exitCode === 0 ? 200 : 500).json({
      exitCode: execRes.exitCode,
      durationMs: execRes.durationMs,
      stdout: execRes.stdout,
      stderr: execRes.stderr,
      parsed,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CaseVault server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
