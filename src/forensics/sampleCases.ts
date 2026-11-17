import { buildSignedChain, formatUtcAndLocal } from './engine';
import type { ArtifactItem, CarvedString, CaseBundle, TimelineEvent } from './types';

function makeArtifactPayloadMap(): Array<{
  utc: string;
  path: string;
  category: ArtifactItem['category'];
  payload: string;
  note: string;
}> {
  return [
    {
      utc: '2026-11-16T17:12:04Z',
      path: 'metadata/preflight.json',
      category: 'identity',
      note: 'preflight',
      payload: JSON.stringify(
        {
          utc: '2026-11-16T17:12:04Z',
          facts: {
            'ro.product.model': 'CPH2819',
            'ro.product.manufacturer': 'OnePlus',
            'ro.build.version.release': '15',
            'ro.build.version.sdk': '35',
            'ro.build.fingerprint': 'OnePlus/CPH2819/OP594DL1:15/AP3A.240905.015/U.1b2a:user/release-keys',
            'ro.serialno': 'R58M12345',
            'ro.crypto.state': 'encrypted',
            'ro.debuggable': '0',
            'ro.secure': '1',
            'persist.sys.timezone': 'America/Los_Angeles',
          },
          df: 'Filesystem     1K-blocks     Used Available Use% Mounted on\n/dev/block/dm-5 224198240 98421000 125777240 44% /data\n/dev/fuse       224198240 98421000 125777240 44% /sdcard',
          battery: 'Current Battery Service state:\n  AC powered: false\n  USB powered: true\n  level: 84\n  temperature: 294',
        },
        null,
        2
      ),
    },
    {
      utc: '2026-11-16T17:12:11Z',
      path: 'metadata/ladder.jsonl',
      category: 'identity',
      note: 'ladder',
      payload: [
        JSON.stringify({ tier: 'adb_root', ok: false, detail: 'adbd cannot run as root in production builds' }),
        JSON.stringify({ tier: 'su_c', ok: true }),
      ].join('\n'),
    },
    {
      utc: '2026-11-16T17:12:28Z',
      path: 'raw/identity/accounts.txt',
      category: 'identity',
      note: 'accounts',
      payload:
        'Accounts: 3\n  Account {name=forensic.subject@example.org, type=com.google}\n  Account {name=+14155550192, type=com.whatsapp}\n  Account {name=signal-primary, type=org.thoughtcrime.securesms}',
    },
    {
      utc: '2026-11-16T17:12:41Z',
      path: 'raw/identity/wifi.txt',
      category: 'identity',
      note: 'wifi',
      payload:
        'WifiManager active: true\nCurrent SSID: "Lab-Secure-5G"\nBSSID: 8c:de:f9:14:22:a1\nIP: 10.42.0.118\nSaved Networks: 14 (WPA2/WPA3-SAE)',
    },
    {
      utc: '2026-11-16T17:13:09Z',
      path: 'raw/services/location.txt',
      category: 'services',
      note: 'dumpsys location',
      payload:
        'Location Manager State:\n  Last Known Locations:\n    fused: Location[fused 37.789700,-122.397200 hAcc=11.4m et=+4d11h22m]\n    gps: Location[gps 37.789681,-122.397214 hAcc=6.2m]',
    },
    {
      utc: '2026-11-16T17:13:34Z',
      path: 'raw/providers/com.android.providers.contacts_contacts.txt',
      category: 'providers',
      note: 'contacts provider',
      payload:
        'Row: 0 _id=101, display_name=Elena Vance, times_contacted=42, last_time_contacted=1763310112000\nRow: 1 _id=104, display_name=Marcus Chen, times_contacted=19, last_time_contacted=1763298400000',
    },
    {
      utc: '2026-11-16T17:14:02Z',
      path: 'raw/packages/_list.txt',
      category: 'packages',
      note: 'packages',
      payload:
        'com.whatsapp\norg.thoughtcrime.securesms\norg.telegram.messenger\ncom.google.android.apps.messaging\ncom.android.chrome\ncom.google.android.apps.maps',
    },
    {
      utc: '2026-11-16T17:15:18Z',
      path: 'media/index.jsonl',
      category: 'media',
      note: 'media index',
      payload: [
        JSON.stringify({ mtime: 1763312880, bytes: 3841024, path: '/sdcard/DCIM/Camera/IMG_20261116_170800.jpg' }),
        JSON.stringify({ mtime: 1763309120, bytes: 184320, path: '/sdcard/DCIM/.thumbnails/thumb_88214.jpg' }),
        JSON.stringify({ mtime: 1763294400, bytes: 1420912, path: '/sdcard/WhatsApp/Media/WhatsApp Documents/transfer_ledger_q4.pdf' }),
      ].join('\n'),
    },
    {
      utc: '2026-11-16T17:16:40Z',
      path: 'apps/org.thoughtcrime.securesms/u0_keys/files_key_manifest.txt',
      category: 'apps',
      note: 'key material',
      payload: 'sqlcipher_key_slot=android_keystore_wrapped\ndb_size_bytes=18874368\nwal_frames=142',
    },
    {
      utc: '2026-11-16T17:17:22Z',
      path: 'recovery/carved/mmssms.db.jsonl',
      category: 'recovery',
      note: 'carve',
      payload: [
        JSON.stringify({
          page: 14,
          offset: 57612,
          sha256: '4a71f28b9c1130e10c2b4831a5f6c112d84f8b9d01a2e4f0e1a2b3c4d5e6f708',
          text: 'sms:+14155550192|DELETED_DRAFT: Meet at Pier 27 gate B before 18:30 PST',
        }),
        JSON.stringify({
          page: 29,
          offset: 119204,
          sha256: '9f33a81e2c44d8190b1e8722c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6',
          text: 'verification_code=849201 expired=2026-11-15T22:14:09Z provider=auth_sms',
        }),
      ].join('\n'),
    },
    {
      utc: '2026-11-16T17:18:05Z',
      path: 'recovery/trash/sdcard_.trash_IMG_20261114_211044.jpg.meta',
      category: 'recovery',
      note: 'trash:/sdcard/.trash/IMG_20261114_211044.jpg',
      payload: 'recovered_from=/sdcard/.trash/IMG_20261114_211044.jpg\noriginal_bytes=2918400\nexif_datetime=2026:11:14 21:10:44',
    },
    {
      utc: '2026-11-16T17:18:45Z',
      path: 'raw/logs/logcat.txt',
      category: 'recovery',
      note: 'logcat',
      payload: [
        '11-16 17:04:12.114 I/ActivityManager( 1842): Start proc 11420:com.whatsapp/u0a214 for service',
        '11-16 17:08:01.882 D/Camera2-Capture( 4410): Saved /sdcard/DCIM/Camera/IMG_20261116_170800.jpg',
        '11-16 17:11:44.019 W/Telecom( 2190): Outgoing call attempt restricted by carrier policy',
      ].join('\n'),
    },
  ];
}

