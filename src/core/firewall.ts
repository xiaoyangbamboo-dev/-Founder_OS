import type {
  AutoAppliedAction,
  DecisionCase,
  Evidence,
  FirewallVerdict,
  PolicyRule,
  Project,
  QualityMetrics,
  RepoVerificationTier,
  RuleConflict,
  SubmissionPayload,
  WorkThread,
} from '../types/founderOs.ts';

export interface DeterministicGatewayResult {
  violatedGuardrails: PolicyRule[];
  reasons: string[];
}

export interface L1EvaluationResult {
  passed: boolean;
  blocked: boolean;
  degradedWarning?: string;
  failures: string[];
  blockedReason?: string;
}

export interface SemanticCheckerAssessment {
  passed: boolean;
  confidence: 'high' | 'medium' | 'low';
  findings: string[];
  matchedHabitIds: string[];
  suggestedFacts: { text: string; source: string }[];
  suggestedUnknowns: string[];
  devilNote: string;
}

export interface FirewallOutcome {
  verdict: FirewallVerdict;
  nextStatus: WorkThread['status'];
  nextBounceCount: number;
  enforcementLayer: DecisionCase['enforcementLayer'];
  triggerType?: DecisionCase['triggerType'];
  degradedWarning?: string;
  reasons: string[];
  violatedGuardrails: PolicyRule[];
  autoAppliedHabit?: PolicyRule;
}

/**
 * Priority sorting for Decision Inbox:
 * Strictly sorts by priorityScore (delay cost × irreversibility), never by raw timestamp.
 */
export function sortDecisionCasesByPriority(cases: DecisionCase[]): DecisionCase[] {
  return [...cases].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'Needs Human' ? -1 : 1;
    }
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

/**
 * Layer A: Deterministic Policy Gateway (100% code-enforced via Harness Hook / Git Merge Gate).
 * Checks ONLY deterministic signals: file paths, shell commands, banned package/diff literals,
 * spend thresholds, and external irreversible flags.
 * Completely immune to prompt injection in agent claims.
 * Note: Semantic conflicts (architecture drift, strategy conflicts) are NOT handled here—they go to Layer B.
 */
export function evaluateDeterministicGateway(
  submission: SubmissionPayload,
  projectId: string,
  rules: PolicyRule[]
): DeterministicGatewayResult {
  const activeGuardrails = rules.filter(
    (r) =>
      r.active &&
      r.kind === 'deterministic_guardrail' &&
      (r.projectId === 'global' || r.projectId === projectId)
  );

  const violatedGuardrails: PolicyRule[] = [];
  const reasons: string[] = [];

  const normalizedDiff = submission.diffSnippet.toLowerCase();
  const normalizedFiles = submission.changedFiles.map((f) => f.toLowerCase());
  const normalizedCmds = (submission.shellCommandsAttempted ?? []).map((c) => c.toLowerCase());

  for (const rule of activeGuardrails) {
    const m = rule.matcher;
    if (!m) continue;

    let hit = false;

    if (m.protectedPaths && m.protectedPaths.length > 0) {
      const hitFiles = normalizedFiles.filter((file) =>
        m.protectedPaths!.some((p) => file.includes(p.toLowerCase()))
      );
      if (hitFiles.length > 0) {
        hit = true;
        reasons.push(`确定性网关「${rule.title}」拦截受保护路径：${hitFiles.join(', ')}`);
      }
    }

    if (m.bannedCommands && m.bannedCommands.length > 0 && normalizedCmds.length > 0) {
      const hitCmds = normalizedCmds.filter((cmd) =>
        m.bannedCommands!.some((b) => cmd.includes(b.toLowerCase()))
      );
      if (hitCmds.length > 0) {
        hit = true;
        reasons.push(`Harness Hook「${rule.title}」阻断高危命令：${hitCmds.join(', ')}`);
      }
    }

    if (m.bannedKeywords && m.bannedKeywords.length > 0) {
      const hitKw = m.bannedKeywords.filter((kw) => normalizedDiff.includes(kw.toLowerCase()));
      if (hitKw.length > 0) {
        hit = true;
        reasons.push(`确定性网关「${rule.title}」命中禁用依赖/字面量：${hitKw.join(', ')}`);
      }
    }

    if (
      typeof m.maxSpendUsd === 'number' &&
      typeof submission.estimatedSpendUsd === 'number' &&
      submission.estimatedSpendUsd > m.maxSpendUsd
    ) {
      hit = true;
      reasons.push(
        `预算熔断「${rule.title}」：本次核验/执行预估花费 $${submission.estimatedSpendUsd.toFixed(2)} 超出上限 $${m.maxSpendUsd.toFixed(2)}`
      );
    }

    if (m.blockExternalSend && submission.externalActionRequested) {
      hit = true;
      reasons.push(`确定性网关「${rule.title}」拦截未经授权的对外发送/不可逆外部调用`);
    }

    if (hit) {
      violatedGuardrails.push(rule);
    }
  }

  return { violatedGuardrails, reasons };
}

