import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Download, Play, Terminal } from 'lucide-react';
import { buildCliCommand } from '../forensics/engine';
import type { CliParams } from '../forensics/types';

interface SelfTestCheck {
  name: string;
  ok: boolean;
  carved_count?: number;
  stage_status?: string;
  checked?: number;
  head_digest?: string;
  detected_errors?: number;
}

interface SelfTestResponse {
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  parsed: {
    version: string;
    ok: boolean;
    checks: SelfTestCheck[];
  } | null;
}

export function EngineCliView() {
  const [params, setParams] = useState<CliParams>({
    mode: 'acquire',
    serial: 'R58M12345',
    outDir: '~/cases/CPH2819_20261116',
    budgetMinutes: 900,
    budgetMb: 32768,
    mediaMode: 'thumbnails',
    servePort: 8787,
  });

  const [copiedCmd, setCopiedCmd] = useState(false);
  const [scriptSource, setScriptSource] = useState<string>('');
  const [scriptLines, setScriptLines] = useState<number>(0);
  const [scriptLoading, setScriptLoading] = useState(true);
  const [scriptError, setScriptError] = useState('');

  const [runningSelfTest, setRunningSelfTest] = useState(false);
  const [selfTestResult, setSelfTestResult] = useState<SelfTestResponse | null>(null);
  const [selfTestError, setSelfTestError] = useState('');

  const command = useMemo(() => buildCliCommand(params), [params]);

  useEffect(() => {
    let active = true;
    fetch('/api/v19/script')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ source: string; lines: number }>;
      })
      .then((data) => {
        if (!active) return;
        setScriptSource(data.source);
        setScriptLines(data.lines);
        setScriptLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setScriptError(err instanceof Error ? err.message : 'Unable to load v19.py');
        setScriptLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleCopyCommand() {
    await navigator.clipboard.writeText(command);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 1500);
  }

  async function handleRunSelfTest() {
    setRunningSelfTest(true);
    setSelfTestError('');
    try {
      const res = await fetch('/api/v19/self-test', { method: 'POST' });
      const data = (await res.json()) as SelfTestResponse;
      setSelfTestResult(data);
    } catch (err) {
      setSelfTestError(err instanceof Error ? err.message : 'Self-test request failed');
    } finally {
      setRunningSelfTest(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Standalone Python CLI · Read-Only · Hash-Chained
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            v19.py Acquisition Engine & Self-Test
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure acquisition flags, execute the offline Python cryptographic self-test on the server, or download the complete v19.py script.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleRunSelfTest}
            disabled={runningSelfTest}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            {runningSelfTest ? 'Running Self-Test…' : 'Run Python Self-Test'}
          </button>
          <a
            href="/api/v19/download"
            download="v19.py"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download v19.py
          </a>
        </div>
      </section>

      {/* Self-Test Live Output */}
      {selfTestError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-xs font-mono text-red-700">
          Self-test error: {selfTestError}
        </div>
      )}

      {selfTestResult && (
        <section
          aria-live="polite"
          data-testid="selftest-results"
          className="rounded-lg border border-emerald-300 bg-white p-5 space-y-4"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0" aria-hidden="true" />
              <h2 className="text-base font-semibold text-slate-900">
                v19.py Offline Self-Test {selfTestResult.exitCode === 0 ? 'PASSED' : 'FAILED'}
              </h2>
            </div>
            <div className="font-mono text-xs text-slate-600 tabular-nums">
              Exit {selfTestResult.exitCode} · {selfTestResult.durationMs} ms
            </div>
          </div>

          {selfTestResult.parsed && (
            <div className="grid grid-cols-1 divide-y divide-slate-200 border-t border-slate-100 pt-3 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-5 lg:divide-x">
              {selfTestResult.parsed.checks.map((chk) => (
                <div key={chk.name} className="py-2 sm:px-3 first:sm:pl-0 last:sm:pr-0">
                  <div className="font-mono text-xs font-semibold text-slate-900">{chk.name}</div>
                  <div className="mt-1 font-mono text-xs text-emerald-700 font-semibold">
                    {chk.ok ? 'PASS' : 'FAIL'}
                  </div>
                  {chk.checked !== undefined && (
                    <div className="mt-0.5 font-mono text-[11px] text-slate-600 tabular-nums">
                      {chk.checked} chain records
                    </div>
                  )}
                  {chk.carved_count !== undefined && (
                    <div className="mt-0.5 font-mono text-[11px] text-slate-600 tabular-nums">
                      {chk.carved_count} carved strings
                    </div>
                  )}
                  {chk.detected_errors !== undefined && (
                    <div className="mt-0.5 font-mono text-[11px] text-slate-600 tabular-nums">
                      {chk.detected_errors} tamper caught
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Interactive CLI Builder */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-semibold text-slate-900">
            01. CLI Command Builder
          </h2>
          <span className="text-xs font-mono text-slate-500">v19.0.0</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="cli-mode" className="block text-xs font-medium text-slate-700">
              Execution Mode
            </label>
            <select
              id="cli-mode"
              value={params.mode}
              onChange={(e) =>
                setParams((p) => ({ ...p, mode: e.target.value as CliParams['mode'] }))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
            >
              <option value="acquire">Acquire Device (--serial + --out)</option>
              <option value="resume">Resume Acquisition (--resume)</option>
              <option value="verify">Verify Case Integrity (--verify)</option>
              <option value="serve">Serve Local Report (--serve)</option>
              <option value="self-test">Offline Self-Test (--self-test)</option>
            </select>
          </div>

          <div>
            <label htmlFor="cli-serial" className="block text-xs font-medium text-slate-700">
              ADB Serial (--serial)
            </label>
            <input
              id="cli-serial"
              type="text"
              value={params.serial}
              onChange={(e) => setParams((p) => ({ ...p, serial: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="cli-out" className="block text-xs font-medium text-slate-700">
              Case Directory (--out)
            </label>
            <input
              id="cli-out"
              type="text"
              value={params.outDir}
              onChange={(e) => setParams((p) => ({ ...p, outDir: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="cli-minutes" className="block text-xs font-medium text-slate-700">
              Budget Minutes (--budget-minutes)
            </label>
            <input
              id="cli-minutes"
              type="number"
              min={1}
              value={params.budgetMinutes}
              onChange={(e) =>
                setParams((p) => ({ ...p, budgetMinutes: Number(e.target.value) || 60 }))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs tabular-nums text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="cli-mb" className="block text-xs font-medium text-slate-700">
              Budget MB (--budget-mb)
            </label>
            <input
              id="cli-mb"
              type="number"
              min={64}
              value={params.budgetMb}
              onChange={(e) =>
                setParams((p) => ({ ...p, budgetMb: Number(e.target.value) || 1024 }))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs tabular-nums text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="cli-media" className="block text-xs font-medium text-slate-700">
              {params.mode === 'serve' ? 'Report Port (--port)' : 'Media Scope (--media-mode)'}
            </label>
            {params.mode === 'serve' ? (
              <input
                id="cli-media"
                type="number"
                min={1024}
                max={65535}
                value={params.servePort}
                onChange={(e) =>
                  setParams((p) => ({ ...p, servePort: Number(e.target.value) || 8787 }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs tabular-nums text-slate-900"
              />
            ) : (
              <select
                id="cli-media"
                value={params.mediaMode}
                onChange={(e) =>
                  setParams((p) => ({
                    ...p,
                    mediaMode: e.target.value as CliParams['mediaMode'],
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
              >
                <option value="thumbnails">thumbnails (cached previews)</option>
                <option value="small">small (≤ 2 MB files)</option>
                <option value="all">all (up to 96 MB/file)</option>
                <option value="none">none (index only)</option>
              </select>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-900 p-3.5 text-slate-100 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5 overflow-x-auto">
            <Terminal className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
            <code data-testid="generated-cli" className="font-mono text-xs whitespace-nowrap">
              {command}
            </code>
          </div>
          <button
            type="button"
            onClick={handleCopyCommand}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 whitespace-nowrap shrink-0 self-end sm:self-auto"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            {copiedCmd ? 'Copied' : 'Copy Command'}
          </button>
        </div>
      </section>

      {/* Complete v19.py Source Viewer */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-semibold text-slate-900">
            02. Complete Engine Source (v19.py)
          </h2>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {scriptLines} lines · Python 3.10+ stdlib only
          </span>
        </div>

        {scriptLoading ? (
          <div className="h-64 animate-pulse rounded-lg bg-slate-100" />
        ) : scriptError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-xs text-red-700">
            {scriptError}
          </div>
        ) : (
          <pre className="max-h-[480px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800">
            {scriptSource}
          </pre>
        )}
      </section>
    </div>
  );
}
