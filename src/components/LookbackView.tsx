import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { DecisionRecord, Project } from '../types/founderOs';
import { formatRelativeTime } from '../core/formatters';
import { ProjectDomainIcon } from './AttentionVisuals';

interface LookbackViewProps {
  record: DecisionRecord;
  project?: Project;
  showMobileBack?: boolean;
  onMobileBack?: () => void;
  onSubmitOutcome: (
    decisionId: string,
    verdict: 'win' | 'miss' | 'neutral',
    note: string
  ) => Promise<void>;
}

/**
 * J-35: Lookback review view when user selects an item from "回头看" in the queue.
 */
export function LookbackView({
  record,
  project,
  showMobileBack = false,
  onMobileBack,
  onSubmitOutcome,
}: LookbackViewProps) {
  const [selectedVerdict, setSelectedVerdict] = useState<'win' | 'miss' | 'neutral' | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSave(verdict: 'win' | 'miss' | 'neutral') {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmitOutcome(record.id, verdict, note.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="bg-white border border-[#c9d6d5] rounded-xl max-w-[760px] w-full p-6 lg:p-8 space-y-5">
      {showMobileBack && onMobileBack && (
        <button
          type="button"
          onClick={onMobileBack}
          className="inline-flex items-center gap-1.5 min-h-8 text-[13px] font-medium text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          <span>返回</span>
        </button>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2">
          <ProjectDomainIcon
            domainIcon={project?.domainIcon}
            accentColor={project?.accentColor}
          />
          <span className="text-[13px] font-semibold text-[#0e3a3d]">
            {project?.name || '过往决定'}
          </span>
        </div>
        <span className="text-[13px] text-[#456669] tabular-nums">
          定于 {formatRelativeTime(record.decidedAt)}
        </span>
      </div>

      <div className="space-y-2">
        <div className="inline-block text-xs font-medium px-2 py-0.5 rounded bg-[#fff6e0] text-[#8a5300]">
          到了回头看的时间
        </div>
        <h1 className="text-[22px] leading-[30px] font-semibold text-[#0e3a3d]">
          {record.caseTitle}
        </h1>
      </div>

      <div className="space-y-2 text-[15px] leading-6 text-[#0e3a3d]">
        <div>
          <span className="text-[13px] text-[#456669] mr-3">当时选的</span>
          <span className="font-semibold">{record.chosenOptionLabel}</span>
        </div>
        <div>
          <span className="text-[13px] text-[#456669] mr-3">当时的考虑</span>
          <span>{record.userRationale}</span>
        </div>
      </div>

      <div className="pt-4 border-t border-[#c9d6d5] space-y-3">
        <p className="text-sm font-medium text-[#0e3a3d]">现在回头看，这个决定怎么样？</p>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { v: 'win' as const, label: '管用' },
              { v: 'miss' as const, label: '不管用' },
              { v: 'neutral' as const, label: '说不好' },
            ] as const
          ).map((item) => (
            <button
              key={item.v}
              type="button"
              onClick={() => setSelectedVerdict(item.v)}
              className={`h-9 px-4 rounded-md text-[13px] font-medium cursor-pointer fos-transition ${
                selectedVerdict === item.v
                  ? 'border-2 border-[#0e3a3d] bg-[#f5f8f7] text-[#0e3a3d] font-semibold'
                  : 'border border-[#6f8c8b] bg-white text-[#0e3a3d] hover:bg-[#f5f8f7]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {selectedVerdict && (
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <input
              type="text"
              aria-label="一句话说说"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="一句话说说（可不填）"
              className="flex-1 h-10 px-3 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
            />
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSave(selectedVerdict)}
              className="h-10 px-5 rounded-md bg-[#0e3a3d] hover:bg-[#144c50] text-sm font-semibold text-white whitespace-nowrap cursor-pointer disabled:opacity-60"
            >
              {submitting ? '正在记…' : '记下'}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
