import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type {
  AutoAppliedAction,
  DecisionRecord,
  PolicyRule,
  Project,
  RuleConflict,
} from '../types/founderOs';
import { formatRelativeTime } from '../core/formatters';

interface CompiledDraft {
  title: string;
  kind: 'deterministic_guardrail' | 'semantic_habit';
  executionMode: 'suggest_only' | 'auto_apply_reversible';
  ruleText: string;
  scopeLabel: string;
  protectedPaths: string[];
  bannedKeywords: string[];
  bannedCommands: string[];
  maxSpendUsd?: number;
  blockExternalSend: boolean;
}

interface JudgmentMemoryViewProps {
  projects: Project[];
  selectedProjectId: string;
  policyRules: PolicyRule[];
  decisionRecords: DecisionRecord[];
  autoAppliedActions: AutoAppliedAction[];
  onCompileRule: (
    naturalText: string,
    projectId: string | 'global'
  ) => Promise<{ compiled: CompiledDraft; conflicts: RuleConflict[] }>;
  onSaveCompiledRule: (payload: {
    projectId: string | 'global';
    kind: 'deterministic_guardrail' | 'semantic_habit';
    executionMode: 'suggest_only' | 'auto_apply_reversible';
    title: string;
    ruleText: string;
    scopeLabel: string;
    matcher?: PolicyRule['matcher'];
    deactivateConflictingRuleIds?: string[];
  }) => Promise<void>;
  onToggleRuleActive: (ruleId: string, active: boolean) => Promise<void>;
  onAckRuleReview: (ruleId: string, stillWorks: boolean) => Promise<void>;
  onChangeHabitMode: (
    ruleId: string,
    mode: 'suggest_only' | 'auto_apply_reversible'
  ) => Promise<void>;
  onUndoAutoAction: (actionId: string) => Promise<void>;
  onSubmitOutcome: (
    decisionId: string,
    verdict: 'win' | 'miss' | 'neutral',
    note: string
  ) => Promise<void>;
}

/**
 * Section 6: 规矩页 (Single column max-w 960, left-aligned, flat hairline sections).
 */
