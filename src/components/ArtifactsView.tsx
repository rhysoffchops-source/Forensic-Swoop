import { useMemo, useState } from 'react';
import { Copy, Download, Search } from 'lucide-react';
import { formatBytes } from '../forensics/engine';
import type { ArtifactItem, CaseBundle } from '../forensics/types';

interface ArtifactsViewProps {
  activeCase: CaseBundle;
  payloads: Record<string, string>;
}

const CATEGORIES: Array<{ id: 'all' | ArtifactItem['category']; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'identity', label: 'Identity' },
  { id: 'services', label: 'Services' },
  { id: 'providers', label: 'Providers' },
  { id: 'packages', label: 'Packages' },
  { id: 'apps', label: 'Apps' },
  { id: 'media', label: 'Media' },
  { id: 'recovery', label: 'Recovery' },
];

export function ArtifactsView({ activeCase, payloads }: ArtifactsViewProps) {
  const [category, setCategory] = useState<'all' | ArtifactItem['category']>('all');
  const [query, setQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState<string>(
    activeCase.artifacts[0]?.path ?? ''
  );
  const [copied, setCopied] = useState(false);

  const [prevCaseId, setPrevCaseId] = useState(activeCase.id);
  if (activeCase.id !== prevCaseId) {
    setPrevCaseId(activeCase.id);
    setSelectedPath(activeCase.artifacts[0]?.path ?? '');
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeCase.artifacts.filter((a) => {
      if (category !== 'all' && a.category !== category) return false;
      if (!q) return true;
      return a.path.toLowerCase().includes(q) || a.sha256.toLowerCase().includes(q);
    });
  }, [activeCase.artifacts, category, query]);

  const activeArtifact =
    filtered.find((a) => a.path === selectedPath) ?? filtered[0] ?? null;

  const activeText = activeArtifact
    ? payloads[activeArtifact.path] ?? activeArtifact.preview
    : '';

  async function handleCopy() {
    if (!activeText) return;
    await navigator.clipboard.writeText(activeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleDownload() {
    if (!activeArtifact) return;
    const blob = new Blob([activeText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeArtifact.path.split('/').pop() || 'artifact.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <section className="border-b border-slate-200 pb-5">
        <p className="text-xs font-medium text-slate-500">
          Raw Dumps · Content Providers · Recovered Files
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Acquired Artifacts Explorer
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Inspect read-only artifact payloads and verify recorded SHA-256 checksums for{' '}
          <span className="font-mono font-medium text-slate-900">{activeCase.id}</span>.
        </p>
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 p-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                category === c.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search artifact paths"
            placeholder="Search paths or SHA-256..."
            className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 sm:w-64 focus-visible:outline-2 focus-visible:outline-blue-700"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="min-w-0 rounded-lg border border-slate-200 bg-white lg:col-span-5">
          <div className="border-b border-slate-100 px-4 py-3 text-xs font-semibold text-slate-700">
            Indexed Artifacts ({filtered.length})
          </div>
          <ul className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-8 text-center text-xs text-slate-500">
                No artifacts match the active filter.
              </li>
            ) : (
              filtered.map((item) => {
                const isSelected = activeArtifact?.path === item.path;
                return (
                  <li key={item.path}>
                    <button
                      type="button"
                      onClick={() => setSelectedPath(item.path)}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-mono text-xs font-medium text-slate-900 break-all">
                        {item.path}
                      </div>
                      <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-slate-500 tabular-nums">
                        <span>{item.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatBytes(item.bytes)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.sha256.slice(0, 12)}…</span>
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 lg:col-span-7">
          {activeArtifact ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-mono text-sm font-semibold text-slate-900 break-all">
                    {activeArtifact.path}
                  </h2>
                  <p className="mt-1 font-mono text-xs text-slate-500 break-all">
                    SHA-256: {activeArtifact.sha256}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Save File
                  </button>
                </div>
              </div>

              <pre className="max-h-[440px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 whitespace-pre-wrap break-words">
                {activeText}
              </pre>
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-slate-500">
              Select an artifact from the list to inspect its payload.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
