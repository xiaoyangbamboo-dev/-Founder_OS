import { useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import type { Project, WorkThread } from '../types/founderOs';
import { formatRelativeTime, formatTimeClockOrRelative } from '../core/formatters';
import { ProjectDomainIcon, ProjectStagePipeline } from './AttentionVisuals';
import { getThreadPlainStatusText, VerificationTierText } from './StatusLabel';

interface RunningItemViewProps {
  thread: WorkThread;
  project?: Project;
  showMobileBack?: boolean;
  onMobileBack?: () => void;
  onInjectFact: (threadId: string, text: string) => Promise<void>;
  onReportMissed: (threadId: string, note: string) => Promise<void>;
}

/**
 * Section 5: 进行中的事项 (Flat 1px-bordered white paper without elevation shadow).
 */
export function RunningItemView({
  thread,
  project,
  showMobileBack = false,
  onMobileBack,
  onInjectFact,
  onReportMissed,
}: RunningItemViewProps) {
  const [factText, setFactText] = useState('');
  const [sendingFact, setSendingFact] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportNote, setReportNote] = useState('');
  const [sendingReport, setSendingReport] = useState(false);

  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [techRawOpen, setTechRawOpen] = useState(false);

  const agentName = thread.sourceAgentName || thread.adapterLabel || 'AI 助手';
  const statusWord = getThreadPlainStatusText(thread.status);
  const lastActivity = formatRelativeTime(thread.updatedAt);

  async function handleSendFact(e: React.FormEvent) {
    e.preventDefault();
    if (!factText.trim() || sendingFact) return;
    setSendingFact(true);
    try {
      await onInjectFact(thread.id, factText.trim());
      setFactText('');
    } finally {
      setSendingFact(false);
    }
  }

  async function handleSendReport(e: React.FormEvent) {
    e.preventDefault();
    if (sendingReport) return;
    setSendingReport(true);
    try {
      await onReportMissed(thread.id, reportNote.trim() || '这里其实有问题，请重做');
      setReportNote('');
      setReportOpen(false);
    } finally {
      setSendingReport(false);
    }
  }

  return (
    <article
      key={thread.id}
      className="bg-white border border-[#c9d6d5] rounded-xl max-w-[760px] w-full p-6 lg:p-8 space-y-5"
    >
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

      {/* R-04 Meta: Project + who is doing it */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 min-w-0">
          <ProjectDomainIcon
            domainIcon={project?.domainIcon}
            accentColor={project?.accentColor}
          />
          <span className="text-[13px] leading-5 font-semibold text-[#0e3a3d]">
            {project?.name || '当前项目'}
          </span>
        </div>
        <span className="text-[13px] leading-5 text-[#456669]">
          {agentName} 在做
        </span>
      </div>

      {/* Title & R-05 Status line */}
      <div className="space-y-1.5">
        <h1 className="text-[22px] leading-[30px] font-semibold text-[#0e3a3d]">
          {thread.title}
        </h1>
        <p className="text-[15px] leading-6 text-[#456669]">
          {statusWord}。上次有动静是 {lastActivity}。
        </p>
      </div>

      {/* R-06 Three-row brief */}
      <div className="space-y-2.5 max-w-[696px]">
        <div className="grid grid-cols-1 sm:grid-cols-[84px_1fr] items-baseline gap-x-3 gap-y-0.5">
          <span className="text-[13px] leading-5 text-[#456669]">你原本要它</span>
          <span className="text-[15px] leading-6 text-[#0e3a3d]">
            {thread.resumeBrief.anchorGoal.text}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[84px_1fr] items-baseline gap-x-3 gap-y-0.5">
          <span className="text-[13px] leading-5 text-[#456669]">它实际做了</span>
          <span className="text-[15px] leading-6 text-[#0e3a3d]">
            {thread.resumeBrief.deltaSummary.text}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[84px_1fr] items-baseline gap-x-3 gap-y-0.5">
          <span className="text-[13px] leading-5 text-[#456669]">现在到哪了</span>
          <span className="text-[15px] leading-6 text-[#0e3a3d]">
            {thread.resumeBrief.blockerReason.text}
          </span>
        </div>
      </div>

      {/* R-08 Always-visible "补充一句" input */}
      <form onSubmit={handleSendFact} className="pt-2 space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            aria-label="补充一句情况给这个 AI"
            value={factText}
            onChange={(e) => setFactText(e.target.value)}
            placeholder="补充一句情况给这个 AI"
            className="flex-1 h-10 px-3 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
          />
          <button
            type="submit"
            disabled={sendingFact || !factText.trim()}
            className="h-9 sm:h-10 px-4 rounded-md border border-[#6f8c8b] bg-white hover:bg-[#f5f8f7] text-[13px] font-medium text-[#0e3a3d] disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            {sendingFact ? '正在发…' : '发给它'}
          </button>
        </div>
      </form>

      {/* R-09 Report a missed issue */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setReportOpen((v) => !v)}
          className="min-h-8 text-[13px] font-medium text-[#456669] hover:text-[#c93a1f] cursor-pointer"
        >
          这件其实有问题
        </button>

        {reportOpen && (
          <form onSubmit={handleSendReport} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              aria-label="哪里不对？"
              value={reportNote}
              onChange={(e) => setReportNote(e.target.value)}
              placeholder="哪里不对？"
              className="flex-1 h-10 px-3 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
            />
            <button
              type="submit"
              disabled={sendingReport}
              className="h-9 sm:h-10 px-4 rounded-md border border-[#6f8c8b] bg-white hover:bg-[#fdf1ee] text-[13px] font-medium text-[#c93a1f] whitespace-nowrap cursor-pointer"
            >
              {sendingReport ? '正在记…' : '记下并让它重做'}
            </button>
          </form>
        )}
      </div>

      {/* R-12 Evidence & Timeline Collapse */}
      <div className="pt-3 border-t border-[#c9d6d5]">
        <button
          type="button"
          aria-expanded={evidenceOpen}
          onClick={() => setEvidenceOpen((v) => !v)}
          className="inline-flex items-center gap-1 min-h-8 text-[13px] font-medium text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
        >
          {evidenceOpen ? (
            <ChevronDown className="w-4 h-4" strokeWidth={1.75} />
          ) : (
            <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
          )}
          <span>看依据</span>
        </button>

        {evidenceOpen && (
          <div className="mt-4 space-y-5 text-sm text-[#0e3a3d]">
            {project && (
              <div className="flex items-center gap-2 text-[13px] text-[#456669]">
                <span>检查方式：</span>
                <VerificationTierText tier={project.verificationTier} />
              </div>
            )}

            <section className="space-y-2">
              <h2 className="text-[13px] font-semibold text-[#456669]">已确认的事实</h2>
              <ul className="space-y-1.5 text-sm">
                <li>原本要做的事：{thread.resumeBrief.anchorGoal.text}</li>
                {thread.resumeBrief.activeConstraints.map((c, idx) => (
                  <li key={idx}>约束：{c.text}</li>
                ))}
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-[13px] font-semibold text-[#456669]">检查记录</h2>
              {thread.evidences.length === 0 ? (
                <p className="text-[13px] text-[#456669]">还没有交回检查记录。</p>
              ) : (
                <div className="divide-y divide-[#c9d6d5] border border-[#c9d6d5] rounded-md">
                  {thread.evidences.map((ev) => (
                    <div key={ev.id} className="p-3 space-y-1">
                      <div className="text-[13px] font-semibold">{ev.title}</div>
                      <p className="text-[13px] text-[#456669]">{ev.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-[13px] font-semibold text-[#456669]">过程</h2>
              <ProjectStagePipeline projectName={project?.name} stages={project?.stages} />
              {thread.trace.length > 0 && (
                <div className="divide-y divide-[#c9d6d5] border-t border-b border-[#c9d6d5]">
                  {thread.trace.map((tr) => (
                    <div key={tr.id} className="py-2 flex items-baseline gap-3 text-[13px]">
                      <span className="text-xs text-[#456669] tabular-nums shrink-0 w-24">
                        {formatTimeClockOrRelative(tr.timestamp)}
                      </span>
                      <span className="font-medium text-[#0e3a3d] shrink-0">{tr.actor}</span>
                      <span className="text-[#456669]">{tr.summary}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="pt-2 border-t border-[#c9d6d5]">
              <button
                type="button"
                aria-expanded={techRawOpen}
                onClick={() => setTechRawOpen((v) => !v)}
                className="inline-flex items-center gap-1 min-h-8 text-[13px] text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
              >
                {techRawOpen ? (
                  <ChevronDown className="w-4 h-4" strokeWidth={1.75} />
                ) : (
                  <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
                )}
                <span>给技术人员看的原始记录</span>
              </button>

              {techRawOpen && (
                <div className="mt-2 p-3 rounded bg-[#f5f8f7] border border-[#c9d6d5] font-mono text-xs text-[#456669] space-y-2 overflow-x-auto">
                  <div>
                    thread={thread.id} · branch={thread.branchOrWorktree} · status={thread.status}
                  </div>
                  {thread.evidences.map((ev) => (
                    <pre key={ev.id} className="whitespace-pre-wrap break-all">
                      [{ev.id}] {ev.rawRef}
                    </pre>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </article>
  );
}
