import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  Lock,
  Paperclip,
  RefreshCw,
  X,
} from 'lucide-react';
import type { DecisionCase, DecisionOption, Project, WorkThread } from '../types/founderOs';
import {
  formatRelativeTime,
  formatTimeClockOrRelative,
  getDefaultSelectedOptionId,
  sortDecisionOptions,
} from '../core/formatters';
import { ProjectDomainIcon, ProjectStageDots, ProjectStagePipeline } from './AttentionVisuals';

interface DecisionSheetProps {
  decisionCase: DecisionCase;
  project?: Project;
  thread?: WorkThread;
  showMobileBack?: boolean;
  onMobileBack?: () => void;
  onDecide: (
    caseId: string,
    payload: {
      chosenOptionId: string;
      userRationale: string;
      extraInstructionToAgent?: string;
      uploadedContextNote?: string;
      uploadedFileName?: string;
      saveAsRule: boolean;
      customRuleText: string;
      markAsFalsePositive: boolean;
      dismissMode?: 'always' | 'once';
      decisionDurationSeconds?: number;
    }
  ) => Promise<void>;
  onSnooze: (
    caseId: string,
    preset: 'tonight' | 'tomorrow_morning' | 'next_monday'
  ) => Promise<void>;
  onExplain: (
    caseId: string,
    useAi: boolean,
    variantIndex: number
  ) => Promise<{
    explanation: {
      whatHappened: string;
      bossAnalogy: string;
      ifIgnored: string;
      recommendedAction: string;
    };
  }>;
  onRefreshBrief: (threadId: string) => Promise<void>;
}

