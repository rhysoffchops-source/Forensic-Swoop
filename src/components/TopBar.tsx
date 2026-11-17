import { Download } from 'lucide-react';

export type NavTab = 'overview' | 'verifier' | 'timeline' | 'artifacts' | 'engine';

interface TopBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onExportReport: () => void;
}

const NAV_ITEMS: Array<{ id: NavTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'verifier', label: 'Chain Verifier' },
  { id: 'timeline', label: 'Timeline & Carver' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'engine', label: 'v19 Engine' },
];

export function TopBar({ activeTab, onSelectTab, onExportReport }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-8 px-6 py-3.5">
        <button
          type="button"
          onClick={() => onSelectTab('overview')}
          className="text-left text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700"
        >
          CaseVault
        </button>

        <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`border-b-2 py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 ${
                  active
                    ? 'border-blue-700 text-slate-900'
                    : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={onExportReport}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Export Report
        </button>
      </div>

      <nav
        aria-label="Mobile navigation"
        className="flex md:hidden items-center gap-4 overflow-x-auto border-t border-slate-100 px-4 py-2"
      >
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`border-b-2 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                active ? 'border-blue-700 text-slate-900' : 'border-transparent text-slate-600'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
