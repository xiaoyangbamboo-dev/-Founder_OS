import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import type {
  AgentChannel,
  FounderOsState,
  SubmissionPayload,
} from './types/founderOs';
import {
  computeDigestGroups,
  computeWeeklySummary,
  findRelatedDecisionsAndRules,
  getPendingReviewDecisions,
  partitionQueueCases,
} from './core/formatters';
import { TopBar } from './components/TopBar';
import { SummaryBar } from './components/SummaryBar';
import { QueueSidebar, type QueueSelection } from './components/QueueSidebar';
import { DecisionSheet } from './components/DecisionSheet';
import { ReferenceSidebar } from './components/ReferenceSidebar';
import { RunningItemView } from './components/RunningItemView';
import { LookbackView } from './components/LookbackView';
import { JudgmentMemoryView } from './components/JudgmentMemoryView';
import { ConnectionsModal } from './components/ConnectionsModal';
import { PasteReplyModal } from './components/PasteReplyModal';
import { NewItemModal } from './components/NewItemModal';
import { DigestDrawer } from './components/DigestDrawer';
import { WeeklySummaryDrawer } from './components/WeeklySummaryDrawer';
import { DemoDrawer } from './components/DemoDrawer';

type ToastData = {
  id: number;
  kind: 'success' | 'error';
  message: string;
  undoPayload?: { caseId: string; decisionRecordId?: string };
  saveRuleDecisionId?: string;
  retryFn?: () => void;
};

const CLEAN_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230e3a3d'/%3E%3Ccircle cx='16' cy='16' r='6' fill='%23ffffff'/%3E%3C/svg%3E";
const ALERT_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230e3a3d'/%3E%3Ccircle cx='16' cy='16' r='6' fill='%23ffffff'/%3E%3Ccircle cx='25' cy='7' r='5' fill='%23ff5a3c'/%3E%3C/svg%3E";

function readInitialDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const demoParam = params.get('demo');
  if (demoParam === '1') {
    try {
      localStorage.setItem('fos_demo_mode', '1');
    } catch {
      // ignore storage errors
    }
    return true;
  }
  if (demoParam === '0') {
    try {
      localStorage.removeItem('fos_demo_mode');
    } catch {
      // ignore storage errors
    }
    return false;
  }
  try {
    return localStorage.getItem('fos_demo_mode') === '1';
  } catch {
    return false;
  }
}

