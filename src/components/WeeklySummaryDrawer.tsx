import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { WeeklySummaryData } from '../core/formatters';

interface WeeklySummaryDrawerProps {
  open: boolean;
  summary: WeeklySummaryData;
  onClose: () => void;
}

export function WeeklySummaryDrawer({
  open,
  summary,
  onClose,
}: WeeklySummaryDrawerProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

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
        aria-labelledby="weekly-summary-title"
        className="w-full max-w-[440px] h-full bg-white fos-modal-shadow flex flex-col"
      >
        <div className="px-6 py-4 border-b border-[#c9d6d5] flex items-center justify-between gap-4 shrink-0">
          <h2 id="weekly-summary-title" className="text-base font-semibold text-[#0e3a3d]">
            本周小结
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="关闭本周小结"
            onClick={onClose}
            className="min-h-8 min-w-8 inline-flex items-center justify-center rounded-md text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto fos-scroll px-6 py-6 space-y-6">
          <div className="pb-5 border-b border-[#c9d6d5] space-y-1.5">
            <div className="text-[22px] leading-[30px] font-semibold text-[#0e3a3d] tabular-nums">
              本周有效处理 {summary.effectiveTotal} 件
            </div>
            <p className="text-sm text-[#456669] tabular-nums">
              替你挡下 {summary.blockedBySystemCount} 件，你拍板 {summary.decidedByFounderCount} 件。
            </p>
          </div>

          <ul className="space-y-4 text-[15px] leading-6 text-[#0e3a3d] tabular-nums">
            {summary.avgResumeSeconds !== null && (
              <li>接上手头的事，平均用了 {summary.avgResumeSeconds} 秒。</li>
            )}
            {summary.filteredOutOfTen !== null && (
              <li>每 10 件里有 {summary.filteredOutOfTen} 件没打扰你。</li>
            )}
            {summary.falseDoneCaughtCount !== null && (
              <li>抓到 {summary.falseDoneCaughtCount} 次 AI 说做完、其实没做完。</li>
            )}
            {summary.precisionAskedCount !== null && summary.precisionRightCount !== null && (
              <li>
                问你的 {summary.precisionAskedCount} 件里，你觉得 {summary.precisionRightCount} 件该问。
              </li>
            )}
            {summary.ruleAppliedCount !== null && (
              <li>有 {summary.ruleAppliedCount} 件直接按你以前的规矩办了。</li>
            )}
          </ul>
        </div>
      </aside>
    </div>
  );
}