/**
 * Objective L1 Evidence Evaluation with explicit degradation for repos without tests:
 * - tier_full: Enforces test exit code + build exit code + browser errors
 * - tier_build_only: Enforces build/typecheck exit code + emits honest warning that functional tests are absent
 * - tier_diff_only: Diff & static scan only; emits clear degradation warning
 */
export function evaluateL1Evidence(
  verificationTier: RepoVerificationTier,
  submission: SubmissionPayload,
  evidences: Evidence[]
): L1EvaluationResult {
  if (submission.environmentBlockedReason && submission.environmentBlockedReason.trim().length > 0) {
    return {
      passed: false,
      blocked: true,
      failures: [submission.environmentBlockedReason.trim()],
      blockedReason: submission.environmentBlockedReason.trim(),
    };
  }

  const failures: string[] = [];
  let degradedWarning: string | undefined;

  if (verificationTier === 'tier_full') {
    if (typeof submission.buildExitCode === 'number' && submission.buildExitCode !== 0) {
      failures.push(`编译/类型检查返回非零退出码 (exit ${submission.buildExitCode})`);
    }
    if (typeof submission.testExitCode === 'number' && submission.testExitCode !== 0) {
      failures.push(`自动化测试套件返回非零退出码 (exit ${submission.testExitCode})`);
    }
    if (submission.browserErrors && submission.browserErrors.length > 0) {
      failures.push(`无头浏览器捕获运行时错误：${submission.browserErrors.join(' | ')}`);
    }
  } else if (verificationTier === 'tier_build_only') {
    degradedWarning =
      '降级提醒：当前仓库未配置自动化测试，仅完成构建/类型检查与 Diff 扫描，功能回归无法确定性担保。';
    if (typeof submission.buildExitCode === 'number' && submission.buildExitCode !== 0) {
      failures.push(`编译/类型检查返回非零退出码 (exit ${submission.buildExitCode})`);
    }
    if (submission.browserErrors && submission.browserErrors.length > 0) {
      failures.push(`无头浏览器捕获运行时错误：${submission.browserErrors.join(' | ')}`);
    }
  } else {
    degradedWarning =
      '降级提醒：当前仓库无本地测试与构建命令（Diff-Only 模式），仅依赖静态路径检查与概率性语义核验。';
  }

  for (const ev of evidences) {
    if (ev.passed === false) {
      failures.push(`客观证据「${ev.title}」未通过：${ev.summary}`);
    }
  }

  return {
    passed: failures.length === 0,
    blocked: false,
    degradedWarning,
    failures,
  };
}

/**
 * Evaluates whether a Semantic Habit is safe to auto-apply without disturbing the founder.
 * Safety guards:
 * 1. Only habits in 'auto_apply_reversible' mode qualify.
 * 2. Must not have excessive misapplications (if misappliedCount >= 2, auto-apply is suspended).
 * 3. Only applies to reversible, non-external-action submissions with high checker confidence.
 */
export function findSafeAutoApplicableHabit(
  habits: PolicyRule[],
  matchedHabitIds: string[],
  submission: SubmissionPayload,
  checkerConfidence: SemanticCheckerAssessment['confidence']
): PolicyRule | undefined {
  if (submission.externalActionRequested || checkerConfidence !== 'high') {
    return undefined;
  }

  return habits.find(
    (h) =>
      h.active &&
      h.kind === 'semantic_habit' &&
      h.executionMode === 'auto_apply_reversible' &&
      h.misappliedCount < 2 &&
      matchedHabitIds.includes(h.id)
  );
}

/**
 * Full Firewall Router:
 * Combines Objective L1 + Deterministic Policy Gateway + Probabilistic Semantic Checker + Safe Habit Auto-Apply.
 */
