import type {
  CarvedString,
  ChainRecord,
  ChainRecordVerification,
  CliParams,
  CaseBundle,
  TimelineEvent,
  VerificationReport,
} from './types';

const GENESIS_PREV = '0'.repeat(64);
const SQLITE_MAGIC = 'SQLite format 3\0';

export async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', copy.buffer);
  const arr = new Uint8Array(hashBuf);
  let hex = '';
  for (let i = 0; i < arr.length; i++) {
    hex += arr[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Mirrors Python's `json.dumps({k: v for k, v in rec.items() if k != "prev"}, sort_keys=True)`
 * with standard `, ` and `: ` separators so Node/Browser digests match `v19.py` byte-for-byte.
 */
export function canonicalChainJson(rec: Omit<ChainRecord, 'prev'>): string {
  const keys = Object.keys(rec).sort() as Array<keyof Omit<ChainRecord, 'prev'>>;
  const parts = keys.map((k) => `${JSON.stringify(k)}: ${JSON.stringify(rec[k])}`);
  return `{${parts.join(', ')}}`;
}

export async function chainDigest(rec: ChainRecord): Promise<string> {
  const { prev: _prev, ...withoutPrev } = rec;
  return sha256Hex(canonicalChainJson(withoutPrev));
}

export async function buildSignedChain(
  items: Array<{ utc: string; path: string; payload: string; note: string }>
): Promise<{ chain: ChainRecord[]; artifactPayloads: Record<string, string> }> {
  const chain: ChainRecord[] = [];
  const artifactPayloads: Record<string, string> = {};
  let prev = GENESIS_PREV;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const sha256 = await sha256Hex(item.payload);
    const rec: ChainRecord = {
      seq: i + 1,
      utc: item.utc,
      path: item.path,
      sha256,
      note: item.note,
      prev,
    };
    prev = await chainDigest(rec);
    chain.push(rec);
    artifactPayloads[item.path] = item.payload;
  }
  return { chain, artifactPayloads };
}

export async function verifyChainRecords(
  records: ChainRecord[],
  artifactPayloads?: Record<string, string | Uint8Array>
): Promise<VerificationReport> {
  if (records.length === 0) {
    return {
      valid: false,
      exitCode: 1,
      checkedCount: 0,
      brokenAtSeq: 1,
      headDigest: GENESIS_PREV,
      errors: [{ seq: 1, path: 'chain.jsonl', reason: 'Empty hash chain ledger' }],
      recordStatuses: [],
    };
  }

  let expectedPrev = GENESIS_PREV;
  let brokenAtSeq: number | null = null;
  const errors: Array<{ seq: number; path: string; reason: string }> = [];
  const recordStatuses: ChainRecordVerification[] = [];

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const expectedSeq = i + 1;
    let linkValid = true;
    let artifactChecked = false;
    let artifactValid: boolean | null = null;
    const reasons: string[] = [];

    if (rec.seq !== expectedSeq) {
      linkValid = false;
      reasons.push(`Sequence number ${rec.seq} expected ${expectedSeq}`);
    }

    if (rec.prev !== expectedPrev) {
      linkValid = false;
      reasons.push(
        `Previous link mismatch (expected ${expectedPrev.slice(0, 12)}, got ${rec.prev.slice(0, 12)})`
      );
    }

    if (artifactPayloads && Object.prototype.hasOwnProperty.call(artifactPayloads, rec.path)) {
      artifactChecked = true;
      const actualHash = await sha256Hex(artifactPayloads[rec.path]);
      artifactValid = actualHash === rec.sha256;
      if (!artifactValid) {
        reasons.push(
          `Artifact SHA-256 mismatch (expected ${rec.sha256.slice(0, 12)}, got ${actualHash.slice(0, 12)})`
        );
      }
    }

    const computedDigest = await chainDigest(rec);
    if (reasons.length > 0) {
      if (brokenAtSeq === null) {
        brokenAtSeq = rec.seq;
      }
      errors.push({
        seq: rec.seq,
        path: rec.path,
        reason: reasons.join('; '),
      });
    }

    recordStatuses.push({
      seq: rec.seq,
      path: rec.path,
      linkValid,
      artifactChecked,
      artifactValid,
      expectedPrev,
      computedDigest,
      error: reasons.length > 0 ? reasons.join('; ') : undefined,
    });

    expectedPrev = computedDigest;
  }

  const valid = errors.length === 0;
  return {
    valid,
    exitCode: valid ? 0 : 1,
    checkedCount: records.length,
    brokenAtSeq,
    headDigest: expectedPrev,
    errors,
    recordStatuses,
  };
}

