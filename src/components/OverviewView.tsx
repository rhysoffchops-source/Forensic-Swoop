import { useMemo, useState } from 'react';
import { formatBytes } from '../forensics/engine';
import type { CaseBundle, StageStatus, VerificationReport } from '../forensics/types';

interface OverviewViewProps {
  cases: CaseBundle[];
  activeCase: CaseBundle;
  verification: VerificationReport;
  onSelectCase: (caseId: string) => void;
  onNavigateTab: (tab: 'verifier' | 'timeline' | 'artifacts' | 'engine') => void;
}

const STATUS_FILTERS: Array<{ id: 'all' | StageStatus; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'ok', label: 'OK' },
  { id: 'partial', label: 'Partial' },
  { id: 'blocked', label: 'Blocked' },
];

function statusTextClass(status: StageStatus): string {
  switch (status) {
    case 'ok':
    case 'cached':
      return 'text-emerald-700 font-semibold';
    case 'partial':
    case 'truncated':
    case 'skipped':
      return 'text-amber-700 font-semibold';
    case 'blocked':
    case 'timeout':
    case 'failed':
      return 'text-red-700 font-semibold';
  }
}

export function OverviewView({
  cases,
  activeCase,
  verification,
  onSelectCase,
  onNavigateTab,
}: OverviewViewProps) {
  const [stageFilter, setStageFilter] = useState<'all' | StageStatus>('all');

  const filteredStages = useMemo(() => {
    if (stageFilter === 'all') return activeCase.stages;
    return activeCase.stages.filter((s) => s.status === stageFilter);
  }, [activeCase.stages, stageFilter]);

  const totalCapturedBytes = useMemo(
    () => activeCase.stages.reduce((acc, s) => acc + s.bytes, 0),
    [activeCase.stages]
  );

  const okStageCount = useMemo(
    () => activeCase.stages.filter((s) => s.status === 'ok' || s.status === 'cached').length,
    [activeCase.stages]
  );

  return (
    <div className="space-y-6">
      {/* Case Context Header */}
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Active Forensic Case · Read-Only Acquisition
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            {activeCase.title}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600 font-mono tabular-nums">
            <span>Serial {activeCase.serial}</span>
            <span aria-hidden="true">·</span>
            <span>Acquired {activeCase.acquiredUtc}</span>
            <span aria-hidden="true">·</span>
            <span>TZ {activeCase.timezone}</span>
            <span aria-hidden="true">·</span>
            <span>Privilege Tier: {activeCase.tier}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3 min-w-0">
          <label htmlFor="case-selector" className="text-xs font-medium text-slate-600 whitespace-nowrap">
            Case Bundle
          </label>
          <select
            id="case-selector"
            value={activeCase.id}
            onChange={(e) => onSelectCase(e.target.value)}
            className="w-full min-w-0 sm:w-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-700"
          >
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} ({c.preflight['ro.product.model']} · {c.tier})
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* 4-Column Metric Strip */}
      <section aria-label="Case key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Chain Integrity</div>
          <div
            className={`mt-1.5 text-lg font-bold tabular-nums ${
              verification.valid ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {verification.valid ? 'VERIFIED (EXIT 0)' : 'BROKEN (EXIT 1)'}
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            {verification.checkedCount} SHA-256 ledger records
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Pipeline Yield</div>
          <div className="mt-1.5 text-lg font-bold text-slate-900 tabular-nums">
            {okStageCount} / {activeCase.stages.length} stages nominal
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            Tier: {activeCase.tier} · Carved: {activeCase.carved.length} runs
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Evidence Captured</div>
          <div className="mt-1.5 text-lg font-bold text-slate-900 tabular-nums">
            {formatBytes(totalCapturedBytes)}
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            {activeCase.artifacts.length} indexed payloads · {activeCase.timeline.length} events
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Acquisition Budget</div>
          <div className="mt-1.5 text-lg font-bold text-slate-900 tabular-nums">
            {activeCase.budgetMinutesUsed} / {activeCase.budgetMinutesCap} min
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            {activeCase.budgetMbUsed} MB / {activeCase.budgetMbCap} MB cap
          </div>
        </div>
      </section>

      {/* Main 2-Column Overview Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Preflight Facts + Privilege Ladder */}
        <div className="min-w-0 space-y-6 lg:col-span-5">
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-semibold text-slate-900">
                01. Device Preflight & Storage
              </h2>
              <span className="text-xs font-mono text-slate-500">Stage 00</span>
            </div>
            <dl className="mt-3 divide-y divide-slate-100 text-sm">
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-slate-500">Model</dt>
                <dd className="font-mono text-right text-slate-900">
                  {activeCase.preflight['ro.product.manufacturer']}{' '}
                  {activeCase.preflight['ro.product.model']}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-slate-500">Android / SDK</dt>
                <dd className="font-mono text-right text-slate-900 tabular-nums">
                  Android {activeCase.preflight['ro.build.version.release']} (SDK{' '}
                  {activeCase.preflight['ro.build.version.sdk']})
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-slate-500">Crypto State</dt>
                <dd className="font-mono text-right text-slate-900">
                  {activeCase.preflight['ro.crypto.state']} · secure={activeCase.preflight['ro.secure']}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-slate-500">Timezone</dt>
                <dd className="font-mono text-right text-slate-900">
                  {activeCase.preflight['persist.sys.timezone']}
                </dd>
              </div>
              <div className="py-2">
                <dt className="text-slate-500">Build Fingerprint</dt>
                <dd className="mt-1 break-all font-mono text-xs text-slate-800">
                  {activeCase.preflight['ro.build.fingerprint']}
                </dd>
              </div>
              <div className="py-2">
                <dt className="text-slate-500">Partition Utilization</dt>
                <dd className="mt-1 font-mono text-xs text-slate-800">
                  {activeCase.preflight.dfSummary}
                </dd>
              </div>
              <div className="py-2">
                <dt className="text-slate-500">Battery</dt>
                <dd className="mt-1 font-mono text-xs text-slate-800">
                  {activeCase.preflight.batterySummary}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-semibold text-slate-900">
                02. Privilege Escalation Ladder
              </h2>
              <span className="text-xs font-mono text-slate-500">Stage 02</span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Method</th>
                    <th className="py-2 pr-3 font-medium">Result</th>
                    <th className="py-2 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {activeCase.ladder.map((att) => (
                    <tr key={att.tier}>
                      <td className="py-2.5 pr-3 font-medium text-slate-900">{att.tier}</td>
                      <td
                        className={`py-2.5 pr-3 font-semibold ${
                          att.ok ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {att.ok ? 'GRANTED' : 'DENIED'}
                      </td>
                      <td className="py-2.5 text-slate-600">{att.detail || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => onNavigateTab('verifier')}
                className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
              >
                Inspect Hash Chain Ledger →
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('timeline')}
                className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
              >
                Open Timeline & Carver →
              </button>
            </div>
          </section>
        </div>

        {/* Right Column: Acquisition Stage Matrix */}
        <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 lg:col-span-7">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                03. Acquisition Pipeline Matrix
              </h2>
              <p className="text-xs text-slate-500">
                Read-only stages executed under {activeCase.tier} privileges
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStageFilter(f.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    stageFilter === f.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Stage</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Tier</th>
                  <th className="py-2 pr-3 text-right font-medium">Artifacts</th>
                  <th className="py-2 pr-3 text-right font-medium">Captured</th>
                  <th className="py-2 font-medium">Notes / Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStages.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No pipeline stages match the selected status filter.
                    </td>
                  </tr>
                ) : (
                  filteredStages.map((s) => (
                    <tr key={s.name} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-3 font-mono font-medium text-slate-900">
                        {s.name}
                      </td>
                      <td className={`py-2.5 pr-3 font-mono uppercase ${statusTextClass(s.status)}`}>
                        {s.status}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-slate-600">{s.tier}</td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-900">
                        {s.artifacts.toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-700">
                        {formatBytes(s.bytes)}
                      </td>
                      <td className="py-2.5 text-slate-600">
                        {s.error ? (
                          <span className="text-red-700">{s.error}</span>
                        ) : (
                          s.notes.join(' · ') || '—'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