export function routeSubmissionThroughFirewall(params: {
  project: Project;
  thread: WorkThread;
  submission: SubmissionPayload;
  evidences: Evidence[];
  rules: PolicyRule[];
  checkerAssessment: SemanticCheckerAssessment;
}): FirewallOutcome {
  const { project, thread, submission, evidences, rules, checkerAssessment } = params;

  // 0. Check Verification Budget Cap first (honest cost ceiling)
  const projectedTotal = thread.verificationSpendUsd + (submission.estimatedSpendUsd ?? 0.04);
  if (projectedTotal > project.verificationBudgetCapUsd) {
    return {
      verdict: 'blocked',
      nextStatus: 'Blocked',
      nextBounceCount: thread.bounceCount,
      enforcementLayer: 'deterministic_gateway',
      reasons: [
        `线程累计核验推理费用 ($${projectedTotal.toFixed(2)}) 超出项目预算上限 ($${project.verificationBudgetCapUsd.toFixed(2)})，已熔断暂停`,
      ],
      violatedGuardrails: [],
    };
  }

  // 1. L1 Objective Evidence Check (with honest degradation when repo lacks tests)
  const l1 = evaluateL1Evidence(project.verificationTier, submission, evidences);
  if (l1.blocked) {
    return {
      verdict: 'blocked',
      nextStatus: 'Blocked',
      nextBounceCount: thread.bounceCount,
      enforcementLayer: 'l1_degradation',
      reasons: l1.failures,
      violatedGuardrails: [],
    };
  }

  // 2. Layer A: Deterministic Policy Gateway (immune to prompt injection)
  const gateway = evaluateDeterministicGateway(submission, project.id, rules);
  if (gateway.violatedGuardrails.length > 0) {
    return {
      verdict: 'escalate',
      nextStatus: 'Needs You',
      nextBounceCount: thread.bounceCount,
      enforcementLayer: 'deterministic_gateway',
      triggerType: 'hard_guardrail',
      degradedWarning: l1.degradedWarning,
      reasons: gateway.reasons,
      violatedGuardrails: gateway.violatedGuardrails,
    };
  }

  // 3. L1 Objective Failures -> Auto-Bounce up to maxBounces (does not disturb founder)
  if (l1.failures.length > 0) {
    const nextBounceCount = thread.bounceCount + 1;
    if (nextBounceCount <= thread.maxBounces) {
      return {
        verdict: 'auto_bounce',
        nextStatus: 'Auto-Fixing',
        nextBounceCount,
        enforcementLayer: 'l1_degradation',
        degradedWarning: l1.degradedWarning,
        reasons: l1.failures,
        violatedGuardrails: [],
      };
    }

    return {
      verdict: 'escalate',
      nextStatus: 'Needs You',
      nextBounceCount,
      enforcementLayer: 'l1_degradation',
      triggerType: 'bounce_limit',
      degradedWarning: l1.degradedWarning,
      reasons: [
        `L1 客观检查连续 ${nextBounceCount} 次未收敛，停止后台空转并升级请创始人处理`,
        ...l1.failures,
      ],
      violatedGuardrails: [],
    };
  }

  // 4. Layer B: Probabilistic Semantic Checker (explicitly fallible)
  if (!checkerAssessment.passed) {
    // Check if a verified reversible semantic habit allows safe auto-application instead of disturbing founder
    const projectHabits = rules.filter(
      (r) => r.projectId === 'global' || r.projectId === project.id
    );
    const safeHabit = findSafeAutoApplicableHabit(
      projectHabits,
      checkerAssessment.matchedHabitIds,
      submission,
      checkerAssessment.confidence
    );

    if (safeHabit) {
      return {
        verdict: 'pass',
        nextStatus: 'Quiet',
        nextBounceCount: thread.bounceCount,
        enforcementLayer: 'probabilistic_checker',
        degradedWarning: l1.degradedWarning,
        reasons: [
          `语义核验命中高置信度可逆习惯「${safeHabit.title}」，已自动沿用放行（支持随时一键撤销）`,
        ],
        violatedGuardrails: [],
        autoAppliedHabit: safeHabit,
      };
    }

    return {
      verdict: 'escalate',
      nextStatus: 'Needs You',
      nextBounceCount: thread.bounceCount,
      enforcementLayer: 'probabilistic_checker',
      triggerType: 'semantic_conflict',
      degradedWarning: l1.degradedWarning,
      reasons: checkerAssessment.findings,
      violatedGuardrails: [],
    };
  }

  return {
    verdict: 'pass',
    nextStatus: 'Quiet',
    nextBounceCount: thread.bounceCount,
    enforcementLayer:
      project.verificationTier === 'tier_full' ? 'probabilistic_checker' : 'l1_degradation',
    degradedWarning: l1.degradedWarning,
    reasons: [
      l1.degradedWarning
        ? `静态检查与语义核验通过（${l1.degradedWarning}）`
        : 'L1 客观测试与 L2 语义核验均已通过，未触及护栏红线',
    ],
    violatedGuardrails: [],
  };
}