export function JudgmentMemoryView({
  projects,
  selectedProjectId,
  policyRules,
  decisionRecords,
  autoAppliedActions,
  onCompileRule,
  onSaveCompiledRule,
  onToggleRuleActive,
  onAckRuleReview,
  onChangeHabitMode,
  onUndoAutoAction,
  onSubmitOutcome,
}: JudgmentMemoryViewProps) {
  const [naturalText, setNaturalText] = useState('');
  const [scopeProjectId, setScopeProjectId] = useState<string>(
    selectedProjectId !== 'all' ? selectedProjectId : 'global'
  );
  const [compiling, setCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [draftResult, setDraftResult] = useState<{
    compiled: CompiledDraft;
    conflicts: RuleConflict[];
  } | null>(null);
  const [techDetailsOpen, setTechDetailsOpen] = useState(false);
  const [conflictChoice, setConflictChoice] = useState<'replace' | 'keep_old'>('replace');
  const [savingRule, setSavingRule] = useState(false);

  const [selectedOutcomeVerdict, setSelectedOutcomeVerdict] = useState<
    Record<string, 'win' | 'miss' | 'neutral'>
  >({});
  const [outcomeNotes, setOutcomeNotes] = useState<Record<string, string>>({});
  const [highlightedDecisionId, setHighlightedDecisionId] = useState<string | null>(null);

  const projectMap = new Map(projects.map((p) => [p.id, p.shortName || p.name]));

  const scopedRules = policyRules.filter(
    (r) =>
      selectedProjectId === 'all' ||
      r.projectId === 'global' ||
      r.projectId === selectedProjectId
  );
  const scopedDecisions = decisionRecords.filter(
    (d) => selectedProjectId === 'all' || d.projectId === selectedProjectId
  );

  const deterministicRules = scopedRules.filter((r) => r.kind === 'deterministic_guardrail');
  const semanticHabits = scopedRules.filter((r) => r.kind === 'semantic_habit');
  const totalSavedCount = scopedRules.reduce((acc, r) => acc + r.hitCount, 0);

  const todayIso = new Date().toISOString().slice(0, 10);

  async function handleCompile(e: React.FormEvent) {
    e.preventDefault();
    if (!naturalText.trim()) return;
    setCompileError(null);
    setCompiling(true);
    try {
      const res = await onCompileRule(naturalText.trim(), scopeProjectId);
      setDraftResult(res);
      setConflictChoice('replace');
      setTechDetailsOpen(false);
    } catch (err: unknown) {
      setCompileError((err as Error).message || '没连上，检查一下网络再试。');
    } finally {
      setCompiling(false);
    }
  }

  async function handleConfirmSaveDraft() {
    if (!draftResult) return;
    if (draftResult.conflicts.length > 0 && conflictChoice === 'keep_old') {
      setDraftResult(null);
      setNaturalText('');
      return;
    }

    setSavingRule(true);
    try {
      const c = draftResult.compiled;
      const scopeLabel =
        scopeProjectId === 'global'
          ? '所有项目'
          : projectMap.get(scopeProjectId) || c.scopeLabel;
      await onSaveCompiledRule({
        projectId: scopeProjectId,
        kind: c.kind,
        executionMode: c.executionMode,
        title: c.title,
        ruleText: c.ruleText,
        scopeLabel,
        matcher:
          c.kind === 'deterministic_guardrail'
            ? {
                protectedPaths: c.protectedPaths,
                bannedKeywords: c.bannedKeywords,
                bannedCommands: c.bannedCommands,
                maxSpendUsd: c.maxSpendUsd,
                blockExternalSend: c.blockExternalSend,
              }
            : {
                bannedKeywords: c.bannedKeywords,
              },
        deactivateConflictingRuleIds:
          draftResult.conflicts.length > 0 && conflictChoice === 'replace'
            ? draftResult.conflicts.map((x) => x.conflictingRuleId)
            : [],
      });
      setDraftResult(null);
      setNaturalText('');
    } finally {
      setSavingRule(false);
    }
  }

  function jumpToDecision(decisionId: string) {
    setHighlightedDecisionId(decisionId);
    const el = document.getElementById(`decision-${decisionId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => {
      setHighlightedDecisionId((cur) => (cur === decisionId ? null : cur));
    }, 1500);
  }

  function renderSwitch(checked: boolean, label: string, onToggle: () => void) {
    return (
      <div className="inline-flex items-center gap-2 shrink-0">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          onClick={onToggle}
          className={`w-10 h-6 rounded-full border p-0.5 flex items-center cursor-pointer fos-transition ${
            checked
              ? 'bg-[#0e3a3d] border-[#0e3a3d] justify-end'
              : 'bg-white border-[#6f8c8b] justify-start'
          }`}
        >
          <span
            className={`w-4 h-4 rounded-full ${
              checked ? 'bg-white' : 'bg-[#6f8c8b]'
            }`}
          />
        </button>
        <span className="text-[13px] text-[#456669] w-7">{checked ? '在用' : '停了'}</span>
      </div>
    );
  }

  return (
    <div className="max-w-[960px] w-full py-8 px-4 sm:px-6 space-y-8">
      {/* 6.1 Page Header (J-02) */}
      <div className="space-y-1">
        <h1 className="text-[22px] leading-[30px] font-semibold text-[#0e3a3d]">规矩</h1>
        <p className="text-[15px] leading-6 text-[#456669] tabular-nums">
          这些规矩帮你省了 {totalSavedCount} 次判断。
        </p>
      </div>

      {/* 6.2 Add a Rule (J-03..J-13) */}
      <section aria-label="加一条规矩" className="pt-6 border-t border-[#c9d6d5] space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-[#0e3a3d]">加一条规矩</h2>
          <p className="text-[13px] leading-5 text-[#456669]">
            用一句话说你的要求，系统会告诉你它打算怎么执行。
          </p>
        </div>

        <form onSubmit={handleCompile} className="flex flex-col sm:flex-row gap-3">
          <select
            aria-label="适用范围"
            value={scopeProjectId}
            onChange={(e) => setScopeProjectId(e.target.value)}
            className="h-10 px-3 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d] shrink-0"
          >
            <option value="global">所有项目</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.shortName || p.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            aria-label="输入你的要求"
            value={naturalText}
            onChange={(e) => setNaturalText(e.target.value)}
            placeholder="例如：给客户发的任何东西，发之前都要我看过"
            className="flex-1 h-10 px-3 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
          />

          <button
            type="submit"
            disabled={compiling || !naturalText.trim()}
            className="h-10 px-5 rounded-md bg-[#0e3a3d] hover:bg-[#144c50] disabled:opacity-60 text-[15px] font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            {compiling ? '正在看…' : '看看怎么执行'}
          </button>
        </form>

        {compileError && (
          <div
            role="alert"
            className="px-3.5 py-2.5 rounded-md bg-[#fff6e0] text-[#8a5300] text-[13px]"
          >
            {compileError}
          </div>
        )}

        {draftResult && (
          <div className="bg-white border border-[#c9d6d5] rounded-md p-5 space-y-4">
            <div className="space-y-1">
              <div className="text-[13px] font-semibold text-[#456669]">系统会这样执行</div>
              <div className="text-[15px] font-semibold text-[#0e3a3d]">
                {draftResult.compiled.title}
              </div>
              <p className="text-sm text-[#0e3a3d]">{draftResult.compiled.ruleText}</p>
              <p className="text-[13px] text-[#0b7265]">
                {draftResult.compiled.kind === 'deterministic_guardrail'
                  ? '一定拦住：碰到就停，等你点头。'
                  : '先提醒你：系统觉得像这类事时会来问你。'}
              </p>
            </div>

            {(draftResult.compiled.protectedPaths.length > 0 ||
              draftResult.compiled.bannedKeywords.length > 0 ||
              draftResult.compiled.bannedCommands.length > 0) && (
              <div>
                <button
                  type="button"
                  aria-expanded={techDetailsOpen}
                  onClick={() => setTechDetailsOpen((v) => !v)}
                  className="inline-flex items-center gap-1 min-h-8 text-[13px] text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
                >
                  {techDetailsOpen ? (
                    <ChevronDown className="w-4 h-4" strokeWidth={1.75} />
                  ) : (
                    <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
                  )}
                  <span>技术细节</span>
                </button>
                {techDetailsOpen && (
                  <div className="mt-2 p-3 rounded bg-[#f5f8f7] border border-[#c9d6d5] font-mono text-xs text-[#456669] space-y-1">
                    {draftResult.compiled.protectedPaths.length > 0 && (
                      <div>paths: {draftResult.compiled.protectedPaths.join(', ')}</div>
                    )}
                    {draftResult.compiled.bannedKeywords.length > 0 && (
                      <div>keywords: {draftResult.compiled.bannedKeywords.join(', ')}</div>
                    )}
                    {draftResult.compiled.bannedCommands.length > 0 && (
                      <div>commands: {draftResult.compiled.bannedCommands.join(', ')}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {draftResult.conflicts.length > 0 && (
              <div className="p-4 rounded-md bg-[#fff6e0] space-y-2.5">
                <div className="text-[13px] font-semibold text-[#8a5300]">
                  这条和你已有的规矩矛盾
                </div>
                <ul className="space-y-1 text-[13px] text-[#0e3a3d]">
                  {draftResult.conflicts.map((cf) => (
                    <li key={cf.conflictingRuleId}>
                      和「{cf.conflictingRuleTitle}」矛盾：{cf.reason}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col sm:flex-row gap-4 pt-1 text-[13px] text-[#0e3a3d]">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="rule-conflict-choice"
                      checked={conflictChoice === 'replace'}
                      onChange={() => setConflictChoice('replace')}
                      className="w-[18px] h-[18px] accent-[#0e3a3d]"
                    />
                    <span>用新的，停掉旧的</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="rule-conflict-choice"
                      checked={conflictChoice === 'keep_old'}
                      onChange={() => setConflictChoice('keep_old')}
                      className="w-[18px] h-[18px] accent-[#0e3a3d]"
                    />
                    <span>留着旧的，这条不加</span>
                  </label>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                disabled={savingRule}
                onClick={handleConfirmSaveDraft}
                className="h-10 px-5 rounded-md bg-[#0e3a3d] hover:bg-[#144c50] text-[15px] font-semibold text-white cursor-pointer disabled:opacity-60"
              >
                {savingRule ? '正在加…' : '加上这条规矩'}
              </button>
              <button
                type="button"
                onClick={() => setDraftResult(null)}
                className="h-9 px-3 text-[13px] text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
              >
                不加了
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 6.3 Rule Lists: Single-column vertical layout (J-14..J-23) */}
      <section aria-label="一定拦住的规矩" className="pt-6 border-t border-[#c9d6d5] space-y-4">
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-[#0e3a3d]">一定拦住的</h2>
            <span className="text-[13px] text-[#456669] tabular-nums">
              {deterministicRules.length} 条
            </span>
          </div>
          <p className="text-[13px] text-[#456669]">碰到就停，AI 绕不过去。</p>
        </div>

        <div className="divide-y divide-[#c9d6d5] border-t border-b border-[#c9d6d5]">
          {deterministicRules.map((r) => {
            const isDue = r.active && r.reviewAt <= todayIso;
            const scopeName =
              r.projectId === 'global'
                ? '所有项目'
                : projectMap.get(r.projectId) || r.scopeLabel;
            return (
              <div key={r.id} className="py-4 space-y-2">
                {isDue && (
                  <div className="px-3 py-2 rounded bg-[#fff6e0] flex flex-wrap items-center justify-between gap-2 text-[13px]">
                    <span className="text-[#8a5300] font-medium">该再看一次了</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onAckRuleReview(r.id, true)}
                        className="h-8 px-3 rounded border border-[#6f8c8b] bg-white text-xs font-medium text-[#0e3a3d] cursor-pointer"
                      >
                        还管用
                      </button>
                      <button
                        type="button"
                        onClick={() => onAckRuleReview(r.id, false)}
                        className="h-8 px-3 rounded border border-[#6f8c8b] bg-white text-xs font-medium text-[#456669] cursor-pointer"
                      >
                        停掉
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="text-[15px] leading-6 font-semibold text-[#0e3a3d]">
                      {r.title}
                    </div>
                    <p className="text-[13px] leading-5 text-[#0e3a3d]">{r.ruleText}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#456669] tabular-nums pt-0.5">
                      <span>{scopeName}</span>
                      <span>帮你省了 {r.hitCount} 次</span>
                      <span>{r.reviewAt} 再看一次</span>
                      {r.sourceDecisionId && (
                        <button
                          type="button"
                          onClick={() => jumpToDecision(r.sourceDecisionId!)}
                          className="text-[#0b7265] hover:underline cursor-pointer"
                        >
                          来自这次决定
                        </button>
                      )}
                    </div>
                  </div>
                  {renderSwitch(r.active, `开关 ${r.title}`, () =>
                    onToggleRuleActive(r.id, !r.active)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-label="先提醒你的规矩" className="pt-6 border-t border-[#c9d6d5] space-y-4">
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-[#0e3a3d]">先提醒你的</h2>
            <span className="text-[13px] text-[#456669] tabular-nums">
              {semanticHabits.length} 条
            </span>
          </div>
          <p className="text-[13px] text-[#456669]">靠 AI 判断，可能有看走眼的时候。</p>
        </div>

        <div className="divide-y divide-[#c9d6d5] border-t border-b border-[#c9d6d5]">
          {semanticHabits.map((r) => {
            const isDue = r.active && r.reviewAt <= todayIso;
            const scopeName =
              r.projectId === 'global'
                ? '所有项目'
                : projectMap.get(r.projectId) || r.scopeLabel;
            return (
              <div key={r.id} className="py-4 space-y-2.5">
                {isDue && (
                  <div className="px-3 py-2 rounded bg-[#fff6e0] flex flex-wrap items-center justify-between gap-2 text-[13px]">
                    <span className="text-[#8a5300] font-medium">该再看一次了</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onAckRuleReview(r.id, true)}
                        className="h-8 px-3 rounded border border-[#6f8c8b] bg-white text-xs font-medium text-[#0e3a3d] cursor-pointer"
                      >
                        还管用
                      </button>
                      <button
                        type="button"
                        onClick={() => onAckRuleReview(r.id, false)}
                        className="h-8 px-3 rounded border border-[#6f8c8b] bg-white text-xs font-medium text-[#456669] cursor-pointer"
                      >
                        停掉
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="text-[15px] leading-6 font-semibold text-[#0e3a3d]">
                      {r.title}
                    </div>
                    <p className="text-[13px] leading-5 text-[#0e3a3d]">{r.ruleText}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#456669] tabular-nums pt-0.5">
                      <span>{scopeName}</span>
                      <span>帮你省了 {r.hitCount} 次</span>
                      <span
                        className={
                          r.misappliedCount > 0 ? 'text-[#c93a1f] font-medium' : ''
                        }
                      >
                        办错过 {r.misappliedCount} 次
                      </span>
                      <span>{r.reviewAt} 再看一次</span>
                      {r.sourceDecisionId && (
                        <button
                          type="button"
                          onClick={() => jumpToDecision(r.sourceDecisionId!)}
                          className="text-[#0b7265] hover:underline cursor-pointer"
                        >
                          来自这次决定
                        </button>
                      )}
                    </div>
                  </div>
                  {renderSwitch(r.active, `开关 ${r.title}`, () =>
                    onToggleRuleActive(r.id, !r.active)
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                  <div
                    role="group"
                    aria-label={`${r.title} 处理方式`}
                    className="inline-flex rounded-md border border-[#6f8c8b] bg-white overflow-hidden self-start"
                  >
                    <button
                      type="button"
                      onClick={() => onChangeHabitMode(r.id, 'suggest_only')}
                      className={`h-8 px-3 text-xs font-medium cursor-pointer ${
                        r.executionMode === 'suggest_only'
                          ? 'bg-[#0e3a3d] text-white'
                          : 'text-[#456669] hover:text-[#0e3a3d]'
                      }`}
                    >
                      先问我
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeHabitMode(r.id, 'auto_apply_reversible')}
                      className={`h-8 px-3 text-xs font-medium border-l border-[#6f8c8b] cursor-pointer ${
                        r.executionMode === 'auto_apply_reversible'
                          ? 'bg-[#0e3a3d] text-white'
                          : 'text-[#456669] hover:text-[#0e3a3d]'
                      }`}
                    >
                      自动办
                    </button>
                  </div>
                  {r.executionMode === 'auto_apply_reversible' && (
                    <span className="text-xs text-[#456669]">只对能反悔的事自动。</span>
                  )}
                </div>

                {r.misappliedCount >= 2 && (
                  <div className="px-3 py-2 rounded bg-[#fff6e0] text-[#8a5300] text-[13px]">
                    办错两次，已改回先问你。
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 6.4 Auto-applied actions by rule (J-24..J-28) */}
      <section aria-label="系统按规矩替你办的" className="pt-6 border-t border-[#c9d6d5] space-y-4">
        <h2 className="text-base font-semibold text-[#0e3a3d]">系统按规矩替你办的</h2>
        {autoAppliedActions.length === 0 ? (
          <p className="text-[13px] text-[#456669]">还没有。</p>
        ) : (
          <div className="divide-y divide-[#c9d6d5] border-t border-b border-[#c9d6d5]">
            {autoAppliedActions.map((act) => (
              <div
                key={act.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <div className="text-[15px] leading-6 text-[#0e3a3d]">{act.threadTitle}</div>
                  <div className="text-[13px] text-[#456669] tabular-nums">
                    按规矩：{act.ruleTitle} · {formatRelativeTime(act.timestamp)}
                  </div>
                </div>
                {act.undone ? (
                  <span className="text-[13px] text-[#456669] shrink-0">已撤回</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onUndoAutoAction(act.id)}
                    className="h-9 px-3.5 rounded-md border border-[#6f8c8b] bg-white hover:bg-[#fdf1ee] text-[13px] font-medium text-[#c93a1f] whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-center"
                  >
                    撤回，这次办错了
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 6.5 Past Decisions & Lookback (J-29..J-34) */}
      <section aria-label="过往决定" className="pt-6 border-t border-[#c9d6d5] space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-[#0e3a3d]">过往决定</h2>
          <p className="text-[13px] text-[#456669]">
            当时定完后结果怎么样，可以在这里记一笔。
          </p>
        </div>

        {scopedDecisions.length === 0 ? (
          <p className="text-[13px] text-[#456669]">还没有记录。</p>
        ) : (
          <div className="divide-y divide-[#c9d6d5] border-t border-b border-[#c9d6d5]">
            {scopedDecisions.map((rec) => {
              const activeVerdict = selectedOutcomeVerdict[rec.id];
              const isHighlighted = highlightedDecisionId === rec.id;
              return (
                <div
                  key={rec.id}
                  id={`decision-${rec.id}`}
                  className={`py-4 space-y-2 fos-transition ${
                    isHighlighted ? 'bg-[#eaf6f3] px-3 -mx-3 rounded' : ''
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-[15px] leading-6 font-semibold text-[#0e3a3d]">
                      {rec.caseTitle}
                    </div>
                    <span className="text-xs text-[#456669] tabular-nums">
                      {formatRelativeTime(rec.decidedAt)}
                    </span>
                  </div>

                  <div className="text-[13px] text-[#456669]">
                    当时选：<span className="text-[#0e3a3d] font-medium">{rec.chosenOptionLabel}</span>
                    <span className="mx-2 text-[#c9d6d5]" aria-hidden="true">
                      /
                    </span>
                    <span>{rec.userRationale}</span>
                  </div>

                  {rec.outcomeCheck ? (
                    <div className="text-[13px] text-[#0e3a3d] pt-1">
                      <span
                        className={
                          rec.outcomeCheck.verdict === 'win'
                            ? 'text-[#0b7265] font-medium'
                            : rec.outcomeCheck.verdict === 'miss'
                              ? 'text-[#c93a1f] font-medium'
                              : 'text-[#456669] font-medium'
                        }
                      >
                        后来：
                        {rec.outcomeCheck.verdict === 'win'
                          ? '管用'
                          : rec.outcomeCheck.verdict === 'miss'
                            ? '不管用'
                            : '说不好'}
                        。
                      </span>{' '}
                      <span className="text-[#456669]">{rec.outcomeCheck.note}</span>
                    </div>
                  ) : (
                    <div className="pt-1 space-y-2">
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
                            onClick={() =>
                              setSelectedOutcomeVerdict((prev) => ({
                                ...prev,
                                [rec.id]: item.v,
                              }))
                            }
                            className={`h-8 px-3 rounded-md text-[13px] cursor-pointer ${
                              activeVerdict === item.v
                                ? 'border-2 border-[#0e3a3d] bg-[#f5f8f7] text-[#0e3a3d] font-semibold'
                                : 'border border-[#6f8c8b] bg-white text-[#0e3a3d] hover:bg-[#f5f8f7]'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>

                      {activeVerdict && (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            aria-label={`为 ${rec.caseTitle} 补一句说明`}
                            value={outcomeNotes[rec.id] || ''}
                            onChange={(e) =>
                              setOutcomeNotes((prev) => ({
                                ...prev,
                                [rec.id]: e.target.value,
                              }))
                            }
                            placeholder="一句话说说（可不填）"
                            className="flex-1 h-10 px-3 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              onSubmitOutcome(
                                rec.id,
                                activeVerdict,
                                outcomeNotes[rec.id] || ''
                              )
                            }
                            className="h-10 px-4 rounded-md bg-[#0e3a3d] text-sm font-semibold text-white whitespace-nowrap cursor-pointer"
                          >
                            记下
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
