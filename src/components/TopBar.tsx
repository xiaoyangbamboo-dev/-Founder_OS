import { ClipboardPaste, Plus } from 'lucide-react';
import type { AdapterConnection, Project } from '../types/founderOs';

interface TopBarProps {
  projects: Project[];
  selectedProjectId: string;
  pendingCountByProject: Record<string, number>;
  totalPendingCount: number;
  activePage: 'home' | 'rules';
  connections: AdapterConnection[];
  demoMode: boolean;
  onGoHome: () => void;
  onSelectProject: (projectId: string) => void;
  onOpenPasteReply: () => void;
  onOpenRules: () => void;
  onOpenConnections: () => void;
  onOpenDemoDrawer: () => void;
}

export function TopBar({
  projects,
  selectedProjectId,
  pendingCountByProject,
  totalPendingCount,
  activePage,
  connections,
  demoMode,
  onGoHome,
  onSelectProject,
  onOpenPasteReply,
  onOpenRules,
  onOpenConnections,
  onOpenDemoDrawer,
}: TopBarProps) {
  const brokenConnCount = connections.filter((c) => c.status !== 'Connected').length;
  const useProjectSelect = projects.length > 5;

  return (
    <header className="h-14 shrink-0 bg-[#f5f8f7] border-b border-[#c9d6d5] px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
      <div className="flex items-center gap-2 sm:gap-4 lg:gap-8 min-w-0 flex-1">
        <button
          type="button"
          onClick={onGoHome}
          className="inline-flex items-center gap-1.5 sm:gap-2 text-[15px] sm:text-base font-semibold text-[#0e3a3d] shrink-0 cursor-pointer py-1 rounded-md whitespace-nowrap"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="text-[#0e3a3d] shrink-0 sm:w-5 sm:h-5"
          >
            <path d="M5 10a7 7 0 0 1 14 0c0 2.2-1.2 3.2-2.6 3.2H7.6C6.2 13.2 5 12.2 5 10Z" />
            <path d="M8.5 13.5c0 2.5-.8 4.2-.8 6" />
            <path d="M12 13.5v6.5" />
            <path d="M15.5 13.5c0 2.5.8 4.2.8 6" />
          </svg>
          <span>Founder OS</span>
        </button>

        {/* Project Tabs (>=1024px when <=5 projects) */}
        {!useProjectSelect && (
          <nav aria-label="切换项目" className="hidden lg:flex items-center gap-1 min-w-0">
            <button
              type="button"
              onClick={() => {
                onSelectProject('all');
                if (activePage !== 'home') onGoHome();
              }}
              className={`h-8 px-3 rounded-md text-[13px] inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer fos-transition ${
                selectedProjectId === 'all'
                  ? 'bg-white text-[#0e3a3d] font-semibold border border-[#6f8c8b]'
                  : 'text-[#456669] hover:text-[#0e3a3d] border border-transparent'
              }`}
            >
              <span>全部</span>
              {totalPendingCount > 0 ? (
                <span className="text-[#c93a1f] font-semibold tabular-nums">
                  {totalPendingCount}
                </span>
              ) : (
                <span className="text-[#456669]">✓</span>
              )}
            </button>

            {projects.map((p) => {
              const count = pendingCountByProject[p.id] ?? 0;
              const isSelected = selectedProjectId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelectProject(p.id);
                    if (activePage !== 'home') onGoHome();
                  }}
                  title={p.name}
                  className={`h-8 px-3 rounded-md text-[13px] inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer fos-transition ${
                    isSelected
                      ? 'bg-white text-[#0e3a3d] font-semibold border border-[#6f8c8b]'
                      : 'text-[#456669] hover:text-[#0e3a3d] border border-transparent'
                  }`}
                >
                  <span>{p.shortName || p.name}</span>
                  {count > 0 ? (
                    <span className="text-[#c93a1f] font-semibold tabular-nums">{count}</span>
                  ) : (
                    <span className="text-[#456669]">✓</span>
                  )}
                </button>
              );
            })}
          </nav>
        )}

        {/* Compact Project Select (<1024px OR >5 projects) */}
        <div className={`${useProjectSelect ? 'block' : 'lg:hidden'} min-w-0`}>
          <label htmlFor="topbar-project-select" className="sr-only">
            切换项目
          </label>
          <select
            id="topbar-project-select"
            value={selectedProjectId}
            onChange={(e) => {
              onSelectProject(e.target.value);
              if (activePage !== 'home') onGoHome();
            }}
            className="h-8 px-2 sm:px-2.5 text-xs sm:text-[13px] bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d] font-medium w-full max-w-[96px] sm:max-w-[200px] truncate"
          >
            <option value="all">
              全部（{totalPendingCount > 0 ? totalPendingCount : '✓'}）
            </option>
            {projects.map((p) => {
              const count = pendingCountByProject[p.id] ?? 0;
              return (
                <option key={p.id} value={p.id}>
                  {p.shortName || p.name}（{count > 0 ? count : '✓'}）
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {demoMode && (
          <button
            type="button"
            onClick={onOpenDemoDrawer}
            className="h-8 px-2 sm:px-2.5 rounded text-xs font-semibold bg-[#fff6e0] text-[#8a5300] border border-[#c9d6d5] cursor-pointer whitespace-nowrap"
          >
            演示
            <span className="hidden sm:inline">模式</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenPasteReply}
          title="粘贴 AI 的回复"
          aria-label="粘贴 AI 的回复"
          className="h-8 sm:h-9 px-2 lg:px-3.5 rounded-md text-[13px] font-medium text-[#0e3a3d] bg-white border border-[#6f8c8b] hover:bg-[#eaf6f3]/50 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer fos-transition"
        >
          <ClipboardPaste className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="hidden lg:inline">粘贴 AI 的回复</span>
        </button>

        <button
          type="button"
          onClick={onOpenRules}
          className={`min-h-8 px-2 sm:px-2.5 rounded-md text-[13px] whitespace-nowrap cursor-pointer fos-transition ${
            activePage === 'rules'
              ? 'bg-white text-[#0e3a3d] font-semibold border border-[#6f8c8b]'
              : 'text-[#456669] hover:text-[#0e3a3d]'
          }`}
        >
          规矩
        </button>

        <button
          type="button"
          onClick={onOpenConnections}
          title={brokenConnCount > 0 ? `有 ${brokenConnCount} 个 AI 断开了` : '查看和管理接入的 AI'}
          className="min-h-8 px-2 sm:px-2.5 rounded-md text-[13px] text-[#456669] hover:text-[#0e3a3d] inline-flex items-center gap-1 whitespace-nowrap cursor-pointer fos-transition"
        >
          {brokenConnCount > 0 && (
            <span
              className="w-2 h-2 rounded-full bg-[#ff5a3c] shrink-0"
              aria-hidden="true"
            />
          )}
          <Plus className="hidden sm:inline lg:hidden w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>接入</span>
        </button>
      </div>
    </header>
  );
}
