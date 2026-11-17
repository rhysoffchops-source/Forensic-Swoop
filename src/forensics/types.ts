export type StageStatus =
  | 'ok'
  | 'partial'
  | 'blocked'
  | 'timeout'
  | 'truncated'
  | 'skipped'
  | 'failed'
  | 'cached';

export type PrivilegeTier = 'root' | 'run-as' | 'backup' | 'shell' | 'none';

export interface ChainRecord {
  seq: number;
  utc: string;
  path: string;
  sha256: string;
  note: string;
  prev: string;
}

export interface StageResult {
  name: string;
  status: StageStatus;
  tier: PrivilegeTier;
  bytes: number;
  artifacts: number;
  notes: string[];
  error: string;
}

export interface PreflightFacts {
  'ro.product.model': string;
  'ro.product.manufacturer': string;
  'ro.build.version.release': string;
  'ro.build.version.sdk': string;
  'ro.build.fingerprint': string;
  'ro.serialno': string;
  'ro.crypto.state': string;
  'ro.debuggable': string;
  'ro.secure': string;
  'persist.sys.timezone': string;
  dfSummary: string;
  batterySummary: string;
}

export interface LadderAttempt {
  tier: string;
  ok: boolean;
  detail?: string;
}

export interface CarvedString {
  dbName: string;
  page: number;
  offset: number;
  sha256: string;
  text: string;
}

export interface TimelineEvent {
  id: string;
  ms: number;
  utc: string;
  local: string;
  source: 'media' | 'logcat' | 'carved_sqlite' | 'provider' | 'app_backup' | 'trash';
  level?: string;
  summary: string;
  detail: string;
}

export interface ArtifactItem {
  path: string;
  category: 'identity' | 'services' | 'providers' | 'packages' | 'apps' | 'media' | 'recovery';
  bytes: number;
  sha256: string;
  preview: string;
}

export interface CaseBundle {
  id: string;
  title: string;
  serial: string;
  acquiredUtc: string;
  timezone: string;
  tzOffsetMinutes: number;
  tzResolved: boolean;
  tier: PrivilegeTier;
  budgetMbCap: number;
  budgetMbUsed: number;
  budgetMinutesCap: number;
  budgetMinutesUsed: number;
  preflight: PreflightFacts;
  ladder: LadderAttempt[];
  stages: StageResult[];
  chain: ChainRecord[];
  artifactPayloads: Record<string, string>;
  artifacts: ArtifactItem[];
  carved: CarvedString[];
  timeline: TimelineEvent[];
}

export interface ChainRecordVerification {
  seq: number;
  path: string;
  linkValid: boolean;
  artifactChecked: boolean;
  artifactValid: boolean | null;
  expectedPrev: string;
  computedDigest: string;
  error?: string;
}

export interface VerificationReport {
  valid: boolean;
  exitCode: 0 | 1;
  checkedCount: number;
  brokenAtSeq: number | null;
  headDigest: string;
  errors: Array<{ seq: number; path: string; reason: string }>;
  recordStatuses: ChainRecordVerification[];
}

export interface CliParams {
  mode: 'acquire' | 'resume' | 'verify' | 'serve' | 'self-test';
  serial: string;
  outDir: string;
  budgetMinutes: number;
  budgetMb: number;
  mediaMode: 'thumbnails' | 'small' | 'all' | 'none';
  servePort: number;
}