/**
 * Computes non-inverted Cockpit health metrics:
 * - quietSuccessRate: Progress achieved without interrupting human and without escaped defects
 * - falseNegativeRate: Escaped defects reported by founder / total verified runs
 * - falsePositiveRate: Mis-bounced or unnecessary escalations / total bounces & escalations
 */
export function computeHealthRates(
  metrics: QualityMetrics,
  autoAppliedActions: AutoAppliedAction[]
) {
  const total = Math.max(metrics.totalRuns, 1);
  const quietSuccessRate = Math.round((metrics.quietSuccessCount / total) * 100);
  const falseNegativeRate = Math.round((metrics.escapedDefectsCount / total) * 100);
  const denomBounce = Math.max(metrics.totalBouncesAndEscalations, 1);
  const falsePositiveRate = Math.round((metrics.falseBounceCount / denomBounce) * 100);
  const habitUndoCount = autoAppliedActions.filter((a) => a.undone).length;

  return {
    quietSuccessRate,
    falseNegativeRate,
    falsePositiveRate,
    habitUndoCount,
  };
}

/**
 * Rule Conflict Detector:
 * Detects opposing commitments between a candidate rule and active rules in the same scope.
 */
export function detectRuleConflicts(
  candidate: {
    projectId: string | 'global';
    ruleText: string;
    title: string;
    matcher?: PolicyRule['matcher'];
  },
  existingRules: PolicyRule[]
): RuleConflict[] {
  const conflicts: RuleConflict[] = [];
  const candidateLower = `${candidate.title} ${candidate.ruleText}`.toLowerCase();

  const sameScopeActive = existingRules.filter(
    (r) =>
      r.active &&
      (r.projectId === 'global' ||
        candidate.projectId === 'global' ||
        r.projectId === candidate.projectId)
  );

  const tensionPairs: [string[], string[], string][] = [
    [
      ['不接定制', '拒绝定制', '优先核心', '不引入', '零依赖', '禁止引入'],
      ['接受定制', '允许定制', '引入 redis', '引入外部', '接入企业'],
      '在“保护核心节奏 / 极简依赖”与“扩展定制 / 引入重型组件”之间存在策略冲突',
    ],
    [
      ['禁止自动', '人工确认', '必须审批', '拦截'],
      ['自动合并', '自动放行', '免审', '无需确认'],
      '在“人工前置把关”与“自动放行策略”之间存在授权冲突',
    ],
    [
      ['低价', '免费层', '降价'],
      ['高客单', '涨价', '取消免费'],
      '在产品定价与商业化方向上存在冲突',
    ],
  ];

  for (const existing of sameScopeActive) {
    const existingLower = `${existing.title} ${existing.ruleText}`.toLowerCase();

    for (const [sideA, sideB, explanation] of tensionPairs) {
      const candA = sideA.some((k) => candidateLower.includes(k));
      const candB = sideB.some((k) => candidateLower.includes(k));
      const existA = sideA.some((k) => existingLower.includes(k));
      const existB = sideB.some((k) => existingLower.includes(k));

      if ((candA && existB) || (candB && existA)) {
        conflicts.push({
          conflictingRuleId: existing.id,
          conflictingRuleTitle: existing.title,
          reason: `${explanation}（现有规则：${existing.ruleText}）`,
        });
      }
    }

    if (
      candidate.matcher?.requireTestsPass === false &&
      existing.matcher?.requireTestsPass === true
    ) {
      conflicts.push({
        conflictingRuleId: existing.id,
        conflictingRuleTitle: existing.title,
        reason: `新规则试图跳过测试门禁，与现有确定性硬护栏「${existing.title}」直接冲突`,
      });
    }
  }

  return conflicts;
}
