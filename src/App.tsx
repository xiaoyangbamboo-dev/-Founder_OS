import { useEffect, useRef, useState } from 'react';
import type {
  AgentChannel,
  FounderOsState,
  SubmissionPayload,
} from './types/founderOs';
import { CockpitInbox } from './components/CockpitInbox';
import { ThreadFocusView } from './components/ThreadFocusView';
import { JudgmentMemoryView } from './components/JudgmentMemoryView';
import { ConnectionsModal } from './components/ConnectionsModal';

type NavTab = 'inbox' | 'focus' | 'memory';

export default function App() {
  const [state, setState] = useState<FounderOsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('inbox');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedThreadId, setSelectedThreadId] = useState<string>('');
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [resetEpoch, setResetEpoch] = useState(0);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [activeTab, selectedThreadId, selectedProjectId]);

  async function refreshState(preserveSelection = true) {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) {
        throw new Error(`加载状态失败 (HTTP ${res.status})`);
      }
      const data = (await res.json()) as FounderOsState;
      setState(data);
      if (!preserveSelection || !selectedThreadId) {
        const firstNeedsYou = data.threads.find((t) => t.status === 'Needs You');
        setSelectedThreadId(firstNeedsYou?.id || data.threads[0]?.id || '');
      }
      setError(null);
    } catch (err: unknown) {
      setError((err as Error).message || '无法连接到 Founder OS 后端');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshState(false);
  }, []);

  async function handleResetDemo() {
    const res = await fetch('/api/reset', { method: 'POST' });
    if (res.ok) {
      const fresh = (await res.json()) as FounderOsState;
      setState(fresh);
      setSelectedProjectId('all');
      setSelectedThreadId(fresh.threads[0]?.id || '');
      setActiveTab('inbox');
      setResetEpoch((n) => n + 1);
    }
  }

  async function handleCreateThread(payload: {
    projectId: string;
    title: string;
    anchorGoal: string;
    adapterType: 'claude_code_hook' | 'git_merge_gate';
    branchOrWorktree: string;
  }) {
    const res = await fetch('/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '创建线程失败');
    await refreshState();
    setSelectedThreadId(data.thread.id);
    setActiveTab('focus');
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
    if (!res.ok) throw new Error(data.error || '核验提交失败');
    await refreshState();
    return {
      verdict: data.outcome.verdict as string,
      reasons: data.outcome.reasons as string[],
    };
  }

  async function handleRefreshResumeBrief(threadId: string) {
    const res = await fetch(`/api/threads/${threadId}/resume-brief`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '刷新增量简报失败');
    await refreshState();
  }

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
    }
  ) {
    const res = await fetch(`/api/cases/${caseId}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '拍板提交失败');
    await refreshState();
  }

  async function handleDispatchCommand(payload: {
    projectId: string;
    targetAgentName: string;
    commandText: string;
    attachmentName?: string;
  }) {
    const res = await fetch('/api/commands/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '指令下发失败');
    await refreshState();
  }

  async function handleExplainCase(caseId: string, useAi: boolean) {
    const res = await fetch(`/api/cases/${caseId}/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useAi }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '生成大白话解释失败');
    if (useAi) await refreshState();
    return data as {
      source: string;
      note?: string;
      explanation: {
        whatHappened: string;
        bossAnalogy: string;
        ifIgnored: string;
        recommendedAction: string;
      };
    };
  }

  async function handleInjectFact(threadId: string, factText: string) {
    const res = await fetch(`/api/threads/${threadId}/inject-fact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factText }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '注入事实失败');
    await refreshState();
  }

  async function handleReportMissedDefect(threadId: string, note: string) {
    const res = await fetch(`/api/threads/${threadId}/report-missed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '报告漏报失败');
    await refreshState();
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
    if (!res.ok) throw new Error(data.error || '消息投递失败');
    await refreshState();
    return {
      triageStatus: data.triage.triageStatus as 'needs_you' | 'handled_for_you',
      handledOutcome: data.triage.handledOutcome as string,
      plainSummary: data.triage.plainSummary as string,
      aiTranslationNote: data.aiTranslationNote as string | undefined,
    };
  }

  async function handleUndoAutoAction(actionId: string) {
    const res = await fetch(`/api/auto-actions/${actionId}/undo`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('撤销失败');
    await refreshState();
  }

  async function handleCompileRule(naturalText: string, projectId: string | 'global') {
    const res = await fetch('/api/rules/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ naturalText, projectId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '规则编译失败');
    await refreshState();
    return data;
  }

  async function handleSaveCompiledRule(payload: Record<string, unknown>) {
    const res = await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '保存规则失败');
    await refreshState();
  }

  async function handleToggleRuleActive(ruleId: string, active: boolean) {
    await fetch(`/api/rules/${ruleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    await refreshState();
  }

  async function handleChangeHabitMode(
    ruleId: string,
    executionMode: 'suggest_only' | 'auto_apply_reversible'
  ) {
    await fetch(`/api/rules/${ruleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ executionMode }),
    });
    await refreshState();
  }

  async function handleSubmitOutcome(
    decisionId: string,
    verdict: 'win' | 'miss' | 'neutral',
    note: string
  ) {
    await fetch(`/api/outcomes/${decisionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verdict, note }),
    });
    await refreshState();
  }

  async function handleToggleConnection(id: string, status: 'Connected' | 'Paused') {
    await fetch(`/api/connections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await refreshState();
  }

  const activeThread =
    state?.threads.find((t) => t.id === selectedThreadId) || state?.threads[0];
  const activeProject = state?.projects.find((p) => p.id === activeThread?.projectId);
  const activeCase = state?.decisionCases.find(
    (c) => c.threadId === activeThread?.id && c.status === 'Needs Human'
  );

  if (loading && !state) {
    return (
      <div className="min-h-screen medusa-canvas text-[#0e3a3d] flex items-center justify-center p-6">
        <div className="medusa-card p-6 w-full max-w-md space-y-3" aria-busy="true">
          <div className="medusa-ct">
            <span className="medusa-ct-label">FOUNDER OS · 初始化中</span>
            <small className="text-[10px] text-[#9dbcbc]">00</small>
          </div>
          <div className="h-4 bg-[#d3e8e7] w-3/4" />
          <div className="h-3 bg-[#e3f4f3] w-1/2" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen medusa-canvas text-[#0e3a3d] flex items-center justify-center p-6">
        <div role="alert" className="medusa-card p-6 w-full max-w-md space-y-3 border-[#ff5a3c]/40">
          <p className="text-sm font-medium text-[#ff5a3c]">{error}</p>
          <button
            type="button"
            onClick={() => refreshState(false)}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0e3a3d]"
          >
            重新连接
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen medusa-canvas text-[#0e3a3d]">
      {state && activeTab === 'inbox' && (
        <CockpitInbox
          key={resetEpoch}
          projects={state.projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={(pid) => setSelectedProjectId(pid)}
          threads={state.threads}
          decisionCases={state.decisionCases}
          agentMessages={state.agentMessages || []}
          founderCommands={state.founderCommands || []}
          policyRules={state.policyRules}
          digestEvents={state.digestEvents}
          autoAppliedActions={state.autoAppliedActions}
          qualityMetrics={state.qualityMetrics}
          onSelectThread={(id) => {
            setSelectedThreadId(id);
            setActiveTab('focus');
          }}
          onOpenMemory={() => setActiveTab('memory')}
          onResetDemo={handleResetDemo}
          onDecideCase={handleDecideCase}
          onDispatchCommand={handleDispatchCommand}
          onExplainCase={handleExplainCase}
          onUndoAutoAction={handleUndoAutoAction}
          onCreateThread={handleCreateThread}
          onIngestAgentMessage={handleIngestAgentMessage}
          onOpenConnections={() => setConnectionsOpen(true)}
        />
      )}

      {state && activeTab !== 'inbox' && (
        <div className="h-screen flex flex-col overflow-hidden">
          <header className="shrink-0 flex items-center justify-between gap-4 pr-6 border-b border-[#d3e8e7] bg-white/75">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setActiveTab('inbox')}
                className="w-[128px] h-[56px] bg-[#ff5a3c] text-white flex items-center justify-center gap-2 font-mono text-xs font-semibold tracking-[0.12em] cursor-pointer"
              >
                <span>← 返回总控</span>
              </button>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="font-bold text-sm text-[#0e3a3d]">Founder OS</span>
                <span className="text-[#ff5a3c]">/</span>
                <span className="text-[#5d8284]">
                  {activeTab === 'focus'
                    ? `高级线程与验货 · ${activeThread?.title || ''}`
                    : '规矩与过往决定账本'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('memory')}
                className={`medusa-btn ${activeTab === 'memory' ? 'on' : ''}`}
              >
                规矩与决定账本
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('focus')}
                className={`medusa-btn ${activeTab === 'focus' ? 'on' : ''}`}
              >
                高级线程与验货
              </button>
              <button
                type="button"
                onClick={() => setConnectionsOpen(true)}
                className="medusa-btn"
              >
                复制 1 句话接入任何 AI
              </button>
            </div>
          </header>

          <main ref={mainRef} className="flex-1 overflow-y-auto p-6">
            <div className="max-w-[1180px] w-full mx-auto">
              {activeTab === 'focus' && activeThread && (
                <ThreadFocusView
                  thread={activeThread}
                  allThreads={state.threads}
                  project={activeProject}
                  activeCase={activeCase}
                  onBackToInbox={() => setActiveTab('inbox')}
                  onSwitchThread={(id) => setSelectedThreadId(id)}
                  onRefreshResumeBrief={handleRefreshResumeBrief}
                  onDecideCase={handleDecideCase}
                  onSubmitToFirewall={handleSubmitToFirewall}
                  onInjectFact={handleInjectFact}
                  onReportMissedDefect={handleReportMissedDefect}
                />
              )}

              {activeTab === 'memory' && (
                <JudgmentMemoryView
                  projects={state.projects}
                  selectedProjectId={selectedProjectId}
                  policyRules={state.policyRules}
                  decisionRecords={state.decisionRecords}
                  autoAppliedActions={state.autoAppliedActions}
                  onCompileRule={handleCompileRule}
                  onSaveCompiledRule={handleSaveCompiledRule}
                  onToggleRuleActive={handleToggleRuleActive}
                  onChangeHabitMode={handleChangeHabitMode}
                  onUndoAutoAction={handleUndoAutoAction}
                  onSubmitOutcome={handleSubmitOutcome}
                />
              )}
            </div>
          </main>
        </div>
      )}

      {state && (
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
      )}
    </div>
  );
}