function makeShellCasePayloadMap(): Array<{
  utc: string;
  path: string;
  category: ArtifactItem['category'];
  payload: string;
  note: string;
}> {
  return [
    {
      utc: '2026-11-15T09:30:10Z',
      path: 'metadata/preflight.json',
      category: 'identity',
      note: 'preflight',
      payload: JSON.stringify(
        {
          utc: '2026-11-15T09:30:10Z',
          facts: {
            'ro.product.model': 'Pixel 8',
            'ro.product.manufacturer': 'Google',
            'ro.build.version.release': '14',
            'ro.build.version.sdk': '34',
            'ro.build.fingerprint': 'google/shiba/shiba:14/AP2A.240905.003/12231197:user/release-keys',
            'ro.serialno': '3A181FDJH00421',
            'ro.crypto.state': 'encrypted',
            'ro.debuggable': '0',
            'ro.secure': '1',
            'persist.sys.timezone': 'UTC',
          },
          df: 'Filesystem 1K-blocks Used Available Use%\n/data 114881024 62100400 52780624 54% /data',
          battery: 'USB powered: true\nlevel: 91',
        },
        null,
        2
      ),
    },
    {
      utc: '2026-11-15T09:30:18Z',
      path: 'metadata/ladder.jsonl',
      category: 'identity',
      note: 'ladder',
      payload: [
        JSON.stringify({ tier: 'adb_root', ok: false, detail: 'adbd cannot run as root in production builds' }),
        JSON.stringify({ tier: 'su_c', ok: false, detail: '/system/bin/sh: su: inaccessible or not found' }),
        JSON.stringify({ tier: 'su_pipe', ok: false, detail: 'su: not found' }),
        JSON.stringify({ tier: 'magisk', ok: false, detail: 'magisk: not found' }),
      ].join('\n'),
    },
    {
      utc: '2026-11-15T09:30:44Z',
      path: 'raw/identity/props.txt',
      category: 'identity',
      note: 'props',
      payload: '[ro.build.version.security_patch]: [2026-11-05]\n[ro.boot.verifiedbootstate]: [green]',
    },
    {
      utc: '2026-11-15T09:31:15Z',
      path: 'raw/providers/media_external_images.txt',
      category: 'providers',
      note: 'media',
      payload: 'Row: 0 _id=9021, _data=/sdcard/Pictures/Screenshots/Screenshot_20261115.png, date_added=1763198100',
    },
    {
      utc: '2026-11-15T09:32:02Z',
      path: 'recovery/carved/downloads_cache.db.jsonl',
      category: 'recovery',
      note: 'carve',
      payload: JSON.stringify({
        page: 4,
        offset: 16890,
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        text: 'https://vault-sync.internal.invalid/archive/case-bundle-2026-11.zip',
      }),
    },
  ];
}