export function DecisionSheet({
  decisionCase,
  project,
  thread,
  showMobileBack = false,
  onMobileBack,
  onDecide,
  onSnooze,
  onExplain,
  onRefreshBrief,
}: DecisionSheetProps) {
  const sortedOptions = useMemo(
    () => sortDecisionOptions(decisionCase.options),
    [decisionCase.options]
  );

  const [selectedOptionId, setSelectedOptionId] = useState<string>(() =>
    getDefaultSelectedOptionId(decisionCase.options)
  );
  const [saveAsRule, setSaveAsRule] = useState(false);
  const [customRuleText, setCustomRuleText] = useState(decisionCase.candidateRuleText);
  const [extraNoteOpen, setExtraNoteOpen] = useState(false);
  const [extraNote, setExtraNote] = useState('');
  const [missingContextText, setMissingContextText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [missingError, setMissingError] = useState<string | null>(null);

  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState(false);
  const [dismissMenuOpen, setDismissMenuOpen] = useState(false);
  const [irreversibleArmed, setIrreversibleArmed] = useState(false);

  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [techRawOpen, setTechRawOpen] = useState(false);
  const [plainOpen, setPlainOpen] = useState(false);
  const [plainLoading, setPlainLoading] = useState(false);
  const [plainVariant, setPlainVariant] = useState(0);
  const [plainExplanation, setPlainExplanation] = useState<{
    whatHappened: string;
    bossAnalogy: string;
    ifIgnored: string;
    recommendedAction: string;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [refreshingBrief, setRefreshingBrief] = useState(false);

  const openedAtRef = useRef<number>(Date.now());
  const missingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const extraInputRef = useRef<HTMLInputElement | null>(null);
  const evidenceRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset local sheet state whenever active case changes
  useEffect(() => {
    setSelectedOptionId(getDefaultSelectedOptionId(decisionCase.options));
    setSaveAsRule(false);
    setCustomRuleText(decisionCase.candidateRuleText);
    setExtraNoteOpen(false);
    setExtraNote('');
    setMissingContextText('');
    setUploadedFileName('');
    setMissingError(null);
    setSnoozeMenuOpen(false);
    setDismissMenuOpen(false);
    setIrreversibleArmed(false);
    setEvidenceOpen(false);
    setTechRawOpen(false);
    setPlainOpen(false);
    setPlainExplanation(null);
    setPlainVariant(0);
    openedAtRef.current = Date.now();
  }, [decisionCase.id]);

  // 3-second disarm timer for Irreversible double-confirmation (P-50)
  useEffect(() => {
    if (!irreversibleArmed) return;
    const t = setTimeout(() => setIrreversibleArmed(false), 3000);
    return () => clearTimeout(t);
  }, [irreversibleArmed]);

  // Show spinner only if submission takes > 2s (X-04)
  useEffect(() => {
    if (!submitting) {
      setShowSpinner(false);
      return;
    }
    const t = setTimeout(() => setShowSpinner(true), 2000);
    return () => clearTimeout(t);
  }, [submitting]);

  const selectedOption = sortedOptions.find((o) => o.id === selectedOptionId);
  const isIrreversibleSelected = selectedOption?.reversibility === 'Irreversible';

  function isUploadOption(opt: DecisionOption): boolean {
    if (decisionCase.decisionType !== 'missing_context') return false;
    return (
      opt.id.includes('upload') ||
      opt.label.includes('补充') ||
      opt === sortedOptions[0]
    );
  }

  async function handlePrimarySubmit() {
    if (submitting) return;
    if (!selectedOption) return;

    // P-40: validate missing_context input when the upload option is chosen
    if (
      isUploadOption(selectedOption) &&
      !missingContextText.trim() &&
      !uploadedFileName
    ) {
      setMissingError('先填资料或上传文件，或者改选「先跳过」');
      missingTextareaRef.current?.focus();
      return;
    }

    // P-50: double-click confirmation for Irreversible option
    if (isIrreversibleSelected && !irreversibleArmed) {
      setIrreversibleArmed(true);
      return;
    }

    const durationSec = Math.max(
      1,
      Math.round((Date.now() - openedAtRef.current) / 1000)
    );

    setSubmitting(true);
    try {
      await onDecide(decisionCase.id, {
        chosenOptionId: selectedOption.id,
        userRationale: `选择了「${selectedOption.label}」`,
        extraInstructionToAgent: extraNote.trim() || undefined,
        uploadedContextNote: missingContextText.trim() || undefined,
        uploadedFileName: uploadedFileName || undefined,
        saveAsRule,
        customRuleText: customRuleText.trim() || decisionCase.candidateRuleText,
        markAsFalsePositive: false,
        decisionDurationSeconds: durationSec,
      });
    } finally {
      setSubmitting(false);
      setIrreversibleArmed(false);
    }
  }

  async function handleDismissOption(mode: 'always' | 'once') {
    if (submitting) return;
    const recommendedOpt =
      sortedOptions.find((o) => o.recommended && o.reversibility !== 'Irreversible') ||
      sortedOptions.find((o) => o.reversibility !== 'Irreversible') ||
      sortedOptions[0];
    if (!recommendedOpt) return;

    setDismissMenuOpen(false);
    const durationSec = Math.max(
      1,
      Math.round((Date.now() - openedAtRef.current) / 1000)
    );
    setSubmitting(true);
    try {
      await onDecide(decisionCase.id, {
        chosenOptionId: recommendedOpt.id,
        userRationale:
          mode === 'always' ? '这类别以后不用再问，按建议办' : '只是这次不必问，按建议办',
        saveAsRule: false,
        customRuleText: '',
        markAsFalsePositive: true,
        dismissMode: mode,
        decisionDurationSeconds: durationSec,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOpenPlainExplanation(nextVariant?: number) {
    const v = typeof nextVariant === 'number' ? nextVariant : plainVariant;
    setPlainOpen(true);
    setPlainLoading(true);
    try {
      const res = await onExplain(decisionCase.id, false, v);
      setPlainExplanation(res.explanation);
      setPlainVariant(v);
    } finally {
      setPlainLoading(false);
    }
  }

  function jumpToEvidence() {
    setEvidenceOpen(true);
    setTimeout(() => {
      evidenceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }

  // Keyboard shortcuts (P-56)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        setSnoozeMenuOpen(false);
        setDismissMenuOpen(false);
        setEvidenceOpen(false);
        setPlainOpen(false);
        return;
      }

      if (inInput) return;

      if (e.key === '1' || e.key === '2' || e.key === '3') {
        const idx = Number(e.key) - 1;
        const opt = sortedOptions[idx];
        if (opt) {
          e.preventDefault();
          setSelectedOptionId(opt.id);
          setIrreversibleArmed(false);
          setMissingError(null);
        }
      } else if (e.key === 'Enter') {
        if (target?.tagName === 'BUTTON') return;
        e.preventDefault();
        handlePrimarySubmit();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setSnoozeMenuOpen((v) => !v);
        setDismissMenuOpen(false);
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        setEvidenceOpen((v) => !v);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // P-17: Reliability badge for row 3 ("为什么拦下")
  const reliabilityBadge =
    decisionCase.enforcementLayer === 'deterministic_gateway'
      ? { text: '你定的规矩', tone: 'bg-[#eaf6f3] text-[#0b7265]' }
      : decisionCase.enforcementLayer === 'probabilistic_checker'
        ? { text: 'AI 的判断，不一定对', tone: 'bg-[#fff6e0] text-[#8a5300]' }
        : { text: '没法实测，只看了内容', tone: 'bg-[#fff6e0] text-[#8a5300]' };

  const hasDegradationNotice = Boolean(
    thread?.resumeBrief.degradationNotice ||
      project?.verificationTier === 'tier_build_only' ||
      project?.verificationTier === 'tier_diff_only'
  );

  const anchorText =
    thread?.resumeBrief.anchorGoal.text || decisionCase.plainSummary || decisionCase.title;
  const deltaText =
    thread?.resumeBrief.deltaSummary.text || decisionCase.plainSummary || decisionCase.whyNow;
  const blockerText = thread?.resumeBrief.blockerReason.text || decisionCase.whyNow;
  const reminderText =
    decisionCase.assumptionsAndUnknowns[0] || decisionCase.devilAdvocateNote;

  return (
    <article
      key={decisionCase.id}
      aria-label={decisionCase.title}
      className="fos-sheet-shadow fos-sheet-enter rounded-xl max-w-[760px] w-full p-6 xl:p-8 relative"
    >
      {/* Mobile back button (<768px) */}
      {showMobileBack && onMobileBack && (
        <button
          type="button"
          onClick={onMobileBack}
          className="mb-4 inline-flex items-center gap-1.5 min-h-8 text-[13px] font-medium text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          <span>返回</span>
        </button>
      )}

      {/* 4.2 Source Row (Left: icon + project + stage dots; Right: agent + relative time) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 min-w-0">
          <div className="inline-flex items-center gap-2 min-w-0">
            <ProjectDomainIcon
              domainIcon={project?.domainIcon}
              accentColor={project?.accentColor}
            />
            <span className="text-[13px] leading-5 font-semibold text-[#0e3a3d] truncate">
              {project?.name || '当前项目'}
            </span>
          </div>

          <ProjectStageDots
            stages={project?.stages}
            currentStageLabel={decisionCase.stageLabel}
          />
        </div>

        <div className="text-[13px] leading-5 text-[#456669] tabular-nums shrink-0">
          {decisionCase.sourceAgentName || 'AI 助手'} 提出，
          {formatRelativeTime(decisionCase.createdAt)}
        </div>
      </div>

      {/* 4.3 Title (<=24 chars, question form, max 2 lines) */}
      <h1 className="mt-4 text-[22px] leading-[30px] font-semibold text-[#0e3a3d] line-clamp-2">
        {decisionCase.title}
      </h1>

      {/* 4.4 Three-Row Resume Brief */}
      <div className="mt-4 space-y-2.5 max-w-[696px]">
        <div className="grid grid-cols-1 sm:grid-cols-[84px_1fr_auto] items-baseline gap-x-3 gap-y-0.5 min-h-[28px]">
          <span className="text-[13px] leading-5 text-[#456669]">你原本要它</span>
          <span className="text-[15px] leading-6 text-[#0e3a3d]">{anchorText}</span>
          <button
            type="button"
            onClick={jumpToEvidence}
            className="text-[13px] leading-5 text-[#0b7265] hover:underline justify-self-start sm:justify-self-end cursor-pointer"
          >
            依据
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[84px_1fr_auto] items-baseline gap-x-3 gap-y-0.5 min-h-[28px]">
          <span className="text-[13px] leading-5 text-[#456669]">它实际做了</span>
          <span className="text-[15px] leading-6 text-[#0e3a3d]">{deltaText}</span>
          <button
            type="button"
            onClick={jumpToEvidence}
            className="text-[13px] leading-5 text-[#0b7265] hover:underline justify-self-start sm:justify-self-end cursor-pointer"
          >
            依据
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[84px_1fr_auto] items-baseline gap-x-3 gap-y-0.5 min-h-[28px]">
          <span className="text-[13px] leading-5 text-[#456669]">为什么拦下</span>
          <div className="text-[15px] leading-6 text-[#0e3a3d]">
            <span
              className={`inline-block text-xs leading-[18px] font-medium px-1.5 py-0.5 rounded mr-2 align-middle ${reliabilityBadge.tone}`}
            >
              {reliabilityBadge.text}
            </span>
            <span className="align-middle">{blockerText}</span>
          </div>
          <button
            type="button"
            onClick={jumpToEvidence}
            className="text-[13px] leading-5 text-[#0b7265] hover:underline justify-self-start sm:justify-self-end cursor-pointer"
          >
            依据
          </button>
        </div>
      </div>

      {/* P-19 Degradation Notice */}
      {hasDegradationNotice && (
        <div className="mt-3 px-3 py-2 rounded bg-[#fff6e0] text-[#8a5300] text-[13px] leading-5">
          这个项目没有自动测试，系统只能检查到这一步。
        </div>
      )}

      {/* P-60 Inline "换个说法" Result */}
      {plainOpen && (
        <div className="mt-4 p-4 rounded-md bg-[#f5f8f7] space-y-2 text-sm leading-6 text-[#0e3a3d]">
          {plainLoading && !plainExplanation ? (
            <div className="text-[13px] text-[#456669]">正在换个说法…</div>
          ) : plainExplanation ? (
            <>
              <p>{plainExplanation.bossAnalogy}</p>
              <p className="text-[13px] text-[#456669]">
                {plainExplanation.recommendedAction}
              </p>
              <div className="pt-1 flex items-center gap-4">
                <button
                  type="button"
                  disabled={plainLoading}
                  onClick={() => handleOpenPlainExplanation(plainVariant + 1)}
                  className="min-h-8 text-[13px] font-medium text-[#0b7265] hover:underline cursor-pointer"
                >
                  再举个例子
                </button>
                <button
                  type="button"
                  onClick={() => setPlainOpen(false)}
                  className="min-h-8 text-[13px] text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
                >
                  收起
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* 4.5 Consequence Row */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-[84px_1fr] items-baseline gap-x-3 gap-y-0.5">
        <span className="text-[13px] leading-5 font-medium text-[#8a5300]">
          不处理会怎样
        </span>
        <span className="text-[15px] leading-6 text-[#0e3a3d]">
          {decisionCase.costOfDelay}
        </span>
      </div>

      {/* 4.6 Unified Option Rows */}
      <div role="radiogroup" aria-label="怎么办" className="mt-5 space-y-2">
        {sortedOptions.map((opt) => {
          const isSelected = selectedOptionId === opt.id;
          const isIrrev = opt.reversibility === 'Irreversible';
          const isPart = opt.reversibility === 'Partially Reversible';
          const showMissingInputs = isSelected && isUploadOption(opt);

          return (
            <div
              key={opt.id}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onClick={() => {
                setSelectedOptionId(opt.id);
                setIrreversibleArmed(false);
                setMissingError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  setSelectedOptionId(opt.id);
                  setIrreversibleArmed(false);
                  setMissingError(null);
                }
              }}
              className={`rounded-md cursor-pointer fos-transition ${
                isSelected
                  ? 'border-2 border-[#0e3a3d] bg-[#f5f8f7] px-4 py-3'
                  : 'border border-[#c9d6d5] hover:border-[#6f8c8b] bg-white px-[17px] py-[13px]'
              }`}
            >
              {/* Line 1: Radio circle + Recommended tag + Option label + Reversibility badge */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 w-[18px] h-[18px] rounded-full border shrink-0 flex items-center justify-center ${
                      isSelected ? 'border-[#0e3a3d]' : 'border-[#6f8c8b]'
                    }`}
                  >
                    {isSelected && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#0e3a3d]" />
                    )}
                  </span>
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    {opt.recommended && (
                      <span className="inline-block text-xs leading-4 font-semibold bg-[#eaf6f3] text-[#0b7265] px-1.5 py-0.5 rounded shrink-0">
                        建议
                      </span>
                    )}
                    <span className="text-[15px] leading-6 font-semibold text-[#0e3a3d]">
                      {opt.label}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 pt-0.5">
                  {isIrrev ? (
                    <span className="inline-flex items-center gap-1 text-xs leading-4 font-medium bg-[#fdf1ee] text-[#c93a1f] px-1.5 py-0.5 rounded whitespace-nowrap">
                      <Lock className="w-3 h-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                      <span>不能反悔</span>
                    </span>
                  ) : isPart ? (
                    <span className="inline-block text-xs leading-4 font-medium bg-[#fff6e0] text-[#8a5300] px-1.5 py-0.5 rounded whitespace-nowrap">
                      部分能反悔
                    </span>
                  ) : (
                    <span className="text-xs leading-4 text-[#456669] whitespace-nowrap">
                      能反悔
                    </span>
                  )}
                </div>
              </div>

              {/* Line 2: 得到 & 付出 (stacked on mobile, side-by-side on desktop) */}
              <div className="pl-[28px] mt-1.5 flex flex-col sm:flex-row sm:flex-wrap gap-x-5 gap-y-1 text-[13px] leading-5">
                <div>
                  <span className="text-[#456669] mr-1.5">得到</span>
                  <span className="text-[#0e3a3d]">{opt.benefit}</span>
                </div>
                <div>
                  <span className="text-[#456669] mr-1.5">付出</span>
                  <span className="text-[#0e3a3d]">{opt.costAndTradeoff}</span>
                </div>
              </div>

              {/* Line 3: Recommendation reason inside recommended option only */}
              {opt.recommended && (
                <div className="pl-[28px] mt-1 text-[13px] leading-5 text-[#0b7265]">
                  建议理由：{decisionCase.devilAdvocateNote}
                </div>
              )}

              {/* Embedded missing-context inputs when this option is selected (P-38..P-40) */}
              {showMissingInputs && (
                <div
                  className="pl-[28px] mt-3 space-y-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <textarea
                    ref={missingTextareaRef}
                    rows={3}
                    value={missingContextText}
                    onChange={(e) => {
                      setMissingContextText(e.target.value);
                      if (missingError) setMissingError(null);
                    }}
                    placeholder={
                      decisionCase.missingInfoPrompt ||
                      '把要补充的情况或口径写在这里…'
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
                  />

                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setUploadedFileName(file.name);
                          setMissingError(null);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-9 px-3 text-[13px] font-medium text-[#0e3a3d] bg-white border border-[#6f8c8b] rounded-md inline-flex items-center gap-1.5 cursor-pointer hover:bg-[#f5f8f7]"
                    >
                      <Paperclip className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                      <span>上传文件</span>
                    </button>

                    {uploadedFileName && (
                      <span className="inline-flex items-center gap-2 text-[13px] text-[#0e3a3d]">
                        <span>{uploadedFileName}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setUploadedFileName('');
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="text-xs text-[#c93a1f] hover:underline cursor-pointer"
                        >
                          移除
                        </button>
                      </span>
                    )}
                  </div>

                  {missingError && (
                    <p role="alert" className="text-[13px] font-medium text-[#c93a1f]">
                      {missingError}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 4.7 Reminder Line */}
      {reminderText && (
        <div className="mt-4 text-[13px] leading-5 line-clamp-2">
          <span className="font-medium text-[#8a5300] mr-2">也要想到</span>
          <span className="text-[#0e3a3d]">{reminderText}</span>
        </div>
      )}

      {/* 4.8 Make-a-Rule Line (unchecked by default) */}
      <div className="mt-4 pt-4 border-t border-[#c9d6d5] space-y-2.5">
        <label className="inline-flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={saveAsRule}
            onChange={(e) => setSaveAsRule(e.target.checked)}
            className="w-[18px] h-[18px] rounded border-[#6f8c8b] accent-[#0e3a3d] cursor-pointer"
          />
          <span className="text-sm text-[#0e3a3d]">以后同类的事都这么办</span>
        </label>

        {saveAsRule && (
          <div className="pl-[28px] space-y-1.5">
            <textarea
              rows={2}
              aria-label="要记下来的规矩内容"
              value={customRuleText}
              onChange={(e) => setCustomRuleText(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
            />
            <p className="text-xs text-[#456669]">
              先只提醒你，不会自动处理。你可以在「规矩」里改成自动。
            </p>
          </div>
        )}
      </div>

      {/* 4.9 Sticky Action Bar */}
      <div className="sticky bottom-0 -mx-6 xl:-mx-8 px-6 xl:px-8 mt-5 pt-3 pb-3 bg-white border-t border-[#c9d6d5] z-10 space-y-2.5">
        {extraNoteOpen && (
          <div className="flex items-center gap-2">
            <input
              ref={extraInputRef}
              type="text"
              aria-label="加一句给 AI 的要求"
              value={extraNote}
              onChange={(e) => setExtraNote(e.target.value)}
              placeholder={`给 ${decisionCase.sourceAgentName || 'AI'} 加一句要求…`}
              className="flex-1 h-10 px-3 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
            />
            <button
              type="button"
              aria-label="收起额外要求"
              onClick={() => {
                setExtraNote('');
                setExtraNoteOpen(false);
              }}
              className="min-h-8 min-w-8 inline-flex items-center justify-center text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5 relative">
          <button
            type="button"
            disabled={submitting || !selectedOption}
            onClick={handlePrimarySubmit}
            className={`h-10 px-5 rounded-md text-[15px] font-semibold text-white inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-60 fos-transition w-full sm:w-auto min-w-[116px] ${
              isIrreversibleSelected
                ? 'bg-[#c93a1f] hover:bg-[#b03118]'
                : 'bg-[#0e3a3d] hover:bg-[#144c50]'
            }`}
          >
            {showSpinner && (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
            )}
            <span>
              {submitting
                ? '正在处理…'
                : isIrreversibleSelected
                  ? irreversibleArmed
                    ? '再点一次确认'
                    : '照办，我知道不能反悔'
                  : '按这个办'}
            </span>
          </button>

          {/* Snooze Menu (P-52) */}
          <div className="relative">
            <button
              type="button"
              aria-expanded={snoozeMenuOpen}
              onClick={() => {
                setSnoozeMenuOpen((v) => !v);
                setDismissMenuOpen(false);
              }}
              className="h-9 px-3.5 rounded-md border border-[#6f8c8b] bg-white hover:bg-[#f5f8f7] text-[13px] font-medium text-[#0e3a3d] whitespace-nowrap cursor-pointer"
            >
              稍后再说
            </button>
            {snoozeMenuOpen && (
              <div
                role="menu"
                className="absolute left-0 bottom-11 w-40 bg-white border border-[#c9d6d5] rounded-md fos-modal-shadow py-1 z-20"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSnoozeMenuOpen(false);
                    onSnooze(decisionCase.id, 'tonight');
                  }}
                  className="w-full text-left px-3 py-2 text-[13px] text-[#0e3a3d] hover:bg-[#f5f8f7] cursor-pointer"
                >
                  今晚
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSnoozeMenuOpen(false);
                    onSnooze(decisionCase.id, 'tomorrow_morning');
                  }}
                  className="w-full text-left px-3 py-2 text-[13px] text-[#0e3a3d] hover:bg-[#f5f8f7] cursor-pointer"
                >
                  明天上午
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSnoozeMenuOpen(false);
                    onSnooze(decisionCase.id, 'next_monday');
                  }}
                  className="w-full text-left px-3 py-2 text-[13px] text-[#0e3a3d] hover:bg-[#f5f8f7] cursor-pointer"
                >
                  下周一
                </button>
              </div>
            )}
          </div>

          {/* Dismiss Menu (P-53) */}
          <div className="relative">
            <button
              type="button"
              aria-expanded={dismissMenuOpen}
              onClick={() => {
                setDismissMenuOpen((v) => !v);
                setSnoozeMenuOpen(false);
              }}
              className="min-h-8 px-2 text-[13px] text-[#456669] hover:text-[#0e3a3d] whitespace-nowrap cursor-pointer"
            >
              这件不必问我
            </button>
            {dismissMenuOpen && (
              <div
                role="menu"
                className="absolute left-0 bottom-10 w-60 bg-white border border-[#c9d6d5] rounded-md fos-modal-shadow py-1 z-20"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleDismissOption('always')}
                  className="w-full text-left px-3 py-2 text-[13px] text-[#0e3a3d] hover:bg-[#f5f8f7] cursor-pointer"
                >
                  这次按建议办，以后这类别再问
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleDismissOption('once')}
                  className="w-full text-left px-3 py-2 text-[13px] text-[#0e3a3d] hover:bg-[#f5f8f7] cursor-pointer"
                >
                  只是这次不必问
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setExtraNoteOpen((v) => !v);
              setTimeout(() => extraInputRef.current?.focus(), 0);
            }}
            className="min-h-8 px-2 text-[13px] text-[#456669] hover:text-[#0e3a3d] whitespace-nowrap cursor-pointer"
          >
            加一句要求
          </button>

          <span className="hidden min-[1100px]:inline text-xs text-[#456669] ml-auto tabular-nums">
            1–3 选择，回车确认
          </span>
        </div>
      </div>

      {/* 4.10 Bottom Collapse Entry ("看依据" & "换个说法") */}
      <div className="mt-4 pt-3 border-t border-[#c9d6d5] flex flex-wrap items-center gap-4">
        <button
          type="button"
          aria-expanded={evidenceOpen}
          onClick={() => setEvidenceOpen((v) => !v)}
          className="inline-flex items-center gap-1 min-h-8 text-[13px] font-medium text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
        >
          {evidenceOpen ? (
            <ChevronDown className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          )}
          <span>看依据</span>
        </button>

        <button
          type="button"
          aria-expanded={plainOpen}
          onClick={() => {
            if (plainOpen) setPlainOpen(false);
            else handleOpenPlainExplanation(0);
          }}
          className="min-h-8 text-[13px] font-medium text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
        >
          换个说法
        </button>
      </div>

      {/* Expanded "看依据" (4 Sections + Nested Raw Tech Log) */}
      {evidenceOpen && (
        <div
          ref={evidenceRef}
          className="mt-4 pt-4 border-t border-[#c9d6d5] space-y-6 text-sm text-[#0e3a3d]"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[#0e3a3d]">依据与过程</h2>
            {thread && (
              <button
                type="button"
                disabled={refreshingBrief}
                onClick={async () => {
                  setRefreshingBrief(true);
                  try {
                    await onRefreshBrief(thread.id);
                  } finally {
                    setRefreshingBrief(false);
                  }
                }}
                className="h-9 px-3 rounded-md border border-[#6f8c8b] bg-white hover:bg-[#f5f8f7] text-[13px] text-[#0e3a3d] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${refreshingBrief ? 'animate-spin' : ''}`}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span>更新进展</span>
              </button>
            )}
          </div>

          {/* Section 1: 已确认的事实 */}
          <section className="space-y-2">
            <h3 className="text-[13px] font-semibold text-[#456669]">已确认的事实</h3>
            <ul className="space-y-2">
              {decisionCase.facts.map((fact, idx) => (
                <li key={idx} className="flex flex-wrap items-baseline gap-2 text-sm leading-6">
                  <span>{fact.text}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      fact.deterministic
                        ? 'bg-[#eaf6f3] text-[#0b7265]'
                        : 'bg-[#fff6e0] text-[#8a5300]'
                    }`}
                  >
                    {fact.deterministic ? '实测' : 'AI 推断'}
                  </span>
                </li>
              ))}
              {thread?.resumeBrief.activeConstraints.map((c, idx) => (
                <li key={`c-${idx}`} className="flex flex-wrap items-baseline gap-2 text-sm leading-6">
                  <span>约束：{c.text}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-[#f5f8f7] text-[#456669]">
                    {c.sourceLabel}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Section 2: 还不确定的地方 */}
          <section className="space-y-2">
            <h3 className="text-[13px] font-semibold text-[#456669]">还不确定的地方</h3>
            {decisionCase.assumptionsAndUnknowns.length === 0 ? (
              <p className="text-[13px] text-[#456669]">没有未说明的猜测。</p>
            ) : (
              <ul className="space-y-1.5 list-disc pl-5 text-sm leading-6">
                {decisionCase.assumptionsAndUnknowns.map((u, idx) => (
                  <li key={idx}>{u}</li>
                ))}
              </ul>
            )}
          </section>

          {/* Section 3: 检查记录 & 各选项实际动作 */}
          <section className="space-y-2">
            <h3 className="text-[13px] font-semibold text-[#456669]">检查记录</h3>
            {thread && thread.evidences.length > 0 ? (
              <div className="divide-y divide-[#c9d6d5] border border-[#c9d6d5] rounded-md">
                {thread.evidences.map((ev) => (
                  <div key={ev.id} className="p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[13px] font-semibold">
                      <span>{ev.title}</span>
                      <span
                        className={
                          ev.passed === false
                            ? 'text-[#c93a1f]'
                            : ev.passed === true
                              ? 'text-[#0b7265]'
                              : 'text-[#456669]'
                        }
                      >
                        {ev.passed === false
                          ? '未通过'
                          : ev.passed === true
                            ? '已通过'
                            : '待补资料'}
                      </span>
                    </div>
                    <p className="text-[13px] text-[#456669]">{ev.summary}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-[#456669]">暂无额外的检查记录。</p>
            )}

            <div className="pt-2 space-y-1">
              <div className="text-[13px] font-semibold text-[#456669]">各选项会执行什么</div>
              <ul className="space-y-1 text-[13px] text-[#456669]">
                {sortedOptions.map((opt) => (
                  <li key={opt.id}>
                    <span className="text-[#0e3a3d] font-medium">{opt.label}：</span>
                    {opt.actionSummary}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Section 4: 过程 */}
          <section className="space-y-3">
            <h3 className="text-[13px] font-semibold text-[#456669]">过程</h3>
            <ProjectStagePipeline
              projectName={project?.name}
              stages={project?.stages}
              currentStageLabel={decisionCase.stageLabel}
            />
            {thread && thread.trace.length > 0 && (
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

          {/* P-59 Nested Raw Technical Log (ONLY place using monospace) */}
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
                  case={decisionCase.id} · thread={decisionCase.threadId} · branch=
                  {thread?.branchOrWorktree || 'n/a'} · layer={decisionCase.enforcementLayer}
                </div>
                {thread?.resumeBrief.deltaSummary.diffLocation && (
                  <div>location={thread.resumeBrief.deltaSummary.diffLocation}</div>
                )}
                {thread?.evidences.map((ev) => (
                  <pre key={ev.id} className="whitespace-pre-wrap break-all">
                    [{ev.id}] {ev.rawRef}
                  </pre>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </article>
  );
}
