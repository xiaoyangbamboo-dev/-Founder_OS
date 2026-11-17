import type {
  AutoAppliedAction,
  DecisionCase,
  DecisionOption,
  DecisionRecord,
  DigestEvent,
  FounderOsState,
  PolicyRule,
  Project,
} from '../types/founderOs.ts';
import { sortDecisionCasesByPriority } from './firewall.ts';

/**
 * Formats an ISO timestamp into relative Chinese copy (never >7 days relative).
 * - Today: 刚刚 / X 分钟前 / X 小时前
 * - Yesterday: 昨天 HH:MM
 * - 2-7 days ago: X 天前
 * - >7 days ago: M 月 D 日
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return '刚刚';

  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfNow - startOfDate) / (24 * 60 * 60 * 1000));

  if (dayDiff === 0) {
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    return `${hours} 小时前`;
  }

  if (dayDiff === 1) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `昨天 ${hh}:${mm}`;
  }

  if (dayDiff <= 7) {
    return `${dayDiff} 天前`;
  }

  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export function formatTimeClockOrRelative(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfNow - startOfDate) / (24 * 60 * 60 * 1000));

  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');

  if (dayDiff === 0) return `${hh}:${mm}`;
  if (dayDiff === 1) return `昨天 ${hh}:${mm}`;
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export function formatWaitDuration(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '刚刚';
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `等了 ${mins} 分钟`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `等了 ${hours} 小时`;
  const days = Math.floor(hours / 24);
  return `等了 ${days} 天`;
}

export function isCaseSnoozed(dCase: DecisionCase, now: Date = new Date()): boolean {
  if (!dCase.snoozedUntil) return false;
  const target = new Date(dCase.snoozedUntil).getTime();
  return !Number.isNaN(target) && target > now.getTime();
}

export function getCaseQueueWaitLabel(dCase: DecisionCase, now: Date = new Date()): string {
  if (isCaseSnoozed(dCase, now)) {
    return dCase.snoozeReasonLabel || '你说稍后再看';
  }
  if (dCase.priorityScore >= 90) {
    return '今天要定';
  }
  return formatWaitDuration(dCase.createdAt, now);
}

export function getProjectShortName(project?: Project): string {
  if (!project) return '未归类';
  if (project.shortName) return project.shortName;
  return project.name.length > 6 ? project.name.slice(0, 6) : project.name;
}

export interface PartitionedQueueCases {
  pending: DecisionCase[];
  later: DecisionCase[];
  totalPendingCount: number;
}

/**
 * Partitions open DecisionCases into:
 * - pending: up to 3 top-priority non-snoozed cases ("等你拍板")
 * - later: overflow (#4+) cases + explicitly snoozed cases ("稍后再看")
 */
export function partitionQueueCases(
  cases: DecisionCase[],
  selectedProjectId: string,
  now: Date = new Date()
): PartitionedQueueCases {
  const open = sortDecisionCasesByPriority(
    cases.filter(
      (c) =>
        c.status === 'Needs Human' &&
        (selectedProjectId === 'all' || c.projectId === selectedProjectId)
    )
  );

  const active = open.filter((c) => !isCaseSnoozed(c, now));
  const snoozed = open.filter((c) => isCaseSnoozed(c, now));

  const pending = active.slice(0, 3);
  const overflow = active.slice(3);

  return {
    pending,
    later: [...overflow, ...snoozed],
    totalPendingCount: active.length,
  };
}

/**
 * Sorts DecisionCase options per P-36:
 * Recommended option first, Irreversible options last.
 */
export function sortDecisionOptions(options: DecisionOption[]): DecisionOption[] {
  return [...options].sort((a, b) => {
    const aScore = a.recommended ? -2 : a.reversibility === 'Irreversible' ? 2 : 0;
    const bScore = b.recommended ? -2 : b.reversibility === 'Irreversible' ? 2 : 0;
    return aScore - bScore;
  });
}

/**
 * Returns default selected option ID per P-29 & P-34:
 * Recommended option is pre-selected unless it is Irreversible.
 */
