import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import type { DigestDrawerGroupData } from '../core/formatters';
import { formatRelativeTime } from '../core/formatters';
import type { Project } from '../types/founderOs';

interface DigestDrawerProps {
  open: boolean;
  groups: DigestDrawerGroupData;
  projects: Project[];
  escapedDefectsCount: number;
  falseBounceCount: number;
  onClose: () => void;
  onUndoAutoAction: (actionId: string) => Promise<void>;
  onMarkMissed: (digestId: string) => Promise<void>;
  onUndoMissed: (digestId: string) => Promise<void>;
}

export function DigestDrawer({
  open,
  groups,
  projects,
  escapedDefectsCount,
  falseBounceCount,
  onClose,
  onUndoAutoAction,
  onMarkMissed,
  onUndoMissed,
}: DigestDrawerProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [expandedRawIds, setExpandedRawIds] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const projectMap = new Map(projects.map((p) => [p.id, p.shortName || p.name]));

  function toggleRaw(id: string) {
    setExpandedRawIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function runAction(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    try {
      await fn();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#0e3a3d]/25"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="digest-drawer-title"
        className="w-full max-w-[440px] h-full bg-white fos-modal-shadow flex flex-col"
      >
        <div className="px-6 py-4 border-b border-[#c9d6d5] flex items-center justify-between gap-4 shrink-0">
          <h2 id="digest-drawer-title" className="text-base font-semibold text-[#0e3a3d]">
            今天替你处理的事
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="关闭明细"
            onClick={onClose}
            className="min-h-8 min-w-8 inline-flex items-center justify-center rounded-md text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto fos-scroll px-6 py-5 space-y-6">
          {/* Group 1: 检查通过，直接放行 */}
          <section className="space-y-3">
            <h3 className="text-[13px] font-semibold text-[#456669] tabular-nums">
              检查通过，直接放行（{groups.passed.length}）
            </h3>
            {groups.passed.length === 0 ? (
              <p className="text-[13px] text-[#456669]">今天还没有。</p>
            ) : (
              <div className="divide-y divide-[#c9d6d5] border-t border-b border-[#c9d6d5]">
                {groups.passed.map((item) => {
                  const projName = item.projectId ? projectMap.get(item.projectId) : undefined;
                  const showRaw = Boolean(expandedRawIds[item.id]);
                  return (
                    <div key={item.id} className="py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs text-[#456669]">
                        <span>{projName || item.threadTitle}</span>
                        <span className="tabular-nums">{formatRelativeTime(item.timestamp)}</span>
                      </div>
                      <p className="text-sm text-[#0e3a3d] leading-snug line-clamp-2">
                        {item.summary}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div>
                          {item.rawContent && (
                            <button
                              type="button"
                              onClick={() => toggleRaw(item.id)}
                              className="inline-flex items-center gap-1 min-h-8 text-xs text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
                            >
                              {showRaw ? (
                                <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.75} />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                              )}
                              <span>看 AI 的原话</span>
                            </button>
                          )}
                        </div>
                        {item.markedWrong ? (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-[#8a5300]">已记下，以后这类会来问你</span>
                            <button
                              type="button"
                              disabled={busyId === item.id}
                              onClick={() => runAction(item.id, () => onUndoMissed(item.id))}
                              className="min-h-8 text-[#0b7265] hover:underline cursor-pointer"
                            >
                              撤销
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => runAction(item.id, () => onMarkMissed(item.id))}
                            className="min-h-8 text-xs text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
                          >
                            这件该告诉我
                          </button>
                        )}
                      </div>
                      {showRaw && item.rawContent && (
                        <pre className="p-2.5 bg-[#f5f8f7] border border-[#c9d6d5] rounded text-xs font-mono text-[#456669] whitespace-pre-wrap break-all">
                          {item.rawContent}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Group 2: 没过检查，打回重做 */}
          <section className="space-y-3">
            <h3 className="text-[13px] font-semibold text-[#456669] tabular-nums">
              没过检查，打回重做（{groups.bounced.length}）
            </h3>
            {groups.bounced.length === 0 ? (
              <p className="text-[13px] text-[#456669]">今天还没有。</p>
            ) : (
              <div className="divide-y divide-[#c9d6d5] border-t border-b border-[#c9d6d5]">
                {groups.bounced.map((item) => {
                  const projName = item.projectId ? projectMap.get(item.projectId) : undefined;
                  const showRaw = Boolean(expandedRawIds[item.id]);
                  return (
                    <div key={item.id} className="py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs text-[#456669]">
                        <span>{projName || item.threadTitle}</span>
                        <span className="tabular-nums">{formatRelativeTime(item.timestamp)}</span>
                      </div>
                      <p className="text-sm text-[#0e3a3d] leading-snug line-clamp-2">
                        {item.summary}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div>
                          {item.rawContent && (
                            <button
                              type="button"
                              onClick={() => toggleRaw(item.id)}
                              className="inline-flex items-center gap-1 min-h-8 text-xs text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
                            >
                              {showRaw ? (
                                <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.75} />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                              )}
                              <span>看 AI 的原话</span>
                            </button>
                          )}
                        </div>
                        {item.markedWrong ? (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-[#8a5300]">已记下，以后这类会来问你</span>
                            <button
                              type="button"
                              disabled={busyId === item.id}
                              onClick={() => runAction(item.id, () => onUndoMissed(item.id))}
                              className="min-h-8 text-[#0b7265] hover:underline cursor-pointer"
                            >
                              撤销
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => runAction(item.id, () => onMarkMissed(item.id))}
                            className="min-h-8 text-xs text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
                          >
                            这件该告诉我
                          </button>
                        )}
                      </div>
                      {showRaw && item.rawContent && (
                        <pre className="p-2.5 bg-[#f5f8f7] border border-[#c9d6d5] rounded text-xs font-mono text-[#456669] whitespace-pre-wrap break-all">
                          {item.rawContent}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Group 3: 按你的规矩办了 */}
          <section className="space-y-3">
            <h3 className="text-[13px] font-semibold text-[#456669] tabular-nums">
              按你的规矩办了（{groups.ruleApplied.length}）
            </h3>
            {groups.ruleApplied.length === 0 ? (
              <p className="text-[13px] text-[#456669]">今天还没有。</p>
            ) : (
              <div className="divide-y divide-[#c9d6d5] border-t border-b border-[#c9d6d5]">
                {groups.ruleApplied.map((item) => {
                  const projName = item.projectId ? projectMap.get(item.projectId) : undefined;
                  return (
                    <div key={item.id} className="py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs text-[#456669]">
                        <span>{projName || item.title}</span>
                        <span className="tabular-nums">{formatRelativeTime(item.timestamp)}</span>
                      </div>
                      <p className="text-sm text-[#0e3a3d] leading-snug line-clamp-2">
                        {item.summary}
                      </p>
                      <div className="text-xs text-[#456669]">
                        按规矩：{item.ruleTitle}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        {item.actionId ? (
                          item.undone ? (
                            <span className="text-xs text-[#456669]">已撤回</span>
                          ) : (
                            <button
                              type="button"
                              disabled={busyId === item.id}
                              onClick={() =>
                                runAction(item.id, () => onUndoAutoAction(item.actionId!))
                              }
                              className="h-8 px-2.5 text-xs font-medium text-[#0e3a3d] border border-[#6f8c8b] rounded-md hover:bg-[#f5f8f7] cursor-pointer"
                            >
                              撤回
                            </button>
                          )
                        ) : (
                          <span />
                        )}

                        {item.digestId &&
                          (item.markedWrong ? (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-[#8a5300]">已记下，以后这类会来问你</span>
                              <button
                                type="button"
                                disabled={busyId === item.id}
                                onClick={() =>
                                  runAction(item.id, () => onUndoMissed(item.digestId!))
                                }
                                className="min-h-8 text-[#0b7265] hover:underline cursor-pointer"
                              >
                                撤销
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={busyId === item.id}
                              onClick={() =>
                                runAction(item.id, () => onMarkMissed(item.digestId!))
                              }
                              className="min-h-8 text-xs text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
                            >
                              这件该告诉我
                            </button>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Footer quality summary (S-06) */}
        <div className="px-6 py-4 border-t border-[#c9d6d5] text-xs text-[#456669] tabular-nums shrink-0 bg-[#f5f8f7]">
          该告诉你却没说：{escapedDefectsCount} 件。不必问你却问了：{falseBounceCount} 件。
        </div>
      </aside>
    </div>
  );
}
