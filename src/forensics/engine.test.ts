import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCliCommand,
  buildSignedChain,
  carveSqliteBuffer,
  chainDigest,
  generateStandaloneHtmlReport,
  normalizeTimestampToMs,
  parseChainJsonl,
  parseLogcatLines,
  sha256Hex,
  verifyChainRecords,
} from './engine';
import { createSampleCases } from './sampleCases';

test('hash chain signs and validates cleanly with exitCode 0', async () => {
  const { chain, artifactPayloads } = await buildSignedChain([
    { utc: '2026-11-16T10:00:00Z', path: 'metadata/preflight.json', payload: '{"ok":true}', note: 'preflight' },
    { utc: '2026-11-16T10:00:05Z', path: 'raw/identity/props.txt', payload: 'ro.secure=1', note: 'props' },
    { utc: '2026-11-16T10:00:10Z', path: 'recovery/carved/db.jsonl', payload: '{"text":"deleted_item"}', note: 'carve' },
  ]);

  assert.equal(chain.length, 3);
  assert.equal(chain[0].prev, '0'.repeat(64));
  assert.equal(chain[1].prev, await chainDigest(chain[0]));

  const report = await verifyChainRecords(chain, artifactPayloads);
  assert.equal(report.valid, true);
  assert.equal(report.exitCode, 0);
  assert.equal(report.checkedCount, 3);
  assert.equal(report.brokenAtSeq, null);
  assert.equal(report.errors.length, 0);
});

test('tampering artifact payload or chain link triggers exitCode 1 at exact seq', async () => {
  const { chain, artifactPayloads } = await buildSignedChain([
    { utc: '2026-11-16T10:00:00Z', path: 'a.txt', payload: 'alpha-payload', note: 'a' },
    { utc: '2026-11-16T10:00:01Z', path: 'b.txt', payload: 'bravo-payload', note: 'b' },
    { utc: '2026-11-16T10:00:02Z', path: 'c.txt', payload: 'charlie-payload', note: 'c' },
  ]);

  // 1. Artifact byte tamper on seq 2
  const tamperedPayloads = { ...artifactPayloads, 'b.txt': 'bravo-payload!' };
  const rep1 = await verifyChainRecords(chain, tamperedPayloads);
  assert.equal(rep1.valid, false);
  assert.equal(rep1.exitCode, 1);
  assert.equal(rep1.brokenAtSeq, 2);
  assert.equal(rep1.recordStatuses[1].artifactValid, false);

  // 2. Chain record note tamper on seq 1 breaks seq 2 prev link
  const tamperedChain = chain.map((c, idx) => (idx === 0 ? { ...c, note: 'altered' } : c));
  const rep2 = await verifyChainRecords(tamperedChain, artifactPayloads);
  assert.equal(rep2.valid, false);
  assert.equal(rep2.exitCode, 1);
  assert.equal(rep2.brokenAtSeq, 2);
});

test('parseChainJsonl parses valid lines and flags malformed lines', () => {
  const raw = [
    JSON.stringify({ seq: 1, utc: '2026-11-16T00:00:00Z', path: 'a', sha256: 'abc', note: '', prev: '0'.repeat(64) }),
    '{bad json',
    JSON.stringify({ seq: 2, path: 'missing_fields' }),
  ].join('\n');
  const parsed = parseChainJsonl(raw);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.parseErrors.length, 2);
});

test('carveSqliteBuffer validates SQLite magic and extracts unallocated printable runs', async () => {
  const buf = new Uint8Array(4096);
  const magic = new TextEncoder().encode('SQLite format 3\0');
  buf.set(magic, 0);
  // Page size 4096 at bytes 16..18 (0x10 0x00)
  buf[16] = 0x10;
  buf[17] = 0x00;

  const liveStr = 'LIVE_ROW_ALREADY_PRESENT_1234';
  const deletedStr = 'DELETED_SMS_BODY_MEET_AT_PIER_27';
  buf.set(new TextEncoder().encode(liveStr), 220);
  buf.set(new TextEncoder().encode(deletedStr), 1850);

  const res = await carveSqliteBuffer(buf, 'mmssms.db', new Set([liveStr]));
  assert.equal(res.validSqlite, true);
  assert.equal(res.pageSize, 4096);
  assert.equal(res.carved.length, 1);
  assert.equal(res.carved[0].text, deletedStr);
  assert.equal(res.carved[0].offset, 1850);
  assert.equal(res.carved[0].page, 0);
  assert.equal(res.carved[0].sha256, await sha256Hex(deletedStr));

  const nonSqlite = await carveSqliteBuffer(new TextEncoder().encode('NOT A SQLITE DATABASE HEADER AT ALL'.repeat(4)), 'bad.db');
  assert.equal(nonSqlite.validSqlite, false);
  assert.equal(nonSqlite.carved.length, 0);
});

test('normalizeTimestampToMs and parseLogcatLines handle epoch10, epoch13, ISO, and threadtime', () => {
  assert.deepEqual(normalizeTimestampToMs('1700000000000'), { ms: 1700000000000, source: 'epoch13' });
  assert.deepEqual(normalizeTimestampToMs('1700000000'), { ms: 1700000000000, source: 'epoch10' });
  assert.equal(normalizeTimestampToMs('42').source, 'unresolved');
  assert.equal(normalizeTimestampToMs('1995-01-01T00:00:00Z').source, 'unresolved');

  const logSample = [
    '11-16 17:04:12.114 I/ActivityManager( 1842): Start proc com.whatsapp',
    '11-16 17:11:44.019 W/Telecom( 2190): Outgoing call blocked',
    'garbage line ignored',
  ].join('\n');
  const events = parseLogcatLines(logSample, 2026, -480);
  assert.equal(events.length, 2);
  assert.equal(events[0].level, 'I');
  assert.equal(events[0].summary, 'ActivityManager (pid 1842)');
  assert.equal(events[1].level, 'W');
});

test('sample cases validate end-to-end and generate standalone HTML report', async () => {
  const cases = await createSampleCases();
  assert.equal(cases.length, 2);
  for (const c of cases) {
    const rep = await verifyChainRecords(c.chain, c.artifactPayloads);
    assert.equal(rep.valid, true, `Sample case ${c.id} failed verification: ${JSON.stringify(rep.errors)}`);
    const html = generateStandaloneHtmlReport(c, rep);
    assert.ok(html.includes(c.id));
    assert.ok(html.includes('VERIFIED (EXIT 0)'));
  }

  const cli = buildCliCommand({
    mode: 'acquire',
    serial: 'R58M12345',
    outDir: '~/cases/CPH2819_20261116',
    budgetMinutes: 900,
    budgetMb: 32768,
    mediaMode: 'thumbnails',
    servePort: 8787,
  });
  assert.equal(
    cli,
    'python3 v19.py --serial R58M12345 --out ~/cases/CPH2819_20261116 --budget-minutes 900 --budget-mb 32768 --media-mode thumbnails'
  );
});