export function getDefaultSelectedOptionId(options: DecisionOption[]): string {
  const sorted = sortDecisionOptions(options);
  const rec = sorted.find((o) => o.recommended && o.reversibility !== 'Irreversible');
  if (rec) return rec.id;
  const firstSafe = sorted.find((o) => o.reversibility !== 'Irreversible');
  return firstSafe ? firstSafe.id : '';
}

export interface DigestDrawerGroupData {
  passed: DigestEvent[];
  bounced: DigestEvent[];
  ruleApplied: {
    id: string;
    actionId?: string;
    digestId?: string;
    threadId: string;
    projectId?: string;
    title: string;
    ruleTitle: string;
    summary: string;
    timestamp: string;
    undone: boolean;
    markedWrong?: boolean;
    rawContent?: string;
  }[];
  totalHandledToday: number;
  bouncedCount: number;
}

export function computeDigestGroups(
  digestEvents: DigestEvent[],
  autoAppliedActions: AutoAppliedAction[],
  selectedProjectId = 'all',
  threads: { id: string; projectId: string }[] = []
): DigestDrawerGroupData {
  const threadProjectMap = new Map(threads.map((t) => [t.id, t.projectId]));
  const matchProject = (itemProjectId?: string, threadId?: string) => {
    if (selectedProjectId === 'all') return true;
    const resolved = itemProjectId || (threadId ? threadProjectMap.get(threadId) : undefined);
    return !resolved || resolved === selectedProjectId;
  };

  const passed = digestEvents.filter(
    (d) => d.eventType === 'silent_pass' && matchProject(d.projectId, d.threadId)
  );
  const bounced = digestEvents.filter(
    (d) => d.eventType === 'auto_bounced' && matchProject(d.projectId, d.threadId)
  );

  const ruleFromAuto = autoAppliedActions
    .filter((a) => matchProject(a.projectId, a.threadId))
    .map((a) => ({
      id: `auto-${a.id}`,
      actionId: a.id,
      threadId: a.threadId,
      projectId: a.projectId || threadProjectMap.get(a.threadId),
      title: a.threadTitle,
      ruleTitle: a.ruleTitle,
      summary: a.actionTaken,
      timestamp: a.timestamp,
      undone: a.undone,
      markedWrong: false,
    }));

  const ruleFromDigest = digestEvents
    .filter(
      (d) =>
        d.eventType === 'habit_auto_applied' &&
        matchProject(d.projectId, d.threadId) &&
        !ruleFromAuto.some((ra) => ra.threadId === d.threadId && ra.timestamp === d.timestamp)
    )
    .map((d) => ({
      id: `dig-${d.id}`,
      digestId: d.id,
      threadId: d.threadId,
      projectId: d.projectId || threadProjectMap.get(d.threadId),
      title: d.threadTitle,
      ruleTitle: '既定规矩',
      summary: d.summary,
      timestamp: d.timestamp,
      undone: false,
      markedWrong: d.markedWrong,
      rawContent: d.rawContent,
    }));

  const ruleApplied = [...ruleFromAuto, ...ruleFromDigest];
  const totalHandledToday = passed.length + bounced.length + ruleApplied.length;

  return {
    passed,
    bounced,
    ruleApplied,
    totalHandledToday,
    bouncedCount: bounced.length,
  };
}

export interface WeeklySummaryData {
  effectiveTotal: number;
  blockedBySystemCount: number;
  decidedByFounderCount: number;
  avgResumeSeconds: number | null;
  filteredOutOfTen: number | null;
  falseDoneCaughtCount: number | null;
  precisionAskedCount: number | null;
  precisionRightCount: number | null;
  ruleAppliedCount: number | null;
}

