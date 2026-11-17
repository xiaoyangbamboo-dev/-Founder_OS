import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Shield,
  Sparkles,
} from 'lucide-react';
import type {
  AutoAppliedAction,
  DecisionRecord,
  PolicyRule,
  Project,
  RuleConflict,
} from '../types/founderOs';

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

export function JudgmentMemoryView({
  projects,
  selectedProjectId,
  policyRules,
  decisionRecords,
  autoAppliedActions,
  onCompileRule,
  onSaveCompiledRule,
  onToggleRuleActive,
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
  const [replaceConflicting, setReplaceConflicting] = useState(false);
  const [savingRule, setSavingRule] = useState(false);

  const [outcomeNotes, setOutcomeNotes] = useState<Record<string, string>>({});

  async function handleCompile(e: React.FormEvent) {
    e.preventDefault();
    if (!naturalText.trim()) return;
    setCompileError(null);
    setCompiling(true);
    try {
      const res = await onCompileRule(naturalText.trim(), scopeProjectId);
      setDraftResult(res);
      setReplaceConflicting(false);
    } catch (err: unknown) {
      setCompileError((err as Error).message);
    } finally {
      setCompiling(false);
    }
  }

  async function handleConfirmSaveDraft() {
    if (!draftResult) return;
    setSavingRule(true);
    try {
      const c = draftResult.compiled;
      await onSaveCompiledRule({
        projectId: scopeProjectId,
        kind: c.kind,
        executionMode: c.executionMode,
        title: c.title,
        ruleText: c.ruleText,
        scopeLabel: c.scopeLabel,
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
        deactivateConflictingRuleIds: replaceConflicting
          ? draftResult.conflicts.map((x) => x.conflictingRuleId)
          : [],
      });
      setDraftResult(null);
      setNaturalText('');
    } finally {
      setSavingRule(false);
    }
  }

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

  return (
    <div className="space-y-6">
      {/* 1. Quick Correction-to-Policy Compiler */}
      <section
        aria-label="纠偏即规则编译器"
        className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
      >
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            随时纠偏立规（Correction-to-Policy 编译器）
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            输入一句吐槽或原则，AI 自动区分“代码确定性硬护栏（Hook 拦截）”与“语义判断习惯”，并强制检测与历史规则是否冲突
          </p>
        </div>

        <form onSubmit={handleCompile} className="flex flex-col sm:flex-row gap-3">
          <select
            aria-label="规则适用作用域"
            value={scopeProjectId}
            onChange={(e) => setScopeProjectId(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900 shrink-0"
          >
            <option value="global">全局策略 (Global)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            aria-label="输入自然语言纠偏或约束"
            value={naturalText}
            onChange={(e) => setNaturalText(e.target.value)}
            placeholder="例如：禁止修改 migrations/ 目录且不许接任何大客户定制开发，优先核心产品上线"
            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-md text-slate-900"
          />

          <button
            type="submit"
            disabled={compiling || !naturalText.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-md whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{compiling ? '编译检测中...' : '编译并检测冲突'}</span>
          </button>
        </form>

        {compileError && (
          <div role="alert" className="px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
            {compileError}
          </div>
        )}

        {draftResult && (
          <div className="border border-blue-200 bg-blue-50/40 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-900">
                编译结果预览：{draftResult.compiled.title}
              </div>
              <span className="text-xs font-mono text-slate-600">
                {draftResult.compiled.kind === 'deterministic_guardrail'
                  ? '确定性硬护栏 (Hook 强拦截)'
                  : `语义习惯 (${draftResult.compiled.executionMode})`}
              </span>
            </div>

            <p className="text-sm text-slate-800">{draftResult.compiled.ruleText}</p>

            {draftResult.compiled.protectedPaths.length > 0 && (
              <p className="text-xs font-mono text-slate-600">
                受保护路径：{draftResult.compiled.protectedPaths.join(', ')}
              </p>
            )}
            {draftResult.compiled.bannedKeywords.length > 0 && (
              <p className="text-xs font-mono text-slate-600">
                禁用关键词/依赖：{draftResult.compiled.bannedKeywords.join(', ')}
              </p>
            )}

            {draftResult.conflicts.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                  <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>检测到与现行策略存在冲突（禁止静默覆盖）</span>
                </div>
                {draftResult.conflicts.map((cf) => (
                  <p key={cf.conflictingRuleId} className="text-xs text-amber-800">
                    • 与「{cf.conflictingRuleTitle}」冲突：{cf.reason}
                  </p>
                ))}
                <label className="inline-flex items-center gap-2 text-xs text-amber-900 pt-1">
                  <input
                    type="checkbox"
                    checked={replaceConflicting}
                    onChange={(e) => setReplaceConflicting(e.target.checked)}
                    className="rounded border-amber-400"
                  />
                  <span>确认废止上述冲突旧规则，由新规则接管</span>
                </label>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDraftResult(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white rounded"
              >
                放弃草案
              </button>
              <button
                type="button"
                disabled={savingRule}
                onClick={handleConfirmSaveDraft}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md"
              >
                {savingRule ? '写入中...' : '确认写入规则库'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 2. Hard Guardrails (Deterministic) & Semantic Habits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section aria-label="确定性硬护栏列表" className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-slate-700" aria-hidden="true" />
              <span>确定性硬护栏（代码/Hook 100% 拦截）</span>
            </h3>
            <span className="text-xs text-slate-500 tabular-nums">{deterministicRules.length} 条</span>
          </div>

          <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
            {deterministicRules.map((r) => (
              <div key={r.id} className="p-3.5 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">{r.title}</div>
                    <p className="text-xs text-slate-600 mt-0.5">{r.ruleText}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleRuleActive(r.id, !r.active)}
                    className={`px-2.5 py-1 text-xs font-medium rounded border whitespace-nowrap shrink-0 ${
                      r.active
                        ? 'text-emerald-700 border-emerald-200 bg-emerald-50'
                        : 'text-slate-500 border-slate-200 bg-slate-50'
                    }`}
                  >
                    {r.active ? '生效中' : '已停用'}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                  <span>{r.scopeLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>已拦截 {r.hitCount} 次</span>
                  <span aria-hidden="true">·</span>
                  <span>复核日期 {r.reviewAt}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-label="语义判断习惯列表" className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              语义判断习惯（Checker 核验 · 错用 ≥2 次自动降级）
            </h3>
            <span className="text-xs text-slate-500 tabular-nums">{semanticHabits.length} 条</span>
          </div>

          <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
            {semanticHabits.map((r) => (
              <div key={r.id} className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">{r.title}</div>
                    <p className="text-xs text-slate-600 mt-0.5">{r.ruleText}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleRuleActive(r.id, !r.active)}
                    className={`px-2.5 py-1 text-xs font-medium rounded border whitespace-nowrap shrink-0 ${
                      r.active
                        ? 'text-emerald-700 border-emerald-200 bg-emerald-50'
                        : 'text-slate-500 border-slate-200 bg-slate-50'
                    }`}
                  >
                    {r.active ? '生效中' : '已停用'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="text-slate-500 tabular-nums">
                    <span>命中 {r.hitCount} 次</span>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span className={r.misappliedCount > 0 ? 'text-red-700 font-medium' : ''}>
                      误用/撤销 {r.misappliedCount} 次
                    </span>
                  </div>

                  <select
                    aria-label={`${r.title} 执行策略`}
                    value={r.executionMode}
                    onChange={(e) =>
                      onChangeHabitMode(
                        r.id,
                        e.target.value as 'suggest_only' | 'auto_apply_reversible'
                      )
                    }
                    className="px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800"
                  >
                    <option value="suggest_only">仅提示 / 升级确认</option>
                    <option value="auto_apply_reversible">可逆场景自动沿用</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 3. Auto-Applied Reversible Actions (Undoable) */}
      <section aria-label="习惯自动执行可撤销日志" className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">
          习惯自动放行审计（随时可 1 键撤销并计入误用率）
        </h3>
        {autoAppliedActions.length === 0 ? (
          <p className="text-xs text-slate-500">暂无自动放行动作</p>
        ) : (
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
            {autoAppliedActions.map((act) => (
              <div
                key={act.id}
                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="font-medium text-slate-900">
                    {act.threadTitle} · 沿用「{act.ruleTitle}」
                  </div>
                  <div className="text-slate-600">{act.actionTaken}</div>
                </div>
                {act.undone ? (
                  <span className="text-slate-400 font-medium whitespace-nowrap">已撤销并降级</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onUndoAutoAction(act.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 border border-red-200 rounded-md whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" aria-hidden="true" />
                    <span>撤销并计为误用</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. Decision Ledger & L3/L4 Outcome Check */}
      <section aria-label="历史决策账本与结果复盘" className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            历史决策账本与事后真实结果验证（L3/L4 Outcome Check）
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            任务跑完不等于商业目标达成，在此标记历史决策事后真实效果
          </p>
        </div>

        <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
          {scopedDecisions.map((rec) => (
            <div key={rec.id} className="p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-slate-900">{rec.caseTitle}</div>
                <span className="text-xs font-mono text-slate-500">
                  {new Date(rec.decidedAt).toLocaleDateString()}
                </span>
              </div>
              <div className="text-xs text-slate-700">
                拍板选择：<span className="font-semibold">{rec.chosenOptionLabel}</span>
                <span className="mx-2 text-slate-300">·</span>
                <span>理由：{rec.userRationale}</span>
              </div>

              {rec.outcomeCheck ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  <span>
                    事后复盘：{rec.outcomeCheck.verdict.toUpperCase()} — {rec.outcomeCheck.note}
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="text"
                    aria-label={`为决策 ${rec.caseTitle} 填写事后结果`}
                    value={outcomeNotes[rec.id] || ''}
                    onChange={(e) =>
                      setOutcomeNotes((prev) => ({ ...prev, [rec.id]: e.target.value }))
                    }
                    placeholder="填写几日后的真实业务/系统结果反馈..."
                    className="flex-1 min-w-[220px] px-3 py-1.5 text-xs border border-slate-300 rounded-md text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => onSubmitOutcome(rec.id, 'win', outcomeNotes[rec.id] || '')}
                    className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md whitespace-nowrap"
                  >
                    符合预期 (Win)
                  </button>
                  <button
                    type="button"
                    onClick={() => onSubmitOutcome(rec.id, 'miss', outcomeNotes[rec.id] || '')}
                    className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md whitespace-nowrap"
                  >
                    未达预期 (Miss)
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