export function parseChainJsonl(raw: string): {
  records: ChainRecord[];
  parseErrors: string[];
} {
  const records: ChainRecord[] = [];
  const parseErrors: string[] = [];
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as Partial<ChainRecord>;
      if (
        typeof obj.seq !== 'number' ||
        typeof obj.utc !== 'string' ||
        typeof obj.path !== 'string' ||
        typeof obj.sha256 !== 'string' ||
        typeof obj.prev !== 'string'
      ) {
        parseErrors.push(`Line ${i + 1}: missing required chain fields`);
        continue;
      }
      records.push({
        seq: obj.seq,
        utc: obj.utc,
        path: obj.path,
        sha256: obj.sha256,
        note: typeof obj.note === 'string' ? obj.note : '',
        prev: obj.prev,
      });
    } catch {
      parseErrors.push(`Line ${i + 1}: malformed JSON`);
    }
  }
  return { records, parseErrors };
}

export async function carveSqliteBuffer(
  bytes: Uint8Array,
  dbName: string,
  liveStrings: Set<string> = new Set(),
  limit = 5000
): Promise<{ validSqlite: boolean; pageSize: number; carved: CarvedString[] }> {
  if (bytes.byteLength < 100) {
    return { validSqlite: false, pageSize: 0, carved: [] };
  }
  const headerStr = new TextDecoder('latin1').decode(bytes.subarray(0, 16));
  if (headerStr !== SQLITE_MAGIC) {
    return { validSqlite: false, pageSize: 0, carved: [] };
  }

  const rawPs = (bytes[16] << 8) | bytes[17];
  const pageSize = rawPs === 1 ? 65536 : rawPs || 4096;

  const carved: CarvedString[] = [];
  const seen = new Set<string>();
  let runStart = -1;

  for (let i = 0; i <= bytes.byteLength && carved.length < limit; i++) {
    const b = i < bytes.byteLength ? bytes[i] : 0;
    const isPrintable = b >= 0x20 && b <= 0x7e;
    if (isPrintable) {
      if (runStart === -1) runStart = i;
    } else if (runStart !== -1) {
      const len = i - runStart;
      if (len >= 16) {
        const slice = bytes.subarray(runStart, i);
        const text = new TextDecoder('ascii').decode(slice);
        if (!liveStrings.has(text) && !seen.has(text)) {
          seen.add(text);
          const digest = await sha256Hex(slice);
          carved.push({
            dbName,
            page: Math.floor(runStart / pageSize),
            offset: runStart,
            sha256: digest,
            text: text.slice(0, 400),
          });
        }
      }
      runStart = -1;
    }
  }

  return { validSqlite: true, pageSize, carved };
}

export function normalizeTimestampToMs(
  raw: string,
  tzOffsetMinutes = 0,
  loYear = 2015,
  hiYear = 2035
): { ms: number | null; source: 'epoch13' | 'epoch10' | 'iso' | 'unresolved' } {
  const v = (raw || '').trim();
  if (!v) return { ms: null, source: 'unresolved' };

  let ms: number;
  let source: 'epoch13' | 'epoch10' | 'iso';

  if (/^\d{13}$/.test(v)) {
    ms = Number(v);
    source = 'epoch13';
  } else if (/^\d{10}$/.test(v)) {
    ms = Number(v) * 1000;
    source = 'epoch10';
  } else if (/^\d{1,4}$/.test(v)) {
    return { ms: null, source: 'unresolved' };
  } else {
    const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(v);
    const parsed = Date.parse(hasTz ? v : `${v}Z`);
    if (Number.isNaN(parsed)) {
      return { ms: null, source: 'unresolved' };
    }
    ms = hasTz ? parsed : parsed - tzOffsetMinutes * 60_000;
    source = 'iso';
  }

  const shiftedYear = new Date(ms + tzOffsetMinutes * 60_000).getUTCFullYear();
  if (shiftedYear < loYear || shiftedYear > hiYear) {
    return { ms: null, source: 'unresolved' };
  }
  return { ms, source };
}

const LOGCAT_RX =
  /^(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)\.(\d+)\s+([VDIWEFA])\/([^(]+)\(\s*(\d+)\): (.*)$/;

export function formatUtcAndLocal(
  ms: number,
  tzOffsetMinutes: number
): { utc: string; local: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  const utc = fmt(new Date(ms));
  const local = fmt(new Date(ms + tzOffsetMinutes * 60_000));
  return { utc, local };
}

export function parseLogcatLines(
  rawText: string,
  year: number,
  tzOffsetMinutes = 0
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const lines = rawText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = LOGCAT_RX.exec(lines[i]);
    if (!m) continue;
    const [, mo, dy, hh, mm, ss, , level, tag, pid, msg] = m;
    const isoNoTz = `${year}-${mo}-${dy}T${hh}:${mm}:${ss}`;
    const norm = normalizeTimestampToMs(isoNoTz, tzOffsetMinutes, year - 2, year + 1);
    if (norm.ms === null) continue;
    const { utc, local } = formatUtcAndLocal(norm.ms, tzOffsetMinutes);
    events.push({
      id: `log-${i + 1}`,
      ms: norm.ms,
      utc,
      local,
      source: 'logcat',
      level,
      summary: `${tag.trim()} (pid ${pid})`,
      detail: msg.slice(0, 400),
    });
  }
  return events;
}