export function computeWeeklySummary(
  state: FounderOsState,
  now: Date = new Date()
): WeeklySummaryData {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const cutoff = now.getTime() - sevenDaysMs;

  const isThisWeek = (iso: string) => {
    const t = new Date(iso).getTime();
    return !Number.isNaN(t) && t >= cutoff;
  };

  const weeklyDigests = state.digestEvents.filter(
    (d) => isThisWeek(d.timestamp) && d.eventType !== 'blocked'
  );
  const weeklyAuto = state.autoAppliedActions.filter((a) => isThisWeek(a.timestamp));
  const weeklyDecisions = state.decisionRecords.filter((r) => isThisWeek(r.decidedAt));

  const blockedBySystemCount = weeklyDigests.length + weeklyAuto.length;
  const decidedByFounderCount = weeklyDecisions.length;
  const effectiveTotal = blockedBySystemCount + decidedByFounderCount;

  const durations = state.qualityMetrics.decisionDurationsSeconds ?? [];
  const avgResumeSeconds =
    durations.length > 0
      ? Math.round(durations.reduce((acc, s) => acc + s, 0) / durations.length)
      : null;

  const totalAttentionEvents =
    blockedBySystemCount +
    decidedByFounderCount +
    state.decisionCases.filter((c) => c.status === 'Needs Human').length;

  const filteredOutOfTen =
    totalAttentionEvents >= 5
      ? Math.min(10, Math.max(0, Math.round((blockedBySystemCount / totalAttentionEvents) * 10)))
      : null;

  const bouncedCount = weeklyDigests.filter((d) => d.eventType === 'auto_bounced').length;
  const falseDoneCaughtCount = bouncedCount > 0 || state.qualityMetrics.totalRuns > 0 ? bouncedCount : null;

  const falsePositives = state.decisionCases.filter((c) => c.markedAsFalsePositive).length;
  const precisionAskedCount = decidedByFounderCount > 0 ? decidedByFounderCount : null;
  const precisionRightCount =
    precisionAskedCount !== null ? Math.max(0, precisionAskedCount - falsePositives) : null;

  const ruleAppliedCount = weeklyAuto.length > 0 ? weeklyAuto.length : null;

  return {
    effectiveTotal,
    blockedBySystemCount,
    decidedByFounderCount,
    avgResumeSeconds,
    filteredOutOfTen,
    falseDoneCaughtCount,
    precisionAskedCount,
    precisionRightCount,
    ruleAppliedCount,
  };
}

export function getPendingReviewDecisions(
  decisionRecords: DecisionRecord[],
  selectedProjectId: string,
  now: Date = new Date()
): DecisionRecord[] {
  return decisionRecords.filter((rec) => {
    if (rec.outcomeCheck) return false;
    if (selectedProjectId !== 'all' && rec.projectId !== selectedProjectId) return false;
    if (!rec.reviewAfterAt) return false;
    const rev = new Date(rec.reviewAfterAt).getTime();
    return !Number.isNaN(rev) && rev <= now.getTime();
  });
}

export function findRelatedDecisionsAndRules(
  dCase: DecisionCase,
  decisionRecords: DecisionRecord[],
  policyRules: PolicyRule[]
): {
  relatedDecisions: DecisionRecord[];
  relatedRules: PolicyRule[];
} {
  const caseKeywords = new Set(
    `${dCase.title} ${dCase.question} ${dCase.plainSummary || ''}`
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2)
  );

  const scoredDecisions = decisionRecords
    .filter((rec) => rec.caseId !== dCase.id)
    .map((rec) => {
      let score = rec.projectId === dCase.projectId ? 2 : 0;
      const recText = `${rec.caseTitle} ${rec.chosenOptionLabel} ${rec.userRationale}`;
      for (const kw of caseKeywords) {
        if (recText.includes(kw)) score += 1;
      }
      return { rec, score };
    })
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.rec);

  const scoredRules = policyRules
    .filter((r) => r.active)
    .map((r) => {
      let score = 0;
      if (r.projectId === dCase.projectId) score += 2;
      if (r.projectId === 'global' && dCase.candidateRuleKind === r.kind) score += 1;
      const ruleText = `${r.title} ${r.ruleText}`;
      for (const kw of caseKeywords) {
        if (ruleText.includes(kw)) score += 1;
      }
      return { rule: r, score };
    })
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((item) => item.rule);

  return {
    relatedDecisions: scoredDecisions,
    relatedRules: scoredRules,
  };
}
