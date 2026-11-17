import { useMemo, useState } from 'react';
import { Download, FileSearch, Search } from 'lucide-react';
import { carveSqliteBuffer } from '../forensics/engine';
import type { CarvedString, CaseBundle, TimelineEvent } from '../forensics/types';

interface TimelineCarverViewProps {
  activeCase: CaseBundle;
}

type SubView = 'timeline' | 'carver';
type SourceFilter = 'all' | TimelineEvent['source'];

const SOURCE_FILTERS: Array<{ id: SourceFilter; label: string }> = [
  { id: 'all', label: 'All Sources' },
  { id: 'media', label: 'Media' },
  { id: 'logcat', label: 'Logcat' },
  { id: 'carved_sqlite', label: 'Carved SQLite' },
  { id: 'provider', label: 'Providers' },
  { id: 'trash', label: 'Trash' },
];

export function TimelineCarverView({ activeCase }: TimelineCarverViewProps) {
  const [subView, setSubView] = useState<SubView>('timeline');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [query, setQuery] = useState('');
  const [tzMode, setTzMode] = useState<'local' | 'utc'>('local');

  // SQLite Carver state
  const [carveQuery, setCarveQuery] = useState('');
  const [customCarved, setCustomCarved] = useState<CarvedString[] | null>(null);
  const [carveMeta, setCarveMeta] = useState<string>('');
  const [carveError, setCarveError] = useState<string>('');

  const filteredTimeline = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeCase.timeline.filter((ev) => {
      if (sourceFilter !== 'all' && ev.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        ev.summary.toLowerCase().includes(q) ||
        ev.detail.toLowerCase().includes(q) ||
        ev.source.toLowerCase().includes(q)
      );
    });
  }, [activeCase.timeline, query, sourceFilter]);

  const activeCarvedList = useMemo(() => {
    const base = customCarved ?? activeCase.carved;
    const q = carveQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (c) =>
        c.text.toLowerCase().includes(q) ||
        c.dbName.toLowerCase().includes(q) ||
        c.sha256.toLowerCase().includes(q)
    );
  }, [activeCase.carved, customCarved, carveQuery]);

  function handleDownloadTimelineCsv() {
    const header = 'ms,utc,local,source,summary,detail';
    const rows = filteredTimeline.map((e) =>
      [
        e.ms,
        e.utc,
        e.local,
        e.source,
        `"${e.summary.replace(/"/g, '""')}"`,
        `"${e.detail.replace(/"/g, '""')}"`,
      ].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeCase.id}_timeline.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCarveFile(file: File | undefined) {
    if (!file) return;
    setCarveError('');
    const buf = new Uint8Array(await file.arrayBuffer());
    const res = await carveSqliteBuffer(buf, file.name);
    if (!res.validSqlite) {
      setCarveError(`${file.name} does not start with SQLite format 3 header magic.`);
      return;
    }
    setCustomCarved(res.carved);
    setCarveMeta(`${file.name} · Page Size ${res.pageSize} B · ${res.carved.length} printable runs carved`);
  }

  async function handleRunSyntheticCarve() {
    setCarveError('');
    const buf = new Uint8Array(8192);
    buf.set(new TextEncoder().encode('SQLite format 3\0'), 0);
    buf[16] = 0x10;
    buf[17] = 0x00; // 4096 bytes/page
    const live = 'LIVE_ACTIVE_RECORD_KEEP_001';
    const carvedA = 'CARVED_DELETED_SMS_20261115: Courier confirmed drop at Locker 19B';
    const carvedB = 'CARVED_TOKEN_CACHE: session_recovery_pin=774910_revoked';
    buf.set(new TextEncoder().encode(live), 180);
    buf.set(new TextEncoder().encode(carvedA), 2300);
    buf.set(new TextEncoder().encode(carvedB), 5120);

    const res = await carveSqliteBuffer(buf, 'synthetic_msgstore.db', new Set([live]));
    setCustomCarved(res.carved);
    setCarveMeta(
      `synthetic_msgstore.db · Page Size ${res.pageSize} B · ${res.carved.length} unallocated runs extracted`
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Sub-View Switcher */}
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Normalized Chronology & Unallocated SQLite Recovery
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Timeline & SQLite Carver
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Correlates media timestamps, threadtime logcat, and deleted SQLite page fragments.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setSubView('timeline')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              subView === 'timeline'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Unified Timeline ({activeCase.timeline.length})
          </button>
          <button
            type="button"
            onClick={() => setSubView('carver')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              subView === 'carver'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            SQLite Carver ({activeCarvedList.length})
          </button>
        </div>
      </section>

      {subView === 'timeline' ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
              {SOURCE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSourceFilter(f.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    sourceFilter === f.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search timeline events"
                  placeholder="Filter events..."
                  className="rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-700"
                />
              </div>

              <button
                type="button"
                onClick={() => setTzMode((m) => (m === 'local' ? 'utc' : 'local'))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                TZ: {tzMode === 'local' ? activeCase.timezone : 'UTC'}
              </button>

              <button
                type="button"
                onClick={handleDownloadTimelineCsv}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">
                    {tzMode === 'local' ? `Timestamp (${activeCase.timezone})` : 'Timestamp (UTC)'}
                  </th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 pr-3 font-medium">Summary</th>
                  <th className="py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTimeline.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      No timeline events match the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredTimeline.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {tzMode === 'local' ? ev.local : ev.utc}
                      </td>
                      <td className="py-2.5 pr-3 font-mono font-medium text-slate-900 whitespace-nowrap">
                        {ev.source}
                        {ev.level ? `/${ev.level}` : ''}
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-slate-900">{ev.summary}</td>
                      <td className="py-2.5 font-mono text-slate-600">{ev.detail}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="space-y-5">
          {/* Interactive Binary SQLite Carver Dropzone */}
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Browser SQLite Unallocated String Carver
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Validates <span className="font-mono">SQLite format 3\0</span> header magic, extracts page size (bytes 16..18), and carves printable ASCII runs (≥16 chars) with page offsets and SHA-256 digests.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap">
                  <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Carve Local .db File</span>
                  <input
                    type="file"
                    accept=".db,.sqlite,.sqlite3"
                    onChange={(e) => handleCarveFile(e.target.files?.[0])}
                    className="sr-only"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleRunSyntheticCarve}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50 whitespace-nowrap"
                >
                  Run Synthetic SQLite Test
                </button>
              </div>
            </div>

            {carveError && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {carveError}
              </div>
            )}
            {carveMeta && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 font-mono text-xs text-emerald-800">
                <span>{carveMeta}</span>
                {customCarved && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomCarved(null);
                      setCarveMeta('');
                      setCarveError('');
                    }}
                    className="font-sans font-semibold text-blue-700 hover:underline whitespace-nowrap"
                  >
                    Reset to Case Results
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                Carved Printable Runs (Stage 10)
              </h2>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="search"
                  value={carveQuery}
                  onChange={(e) => setCarveQuery(e.target.value)}
                  aria-label="Filter carved strings"
                  placeholder="Search carved strings..."
                  className="rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-700"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Database</th>
                    <th className="py-2 pr-3 text-right font-medium">Page</th>
                    <th className="py-2 pr-3 text-right font-medium">Offset</th>
                    <th className="py-2 pr-3 font-medium">SHA-256</th>
                    <th className="py-2 font-medium">Recovered String</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {activeCarvedList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center font-sans text-slate-500">
                        No carved strings match the filter.
                      </td>
                    </tr>
                  ) : (
                    activeCarvedList.map((row) => (
                      <tr key={`${row.dbName}-${row.offset}`} className="hover:bg-slate-50">
                        <td className="py-2.5 pr-3 font-medium text-slate-900 whitespace-nowrap">
                          {row.dbName}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-slate-700">
                          {row.page}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-slate-700">
                          0x{row.offset.toString(16)} ({row.offset})
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums text-slate-500" title={row.sha256}>
                          {row.sha256.slice(0, 12)}…
                        </td>
                        <td className="py-2.5 text-slate-900 break-all">{row.text}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