export default function App() {
  const [state, setState] = useState<FounderOsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState<string | null>(null);

  const [activePage, setActivePage] = useState<'home' | 'rules'>('home');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selection, setSelection] = useState<QueueSelection | null>(null);

  const [tabletQueueOpen, setTabletQueueOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [pasteReplyOpen, setPasteReplyOpen] = useState(false);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [demoMode] = useState<boolean>(() => readInitialDemoMode());
  const [demoOpen, setDemoOpen] = useState(false);

  const [freshCaseIds, setFreshCaseIds] = useState<string[]>([]);
  const [toast, setToast] = useState<ToastData | null>(null);

  const mainScrollRef = useRef<HTMLElement | null>(null);
  const knownCaseIdsRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((next: Omit<ToastData, 'id'>) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const id = Date.now();
    setToast({ id, ...next });
    toastTimerRef.current = setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, 6000);
  }, []);

  const flashNewCase = useCallback((caseId: string) => {
    setFreshCaseIds((prev) => (prev.includes(caseId) ? prev : [...prev, caseId]));
    setTimeout(() => {
      setFreshCaseIds((prev) => prev.filter((id) => id !== caseId));
    }, 1200);
  }, []);

  const refreshState = useCallback(
    async (options?: { isInitial?: boolean; preferredSelection?: QueueSelection }) => {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) {
          throw new Error('没连上，数据可能不是最新的。');
        }
        const data = (await res.json()) as FounderOsState;

        // Detect newly arrived urgent cases for subtle flash + optional permitted Notification (X-06, X-07)
        if (!options?.isInitial && knownCaseIdsRef.current.size > 0) {
          for (const c of data.decisionCases) {
            if (c.status === 'Needs Human' && !knownCaseIdsRef.current.has(c.id)) {
              flashNewCase(c.id);
              if (
                c.priorityScore >= 90 &&
                typeof window !== 'undefined' &&
                'Notification' in window &&
                Notification.permission === 'granted'
              ) {
                try {
                  new Notification(c.title, { body: c.costOfDelay });
                } catch {
                  // ignore notification failure
                }
              }
            }
          }
        }
        knownCaseIdsRef.current = new Set(data.decisionCases.map((c) => c.id));

        setState(data);
        setNetworkError(null);
        if (options?.preferredSelection) {
          setSelection(options.preferredSelection);
        }
      } catch (err: unknown) {
        setNetworkError((err as Error).message || '没连上，数据可能不是最新的。');
      } finally {
        setLoading(false);
      }
    },
    [flashNewCase]
  );

  useEffect(() => {
    refreshState({ isInitial: true });
  }, [refreshState]);

  // Derived Queue & Counts
  const queueData = useMemo(() => {
    if (!state) {
      return {
        pendingCases: [],
        laterCases: [],
        totalPendingCount: 0,
        pendingReviews: [],
        runningThreads: [],
        pendingCountByProject: {} as Record<string, number>,
        totalPendingAll: 0,
      };
    }

    const allPartition = partitionQueueCases(state.decisionCases, 'all');
    const pendingCountByProject: Record<string, number> = {};
    for (const p of state.projects) {
      pendingCountByProject[p.id] = partitionQueueCases(state.decisionCases, p.id).totalPendingCount;
    }

    const scopedPartition = partitionQueueCases(state.decisionCases, selectedProjectId);
    const pendingReviews = getPendingReviewDecisions(state.decisionRecords, selectedProjectId);

    const openCaseThreadIds = new Set(
      state.decisionCases.filter((c) => c.status === 'Needs Human').map((c) => c.threadId)
    );
    const runningThreads = state.threads.filter(
      (t) =>
        (selectedProjectId === 'all' || t.projectId === selectedProjectId) &&
        !openCaseThreadIds.has(t.id)
    );

    return {
      pendingCases: scopedPartition.pending,
      laterCases: scopedPartition.later,
      totalPendingCount: scopedPartition.totalPendingCount,
      pendingReviews,
      runningThreads,
      pendingCountByProject,
      totalPendingAll: allPartition.totalPendingCount,
    };
  }, [state, selectedProjectId]);

  // Synchronous selection resolution so initial load and state changes never flash empty state
  const resolvedSelection = useMemo<QueueSelection | null>(() => {
    if (!state) return null;
    if (selection) {
      if (selection.kind === 'case') {
        const found = state.decisionCases.find(
          (c) => c.id === selection.id && c.status === 'Needs Human'
        );
        if (found && (selectedProjectId === 'all' || found.projectId === selectedProjectId)) {
          return selection;
        }
      } else if (selection.kind === 'thread') {
        const found = state.threads.find((t) => t.id === selection.id);
        if (found && (selectedProjectId === 'all' || found.projectId === selectedProjectId)) {
          return selection;
        }
      } else if (selection.kind === 'lookback') {
        if (queueData.pendingReviews.some((r) => r.id === selection.id)) {
          return selection;
        }
      }
    }

    if (queueData.pendingCases[0]) {
      return { kind: 'case', id: queueData.pendingCases[0].id };
    }
    if (queueData.laterCases[0]) {
      return { kind: 'case', id: queueData.laterCases[0].id };
    }
    if (queueData.pendingReviews[0]) {
      return { kind: 'lookback', id: queueData.pendingReviews[0].id };
    }
    return null;
  }, [state, selection, selectedProjectId, queueData]);

  // T-09 & T-10: Browser Tab Title & Favicon Alert Dot
  useEffect(() => {
    const count = queueData.totalPendingAll;
    document.title = count > 0 ? `${count} 件等你拍板 · Founder OS` : 'Founder OS';
    const link = document.getElementById('app-favicon') as HTMLLinkElement | null;
    if (link) {
      link.href = count > 0 ? ALERT_FAVICON : CLEAN_FAVICON;
    }
  }, [queueData.totalPendingAll]);

  // Scroll workspace top on selection/page change
  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0 });
  }, [activePage, resolvedSelection?.kind, resolvedSelection?.id, selectedProjectId]);

  const digestGroups = useMemo(() => {
    if (!state) {
      return computeDigestGroups([], [], 'all', []);
    }
    return computeDigestGroups(
      state.digestEvents,
      state.autoAppliedActions,
      selectedProjectId,
      state.threads
    );
  }, [state, selectedProjectId]);

  const weeklySummary = useMemo(() => {
    if (!state) {
      return {
        effectiveTotal: 0,
        blockedBySystemCount: 0,
        decidedByFounderCount: 0,
        avgResumeSeconds: null,
        filteredOutOfTen: null,
        falseDoneCaughtCount: null,
        precisionAskedCount: null,
        precisionRightCount: null,
        ruleAppliedCount: null,
      };
    }
    return computeWeeklySummary(state);
  }, [state]);

  // Active item lookup
  const activeCase =
    resolvedSelection?.kind === 'case'
      ? state?.decisionCases.find((c) => c.id === resolvedSelection.id && c.status === 'Needs Human')
      : undefined;
  const activeThread =
    resolvedSelection?.kind === 'thread'
      ? state?.threads.find((t) => t.id === resolvedSelection.id)
      : activeCase
        ? state?.threads.find((t) => t.id === activeCase.threadId)
        : undefined;
  const activeLookback =
    resolvedSelection?.kind === 'lookback'
      ? state?.decisionRecords.find((r) => r.id === resolvedSelection.id)
      : undefined;

  const activeProject = state?.projects.find(
    (p) => p.id === (activeCase?.projectId || activeThread?.projectId || activeLookback?.projectId)
  );

  const referenceData = useMemo(() => {
    if (!state || !activeCase) {
      return { relatedDecisions: [], relatedRules: [] };
    }
    return findRelatedDecisionsAndRules(activeCase, state.decisionRecords, state.policyRules);
  }, [state, activeCase]);

  // Action Handlers with X-03 error toast + retry
  async function handleDecideCase(
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
  ) {
    const targetCase = state?.decisionCases.find((c) => c.id === caseId);
    const chosenOpt = targetCase?.options.find((o) => o.id === payload.chosenOptionId);
    try {
      const res = await fetch(`/api/cases/${caseId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '提交没成功');

      await refreshState();
      setMobileDetailOpen(false);

      const decisionRecordId = data.decisionRecord?.id as string | undefined;
      const canUndo = chosenOpt?.reversibility !== 'Irreversible';
      showToast({
        kind: 'success',
        message: `已按「${chosenOpt?.label || '你的决定'}」办。`,
        undoPayload: canUndo ? { caseId, decisionRecordId } : undefined,
        saveRuleDecisionId:
          !payload.saveAsRule && payload.dismissMode !== 'always' ? decisionRecordId : undefined,
      });
    } catch (err: unknown) {
      showToast({
        kind: 'error',
        message: `${(err as Error).message || '提交没成功'}，再试一次？`,
        retryFn: () => handleDecideCase(caseId, payload),
      });
    }
  }

  async function handleUndoDecide(caseId: string, decisionRecordId?: string) {
    try {
      const res = await fetch(`/api/cases/${caseId}/undo-decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisionRecordId }),
      });
      if (!res.ok) throw new Error('撤回没成功');
      await refreshState({ preferredSelection: { kind: 'case', id: caseId } });
      showToast({ kind: 'success', message: '已撤回，退回等你重选。' });
    } catch (err: unknown) {
      showToast({
        kind: 'error',
        message: (err as Error).message || '撤回没成功',
        retryFn: () => handleUndoDecide(caseId, decisionRecordId),
      });
    }
  }

  async function handleSaveRuleFromDecision(decisionId: string) {
    try {
      const res = await fetch(`/api/rules/from-decision/${decisionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('记成规矩没成功');
      await refreshState();
      showToast({ kind: 'success', message: '已存成规矩，以后先提醒你。' });
    } catch (err: unknown) {
      showToast({
        kind: 'error',
        message: (err as Error).message || '存成规矩没成功',
        retryFn: () => handleSaveRuleFromDecision(decisionId),
      });
    }
  }

  async function handleSnoozeCase(
    caseId: string,
    preset: 'tonight' | 'tomorrow_morning' | 'next_monday'
  ) {
    try {
      const res = await fetch(`/api/cases/${caseId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset }),
      });
      if (!res.ok) throw new Error('没推迟成功');
      await refreshState();
      setMobileDetailOpen(false);
      const label =
        preset === 'tonight' ? '今晚' : preset === 'tomorrow_morning' ? '明天上午' : '下周一';
      showToast({ kind: 'success', message: `已挪到「稍后再看」，${label}再提醒你。` });
    } catch (err: unknown) {
      showToast({
        kind: 'error',
        message: (err as Error).message || '操作没成功',
        retryFn: () => handleSnoozeCase(caseId, preset),
      });
    }
  }

  async function handleExplainCase(caseId: string, useAi: boolean, variantIndex: number) {
    const res = await fetch(`/api/cases/${caseId}/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useAi, variantIndex }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '没能生成换个说法');
    return data as {
      explanation: {
        whatHappened: string;
        bossAnalogy: string;
        ifIgnored: string;
        recommendedAction: string;
      };
    };
  }

  async function handleRefreshBrief(threadId: string) {
    try {
      const res = await fetch(`/api/threads/${threadId}/resume-brief`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新进展没成功');
      await refreshState();
      showToast({ kind: 'success', message: '进展已更新。' });
    } catch (err: unknown) {
      showToast({
        kind: 'error',
        message: (err as Error).message || '更新进展没成功',
        retryFn: () => handleRefreshBrief(threadId),
      });
    }
  }

  async function handleInjectFact(threadId: string, factText: string) {
    try {
      const res = await fetch(`/api/threads/${threadId}/inject-fact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factText }),
      });
      if (!res.ok) throw new Error('没发出去');
      await refreshState();
      showToast({ kind: 'success', message: '已发给这个 AI。' });
    } catch (err: unknown) {
      showToast({
        kind: 'error',
        message: (err as Error).message || '没发出去',
        retryFn: () => handleInjectFact(threadId, factText),
      });
    }
  }

  async function handleReportMissed(threadId: string, note: string) {
    try {
      const res = await fetch(`/api/threads/${threadId}/report-missed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error('没记下来');
      await refreshState();
      showToast({ kind: 'success', message: '已记下并打回让它重做。' });
    } catch (err: unknown) {
      showToast({
        kind: 'error',
        message: (err as Error).message || '没记下来',
        retryFn: () => handleReportMissed(threadId, note),
      });
    }
  }

  async function handleIngestAgentMessage(payload: {
    agentName: string;
    agentChannel: AgentChannel;
    projectId: string;
    rawMessage: string;
    useAiTranslator?: boolean;
  }) {
    const res = await fetch('/api/ingest/agent-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '没送过去');

    const createdCaseId = data.createdCase?.id as string | undefined;
    if (createdCaseId) {
      flashNewCase(createdCaseId);
    }
    await refreshState(
      createdCaseId ? { preferredSelection: { kind: 'case', id: createdCaseId } } : undefined
    );
    return {
      triageStatus: data.triage.triageStatus as 'needs_you' | 'handled_for_you',
      handledOutcome: data.triage.handledOutcome as string,
      plainSummary: data.triage.plainSummary as string,
      aiTranslationNote: data.aiTranslationNote as string | undefined,
      createdCaseId,
    };
  }

  async function handleCreateThread(payload: {
    projectId: string;
    title: string;
    anchorGoal: string;
    constraintsText?: string;
    sourceAgentName?: string;
    adapterType: 'claude_code_hook' | 'git_merge_gate';
  }) {
    const res = await fetch('/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '没建成功');
    const threadId = data.thread?.id as string | undefined;
    await refreshState(threadId ? { preferredSelection: { kind: 'thread', id: threadId } } : undefined);
    setActivePage('home');
    showToast({ kind: 'success', message: '已记下，AI 开始按要求做。' });
  }

  async function handleSubmitToFirewall(
    threadId: string,
    payload: SubmissionPayload & { useSemanticAi: boolean }
  ) {
    const res = await fetch(`/api/threads/${threadId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '检查没跑通');
    const createdCaseId = data.createdCase?.id as string | undefined;
    await refreshState(
      createdCaseId ? { preferredSelection: { kind: 'case', id: createdCaseId } } : undefined
    );
    return {
      verdict: data.outcome.verdict as string,
      reasons: data.outcome.reasons as string[],
    };
  }

  async function handleUndoAutoAction(actionId: string) {
    try {
      const res = await fetch(`/api/auto-actions/${actionId}/undo`, { method: 'POST' });
      if (!res.ok) throw new Error('撤回没成功');
      await refreshState();
      showToast({ kind: 'success', message: '已撤回并退回等你拍板。' });
    } catch (err: unknown) {
      showToast({
        kind: 'error',
        message: (err as Error).message || '撤回没成功',
        retryFn: () => handleUndoAutoAction(actionId),
      });
    }
  }

  async function handleMarkDigestMissed(digestId: string) {
    try {
      const res = await fetch(`/api/digest/${digestId}/mark-missed`, { method: 'POST' });
      if (!res.ok) throw new Error('记录没成功');
      await refreshState();
    } catch (err: unknown) {
      showToast({
        kind: 'error',
        message: (err as Error).message || '记录没成功',
        retryFn: () => handleMarkDigestMissed(digestId),
      });
    }
  }

  async function handleUndoDigestMissed(digestId: string) {
    try {
      const res = await fetch(`/api/digest/${digestId}/undo-missed`, { method: 'POST' });
      if (!res.ok) throw new Error('撤销没成功');
      await refreshState();
    } catch (err: unknown) {
      showToast({
        kind: 'error',
        message: (err as Error).message || '撤销没成功',
        retryFn: () => handleUndoDigestMissed(digestId),
      });
    }
  }

  async function handleCompileRule(naturalText: string, projectId: string | 'global') {
    const res = await fetch('/api/rules/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ naturalText, projectId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '没能看懂这条要求');
    await refreshState();
    return data;
  }

  async function handleSaveCompiledRule(payload: {
    projectId: string | 'global';
    kind: 'deterministic_guardrail' | 'semantic_habit';
    executionMode: 'suggest_only' | 'auto_apply_reversible';
    title: string;
    ruleText: string;
    scopeLabel: string;
    matcher?: FounderOsState['policyRules'][number]['matcher'];
    deactivateConflictingRuleIds?: string[];
  }) {
    const res = await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '没能加上这条规矩');
    await refreshState();
    showToast({ kind: 'success', message: '规矩已加上。' });
  }

  async function handleToggleRuleActive(ruleId: string, active: boolean) {
    try {
      const res = await fetch(`/api/rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error('切换没成功');
      await refreshState();
    } catch (err: unknown) {
      showToast({
        kind: 'error',
        message: (err as Error).message || '切换没成功',
        retryFn: () => handleToggleRuleActive(ruleId, active),
      });
    }
  }

  async function handleAckRuleReview(ruleId: string, stillWorks: boolean) {
    try {
      const res = await fetch(`/api/rules/${ruleId}/ack-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stillWorks }),
      });
      if (!res.ok) throw new Error('更新没成功');
      await refreshState();
      showToast({
        kind: 'success',
        message: stillWorks ? '已续期，下个月再看。' : '这条规矩已停用。',
      });
    } catch (err: unknown) {
      showToast({
        kind: 'error',
        message: (err as Error).message || '更新没成功',
        retryFn: () => handleAckRuleReview(ruleId, stillWorks),
      });
    }
  }

  async function handleChangeHabitMode(
    ruleId: string,
    executionMode: 'suggest_only' | 'auto_apply_reversible'
  ) {
    try {
      const res = await fetch(`/api/rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionMode }),
      });
      if (!res.ok) throw new Error('切换方式没成功');
      await refreshState();
    } catch (err: unknown) {
      showToast({
        kind: 'error',
        message: (err as Error).message || '切换方式没成功',
        retryFn: () => handleChangeHabitMode(ruleId, executionMode),
      });
    }
  }

  async function handleSubmitOutcome(
    decisionId: string,
    verdict: 'win' | 'miss' | 'neutral',
    note: string
  ) {
    try {
      const res = await fetch(`/api/outcomes/${decisionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict, note }),
      });
      if (!res.ok) throw new Error('没记下来');
      await refreshState();
      showToast({ kind: 'success', message: '已记下这次回头看的结果。' });
    } catch (err: unknown) {
      showToast({
        kind: 'error',
        message: (err as Error).message || '没记下来',
        retryFn: () => handleSubmitOutcome(decisionId, verdict, note),
      });
    }
  }

  async function handleToggleConnection(id: string, status: 'Connected' | 'Paused') {
    try {
      const res = await fetch(`/api/connections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('切换连接状态没成功');
      await refreshState();
    } catch (err: unknown) {
      showToast({
        kind: 'error',
        message: (err as Error).message || '切换连接状态没成功',
        retryFn: () => handleToggleConnection(id, status),
      });
    }
  }

  async function handleResetDemo() {
    const res = await fetch('/api/reset', { method: 'POST' });
    if (!res.ok) throw new Error('重置没成功');
    const fresh = (await res.json()) as FounderOsState;
    knownCaseIdsRef.current = new Set(fresh.decisionCases.map((c) => c.id));
    setState(fresh);
    setSelectedProjectId('all');
    setActivePage('home');
    setSelection(null);
    setMobileDetailOpen(false);
  }

  // X-01 Skeleton loading state (first load, no text labels, matching layout geometry)
  if (loading && !state) {
    return (
      <div className="min-h-screen bg-[#f5f8f7] text-[#0e3a3d] flex flex-col">
        <header className="h-14 shrink-0 bg-[#f5f8f7] border-b border-[#c9d6d5] px-6 flex items-center justify-between">
          <div className="h-5 w-28 rounded bg-[#e2ebea]" />
          <div className="flex items-center gap-3">
            <div className="h-8 w-24 rounded bg-[#e2ebea]" />
            <div className="h-8 w-14 rounded bg-[#e2ebea]" />
          </div>
        </header>
        <div className="h-[44px] shrink-0 bg-[#f5f8f7] border-b border-[#c9d6d5]" />
        <div className="flex-1 flex">
          <div className="hidden lg:block w-[280px] border-r border-[#c9d6d5] p-4 space-y-3">
            <div className="h-16 rounded bg-[#e2ebea]" />
            <div className="h-16 rounded bg-[#e2ebea]" />
            <div className="h-16 rounded bg-[#e2ebea]" />
          </div>
          <main className="flex-1 p-6 lg:p-8">
            <div className="max-w-[760px] h-[440px] rounded-xl bg-white/80" />
          </main>
        </div>
      </div>
    );
  }

  // Initial load error with zero data
  if (networkError && !state) {
    return (
      <div className="min-h-screen bg-[#f5f8f7] text-[#0e3a3d] flex items-center justify-center p-6">
        <div
          role="alert"
          className="max-w-md w-full bg-white border border-[#c9d6d5] rounded-xl p-6 space-y-4"
        >
          <p className="text-[15px] text-[#0e3a3d]">{networkError}</p>
          <button
            type="button"
            onClick={() => refreshState({ isInitial: true })}
            className="h-10 px-5 rounded-md bg-[#0e3a3d] text-[15px] font-semibold text-white cursor-pointer"
          >
            再试一次
          </button>
        </div>
      </div>
    );
  }

  const isFirstTimeEmpty =
    Boolean(state) && state!.threads.length === 0 && state!.decisionCases.length === 0;

  const selectedProjectName =
    selectedProjectId === 'all'
      ? null
      : state?.projects.find((p) => p.id === selectedProjectId)?.shortName ||
        state?.projects.find((p) => p.id === selectedProjectId)?.name;

  function renderMainDetailArea(showMobileBack: boolean) {
    if (!state) return null;

    if (isFirstTimeEmpty) {
      return (
        <div className="max-w-[600px] py-8 space-y-5">
          <h1 className="text-[22px] leading-[30px] font-semibold text-[#0e3a3d]">
            先把你的 AI 接进来
          </h1>
          <ol className="space-y-4 text-[15px] leading-6 text-[#0e3a3d]">
            <li className="flex items-start gap-3">
              <span className="font-semibold text-[#456669] tabular-nums">1.</span>
              <div className="space-y-2">
                <div>选好项目和职责，复制一段话发给你的 AI。</div>
                <button
                  type="button"
                  onClick={() => setConnectionsOpen(true)}
                  className="h-10 px-5 rounded-md bg-[#0e3a3d] hover:bg-[#144c50] text-[15px] font-semibold text-white cursor-pointer"
                >
                  接入一个 AI
                </button>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-semibold text-[#456669] tabular-nums">2.</span>
              <div>让它照常干活，平时不用你盯着。</div>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-semibold text-[#456669] tabular-nums">3.</span>
              <div>遇到拿不准、或碰到底线的事，会出现在这里等你拍板。</div>
            </li>
          </ol>
        </div>
      );
    }

    if (activeCase) {
      return (
        <div className="flex items-start gap-6 xl:gap-8">
          <DecisionSheet
            decisionCase={activeCase}
            project={activeProject}
            thread={activeThread}
            showMobileBack={showMobileBack}
            onMobileBack={() => setMobileDetailOpen(false)}
            onDecide={handleDecideCase}
            onSnooze={handleSnoozeCase}
            onExplain={handleExplainCase}
            onRefreshBrief={handleRefreshBrief}
          />
          <ReferenceSidebar
            relatedDecisions={referenceData.relatedDecisions}
            relatedRules={referenceData.relatedRules}
            onGoToRule={() => setActivePage('rules')}
          />
        </div>
      );
    }

    if (activeLookback) {
      return (
        <LookbackView
          record={activeLookback}
          project={activeProject}
          showMobileBack={showMobileBack}
          onMobileBack={() => setMobileDetailOpen(false)}
          onSubmitOutcome={handleSubmitOutcome}
        />
      );
    }

    if (activeThread) {
      return (
        <RunningItemView
          thread={activeThread}
          project={activeProject}
          showMobileBack={showMobileBack}
          onMobileBack={() => setMobileDetailOpen(false)}
          onInjectFact={handleInjectFact}
          onReportMissed={handleReportMissed}
        />
      );
    }

    // P-67..P-71: Normal all-cleared empty state directly on flat #f5f8f7 canvas
    return (
      <div className="max-w-[600px] py-12 space-y-3">
        <h1 className="text-[22px] leading-[30px] font-semibold text-[#0e3a3d]">
          {selectedProjectName
            ? `「${selectedProjectName}」现在没有要你定的事`
            : '现在没有要你定的事'}
        </h1>
        <p className="text-[15px] leading-6 text-[#456669] tabular-nums">
          有事会出现在这里。
          {digestGroups.totalHandledToday > 0 && (
            <>今天已经替你处理了 {digestGroups.totalHandledToday} 件。</>
          )}
        </p>
        {digestGroups.totalHandledToday > 0 && (
          <button
            type="button"
            onClick={() => setDigestOpen(true)}
            className="min-h-8 text-[14px] font-medium text-[#0b7265] hover:underline cursor-pointer"
          >
            看明细
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#f5f8f7] text-[#0e3a3d] flex flex-col overflow-hidden">
      {state && (
        <TopBar
          projects={state.projects}
          selectedProjectId={selectedProjectId}
          pendingCountByProject={queueData.pendingCountByProject}
          totalPendingCount={queueData.totalPendingAll}
          activePage={activePage}
          connections={state.connections}
          demoMode={demoMode}
          onGoHome={() => {
            setActivePage('home');
            setMobileDetailOpen(false);
          }}
          onSelectProject={(pid) => {
            setSelectedProjectId(pid);
            setMobileDetailOpen(false);
          }}
          onOpenPasteReply={() => setPasteReplyOpen(true)}
          onOpenRules={() => {
            setActivePage('rules');
            setTabletQueueOpen(false);
          }}
          onOpenConnections={() => setConnectionsOpen(true)}
          onOpenDemoDrawer={() => setDemoOpen(true)}
        />
      )}

      {/* X-02: Non-blocking offline banner */}
      {networkError && state && (
        <div
          role="alert"
          className="shrink-0 bg-[#fff6e0] border-b border-[#c9d6d5] px-4 sm:px-6 py-2 flex items-center justify-between gap-3 text-[13px] text-[#8a5300]"
        >
          <span>{networkError}</span>
          <button
            type="button"
            onClick={() => refreshState()}
            className="min-h-8 px-3 rounded border border-[#8a5300]/30 bg-white text-[#8a5300] font-medium cursor-pointer shrink-0"
          >
            再试一次
          </button>
        </div>
      )}

      {/* Home Page */}
      {state && activePage === 'home' && (
        <>
          <SummaryBar
            totalHandledToday={digestGroups.totalHandledToday}
            bouncedCount={digestGroups.bouncedCount}
            onOpenDigest={() => setDigestOpen(true)}
          />

          {/* Tablet (768–1023px) Queue Trigger Bar */}
          <div className="hidden md:flex lg:hidden shrink-0 px-6 py-2 bg-[#f5f8f7] border-b border-[#c9d6d5] items-center justify-between">
            <button
              type="button"
              onClick={() => setTabletQueueOpen(true)}
              className="h-9 px-3 rounded-md bg-white border border-[#6f8c8b] text-[13px] font-medium text-[#0e3a3d] inline-flex items-center gap-2 cursor-pointer"
            >
              <span>等你拍板</span>
              <span className="text-[#c93a1f] font-semibold tabular-nums">
                {queueData.totalPendingCount}
              </span>
              <ChevronRight className="w-4 h-4 text-[#456669]" strokeWidth={1.75} />
            </button>
          </div>

          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Desktop (>=1024px) Persistent Left Queue */}
            <QueueSidebar
              projects={state.projects}
              pendingCases={queueData.pendingCases}
              laterCases={queueData.laterCases}
              totalPendingCount={queueData.totalPendingCount}
              pendingReviews={queueData.pendingReviews}
              runningThreads={queueData.runningThreads}
              selection={resolvedSelection}
              weeklyTotalCount={weeklySummary.effectiveTotal}
              freshCaseIds={freshCaseIds}
              onSelect={(sel) => {
                setSelection(sel);
              }}
              onOpenNewItem={() => setNewItemOpen(true)}
              onOpenWeeklySummary={() => setWeeklyOpen(true)}
              className="hidden lg:flex w-[260px] xl:w-[300px]"
            />

            {/* Tablet & Desktop Main Detail Area */}
            <main
              ref={mainScrollRef}
              className="hidden md:block flex-1 overflow-y-auto fos-scroll p-6 lg:p-8"
            >
              {renderMainDetailArea(false)}
            </main>

            {/* Mobile (<768px) Single-Column List OR Full-Screen Detail */}
            <div className="flex-1 md:hidden flex flex-col min-h-0 overflow-hidden">
              {!mobileDetailOpen ? (
                <QueueSidebar
                  projects={state.projects}
                  pendingCases={queueData.pendingCases}
                  laterCases={queueData.laterCases}
                  totalPendingCount={queueData.totalPendingCount}
                  pendingReviews={queueData.pendingReviews}
                  runningThreads={queueData.runningThreads}
                  selection={resolvedSelection}
                  weeklyTotalCount={weeklySummary.effectiveTotal}
                  freshCaseIds={freshCaseIds}
                  onSelect={(sel) => {
                    setSelection(sel);
                    setMobileDetailOpen(true);
                  }}
                  onOpenNewItem={() => setNewItemOpen(true)}
                  onOpenWeeklySummary={() => setWeeklyOpen(true)}
                  className="flex w-full h-full border-r-0"
                />
              ) : (
                <main className="flex-1 overflow-y-auto fos-scroll p-4">
                  {renderMainDetailArea(true)}
                </main>
              )}
            </div>
          </div>

          {/* Tablet (768–1023px) Slide-Over Queue Drawer */}
          {tabletQueueOpen && (
            <div
              className="fixed inset-0 z-40 hidden md:flex lg:hidden bg-[#0e3a3d]/25"
              onClick={(e) => {
                if (e.target === e.currentTarget) setTabletQueueOpen(false);
              }}
            >
              <div className="h-full bg-[#f5f8f7] fos-modal-shadow flex flex-col w-[300px]">
                <div className="px-4 py-3 border-b border-[#c9d6d5] flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-[#0e3a3d]">事项队列</span>
                  <button
                    type="button"
                    aria-label="关闭队列"
                    onClick={() => setTabletQueueOpen(false)}
                    className="min-h-8 min-w-8 inline-flex items-center justify-center text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
                  >
                    <X className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
                <QueueSidebar
                  projects={state.projects}
                  pendingCases={queueData.pendingCases}
                  laterCases={queueData.laterCases}
                  totalPendingCount={queueData.totalPendingCount}
                  pendingReviews={queueData.pendingReviews}
                  runningThreads={queueData.runningThreads}
                  selection={resolvedSelection}
                  weeklyTotalCount={weeklySummary.effectiveTotal}
                  freshCaseIds={freshCaseIds}
                  onSelect={(sel) => {
                    setSelection(sel);
                    setTabletQueueOpen(false);
                  }}
                  onOpenNewItem={() => {
                    setTabletQueueOpen(false);
                    setNewItemOpen(true);
                  }}
                  onOpenWeeklySummary={() => {
                    setTabletQueueOpen(false);
                    setWeeklyOpen(true);
                  }}
                  className="flex-1 w-full border-r-0"
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Rules Page ("规矩") */}
      {state && activePage === 'rules' && (
        <main ref={mainScrollRef} className="flex-1 overflow-y-auto fos-scroll">
          <JudgmentMemoryView
            projects={state.projects}
            selectedProjectId={selectedProjectId}
            policyRules={state.policyRules}
            decisionRecords={state.decisionRecords}
            autoAppliedActions={state.autoAppliedActions}
            onCompileRule={handleCompileRule}
            onSaveCompiledRule={handleSaveCompiledRule}
            onToggleRuleActive={handleToggleRuleActive}
            onAckRuleReview={handleAckRuleReview}
            onChangeHabitMode={handleChangeHabitMode}
            onUndoAutoAction={handleUndoAutoAction}
            onSubmitOutcome={handleSubmitOutcome}
          />
        </main>
      )}

      {/* Modals & Drawers */}
      {state && (
        <>
          <ConnectionsModal
            open={connectionsOpen}
            connections={state.connections}
            projects={state.projects}
            policyRules={state.policyRules}
            defaultProjectId={selectedProjectId}
            onClose={() => setConnectionsOpen(false)}
            onToggleConnection={handleToggleConnection}
            onIngestAgentMessage={handleIngestAgentMessage}
          />

          <PasteReplyModal
            open={pasteReplyOpen}
            projects={state.projects}
            defaultProjectId={selectedProjectId}
            onClose={() => setPasteReplyOpen(false)}
            onSubmit={handleIngestAgentMessage}
            onSelectCreatedCase={(caseId) => {
              setActivePage('home');
              setSelection({ kind: 'case', id: caseId });
              setMobileDetailOpen(true);
            }}
          />

          <NewItemModal
            open={newItemOpen}
            projects={state.projects}
            defaultProjectId={selectedProjectId}
            onClose={() => setNewItemOpen(false)}
            onCreate={handleCreateThread}
          />

          <DigestDrawer
            open={digestOpen}
            groups={digestGroups}
            projects={state.projects}
            escapedDefectsCount={state.qualityMetrics.escapedDefectsCount}
            falseBounceCount={state.qualityMetrics.falseBounceCount}
            onClose={() => setDigestOpen(false)}
            onUndoAutoAction={handleUndoAutoAction}
            onMarkMissed={handleMarkDigestMissed}
            onUndoMissed={handleUndoDigestMissed}
          />

          <WeeklySummaryDrawer
            open={weeklyOpen}
            summary={weeklySummary}
            onClose={() => setWeeklyOpen(false)}
          />

          {demoMode && (
            <DemoDrawer
              open={demoOpen}
              projects={state.projects}
              threads={state.threads}
              onClose={() => setDemoOpen(false)}
              onResetDemo={handleResetDemo}
              onIngestAgentMessage={handleIngestAgentMessage}
              onSubmitToFirewall={handleSubmitToFirewall}
            />
          )}
        </>
      )}

      {/* P-63 / P-64 / X-03 / A-04 Bottom Fixed Toast */}
      {toast && (
        <div
          role={toast.kind === 'error' ? 'alert' : 'status'}
          aria-live={toast.kind === 'error' ? 'assertive' : 'polite'}
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] rounded-lg px-4 py-3 fos-modal-shadow fos-toast-enter flex flex-wrap items-center gap-3 text-[13px] ${
            toast.kind === 'error'
              ? 'bg-[#fff6e0] text-[#8a5300] border border-[#c9d6d5]'
              : 'bg-[#0e3a3d] text-white'
          }`}
        >
          <span>{toast.message}</span>

          {toast.undoPayload && (
            <button
              type="button"
              onClick={() => {
                const p = toast.undoPayload!;
                setToast(null);
                handleUndoDecide(p.caseId, p.decisionRecordId);
              }}
              className="font-semibold text-[#eaf6f3] underline underline-offset-2 cursor-pointer"
            >
              撤回
            </button>
          )}

          {toast.saveRuleDecisionId && (
            <button
              type="button"
              onClick={() => {
                const decId = toast.saveRuleDecisionId!;
                setToast(null);
                handleSaveRuleFromDecision(decId);
              }}
              className="font-semibold text-[#eaf6f3] underline underline-offset-2 cursor-pointer"
            >
              存成规矩
            </button>
          )}

          {toast.retryFn && (
            <button
              type="button"
              onClick={() => {
                const fn = toast.retryFn!;
                setToast(null);
                fn();
              }}
              className="font-semibold underline underline-offset-2 cursor-pointer"
            >
              再试一次
            </button>
          )}

          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => setToast(null)}
            className="opacity-75 hover:opacity-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        </div>
      )}
    </div>
  );
}
