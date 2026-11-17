import { useState } from 'react';
import { CheckCircle2, FileUp, RotateCcw, ShieldAlert } from 'lucide-react';
import { parseChainJsonl, verifyChainRecords } from '../forensics/engine';
import type { CaseBundle, VerificationReport } from '../forensics/types';

interface ChainVerifierViewProps {
  activeCase: CaseBundle;
  verification: VerificationReport;
  tamperedSeqs: number[];
  onToggleTamper: (seq: number, path: string) => void;
  onRestoreAll: () => void;
}

export function ChainVerifierView({
  activeCase,
  verification,
  tamperedSeqs,
  onToggleTamper,
  onRestoreAll,
}: ChainVerifierViewProps) {
  const [showImport, setShowImport] = useState(false);
  const [customJsonl, setCustomJsonl] = useState('');
  const [customReport, setCustomReport] = useState<VerificationReport | null>(null);
  const [customParseErrors, setCustomParseErrors] = useState<string[]>([]);

  async function handleVerifyCustom(rawText: string) {
    const { records, parseErrors } = parseChainJsonl(rawText);
    setCustomParseErrors(parseErrors);
    const rep = await verifyChainRecords(records);
    setCustomReport(rep);
  }

  async function handleFileUpload(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setCustomJsonl(text);
    await handleVerifyCustom(text);
  }

  const statusBySeq = new Map(verification.recordStatuses.map((s) => [s.seq, s]));

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Cryptographic Evidence Ledger · SHA-256 Chain Validation
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Chain of Custody Verifier
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Validates sequential SHA-256 prev pointers and artifact payloads for{' '}
            <span className="font-mono font-medium text-slate-900">{activeCase.id}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {tamperedSeqs.length > 0 && (
            <button
              type="button"
              onClick={onRestoreAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Restore Integrity
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowImport((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
            {showImport ? 'Hide Custom Verifier' : 'Verify External chain.jsonl'}
          </button>
        </div>
      </section>

      {/* Live Verification Status Banner */}
      <section
        aria-live="polite"
        data-testid="verification-banner"
        className={`rounded-lg border p-4 bg-white ${
          verification.valid ? 'border-emerald-300' : 'border-red-300'
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {verification.valid ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700 shrink-0" aria-hidden="true" />
            ) : (
              <ShieldAlert className="mt-0.5 h-5 w-5 text-red-700 shrink-0" aria-hidden="true" />
            )}
            <div>
              <div
                className={`text-sm font-bold ${
                  verification.valid ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {verification.valid
                  ? `CHAIN VALIDATED — EXIT 0 (${verification.checkedCount} records verified)`
                  : `CHAIN BROKEN — EXIT 1 (First break at seq #${verification.brokenAtSeq})`}
              </div>
              <div className="mt-1 font-mono text-xs text-slate-600 break-all">
                Head Digest: {verification.headDigest}
              </div>
            </div>
          </div>

          <div className="text-xs font-mono tabular-nums text-slate-600">
            {verification.errors.length} integrity error{verification.errors.length === 1 ? '' : 's'}
          </div>
        </div>

        {verification.errors.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-red-100 pt-3 text-xs font-mono text-red-700">
            {verification.errors.map((err) => (
              <li key={`${err.seq}-${err.path}`}>
                seq #{err.seq} ({err.path}): {err.reason}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* External chain.jsonl Paste / Upload Panel */}
      {showImport && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                External chain.jsonl Verification
              </h2>
              <p className="text-xs text-slate-500">
                Upload or paste lines from any v19.py chain.jsonl file to audit sequence and SHA-256 prev links.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100">
              <span>Load .jsonl File</span>
              <input
                type="file"
                accept=".jsonl,.txt,.json"
                onChange={(e) => handleFileUpload(e.target.files?.[0])}
                className="sr-only"
              />
            </label>
          </div>

          <textarea
            value={customJsonl}
            onChange={(e) => setCustomJsonl(e.target.value)}
            rows={5}
            aria-label="Paste chain.jsonl content"
            placeholder='{"note": "preflight", "path": "metadata/preflight.json", "prev": "0000...", "seq": 1, "sha256": "...", "utc": "..."}'
            className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-700"
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleVerifyCustom(customJsonl)}
              disabled={!customJsonl.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              Verify Submitted Chain
            </button>
            <button
              type="button"
              onClick={() => {
                const serialized = activeCase.chain.map((r) => JSON.stringify(r)).join('\n');
                setCustomJsonl(serialized);
                handleVerifyCustom(serialized);
              }}
              className="text-xs font-medium text-blue-700 hover:underline"
            >
              Load Active Case chain.jsonl
            </button>
          </div>

          {customParseErrors.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-mono text-amber-800">
              {customParseErrors.join(' | ')}
            </div>
          )}

          {customReport && (
            <div
              className={`rounded-md border p-3 text-xs font-mono ${
                customReport.valid
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {customReport.valid
                ? `VALID (Exit 0) · ${customReport.checkedCount} chain links verified · Head ${customReport.headDigest}`
                : `INVALID (Exit 1) · ${customReport.errors.map((e) => `seq #${e.seq}: ${e.reason}`).join('; ')}`}
            </div>
          )}
        </section>
      )}

      {/* Cryptographic Ledger Table */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-1 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              01. Cryptographic Ledger (chain.jsonl)
            </h2>
            <p className="text-xs text-slate-500">
              Click Simulate Tamper on any row to flip 1 byte in its evidence payload and observe verification failure.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {activeCase.chain.length} entries
          </span>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Seq</th>
                <th className="py-2 pr-3 font-medium">UTC Timestamp</th>
                <th className="py-2 pr-3 font-medium">Artifact Path</th>
                <th className="py-2 pr-3 font-medium">Payload SHA-256</th>
                <th className="py-2 pr-3 font-medium">Prev Link</th>
                <th className="py-2 pr-3 font-medium">Verification</th>
                <th className="py-2 text-right font-medium">Tamper Lab</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {activeCase.chain.map((rec) => {
                const st = statusBySeq.get(rec.seq);
                const isTampered = tamperedSeqs.includes(rec.seq);
                const rowOk = st ? st.linkValid && st.artifactValid !== false : true;
                return (
                  <tr
                    key={rec.seq}
                    className={rowOk ? 'hover:bg-slate-50' : 'bg-red-50/70'}
                  >
                    <td className="py-2.5 pr-3 tabular-nums font-semibold text-slate-900">
                      #{rec.seq}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-slate-600 whitespace-nowrap">
                      {rec.utc}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-900">
                      <div>{rec.path}</div>
                      {rec.note && <div className="text-[11px] text-slate-500">{rec.note}</div>}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-slate-700" title={rec.sha256}>
                      {rec.sha256.slice(0, 14)}…
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-slate-500" title={rec.prev}>
                      {rec.prev.slice(0, 12)}…
                    </td>
                    <td
                      className={`py-2.5 pr-3 font-semibold ${
                        rowOk ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {rowOk ? 'VALID' : 'HASH MISMATCH'}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onToggleTamper(rec.seq, rec.path)}
                        aria-label={
                          isTampered
                            ? `Restore payload for seq ${rec.seq}`
                            : `Simulate tamper on seq ${rec.seq}`
                        }
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-sans font-medium transition-colors ${
                          isTampered
                            ? 'border-red-300 bg-white text-red-700 hover:bg-red-50'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {isTampered ? 'Revert Byte' : 'Simulate Tamper'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
