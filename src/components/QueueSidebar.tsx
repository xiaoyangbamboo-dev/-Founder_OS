import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import type { DecisionCase, DecisionRecord, Project, WorkThread } from '../types/founderOs';
import {
  formatRelativeTime,
  getCaseQueueWaitLabel,
  getProjectShortName,
} from '../core/formatters';
import { getThreadPlainStatusText } from './StatusLabel';

export type QueueSelection =
  | { kind: 'case'; id: string }
  | { kind: 'thread'; id: string }
  | { kind: 'lookback'; id: string };

interface QueueSidebarProps {
  projects: Project[];
  pendingCases: DecisionCase[];
  laterCases: DecisionCase[];
  totalPendingCount: number;
  pendingReviews: DecisionRecord[];
  runningThreads: WorkThread[];
  selection: QueueSelection | null;
  weeklyTotalCount: number;
  freshCaseIds: string[];
  onSelect: (sel: QueueSelection) => void;
  onOpenNewItem: () => void;
  onOpenWeeklySummary: () => void;
  className?: string;
}

export function QueueSidebar({
  projects,
  pendingCases,
  laterCases,
  totalPendingCount,
  pendingReviews,
  runningThreads,
  selection,
  weeklyTotalCount,
  freshCaseIds,
  onSelect,
  onOpenNewItem,
  onOpenWeeklySummary,
  className = '',
}: QueueSidebarProps) {
  const [laterOpen, setLaterOpen] = useState(false);
  const [lookbackOpen, setLookbackOpen] = useState(true);
  const [runningOpen, setRunningOpen] = useState(false);

  const prevPendingCountRef = useRef<number>(totalPendingCount);
  const [liveNotice, setLiveNotice] = useState<string>('');

  useEffect(() => {
    const prev = prevPendingCountRef.current;
    if (totalPendingCount > prev) {
      const diff = totalPendingCount - prev;
      setLiveNotice(`新增 ${diff} 件等你拍板`);
    }
    prevPendingCountRef.current = totalPendingCount;
  }, [totalPendingCount]);

  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const visibleItems: QueueSelection[] = [
    ...pendingCases.map((c) => ({ kind: 'case' as const, id: c.id })),
    ...(laterOpen ? laterCases.map((c) => ({ kind: 'case' as const, id: c.id })) : []),
    ...(lookbackOpen
      ? pendingReviews.map((r) => ({ kind: 'lookback' as const, id: r.id }))
      : []),
    ...(runningOpen ? runningThreads.map((t) => ({ kind: 'thread' as const, id: t.id })) : []),
  ];

  function handleListKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (visibleItems.length === 0) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    e.preventDefault();
    const idx = visibleItems.findIndex(
      (item) => selection && item.kind === selection.kind && item.id === selection.id
    );
    const nextIdx =
      e.key === 'ArrowDown'
        ? idx < visibleItems.length - 1
          ? idx + 1
          : 0
        : idx > 0
          ? idx - 1
          : visibleItems.length - 1;

    const target = visibleItems[nextIdx];
    if (target) onSelect(target);
  }

  function renderCaseRow(dCase: DecisionCase, isLater: boolean) {
    const isSelected = selection?.kind === 'case' && selection.id === dCase.id;
    const isUrgent = !isLater && dCase.priorityScore >= 90;
    const waitLabel = isLater
      ? dCase.snoozeReasonLabel || '排在后面的事'
      : getCaseQueueWaitLabel(dCase);
    const isFresh = freshCaseIds.includes(dCase.id);
    const proj = projectMap.get(dCase.projectId);

    return (
      <button
        key={dCase.id}
        type="button"
        onClick={() => onSelect({ kind: 'case', id: dCase.id })}
        className={`w-full text-left min-h-[72px] px-4 py-3 border-b border-[#c9d6d5] block cursor-pointer fos-transition ${
          isSelected
            ? 'bg-white border-l-[3px] border-l-[#0e3a3d]'
            : 'bg-transparent hover:bg-white border-l-[3px] border-l-transparent'
        } ${isFresh ? 'fos-new-item-flash' : ''}`}
      >
        <div className="text-xs leading-[18px] text-[#456669]">
          {getProjectShortName(proj)}
        </div>
        <div className="text-[15px] leading-6 font-semibold text-[#0e3a3d] line-clamp-2 mt-0.5">
          {dCase.title}
        </div>
        <div
          className={`text-xs leading-[18px] mt-1 tabular-nums ${
            isUrgent ? 'text-[#c93a1f] font-medium' : 'text-[#456669]'
          }`}
        >
          {waitLabel}
        </div>
      </button>
    );
  }

  return (
    <aside
      aria-label="事项队列"
      onKeyDown={handleListKeyDown}
      className={`bg-[#f5f8f7] border-r border-[#c9d6d5] flex flex-col shrink-0 ${className}`}
    >
      <div className="sr-only" aria-live="polite">
        {liveNotice}
      </div>

      <div className="flex-1 overflow-y-auto fos-scroll">
        {/* 1. 等你拍板 (max 3 items) */}
        <section>
          <div className="pt-5 px-4 pb-2 flex items-center justify-between">
            <h2 className="text-[13px] leading-5 font-semibold text-[#456669]">等你拍板</h2>
            <span className="text-[13px] leading-5 font-semibold text-[#c93a1f] tabular-nums">
              {totalPendingCount}
            </span>
          </div>

          {pendingCases.length === 0 ? (
            <div className="px-4 py-3 text-[13px] text-[#456669] border-b border-[#c9d6d5]">
              没有要你定的事
            </div>
          ) : (
            <div className="border-t border-[#c9d6d5]">
              {pendingCases.map((c) => renderCaseRow(c, false))}
            </div>
          )}
        </section>

        {/* 2. 稍后再看 (default collapsed) */}
        {laterCases.length > 0 && (
          <section className="border-b border-[#c9d6d5]">
            <button
              type="button"
              aria-expanded={laterOpen}
              onClick={() => setLaterOpen((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between text-[13px] font-semibold text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
            >
              <span className="tabular-nums">稍后再看 {laterCases.length}</span>
              {laterOpen ? (
                <ChevronDown className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <ChevronRight className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>
            {laterOpen && (
              <div className="border-t border-[#c9d6d5]">
                {laterCases.map((c) => renderCaseRow(c, true))}
              </div>
            )}
          </section>
        )}

        {/* 3. 回头看 (J-35, shown when due decisions exist) */}
        {pendingReviews.length > 0 && (
          <section className="border-b border-[#c9d6d5]">
            <button
              type="button"
              aria-expanded={lookbackOpen}
              onClick={() => setLookbackOpen((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between text-[13px] font-semibold text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
            >
              <span className="tabular-nums">回头看 {pendingReviews.length}</span>
              {lookbackOpen ? (
                <ChevronDown className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <ChevronRight className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>
            {lookbackOpen && (
              <div className="border-t border-[#c9d6d5]">
                {pendingReviews.map((rec) => {
                  const isSelected =
                    selection?.kind === 'lookback' && selection.id === rec.id;
                  const proj = projectMap.get(rec.projectId);
                  return (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => onSelect({ kind: 'lookback', id: rec.id })}
                      className={`w-full text-left min-h-[72px] px-4 py-3 border-b last:border-b-0 border-[#c9d6d5] block cursor-pointer fos-transition ${
                        isSelected
                          ? 'bg-white border-l-[3px] border-l-[#0e3a3d]'
                          : 'bg-transparent hover:bg-white border-l-[3px] border-l-transparent'
                      }`}
                    >
                      <div className="text-xs leading-[18px] text-[#456669]">
                        {getProjectShortName(proj)}
                      </div>
                      <div className="text-sm leading-5 font-semibold text-[#0e3a3d] line-clamp-2 mt-0.5">
                        {rec.caseTitle}
                      </div>
                      <div className="text-xs leading-[18px] text-[#8a5300] mt-1">
                        定于 {formatRelativeTime(rec.decidedAt)} · 该回头看看
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* 4. 不用你管的 */}
        <section className="border-b border-[#c9d6d5]">
          <div className="px-4 py-2 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-expanded={runningOpen}
              onClick={() => setRunningOpen((v) => !v)}
              className="flex-1 py-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-[#456669] hover:text-[#0e3a3d] text-left cursor-pointer"
            >
              <span className="tabular-nums">不用你管的 {runningThreads.length}</span>
              {runningOpen ? (
                <ChevronDown className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <ChevronRight className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={onOpenNewItem}
              title="新建一件事"
              className="min-h-8 px-2 text-xs font-medium text-[#0b7265] hover:underline inline-flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
              <span>新建一件事</span>
            </button>
          </div>

          {runningOpen && (
            <div className="border-t border-[#c9d6d5]">
              {runningThreads.length === 0 ? (
                <div className="px-4 py-3 text-[13px] text-[#456669]">
                  现在没有进行中的事
                </div>
              ) : (
                runningThreads.map((thr) => {
                  const isSelected =
                    selection?.kind === 'thread' && selection.id === thr.id;
                  const proj = projectMap.get(thr.projectId);
                  return (
                    <button
                      key={thr.id}
                      type="button"
                      onClick={() => onSelect({ kind: 'thread', id: thr.id })}
                      className={`w-full text-left px-4 py-3 border-b last:border-b-0 border-[#c9d6d5] block cursor-pointer fos-transition ${
                        isSelected
                          ? 'bg-white border-l-[3px] border-l-[#0e3a3d]'
                          : 'bg-transparent hover:bg-white border-l-[3px] border-l-transparent'
                      }`}
                    >
                      <div className="text-sm leading-5 font-medium text-[#0e3a3d] line-clamp-2">
                        {thr.title}
                      </div>
                      <div className="text-xs leading-[18px] text-[#456669] mt-1 flex items-center justify-between gap-2">
                        <span>{getProjectShortName(proj)}</span>
                        <span
                          className={
                            thr.status === 'Blocked' || thr.status === 'Auto-Fixing'
                              ? 'text-[#8a5300]'
                              : 'text-[#0b7265]'
                          }
                        >
                          {getThreadPlainStatusText(thr.status)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </section>
      </div>

      {/* Fixed Bottom Weekly Summary (Q-14) */}
      <div className="p-4 border-t border-[#c9d6d5] shrink-0 bg-[#f5f8f7]">
        <div className="text-[13px] leading-5 text-[#0e3a3d] tabular-nums">
          本周有效处理 {weeklyTotalCount} 件
        </div>
        <button
          type="button"
          onClick={onOpenWeeklySummary}
          className="min-h-8 text-[13px] font-medium text-[#0b7265] hover:underline cursor-pointer"
        >
          看本周小结
        </button>
      </div>
    </aside>
  );
}