function buildTimelineFromEvents(
  tzOffsetMinutes: number,
  rawEvents: Array<{ ms: number; source: TimelineEvent['source']; level?: string; summary: string; detail: string }>
): TimelineEvent[] {
  return rawEvents
    .sort((a, b) => b.ms - a.ms)
    .map((ev, idx) => {
      const { utc, local } = formatUtcAndLocal(ev.ms, tzOffsetMinutes);
      return {
        id: `ev-${idx + 1}`,
        ms: ev.ms,
        utc,
        local,
        source: ev.source,
        level: ev.level,
        summary: ev.summary,
        detail: ev.detail,
      };
    });
}

export async function createSampleCases(): Promise<CaseBundle[]> {
  // Case 1: CPH2819_20261116 (Root-tier max-yield acquisition)
  const items1 = makeArtifactPayloadMap();
  const { chain: chain1, artifactPayloads: payloads1 } = await buildSignedChain(
    items1.map(({ utc, path, payload, note }) => ({ utc, path, payload, note }))
  );

  const artifacts1: ArtifactItem[] = items1.map((item, idx) => ({
    path: item.path,
    category: item.category,
    bytes: new TextEncoder().encode(item.payload).byteLength,
    sha256: chain1[idx].sha256,
    preview: item.payload,
  }));

  const carved1: CarvedString[] = [
    {
      dbName: 'mmssms.db',
      page: 14,
      offset: 57612,
      sha256: '4a71f28b9c1130e10c2b4831a5f6c112d84f8b9d01a2e4f0e1a2b3c4d5e6f708',
      text: 'sms:+14155550192|DELETED_DRAFT: Meet at Pier 27 gate B before 18:30 PST',
    },
    {
      dbName: 'mmssms.db',
      page: 29,
      offset: 119204,
      sha256: '9f33a81e2c44d8190b1e8722c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6',
      text: 'verification_code=849201 expired=2026-11-15T22:14:09Z provider=auth_sms',
    },
    {
      dbName: 'contacts2.db',
      page: 8,
      offset: 34112,
      sha256: '71bc920e12d4a5812c9e8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d',
      text: 'raw_contact_deleted: +14155550177 / "Courier North" / note=backup_key_holder',
    },
    {
      dbName: 'wa_msgstore_decrypted.db',
      page: 102,
      offset: 419280,
      sha256: '2d8a19c0f73e4110b6a59e8d7c6b5a4938271605f4e3d2c1b0a9f8e7d6c5b4a3',
      text: 'jid=14155550192@s.whatsapp.net|deleted_msg=Confirming delivery manifest signed',
    },
  ];

  const tz1 = -480; // America/Los_Angeles PST
  const timeline1 = buildTimelineFromEvents(tz1, [
    {
      ms: 1763312880000,
      source: 'media',
      summary: '/sdcard/DCIM/Camera/IMG_20261116_170800.jpg',
      detail: '3.7 MB JPEG photo captured on primary rear camera',
    },
    {
      ms: 1763313104000,
      source: 'logcat',
      level: 'W',
      summary: 'Telecom (pid 2190)',
      detail: 'Outgoing call attempt restricted by carrier policy',
    },
    {
      ms: 1763312881882,
      source: 'logcat',
      level: 'D',
      summary: 'Camera2-Capture (pid 4410)',
      detail: 'Saved /sdcard/DCIM/Camera/IMG_20261116_170800.jpg',
    },
    {
      ms: 1763312652114,
      source: 'logcat',
      level: 'I',
      summary: 'ActivityManager (pid 1842)',
      detail: 'Start proc 11420:com.whatsapp/u0a214 for service',
    },
    {
      ms: 1763310112000,
      source: 'provider',
      summary: 'Contacts Provider · Elena Vance',
      detail: 'times_contacted=42, last_time_contacted=1763310112000',
    },
    {
      ms: 1763309120000,
      source: 'media',
      summary: '/sdcard/DCIM/.thumbnails/thumb_88214.jpg',
      detail: '180.0 KB cached thumbnail',
    },
    {
      ms: 1763294400000,
      source: 'media',
      summary: '/sdcard/WhatsApp/Media/WhatsApp Documents/transfer_ledger_q4.pdf',
      detail: '1.4 MB document indexed in WhatsApp Media',
    },
    {
      ms: 1763244849000,
      source: 'carved_sqlite',
      summary: 'mmssms.db · Page 29 @ 119204',
      detail: 'verification_code=849201 expired=2026-11-15T22:14:09Z provider=auth_sms',
    },
    {
      ms: 1763183444000,
      source: 'trash',
      summary: '/sdcard/.trash/IMG_20261114_211044.jpg',
      detail: 'Recovered 2.8 MB trashed photo before 30-day purge',
    },
  ]);

  const case1: CaseBundle = {
    id: 'CPH2819_20261116',
    title: 'OnePlus CPH2819 — Rooted Read-Only Acquisition',
    serial: 'R58M12345',
    acquiredUtc: '2026-11-16T17:19:02Z',
    timezone: 'America/Los_Angeles',
    tzOffsetMinutes: tz1,
    tzResolved: true,
    tier: 'root',
    budgetMbCap: 32768,
    budgetMbUsed: 1842,
    budgetMinutesCap: 900,
    budgetMinutesUsed: 47,
    preflight: {
      'ro.product.model': 'CPH2819',
      'ro.product.manufacturer': 'OnePlus',
      'ro.build.version.release': '15',
      'ro.build.version.sdk': '35',
      'ro.build.fingerprint': 'OnePlus/CPH2819/OP594DL1:15/AP3A.240905.015/U.1b2a:user/release-keys',
      'ro.serialno': 'R58M12345',
      'ro.crypto.state': 'encrypted',
      'ro.debuggable': '0',
      'ro.secure': '1',
      'persist.sys.timezone': 'America/Los_Angeles',
      dfSummary: '/data: 93.9 GB used / 213.8 GB total (44%) · /sdcard: 44% used',
      batterySummary: '84% · USB powered · 29.4 C',
    },
    ladder: [
      { tier: 'adb_root', ok: false, detail: 'adbd cannot run as root in production builds' },
      { tier: 'su_c', ok: true, detail: 'uid=0(root) gid=0(root)' },
    ],
    stages: [
      { name: '00_preflight', status: 'ok', tier: 'shell', bytes: 1840, artifacts: 1, notes: ['CPH2819'], error: '' },
      { name: '02_ladder', status: 'ok', tier: 'root', bytes: 248, artifacts: 1, notes: ['tier=root'], error: '' },
      { name: '03_identity', status: 'ok', tier: 'root', bytes: 412900, artifacts: 9, notes: ['all 9 probes captured'], error: '' },
      { name: '04_services', status: 'partial', tier: 'root', bytes: 14820400, artifacts: 184, notes: ['n=191', '{"ok":184,"timeout":4,"blocked":3}'], error: '' },
      { name: '05_providers', status: 'partial', tier: 'root', bytes: 6490210, artifacts: 42, notes: ['n=46', 'blocked=4'], error: '' },
      { name: '06_packages', status: 'ok', tier: 'root', bytes: 29481000, artifacts: 268, notes: ['n=268'], error: '' },
      { name: '08_media', status: 'ok', tier: 'root', bytes: 412880120, artifacts: 1420, notes: ['indexed=1420', 'chosen=1420', 'skipped=0'], error: '' },
      { name: '09_app:org.thoughtcrime.securesms', status: 'ok', tier: 'root', bytes: 618490112, artifacts: 14, notes: ['0:root:ok:618490112', 'members=13'], error: '' },
      { name: '09_app:com.whatsapp', status: 'ok', tier: 'root', bytes: 814902110, artifacts: 22, notes: ['0:root:ok:814902110', 'members=21'], error: '' },
      { name: '10_carve:mmssms.db', status: 'ok', tier: 'root', bytes: 24912, artifacts: 2, notes: ['unallocated printable runs carved'], error: '' },
      { name: '11_trash', status: 'ok', tier: 'root', bytes: 18940200, artifacts: 19, notes: ['recovered=19', 'skipped=0'], error: '' },
      { name: '12_logs', status: 'ok', tier: 'root', bytes: 12480910, artifacts: 3, notes: ['parsed_lines=18420'], error: '' },
      { name: '13_timeline', status: 'ok', tier: 'root', bytes: 4920110, artifacts: 19840, notes: ['events=19840'], error: '' },
      { name: '14_report', status: 'ok', tier: 'root', bytes: 128400, artifacts: 2, notes: ['manifest.json + report.html'], error: '' },
    ],
    chain: chain1,
    artifactPayloads: payloads1,
    artifacts: artifacts1,
    carved: carved1,
    timeline: timeline1,
  };

  // Case 2: Pixel8_Restricted_Shell (Unrooted shell-tier partial acquisition)
  const items2 = makeShellCasePayloadMap();
  const { chain: chain2, artifactPayloads: payloads2 } = await buildSignedChain(
    items2.map(({ utc, path, payload, note }) => ({ utc, path, payload, note }))
  );

  const artifacts2: ArtifactItem[] = items2.map((item, idx) => ({
    path: item.path,
    category: item.category,
    bytes: new TextEncoder().encode(item.payload).byteLength,
    sha256: chain2[idx].sha256,
    preview: item.payload,
  }));

  const carved2: CarvedString[] = [
    {
      dbName: 'downloads_cache.db',
      page: 4,
      offset: 16890,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      text: 'https://vault-sync.internal.invalid/archive/case-bundle-2026-11.zip',
    },
  ];

  const timeline2 = buildTimelineFromEvents(0, [
    {
      ms: 1763198100000,
      source: 'provider',
      summary: 'MediaStore · Screenshot_20261115.png',
      detail: '/sdcard/Pictures/Screenshots/Screenshot_20261115.png',
    },
    {
      ms: 1763199010000,
      source: 'carved_sqlite',
      summary: 'downloads_cache.db · Page 4 @ 16890',
      detail: 'https://vault-sync.internal.invalid/archive/case-bundle-2026-11.zip',
    },
  ]);

  const case2: CaseBundle = {
    id: 'Pixel8_Restricted_Shell',
    title: 'Google Pixel 8 — Shell-Tier Partial Acquisition',
    serial: '3A181FDJH00421',
    acquiredUtc: '2026-11-15T09:34:12Z',
    timezone: 'UTC',
    tzOffsetMinutes: 0,
    tzResolved: true,
    tier: 'shell',
    budgetMbCap: 16384,
    budgetMbUsed: 248,
    budgetMinutesCap: 180,
    budgetMinutesUsed: 19,
    preflight: {
      'ro.product.model': 'Pixel 8',
      'ro.product.manufacturer': 'Google',
      'ro.build.version.release': '14',
      'ro.build.version.sdk': '34',
      'ro.build.fingerprint': 'google/shiba/shiba:14/AP2A.240905.003/12231197:user/release-keys',
      'ro.serialno': '3A181FDJH00421',
      'ro.crypto.state': 'encrypted',
      'ro.debuggable': '0',
      'ro.secure': '1',
      'persist.sys.timezone': 'UTC',
      dfSummary: '/data: 59.2 GB used / 109.6 GB total (54%)',
      batterySummary: '91% · USB powered',
    },
    ladder: [
      { tier: 'adb_root', ok: false, detail: 'adbd cannot run as root in production builds' },
      { tier: 'su_c', ok: false, detail: '/system/bin/sh: su: inaccessible or not found' },
      { tier: 'su_pipe', ok: false, detail: 'su: not found' },
      { tier: 'magisk', ok: false, detail: 'magisk: not found' },
    ],
    stages: [
      { name: '00_preflight', status: 'ok', tier: 'shell', bytes: 1120, artifacts: 1, notes: ['Pixel 8'], error: '' },
      { name: '02_ladder', status: 'partial', tier: 'shell', bytes: 390, artifacts: 1, notes: ['tier=shell'], error: '' },
      { name: '03_identity', status: 'ok', tier: 'shell', bytes: 280100, artifacts: 9, notes: ['props & settings captured'], error: '' },
      { name: '04_services', status: 'partial', tier: 'shell', bytes: 9810200, artifacts: 142, notes: ['n=178', '{"ok":142,"blocked":36}'], error: '' },
      { name: '05_providers', status: 'partial', tier: 'shell', bytes: 2104000, artifacts: 18, notes: ['n=39', 'blocked=21'], error: '' },
      { name: '08_media', status: 'ok', tier: 'shell', bytes: 240812000, artifacts: 312, notes: ['indexed=312', 'mode=thumbnails'], error: '' },
      { name: '09_app:org.thoughtcrime.securesms', status: 'blocked', tier: 'none', bytes: 0, artifacts: 0, notes: [], error: 'SELinux denied /data/user/0 under shell uid=2000' },
      { name: '10_carve:downloads_cache.db', status: 'ok', tier: 'shell', bytes: 8192, artifacts: 1, notes: ['public storage sqlite carved'], error: '' },
      { name: '14_report', status: 'ok', tier: 'shell', bytes: 64200, artifacts: 2, notes: ['manifest.json + report.html'], error: '' },
    ],
    chain: chain2,
    artifactPayloads: payloads2,
    artifacts: artifacts2,
    carved: carved2,
    timeline: timeline2,
  };

  return [case1, case2];
}