export function formatBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let val = n;
  for (const u of units) {
    if (val < 1024 || u === 'TB') {
      return u === 'B' ? `${Math.round(val)} B` : `${val.toFixed(1)} ${u}`;
    }
    val /= 1024;
  }
  return `${n} B`;
}

export function buildCliCommand(params: CliParams): string {
  if (params.mode === 'self-test') {
    return 'python3 v19.py --self-test --json';
  }
  if (params.mode === 'verify') {
    return `python3 v19.py --verify ${params.outDir || '~/cases/CPH2819_20261116'}`;
  }
  if (params.mode === 'serve') {
    return `python3 v19.py --serve ${params.outDir || '~/cases/CPH2819_20261116'} --port ${params.servePort}`;
  }
  const base = `python3 v19.py --serial ${params.serial || 'R58M12345'} --out ${params.outDir || '~/cases/CPH2819_20261116'} --budget-minutes ${params.budgetMinutes} --budget-mb ${params.budgetMb} --media-mode ${params.mediaMode}`;
  return params.mode === 'resume' ? `${base} --resume` : base;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateStandaloneHtmlReport(
  bundle: CaseBundle,
  verification: VerificationReport
): string {
  const stageRows = bundle.stages
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.status.toUpperCase())}</td><td>${escapeHtml(s.tier)}</td><td>${s.artifacts}</td><td>${escapeHtml(formatBytes(s.bytes))}</td><td>${escapeHtml(s.notes.join(', ') || s.error)}</td></tr>`
    )
    .join('');

  const chainRows = bundle.chain
    .slice(0, 60)
    .map(
      (c) =>
        `<tr><td>${c.seq}</td><td>${escapeHtml(c.utc)}</td><td>${escapeHtml(c.path)}</td><td><code>${escapeHtml(c.sha256.slice(0, 16))}...</code></td><td>${escapeHtml(c.note)}</td></tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Forensic Case Report - ${escapeHtml(bundle.id)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; background: #f8fafc; max-width: 1120px; margin: 2rem auto; padding: 0 1.25rem; line-height: 1.5; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1.1rem; margin: 2rem 0 0.75rem; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.35rem; }
  .meta { color: #475569; font-size: 0.9rem; margin-bottom: 1.25rem; }
  .banner { padding: 0.75rem 1rem; border: 1px solid ${verification.valid ? '#16a34a' : '#dc2626'}; background: #ffffff; margin-bottom: 1.5rem; font-weight: 600; color: ${verification.valid ? '#15803d' : '#b91c1c'}; }
  table { width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #cbd5e1; font-size: 0.875rem; }
  th, td { text-align: left; padding: 0.55rem 0.75rem; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 600; }
  code { font-family: ui-monospace, monospace; font-size: 0.82rem; }
</style>
</head>
<body>
  <h1>Forensic Case Report: ${escapeHtml(bundle.id)}</h1>
  <div class="meta">Device: ${escapeHtml(bundle.preflight['ro.product.manufacturer'])} ${escapeHtml(bundle.preflight['ro.product.model'])} (${escapeHtml(bundle.serial)}) · Acquired: ${escapeHtml(bundle.acquiredUtc)} · Tier: ${escapeHtml(bundle.tier)} · TZ: ${escapeHtml(bundle.timezone)}</div>
  <div class="banner">Chain Integrity: ${verification.valid ? 'VERIFIED (EXIT 0)' : 'BROKEN (EXIT 1)'} — ${verification.checkedCount} ledger entries · Head Digest: <code>${escapeHtml(verification.headDigest)}</code></div>
  <h2>01. Acquisition Stages</h2>
  <table>
    <thead><tr><th>Stage</th><th>Status</th><th>Tier</th><th>Artifacts</th><th>Bytes</th><th>Notes / Errors</th></tr></thead>
    <tbody>${stageRows}</tbody>
  </table>
  <h2>02. Hash Chain Ledger (First ${Math.min(60, bundle.chain.length)} Entries)</h2>
  <table>
    <thead><tr><th>Seq</th><th>UTC</th><th>Path</th><th>SHA-256</th><th>Note</th></tr></thead>
    <tbody>${chainRows}</tbody>
  </table>
</body>
</html>`;
}
