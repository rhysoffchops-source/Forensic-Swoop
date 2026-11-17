import { useEffect, useMemo, useState } from 'react';
import { ArtifactsView } from './components/ArtifactsView';
import { ChainVerifierView } from './components/ChainVerifierView';
import { EngineCliView } from './components/EngineCliView';
import { OverviewView } from './components/OverviewView';
import { TimelineCarverView } from './components/TimelineCarverView';
import { TopBar, type NavTab } from './components/TopBar';
import { generateStandaloneHtmlReport, verifyChainRecords } from './forensics/engine';
import { createSampleCases } from './forensics/sampleCases';
import type { CaseBundle, VerificationReport } from './forensics/types';

export default function App() {
  const [cases, setCases] = useState<CaseBundle[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [tamperedPathsByCase, setTamperedPathsByCase] = useState<Record<string, Record<string, number>>>({});
  const [verification, setVerification] = useState<VerificationReport | null>(null);
  const [exportNotice, setExportNotice] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    createSampleCases().then((loaded) => {
      if (!mounted) return;
      setCases(loaded);
      if (loaded.length > 0) {
        setActiveCaseId(loaded[0].id);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const activeCase = useMemo(
    () => cases.find((c) => c.id === activeCaseId) ?? cases[0] ?? null,
    [cases, activeCaseId]
  );

  const activeTamperMap = useMemo(
    () => (activeCase ? tamperedPathsByCase[activeCase.id] ?? {} : {}),
    [activeCase, tamperedPathsByCase]
  );

  const activePayloads = useMemo(() => {
    if (!activeCase) return {};
    const next: Record<string, string> = { ...activeCase.artifactPayloads };
    for (const path of Object.keys(activeTamperMap)) {
      if (Object.prototype.hasOwnProperty.call(next, path)) {
        next[path] = `${next[path]}\n`;
      }
    }
    return next;
  }, [activeCase, activeTamperMap]);

  const tamperedSeqs = useMemo(() => Object.values(activeTamperMap), [activeTamperMap]);

  useEffect(() => {
    if (!activeCase) return;
    let cancelled = false;
    verifyChainRecords(activeCase.chain, activePayloads).then((rep) => {
      if (!cancelled) setVerification(rep);
    });
    return () => {
      cancelled = true;
    };
  }, [activeCase, activePayloads]);

  function handleToggleTamper(seq: number, path: string) {
    if (!activeCase) return;
    setTamperedPathsByCase((prev) => {
      const current = { ...(prev[activeCase.id] ?? {}) };
      if (current[path]) {
        delete current[path];
      } else {
        current[path] = seq;
      }
      return { ...prev, [activeCase.id]: current };
    });
  }

  function handleRestoreAll() {
    if (!activeCase) return;
    setTamperedPathsByCase((prev) => ({ ...prev, [activeCase.id]: {} }));
  }

  function handleExportReport() {
    if (!activeCase || !verification) return;
    const html = generateStandaloneHtmlReport(activeCase, verification);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeCase.id}_forensic_report.html`;
    a.click();
    URL.revokeObjectURL(url);
    setExportNotice(
      `Exported ${activeCase.id}_forensic_report.html (${verification.valid ? 'VERIFIED EXIT 0' : 'BROKEN EXIT 1'})`
    );
    setTimeout(() => setExportNotice(''), 4000);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onExportReport={handleExportReport}
      />

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        {exportNotice && (
          <div
            role="status"
            className="mb-5 flex items-center justify-between rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-800"
          >
            <span>{exportNotice}</span>
            <button
              type="button"
              onClick={() => setExportNotice('')}
              className="text-slate-500 hover:text-slate-900"
            >
              Dismiss
            </button>
          </div>
        )}

        {!activeCase || !verification ? (
          <div className="space-y-4">
            <div className="h-20 animate-pulse rounded-lg border border-slate-200 bg-white" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white" />
              <div className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white" />
              <div className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white" />
              <div className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white" />
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <OverviewView
                cases={cases}
                activeCase={activeCase}
                verification={verification}
                onSelectCase={setActiveCaseId}
                onNavigateTab={setActiveTab}
              />
            )}
            {activeTab === 'verifier' && (
              <ChainVerifierView
                activeCase={activeCase}
                verification={verification}
                tamperedSeqs={tamperedSeqs}
                onToggleTamper={handleToggleTamper}
                onRestoreAll={handleRestoreAll}
              />
            )}
            {activeTab === 'timeline' && (
              <TimelineCarverView activeCase={activeCase} />
            )}
            {activeTab === 'artifacts' && (
              <ArtifactsView activeCase={activeCase} payloads={activePayloads} />
            )}
            {activeTab === 'engine' && <EngineCliView />}
          </>
        )}
      </main>
    </div>
  );
}
