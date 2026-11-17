import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Layers,
  MessageSquarePlus,
  Paperclip,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import type {
  AgentChannel,
  AgentFeedbackMessage,
  AutoAppliedAction,
  DecisionCase,
  DecisionType,
  DigestEvent,
  FounderCommand,
  PolicyRule,
  Project,
  QualityMetrics,
  WorkThread,
} from '../types/founderOs';
import { computeEisenhowerPosition } from '../core/ingest';
import {
  CauseEffectFlowDiagram,
  ProjectDomainIcon,
  ProjectStagePipeline,
  RiskSeverityBars,
} from './AttentionVisuals';
import { StatusLabel, VerificationTierText } from './StatusLabel';
import {
  MedusaCoreCanvas,
  SECTION_TIMESTAMPS,
  jetPressureAt,
  type CoreSection,
} from './MedusaCoreCanvas';

interface BossExplanation {
  whatHappened: string;
  bossAnalogy: string;
  ifIgnored: string;
  recommendedAction: string;
}

interface CockpitInboxProps {
  projects: Project[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  threads: WorkThread[];
  decisionCases: DecisionCase[];
  agentMessages: AgentFeedbackMessage[];
  founderCommands: FounderCommand[];
  policyRules: PolicyRule[];
  digestEvents: DigestEvent[];
  autoAppliedActions: AutoAppliedAction[];
  qualityMetrics: QualityMetrics;
  onSelectThread: (threadId: string) => void;
  onOpenMemory: () => void;
  onResetDemo: () => Promise<void>;
  onDecideCase: (
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
  ) => Promise<void>;
  onDispatchCommand: (payload: {
    projectId: string;
    targetAgentName: string;
    commandText: string;
    attachmentName?: string;
  }) => Promise<void>;
  onExplainCase: (
    caseId: string,
    useAi: boolean
  ) => Promise<{
    source: string;
    note?: string;
    explanation: BossExplanation;
  }>;
  onUndoAutoAction: (actionId: string) => Promise<void>;
  onCreateThread: (payload: {
    projectId: string;
    title: string;
    anchorGoal: string;
    adapterType: 'claude_code_hook' | 'git_merge_gate';
    branchOrWorktree: string;
  }) => Promise<void>;
  onIngestAgentMessage: (payload: {
    agentName: string;
    agentChannel: AgentChannel;
    projectId: string;
    rawMessage: string;
    useAiTranslator?: boolean;
  }) => Promise<{
    triageStatus: 'needs_you' | 'handled_for_you';
    handledOutcome: string;
    plainSummary: string;
    aiTranslationNote?: string;
  }>;
  onOpenConnections: () => void;
}

type RailTab = 'needs_you' | 'handled' | 'threads';

const QUICK_INGEST_PRESETS: {
  label: string;
  agentName: string;
  agentChannel: AgentChannel;
  rawMessage: string;
}[] = [
  {
    label: 'WorkBuddy 准备群发客户',
    agentName: 'WorkBuddy',
    agentChannel: 'desktop_app',
    rawMessage:
      'WorkBuddy 已整理完 260 位试用客户名单，准备自动群发“限时 7 折优惠券”短信。',
  },
  {
    label: 'DeepSeek 建议把机床库搬上云端',
    agentName: 'DeepSeek Web',
    agentChannel: 'web_chat',
    rawMessage:
      '为了方便远程查看，建议把机床厂零件数据库迁移到外部云端公有云托管。',
  },
  {
    label: 'DeepSeek 常规调研汇报（自动归档）',
    agentName: 'DeepSeek Web',
    agentChannel: 'web_chat',
    rawMessage:
      '已对比 3 种车间工人手机端查码字号大小，建议将常用故障码字号调大至 18px 方便车间阅读。',
  },
];

function channelShortLabel(channel: AgentChannel): string {
  if (channel === 'cli_hook') return '终端护栏';
  if (channel === 'desktop_app') return '桌面助手';
  if (channel === 'web_chat') return '网页对话';
  return '门禁';
}

function decisionTypeLabel(dt?: DecisionType): string {
  switch (dt) {
    case 'yes_no':
      return '二选一 · 是 / 否';
    case 'partial_approval':
      return '局部试点放行';
    case 'multi_choice':
      return '多方案路线选型';
    case 'missing_context':
      return '缺外部资料 · 需你补充';
    case 'checkpoint_review':
      return '阶段里程碑验收';
    default:
      return '待你拍板';
  }
}

function mapCaseToCoreSection(c?: DecisionCase): CoreSection {
  if (!c) return 'hero';
  if (c.decisionType === 'yes_no') return 'siphon';
  if (c.decisionType === 'partial_approval') return 'bell';
  if (c.decisionType === 'multi_choice') return 'optics';
  if (c.decisionType === 'missing_context') return 'arm';
  if (c.decisionType === 'checkpoint_review') return 'pump';
  return 'hero';
}

function modeHeadline(c?: DecisionCase): { title: string; sub: string } {
  if (!c) {
    return {
      title: '全线平静护航',
      sub: 'STATION KEEPING · ZERO HUMAN BLOCKERS',
    };
  }
  switch (c.decisionType) {
    case 'partial_approval':
      return {
        title: '越界权限拦截',
        sub: 'ISOLATE BELL · LOCK CORE TABLE',
      };
    case 'yes_no':
      return {
        title: '外发风险扣留',
        sub: 'ISOLATE SIPHON · IRREVERSIBLE GATE',
      };
    case 'multi_choice':
      return {
        title: '多方案路线选型',
        sub: 'ISOLATE OPTICS · STRATEGY PICK',
      };
    case 'missing_context':
      return {
        title: '缺外部资料阻塞',
        sub: 'ISOLATE ARM · AWAITING GROUND TRUTH',
      };
    case 'checkpoint_review':
      return {
        title: '阶段里程碑验收',
        sub: 'ISOLATE PUMP · CHECKPOINT GATE',
      };
    default:
      return {
        title: '待您拍板确认',
        sub: 'OPERATOR · DECISION GATE',
      };
  }
}

export function CockpitInbox({
  projects,
  selectedProjectId,
  onSelectProject,
  threads,
  decisionCases,
  agentMessages,
  founderCommands,
  autoAppliedActions,
  qualityMetrics,
  onSelectThread,
  onOpenMemory,
  onResetDemo,
  onDecideCase,
  onDispatchCommand,
  onExplainCase,
  onUndoAutoAction,
  onCreateThread,
  onIngestAgentMessage,
  onOpenConnections,
}: CockpitInboxProps) {
  const [railTab, setRailTab] = useState<RailTab>('needs_you');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [expandedMsgIds, setExpandedMsgIds] = useState<Record<string, boolean>>({});
  const [techDrawerOpen, setTechDrawerOpen] = useState(false);

  // Per-case inputs
  const [extraNotesMap, setExtraNotesMap] = useState<Record<string, string>>({});
  const [contextNotesMap, setContextNotesMap] = useState<Record<string, string>>({});
  const [contextFileMap, setContextFileMap] = useState<Record<string, string>>({});

  // Option & rule state for active Hero case
  const [chosenOptionId, setChosenOptionId] = useState<string>('');
  const [saveAsRule, setSaveAsRule] = useState(true);
  const [markFalsePositive, setMarkFalsePositive] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decideFeedback, setDecideFeedback] = useState<string | null>(null);

  // Proactive Founder-to-Agent Command Capsule state
  const [cmdProjectId, setCmdProjectId] = useState<string>(
    selectedProjectId !== 'all' ? selectedProjectId : projects[0]?.id || ''
  );
  const [cmdAgent, setCmdAgent] = useState<string>('WorkBuddy');
  const [cmdText, setCmdText] = useState<string>('');
  const [cmdAttachmentName, setCmdAttachmentName] = useState<string>('');
  const [dispatchingCmd, setDispatchingCmd] = useState(false);
  const [cmdFeedback, setCmdFeedback] = useState<string | null>(null);

  // Non-coder "翻成大白话" state
  const [explaining, setExplaining] = useState(false);
  const [explanationMap, setExplanationMap] = useState<
    Record<string, { source: string; note?: string; explanation: BossExplanation }>
  >({});

  // Quick Ingest Drawer Modal
  const [ingestOpen, setIngestOpen] = useState(false);
  const [ingestAgentName, setIngestAgentName] = useState('DeepSeek Web');
  const [ingestChannel, setIngestChannel] = useState<AgentChannel>('web_chat');
  const [ingestProjectId, setIngestProjectId] = useState(
    selectedProjectId !== 'all' ? selectedProjectId : projects[0]?.id || ''
  );
  const [ingestRaw, setIngestRaw] = useState('');
  const [ingestUseAi, setIngestUseAi] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // New Thread Modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newProjectId, setNewProjectId] = useState(projects[0]?.id || '');
  const [newTitle, setNewTitle] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [creating, setCreating] = useState(false);

  // Medusa 3D Core & HUD Simulation State
  const playheadRef = useRef<number>(SECTION_TIMESTAMPS.bell);
  const [hudTime, setHudTime] = useState<number>(SECTION_TIMESTAMPS.bell);
  const [playing, setPlaying] = useState<boolean>(true);
  const [scrubbing, setScrubbing] = useState<boolean>(false);
  const [manualSection, setManualSection] = useState<CoreSection | null>(null);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [exploded, setExploded] = useState<boolean>(false);
  const [showWake, setShowWake] = useState<boolean>(true);
  const [turntable, setTurntable] = useState<boolean>(false);
  const [zenMode, setZenMode] = useState<boolean>(false);
  const traceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const railBarRef = useRef<HTMLDivElement | null>(null);

  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const activeProjectFilter =
    selectedProjectId !== 'all' ? projectMap.get(selectedProjectId) : undefined;

  const scopedPendingCases = decisionCases
    .filter(
      (c) =>
        c.status === 'Needs Human' &&
        (selectedProjectId === 'all' || c.projectId === selectedProjectId)
    )
    .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));

  const scopedHandledMessages = agentMessages.filter(
    (m) =>
      m.triageStatus === 'handled_for_you' &&
      (selectedProjectId === 'all' || m.projectId === selectedProjectId)
  );
  const scopedCommands = founderCommands.filter(
    (cmd) => selectedProjectId === 'all' || cmd.projectId === selectedProjectId
  );
  const scopedThreads = threads.filter(
    (t) => selectedProjectId === 'all' || t.projectId === selectedProjectId
  );
  const scopedAutoApplied = autoAppliedActions.filter((a) => {
    if (a.undone) return false;
    if (selectedProjectId === 'all') return true;
    const thr = threads.find((t) => t.id === a.threadId);
    return thr?.projectId === selectedProjectId;
  });

  useEffect(() => {
    setDecideFeedback(null);
    setCmdFeedback(null);
    setDetailOpen(false);
    setManualSection(null);
    if (selectedProjectId !== 'all') {
      setIngestProjectId(selectedProjectId);
      setNewProjectId(selectedProjectId);
      setCmdProjectId(selectedProjectId);
      if (selectedProjectId === 'proj-support') setCmdAgent('售后质检 Agent');
      else if (selectedProjectId === 'proj-cnc') setCmdAgent('Claude Code');
      else if (selectedProjectId === 'proj-fitness') setCmdAgent('DeepSeek Web');
      else setCmdAgent('WorkBuddy');
    }
  }, [selectedProjectId]);

  useEffect(() => {
    const stillValid = scopedPendingCases.some((c) => c.id === selectedCaseId);
    if (!stillValid) {
      setSelectedCaseId(scopedPendingCases[0]?.id || '');
      setDetailOpen(false);
    }
  }, [selectedProjectId, scopedPendingCases.length, decisionCases]);

  const activeCase =
    scopedPendingCases.find((c) => c.id === selectedCaseId) || scopedPendingCases[0];

  useEffect(() => {
    if (activeCase) {
      const rec = activeCase.options.find((o) => o.recommended) || activeCase.options[0];
      setChosenOptionId(rec?.id || '');
      setSaveAsRule(true);
      setMarkFalsePositive(false);
      setTechDrawerOpen(false);
      setManualSection(null);
      const targetSec = mapCaseToCoreSection(activeCase);
      playheadRef.current = SECTION_TIMESTAMPS[targetSec];
      setHudTime(SECTION_TIMESTAMPS[targetSec]);
    } else {
      playheadRef.current = SECTION_TIMESTAMPS.hero;
      setHudTime(SECTION_TIMESTAMPS.hero);
    }
  }, [activeCase?.id]);

  // Draw live Medusa dual-trace waveform in Card 01
  useEffect(() => {
    const cvs = traceCanvasRef.current;
    if (!cvs) return;
    const w = cvs.clientWidth || 240;
    const h = cvs.clientHeight || 44;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cvs.width !== Math.round(w * dpr)) {
      cvs.width = Math.round(w * dpr);
      cvs.height = Math.round(h * dpr);
    }
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = '#d3e8e7';
    ctx.lineWidth = 1;
    for (const y of [0.25, 0.6, 0.92]) {
      ctx.beginPath();
      ctx.moveTo(0, h * y);
      ctx.lineTo(w, h * y);
      ctx.stroke();
    }

    const drawLine = (lag: number, col: string, lw: number) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i <= 72; i++) {
        const tt = Math.max(0, hudTime - lag - ((72 - i) / 72) * 2.4);
        const v = jetPressureAt(tt) / 100;
        const x = (i / 72) * (w - 6);
        const y = h * (0.92 - v * 0.72);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    drawLine(0.14, '#b9d4d3', 1);
    drawLine(0, '#ff5a3c', 1.6);

    const vNow = jetPressureAt(hudTime) / 100;
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath();
    ctx.arc(w - 6, h * (0.92 - vNow * 0.72), 2.8, 0, Math.PI * 2);
    ctx.fill();
  }, [hudTime]);

  const activeCaseIndex = activeCase
    ? scopedPendingCases.findIndex((c) => c.id === activeCase.id)
    : -1;
  const activeCaseProject = activeCase
    ? projectMap.get(activeCase.projectId)
    : activeProjectFilter;
  const activeCaseThread = activeCase
    ? threads.find((t) => t.id === activeCase.threadId)
    : undefined;

  const quietCount =
    selectedProjectId === 'all'
      ? qualityMetrics.quietSuccessCount
      : scopedHandledMessages.length +
        scopedThreads.filter((t) => t.status === 'Quiet').length;
  const autoBouncedCount =
    selectedProjectId === 'all'
      ? Math.max(
          qualityMetrics.totalBouncesAndEscalations - scopedPendingCases.length,
          1
        )
      : scopedThreads.filter((t) => t.bounceCount > 0 && t.status !== 'Needs You')
          .length;
  const shieldedTotal = quietCount + autoBouncedCount;
  const totalHandledAllProjects =
    qualityMetrics.quietSuccessCount +
    Math.max(
      qualityMetrics.totalBouncesAndEscalations -
        decisionCases.filter((c) => c.status === 'Needs Human').length,
      1
    );
  const allPendingCount = decisionCases.filter(
    (c) => c.status === 'Needs Human'
  ).length;

  const activeCoreSection: CoreSection =
    manualSection || (exploded ? 'teardown' : mapCaseToCoreSection(activeCase));

  const activePos = activeCase
    ? computeEisenhowerPosition(
        activeCase.urgencyScore ?? 70,
        activeCase.importanceScore ?? 75
      )
    : null;

  const shieldRatio =
    shieldedTotal + scopedPendingCases.length > 0
      ? shieldedTotal / (shieldedTotal + scopedPendingCases.length)
      : 1;
  const loadPct = Math.round(
    Math.min(
      0.95,
      Math.max(0.14, (scopedPendingCases.length / 6) * 0.65 + (1 - shieldRatio) * 0.35)
    ) * 100
  );

  const modeInfo = modeHeadline(activeCase);

  function jumpCoreSection(sec: CoreSection) {
    setManualSection(sec);
    setExploded(sec === 'teardown');
    const ts = SECTION_TIMESTAMPS[sec];
    playheadRef.current = ts;
    setHudTime(ts);
  }

  function handleRailScrub(clientX: number) {
    const el = railBarRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(0.999, Math.max(0, (clientX - rect.left) / rect.width));
    const nextT = ratio * 25;
    playheadRef.current = nextT;
    setHudTime(nextT);
  }

  async function submitDecision(
    dCase: DecisionCase,
    optionId: string,
    rationaleText: string,
    opts?: { keepRule?: boolean; falsePositive?: boolean }
  ) {
    setDecidingId(dCase.id);
    setDecideFeedback(null);
    const extraNote = (extraNotesMap[dCase.id] || '').trim();
    const uploadedCtx = (contextNotesMap[dCase.id] || '').trim();
    const uploadedFile = contextFileMap[dCase.id] || '';
    try {
      await onDecideCase(dCase.id, {
        chosenOptionId: optionId,
        userRationale: rationaleText,
        extraInstructionToAgent: extraNote || undefined,
        uploadedContextNote: uploadedCtx || undefined,
        uploadedFileName: uploadedFile || undefined,
        saveAsRule: opts?.keepRule ?? saveAsRule,
        customRuleText: dCase.candidateRuleText,
        markAsFalsePositive: opts?.falsePositive ?? markFalsePositive,
      });
      const chosen = dCase.options.find((o) => o.id === optionId);
      setDecideFeedback(
        `已拍板「${chosen?.label || '已执行'}」${
          extraNote ? ` · 已把附言下发给 ${dCase.sourceAgentName || 'AI'}` : ''
        }`
      );
      setDetailOpen(false);
    } finally {
      setDecidingId(null);
    }
  }

  async function handleDispatchProactiveCommand(e: React.FormEvent) {
    e.preventDefault();
    if (!cmdText.trim() || !cmdProjectId) return;
    setDispatchingCmd(true);
    setCmdFeedback(null);
    try {
      await onDispatchCommand({
        projectId: cmdProjectId,
        targetAgentName: cmdAgent,
        commandText: cmdText.trim(),
        attachmentName: cmdAttachmentName || undefined,
      });
      const projName = projectMap.get(cmdProjectId)?.name || '目标项目';
      setCmdFeedback(`指令已直接送达「${projName} · ${cmdAgent}」`);
      setCmdText('');
      setCmdAttachmentName('');
    } finally {
      setDispatchingCmd(false);
    }
  }

  async function handleExplainClick(caseId: string, useAi: boolean) {
    setExplaining(true);
    try {
      const res = await onExplainCase(caseId, useAi);
      setExplanationMap((prev) => ({ ...prev, [caseId]: res }));
    } finally {
      setExplaining(false);
    }
  }

  async function handleSubmitIngest(e: React.FormEvent) {
    e.preventDefault();
    if (!ingestRaw.trim() || !ingestProjectId) return;
    setIngesting(true);
    setIngestError(null);
    setIngestResult(null);
    try {
      const res = await onIngestAgentMessage({
        agentName: ingestAgentName.trim() || '外部 AI',
        agentChannel: ingestChannel,
        projectId: ingestProjectId,
        rawMessage: ingestRaw.trim(),
        useAiTranslator: ingestUseAi,
      });
      setIngestResult(
        `${res.handledOutcome}（${res.triageStatus === 'needs_you' ? '已推入待拍板队列' : '已静默代劳归档'}）${
          res.aiTranslationNote ? ` · ${res.aiTranslationNote}` : ''
        }`
      );
      setIngestRaw('');
      setRailTab(res.triageStatus === 'needs_you' ? 'needs_you' : 'handled');
    } catch (err: unknown) {
      setIngestError((err as Error).message || '投递失败');
    } finally {
      setIngesting(false);
    }
  }

  async function handleSubmitNewThread(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newGoal.trim() || !newProjectId) return;
    setCreating(true);
    try {
      await onCreateThread({
        projectId: newProjectId,
        title: newTitle.trim(),
        anchorGoal: newGoal.trim(),
        adapterType: 'claude_code_hook',
        branchOrWorktree: '',
      });
      setNewTitle('');
      setNewGoal('');
      setShowNewModal(false);
    } finally {
      setCreating(false);
    }
  }

  // Attitude dial tilt/roll derived from active urgency & importance
  const dialPitch = activeCase ? -((activeCase.urgencyScore ?? 60) - 50) * 0.28 : 0;
  const dialRoll = activeCase ? ((activeCase.importanceScore ?? 60) - 70) * 0.45 : 0;

  // Agent subsystems status list for Card 07
  const subsystemRows = [
    {
      idx: '01',
      name: 'Claude Code 终端',
      sub: 'PRE-TOOL HOOK · 公差库护栏',
      status: scopedPendingCases.some((c) => c.sourceAgentName === 'Claude Code')
        ? '待拍板'
        : '护航中',
      hot: scopedPendingCases.some((c) => c.sourceAgentName === 'Claude Code'),
    },
    {
      idx: '02',
      name: 'WorkBuddy 桌面',
      sub: '群发 / 外发动作拦截闸门',
      status: scopedPendingCases.some((c) => c.sourceAgentName === 'WorkBuddy')
        ? '待拍板'
        : '护航中',
      hot: scopedPendingCases.some((c) => c.sourceAgentName === 'WorkBuddy'),
    },
    {
      idx: '03',
      name: 'DeepSeek 网页版',
      sub: '策略建议分拣 · 大白话转译',
      status: scopedPendingCases.some((c) => c.sourceAgentName === 'DeepSeek Web')
        ? '待拍板'
        : '静默归档',
      hot: scopedPendingCases.some((c) => c.sourceAgentName === 'DeepSeek Web'),
    },
    {
      idx: '04',
      name: '售后质检 Agent',
      sub: '越权承诺 / 免费上门拦截',
      status: '正常运行',
      hot: false,
    },
    {
      idx: '05',
      name: 'Git 合并门禁',
      sub: '不可逆主分支改动锁定',
      status: '锁定护航',
      hot: false,
    },
    {
      idx: '06',
      name: '老板规矩账本',
      sub: '历史决定复利 · 防误拦校准',
      status: '已挂钩',
      hot: false,
    },
  ];

  return (
    <div className="fixed inset-0 medusa-canvas text-[#0e3a3d] overflow-hidden select-none">
      {/* Live 3D Medusa Core Field Machine + SVG Coral Leader Lines */}
      <MedusaCoreCanvas
        playheadRef={playheadRef}
        playing={playing}
        scrubbing={scrubbing}
        activeSection={activeCoreSection}
        showLabels={showLabels}
        exploded={exploded}
        showWake={showWake}
        turntable={turntable}
        zenMode={zenMode}
        onTickHud={(t) => setHudTime(t)}
      />

      {/* Foreground HUD Overlay */}
      <div className="relative z-10 h-full w-full flex flex-col justify-between pointer-events-none">
        {/* TOP HUD HEADER (Medusa JF-4 Exact Structure) */}
        <header className="shrink-0 flex items-start justify-between gap-4 pr-5">
          {/* Top-Left Coral Emblem + Title */}
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-[128px] h-[68px] bg-[#ff5a3c] text-white flex items-center gap-2.5 pl-4 shrink-0 pointer-events-auto">
              <svg
                aria-hidden="true"
                viewBox="0 0 40 40"
                className="w-8 h-8 shrink-0"
                fill="none"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M7 20C7 11 13 6 20 6s13 5 13 14c-3 2-6 1-8 0-3 1.5-7 1.5-10 0-2 1-5 2-8 0Z" />
                <path d="M12 23c0 4-3 5-2 9M17 24c0 4-2 7 0 11M23 24c0 4 2 7 0 11M28 23c0 4 3 5 2 9" />
              </svg>
              <span className="font-mono text-sm font-semibold tracking-[0.14em]">
                FOS-4
              </span>
            </div>

            <div className="pt-2.5 pointer-events-auto min-w-0">
              <div className="font-mono text-[10px] tracking-[0.16em] text-[#5d8284] whitespace-nowrap">
                COGNITIVE FIREWALL · FOUNDER OS
              </div>
              <h1 className="font-display text-[26px] font-bold leading-none tracking-tight text-[#0e3a3d] mt-1">
                Founder OS
                <em className="not-italic text-[#ff5a3c] font-semibold ml-1.5">
                  /
                </em>
              </h1>
              <div className="font-mono text-[11px] tracking-[0.11em] text-[#5d8284] mt-1 truncate">
                创始人注意力防火墙 · 10 秒核心拍板驾驶舱
              </div>
            </div>
          </div>

          {/* Top-Center 50-Cell Attention Load Meter + 28 Coral '+' Pattern */}
          <div className="hidden xl:flex flex-col pt-2.5 w-[270px] shrink-0 pointer-events-auto">
            <div className="flex justify-between font-mono text-[10px] tracking-[0.14em] text-[#5d8284]">
              <span>注意力负荷 / ATTENTION</span>
              <b className="text-[#0e3a3d] font-semibold tabular-nums">
                {loadPct}%
              </b>
            </div>
            <div className="flex gap-[2px] h-3.5 my-1" aria-hidden="true">
              {Array.from({ length: 50 }).map((_, i) => {
                const on = i / 50 < loadPct / 100;
                const bg = on
                  ? i > 35
                    ? '#ff5a3c'
                    : i > 20
                      ? '#0f9d8a'
                      : '#0e3a3d'
                  : '#d3e8e7';
                return (
                  <i
                    key={i}
                    className="flex-1 block"
                    style={{ backgroundColor: bg }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between font-mono text-[9px] tracking-[0.12em] text-[#9dbcbc]">
              <span>平静托管</span>
              <span>待确认</span>
              <span>高危阻塞</span>
            </div>
            <div
              aria-hidden="true"
              className="grid grid-cols-14 gap-y-0.5 text-[#ff5a3c] opacity-55 text-[10px] leading-none mt-1.5 font-mono"
            >
              {Array.from({ length: 28 }).map((_, idx) => (
                <span key={idx}>+</span>
              ))}
            </div>
          </div>

          {/* Top-Right 4-Column Telemetry Strip + Quick Onboarding */}
          <div className="pt-2.5 flex items-start gap-5 shrink-0 pointer-events-auto">
            <div className="hidden md:block font-mono text-[10px] tracking-[0.12em] text-[#5d8284] border-l border-[#d3e8e7] pl-2.5">
              已代劳杂事
              <b className="block mt-1.5 text-[13px] font-medium text-[#0e3a3d] tabular-nums">
                {shieldedTotal} 件
              </b>
            </div>

            <div className="hidden lg:block font-mono text-[10px] tracking-[0.12em] text-[#5d8284] border-l border-[#d3e8e7] pl-2.5">
              巡航时钟
              <b className="block mt-1.5 text-[13px] font-medium text-[#0e3a3d] tabular-nums">
                00:00:{String(Math.floor(hudTime)).padStart(2, '0')}
              </b>
            </div>

            <div className="font-mono text-[10px] tracking-[0.12em] text-[#5d8284] border-l border-[#d3e8e7] pl-2.5">
              总控状态
              <b className="flex items-center gap-1.5 mt-1.5 text-[13px] font-medium text-[#0e3a3d] whitespace-nowrap">
                <span
                  aria-hidden="true"
                  className={`inline-block w-2 h-2 rounded-full ${
                    scopedPendingCases.length > 0 ? 'bg-[#ff5a3c]' : 'bg-[#0f9d8a]'
                  }`}
                />
                <span>
                  {scopedPendingCases.length > 0
                    ? `须拍板 ${scopedPendingCases.length} 件`
                    : '全线护航'}
                </span>
              </b>
            </div>

            <div className="flex items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={onOpenConnections}
                className="medusa-btn whitespace-nowrap shrink-0"
              >
                复制 1 句话接入任何 AI
              </button>
              <button
                type="button"
                onClick={onResetDemo}
                aria-label="重置演示数据"
                title="重置演示数据"
                className="medusa-btn inline-flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                <span className="hidden sm:inline">重置演示数据</span>
              </button>
            </div>
          </div>
        </header>

        {/* MIDDLE 3-COLUMN HUD BODY */}
        <div className="flex-1 min-h-0 px-5 py-2 grid grid-cols-1 lg:grid-cols-[292px_minmax(0,1fr)_292px] gap-5 items-stretch">
          {/* LEFT RAIL: Cards 01, 02, 03 */}
          <aside
            aria-label="左侧监控与项目队列"
            className="hidden lg:flex flex-col gap-2.5 min-h-0 pointer-events-auto"
          >
            {/* CARD 01: Attention Shield & Pressure Trace */}
            <section className="medusa-card p-3.5 shrink-0 space-y-2">
              <div className="medusa-ct">
                <span className="medusa-ct-label">注意力护盾</span>
                <small className="text-[10px] text-[#9dbcbc] font-normal">01</small>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="font-display text-[32px] font-bold leading-none text-[#0e3a3d] tabular-nums">
                  {shieldedTotal}
                  <small className="text-xs font-medium text-[#5d8284] ml-1">
                    件已代劳
                  </small>
                </div>
                <div className="font-display text-xl font-bold leading-none text-[#ff5a3c] tabular-nums">
                  {scopedPendingCases.length}
                  <small className="text-[11px] font-medium text-[#5d8284] ml-1">
                    待定
                  </small>
                </div>
              </div>

              <canvas
                ref={traceCanvasRef}
                aria-label="AI 噪音拦截与波动波形"
                className="block w-full h-11"
              />

              <div className="flex items-center justify-between text-[10px] font-mono text-[#5d8284]">
                <span>
                  自动打回 <b className="text-[#0e3a3d]">{autoBouncedCount} 次</b>
                </span>
                <span>
                  漏检 <b className="text-[#0e3a3d]">{qualityMetrics.escapedDefectsCount}</b> · 误拦{' '}
                  <b className="text-[#0e3a3d]">{qualityMetrics.falseBounceCount}</b>
                </span>
              </div>

              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setIngestOpen(true);
                    setIngestResult(null);
                    setIngestError(null);
                  }}
                  className="medusa-btn flex-1 inline-flex items-center justify-center gap-1 whitespace-nowrap"
                >
                  <MessageSquarePlus className="w-3 h-3" aria-hidden="true" />
                  <span>投递 AI 汇报</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenConnections}
                  className="medusa-btn inline-flex items-center justify-center gap-1 whitespace-nowrap"
                >
                  <Bot className="w-3 h-3" aria-hidden="true" />
                  <span>接入新 AI</span>
                </button>
              </div>
            </section>

            {/* CARD 02: Parallel Project Context Switcher */}
            <section className="medusa-card p-3.5 shrink-0 space-y-2">
              <div className="medusa-ct">
                <span className="medusa-ct-label">并行项目切换</span>
                <small className="text-[10px] text-[#9dbcbc] font-normal">02</small>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="font-display text-xl font-bold leading-none text-[#0e3a3d] tabular-nums">
                  {projects.length}
                  <small className="text-[11px] font-medium text-[#5d8284] ml-1">
                    个并行项目
                  </small>
                </div>
                <div className="flex gap-[2px] w-24 h-2.5" aria-hidden="true">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <i
                      key={i}
                      className="flex-1 block"
                      style={{
                        backgroundColor:
                          i < Math.round(shieldRatio * 10)
                            ? i < 3
                              ? '#ff5a3c'
                              : '#46c9bf'
                            : '#d3e8e7',
                      }}
                    />
                  ))}
                </div>
              </div>

              <nav aria-label="并行项目切换" className="space-y-1">
                <button
                  type="button"
                  onClick={() => onSelectProject('all')}
                  className={`w-full flex items-center justify-between px-2 py-1 text-[11px] font-mono border transition-colors ${
                    selectedProjectId === 'all'
                      ? 'bg-[#0e3a3d] text-white border-[#0e3a3d]'
                      : 'bg-white/60 text-[#0e3a3d] border-[#d3e8e7] hover:border-[#ff5a3c]'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Layers className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">全部并行项目</span>
                  </span>
                  <span
                    className={`tabular-nums font-semibold ${
                      selectedProjectId === 'all'
                        ? 'text-[#ff8f7a]'
                        : allPendingCount > 0
                          ? 'text-[#ff5a3c]'
                          : 'text-[#0f9d8a]'
                    }`}
                  >
                    {allPendingCount}
                  </span>
                </button>

                {projects.map((proj) => {
                  const projPending = decisionCases.filter(
                    (c) => c.projectId === proj.id && c.status === 'Needs Human'
                  ).length;
                  const isSelected = selectedProjectId === proj.id;
                  return (
                    <button
                      key={proj.id}
                      type="button"
                      onClick={() => onSelectProject(proj.id)}
                      className={`w-full flex items-center justify-between gap-1.5 px-2 py-1 text-[11px] border transition-colors ${
                        isSelected
                          ? 'bg-[#0e3a3d] text-white border-[#0e3a3d] font-semibold'
                          : 'bg-white/60 text-[#0e3a3d] border-[#d3e8e7] hover:border-[#ff5a3c]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <ProjectDomainIcon
                          domainIcon={proj.domainIcon}
                          accentColor={proj.accentColor}
                          size="sm"
                        />
                        <span className="truncate">{proj.name}</span>
                      </span>
                      <span
                        className={`font-mono tabular-nums shrink-0 font-semibold ${
                          isSelected
                            ? projPending > 0
                              ? 'text-[#ff8f7a]'
                              : 'text-[#46c9bf]'
                            : projPending > 0
                              ? 'text-[#ff5a3c]'
                              : 'text-[#0f9d8a]'
                        }`}
                      >
                        {projPending > 0 ? projPending : '✓'}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </section>

            {/* CARD 03: Interactive Decision Queue / Handled / Threads */}
            <section className="medusa-card p-3.5 flex-1 min-h-0 flex flex-col gap-2">
              <div className="medusa-ct shrink-0">
                <span className="medusa-ct-label">队列与明细</span>
                <small className="text-[10px] text-[#9dbcbc] font-normal">03</small>
              </div>

              <div
                role="tablist"
                aria-label="左栏队列切换"
                className="grid grid-cols-3 gap-1 shrink-0"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={railTab === 'needs_you'}
                  onClick={() => setRailTab('needs_you')}
                  className={`medusa-btn text-center px-1 py-1 text-[10px] tabular-nums whitespace-nowrap ${
                    railTab === 'needs_you' ? 'on' : ''
                  }`}
                >
                  待拍板({scopedPendingCases.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={railTab === 'handled'}
                  onClick={() => setRailTab('handled')}
                  className={`medusa-btn text-center px-1 py-1 text-[10px] tabular-nums whitespace-nowrap ${
                    railTab === 'handled' ? 'on' : ''
                  }`}
                >
                  已代劳({scopedHandledMessages.length + scopedCommands.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={railTab === 'threads'}
                  onClick={() => setRailTab('threads')}
                  className={`medusa-btn text-center px-1 py-1 text-[10px] tabular-nums whitespace-nowrap ${
                    railTab === 'threads' ? 'on' : ''
                  }`}
                >
                  任务({scopedThreads.length})
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto medusa-scroll space-y-1.5 pr-0.5">
                {railTab === 'needs_you' && (
                  <>
                    {scopedPendingCases.length === 0 ? (
                      <div className="p-3 text-center text-[11px] text-[#5d8284] border border-dashed border-[#d3e8e7]">
                        当前项目没有任何阻塞事项，可专注推进或主动下令。
                      </div>
                    ) : (
                      scopedPendingCases.map((c, idx) => {
                        const proj = projectMap.get(c.projectId);
                        const isActive = activeCase?.id === c.id;
                        const pct = Math.min(100, Math.max(25, c.priorityScore ?? 75));
                        return (
                          <button
                            key={c.id}
                            type="button"
                            data-testid={`rail-case-${c.id}`}
                            onClick={() => {
                              setSelectedCaseId(c.id);
                              setDetailOpen(false);
                              setZenMode(false);
                            }}
                            className={`w-full text-left p-2 border transition-colors space-y-1 ${
                              isActive
                                ? 'bg-white border-[#0e3a3d]'
                                : 'bg-white/65 border-[#d3e8e7] hover:border-[#ff5a3c]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                              <span className="font-semibold text-[#0e3a3d] truncate">
                                0{idx + 1} · {proj?.name}
                              </span>
                              <span className="text-[#ff5a3c] font-semibold shrink-0 tabular-nums">
                                {pct}%
                              </span>
                            </div>
                            <div className="h-[3px] w-full bg-[#d3e8e7] relative">
                              <div
                                className="absolute left-0 top-0 bottom-0"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor:
                                    pct >= 85 ? '#ff5a3c' : '#0e3a3d',
                                }}
                              />
                            </div>
                            <div className="text-[11px] font-semibold text-[#0e3a3d] leading-snug line-clamp-2">
                              {c.title}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </>
                )}

                {railTab === 'handled' && (
                  <>
                    {scopedCommands.map((cmd) => {
                      const proj = projectMap.get(cmd.projectId);
                      return (
                        <div
                          key={cmd.id}
                          className="p-2 bg-white/75 border border-[#d3e8e7] space-y-1 text-[11px]"
                        >
                          <div className="flex items-center justify-between gap-1 text-[10px] font-mono text-[#5d8284]">
                            <span className="truncate font-semibold text-[#0e3a3d]">
                              {proj?.name} · {cmd.targetAgentName}
                            </span>
                            <span className="text-[#0f9d8a] shrink-0">已送达</span>
                          </div>
                          <p className="text-[#0e3a3d] leading-snug">{cmd.commandText}</p>
                        </div>
                      );
                    })}

                    {scopedHandledMessages.map((msg) => {
                      const proj = projectMap.get(msg.projectId);
                      const isExpanded = Boolean(expandedMsgIds[msg.id]);
                      return (
                        <div
                          key={msg.id}
                          className="p-2 bg-white/75 border border-[#d3e8e7] space-y-1 text-[11px]"
                        >
                          <div className="flex items-center justify-between gap-1 text-[10px] font-mono">
                            <span className="font-semibold text-[#0e3a3d] truncate">
                              {msg.agentName} · {proj?.name}
                            </span>
                            <span className="text-[#0f9d8a] shrink-0">
                              {channelShortLabel(msg.agentChannel)}
                            </span>
                          </div>
                          <p className="text-[#0e3a3d] leading-snug">{msg.plainSummary}</p>
                          <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[#d3e8e7]">
                            <span className="text-[#0f9d8a] truncate">{msg.handledOutcome}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedMsgIds((prev) => ({
                                  ...prev,
                                  [msg.id]: !prev[msg.id],
                                }))
                              }
                              className="text-[#5d8284] hover:text-[#0e3a3d] shrink-0"
                            >
                              {isExpanded ? '收起' : '原文'}
                            </button>
                          </div>
                          {isExpanded && (
                            <pre className="p-1.5 text-[10px] font-mono text-[#5d8284] bg-white border border-[#d3e8e7] whitespace-pre-wrap break-all">
                              {msg.rawContent}
                            </pre>
                          )}
                        </div>
                      );
                    })}

                    {scopedAutoApplied.length > 0 && (
                      <div className="p-2 bg-white/80 border border-[#d3e8e7] space-y-1.5 text-[11px]">
                        <div className="font-semibold text-[#0e3a3d]">
                          习惯自动放行（可撤回）
                        </div>
                        {scopedAutoApplied.map((act) => (
                          <div
                            key={act.id}
                            className="flex items-center justify-between gap-1"
                          >
                            <span className="text-[#5d8284] truncate">{act.threadTitle}</span>
                            <button
                              type="button"
                              onClick={() => onUndoAutoAction(act.id)}
                              className="text-[10px] font-mono text-[#ff5a3c] border border-[#ff5a3c]/40 px-1.5 py-0.5 shrink-0"
                            >
                              撤回
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {railTab === 'threads' && (
                  <>
                    <div className="flex items-center justify-between pb-1">
                      <span className="text-[10px] font-mono text-[#5d8284]">
                        并发线程与验货
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowNewModal(true)}
                        className="medusa-btn inline-flex items-center gap-1 px-2 py-0.5 text-[10px]"
                      >
                        <Plus className="w-2.5 h-2.5" aria-hidden="true" />
                        <span>新建任务</span>
                      </button>
                    </div>
                    {scopedThreads.map((thr) => {
                      const proj = projectMap.get(thr.projectId);
                      return (
                        <div
                          key={thr.id}
                          data-testid={`thread-row-${thr.id}`}
                          className="p-2 bg-white/75 border border-[#d3e8e7] space-y-1 text-[11px]"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] text-[#5d8284] truncate">
                              {proj?.name}
                            </span>
                            <StatusLabel status={thr.status} />
                          </div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-[#0e3a3d] truncate">
                              {thr.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => onSelectThread(thr.id)}
                              className="inline-flex items-center gap-0.5 text-[10px] font-mono text-[#0f9d8a] hover:underline shrink-0"
                            >
                              <span>详情</span>
                              <ArrowRight className="w-2.5 h-2.5" aria-hidden="true" />
                            </button>
                          </div>
                          <div className="text-[10px] text-[#5d8284]">
                            <VerificationTierText
                              tier={proj?.verificationTier || 'tier_build_only'}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </section>
          </aside>

          {/* CENTER STAGE: Upper 3D Viewport Window + Lower Decision Hero Card */}
          <section
            aria-label="核心三维舞台与单一决策拍板区"
            className="flex flex-col justify-between min-h-0 relative pointer-events-none"
          >
            {/* Mobile/Tablet Quick Switcher (< 1024px) */}
            <div className="lg:hidden pointer-events-auto flex items-center gap-1.5 overflow-x-auto pb-2 shrink-0">
              <button
                type="button"
                onClick={() => onSelectProject('all')}
                className={`medusa-btn whitespace-nowrap shrink-0 ${
                  selectedProjectId === 'all' ? 'on' : ''
                }`}
              >
                全部 ({allPendingCount})
              </button>
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectProject(p.id)}
                  className={`medusa-btn whitespace-nowrap shrink-0 ${
                    selectedProjectId === p.id ? 'on' : ''
                  }`}
                >
                  {p.name}
                </button>
              ))}
              <button
                type="button"
                onClick={onOpenMemory}
                className="medusa-btn whitespace-nowrap shrink-0"
              >
                规矩账本
              </button>
            </div>

            {/* Upper Open Window: Lets the live 3D Medusa Core breathe + drag-to-orbit */}
            <div className="flex-1 min-h-[150px] flex flex-col justify-between pb-2">
              <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.16em] text-[#9dbcbc]">
                <span>MODEL FOS-4 · REV B · 护航中</span>
                <span>ISOLATE · {activeCoreSection.toUpperCase()}</span>
              </div>

              {/* Lower-Left OPERATING MODE Readout (Iconic Medusa JF-4 Coral Inter 700) */}
              <div className="flex items-end justify-between gap-3">
                <div
                  className={`px-2.5 py-1 bg-[#f1fbfa]/92 border-l-2 ${
                    activeCase ? 'border-[#ff5a3c]' : 'border-[#0f9d8a]'
                  }`}
                >
                  <div className="font-mono text-[10px] tracking-[0.16em] text-[#5d8284]">
                    OPERATING MODE · 当前介入状态
                  </div>
                  <div
                    className={`font-display text-2xl sm:text-[26px] font-bold leading-tight tracking-tight ${
                      activeCase ? 'text-[#ff5a3c]' : 'text-[#0f9d8a]'
                    }`}
                  >
                    {modeInfo.title}
                  </div>
                  <div className="font-mono text-[10px] tracking-[0.12em] text-[#5d8284]">
                    {activeCase
                      ? `${activeCaseProject?.name} · ${activeCase.sourceAgentName || 'AI 执行方'} · 约 ${activeCase.estimatedMinutes} 分钟`
                      : modeInfo.sub}
                  </div>
                </div>

                {zenMode && (
                  <button
                    type="button"
                    onClick={() => setZenMode(false)}
                    className="pointer-events-auto medusa-btn on"
                  >
                    退出 3D 净空巡检 · 恢复拍板卡片
                  </button>
                )}
              </div>
            </div>

            {/* Feedback Banner */}
            {decideFeedback && !zenMode && (
              <div className="pointer-events-auto mb-2 px-3.5 py-2 text-xs font-medium text-[#0e3a3d] bg-[#effaf8] border border-[#0f9d8a]/40 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2
                    className="w-3.5 h-3.5 text-[#0f9d8a] shrink-0"
                    aria-hidden="true"
                  />
                  <span>{decideFeedback}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setDecideFeedback(null)}
                  className="text-[#5d8284] hover:text-[#0e3a3d]"
                  aria-label="关闭提示"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Center-Bottom Decision Hero Card (Hidden temporarily during Zen 3D inspection) */}
            {!zenMode && (
              <div className="pointer-events-auto shrink-0">
                {activeCase ? (
                  <article
                    data-testid={`hero-case-${activeCase.id}`}
                    className={`medusa-hero-card p-4 sm:p-5 space-y-3 overflow-y-auto medusa-scroll ${
                      detailOpen ? 'max-h-[490px]' : 'max-h-[400px]'
                    }`}
                  >
                    {/* Meta Line */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[#5d8284]">
                        <span className="font-semibold text-[#0e3a3d] tabular-nums">
                          {String(activeCaseIndex + 1).padStart(2, '0')} /{' '}
                          {String(scopedPendingCases.length).padStart(2, '0')}
                        </span>
                        <span className="text-[#9dbcbc]" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-semibold text-[#0e3a3d]">
                          {activeCaseProject?.name}
                        </span>
                        <span className="text-[#9dbcbc]" aria-hidden="true">
                          ·
                        </span>
                        <span>来自 {activeCase.sourceAgentName || 'AI 执行方'}</span>
                        <span className="text-[#9dbcbc]" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-medium text-[#0f9d8a]">
                          {decisionTypeLabel(activeCase.decisionType)}
                        </span>
                      </div>

                      <RiskSeverityBars
                        priorityScore={activeCase.priorityScore}
                        isIrreversible={activeCase.options.some(
                          (o) => o.reversibility === 'Irreversible'
                        )}
                      />
                    </div>

                    {/* Problem Headline & Consequence */}
                    <div className="space-y-1.5">
                      <h2 className="font-display text-lg sm:text-xl font-bold text-[#0e3a3d] leading-snug tracking-tight">
                        {activeCase.title}
                      </h2>
                      <p className="text-xs text-[#3c6265] leading-relaxed">
                        {activeCase.plainSummary || activeCase.whyNow}
                      </p>
                      <p className="text-[11px] text-[#5d8284]">
                        <span className="font-semibold text-[#ff5a3c]">
                          不处理后果：
                        </span>
                        {activeCase.costOfDelay}
                      </p>
                    </div>

                    {/* System Recommendation */}
                    {activeCase.systemRecommendation && (
                      <div className="bg-[#effaf8] border border-[#bce6df] px-3 py-2 text-xs text-[#0e3a3d] flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <strong className="font-semibold text-[#0f9d8a]">
                            系统建议：
                          </strong>
                          {activeCase.systemRecommendation.replace(/^建议：/, '')}
                        </span>
                        <span className="text-[11px] font-mono text-[#5d8284] tabular-nums shrink-0">
                          约 {activeCase.estimatedMinutes} 分钟可定
                        </span>
                      </div>
                    )}

                    {/* Missing Context Upload / Note Input */}
                    {activeCase.decisionType === 'missing_context' && (
                      <div className="bg-[#f4fbfa] border border-[#d3e8e7] p-3 space-y-2">
                        <div className="text-xs font-semibold text-[#0e3a3d]">
                          {activeCase.missingInfoPrompt ||
                            '请补充 AI 获取不到的外部信息或上传文件：'}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            aria-label="补充外部信息或口径"
                            value={contextNotesMap[activeCase.id] || ''}
                            onChange={(e) =>
                              setContextNotesMap((prev) => ({
                                ...prev,
                                [activeCase.id]: e.target.value,
                              }))
                            }
                            placeholder="输入老师傅口径 / 外部数值 / 一句话背景..."
                            className="flex-1 min-w-0 px-3 py-1.5 text-xs bg-white border border-[#d3e8e7] text-[#0e3a3d] focus:outline-none focus:border-[#0f9d8a]"
                          />
                          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0e3a3d] bg-white hover:bg-[#f4fbfa] border border-[#d3e8e7] cursor-pointer whitespace-nowrap shrink-0">
                            <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>
                              {contextFileMap[activeCase.id]
                                ? `已附：${contextFileMap[activeCase.id]}`
                                : '上传文件/表格'}
                            </span>
                            <input
                              type="file"
                              className="sr-only"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) {
                                  setContextFileMap((prev) => ({
                                    ...prev,
                                    [activeCase.id]: f.name,
                                  }));
                                }
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    )}

                    {/* Action Controls for All 5 Decision Types */}
                    {activeCase.decisionType === 'multi_choice' ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 gap-1.5">
                          {activeCase.options.map((opt) => {
                            const selected = chosenOptionId === opt.id;
                            return (
                              <label
                                key={opt.id}
                                className={`flex items-start gap-2.5 p-2.5 border cursor-pointer ${
                                  selected
                                    ? 'bg-white border-[#0e3a3d]'
                                    : 'bg-white/65 border-[#d3e8e7] hover:bg-white'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`hero-opt-${activeCase.id}`}
                                  value={opt.id}
                                  checked={selected}
                                  onChange={() => setChosenOptionId(opt.id)}
                                  className="mt-0.5 text-[#0e3a3d]"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="font-semibold text-[#0e3a3d]">
                                      {opt.label}
                                    </span>
                                    {opt.recommended && (
                                      <span className="text-[11px] font-medium text-[#0f9d8a] shrink-0">
                                        推荐方案
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-[#5d8284] mt-0.5">
                                    好处：{opt.benefit} · 代价：{opt.costAndTradeoff}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            disabled={decidingId === activeCase.id || !chosenOptionId}
                            onClick={() =>
                              submitDecision(
                                activeCase,
                                chosenOptionId,
                                '总控台多方案选型拍板'
                              )
                            }
                            className="px-4 py-2 text-xs font-semibold text-white bg-[#0e3a3d] hover:bg-[#144e52] disabled:opacity-45 whitespace-nowrap shrink-0"
                          >
                            {decidingId === activeCase.id
                              ? '下发中...'
                              : '确认所选方案并下发执行'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2.5">
                        {(() => {
                          const recOption =
                            activeCase.options.find((o) => o.recommended) ||
                            activeCase.options[0];
                          const altOption =
                            activeCase.options.find((o) => o.id !== recOption?.id) ||
                            activeCase.options[1];
                          const missingBlocked =
                            activeCase.decisionType === 'missing_context' &&
                            !(contextNotesMap[activeCase.id] || '').trim() &&
                            !contextFileMap[activeCase.id];
                          return (
                            <>
                              {recOption && (
                                <button
                                  type="button"
                                  disabled={
                                    decidingId === activeCase.id || missingBlocked
                                  }
                                  onClick={() =>
                                    submitDecision(
                                      activeCase,
                                      recOption.id,
                                      activeCase.decisionType === 'missing_context'
                                        ? '补充外部资料后直接入库放行'
                                        : '总控台直接采纳系统建议拍板'
                                    )
                                  }
                                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0e3a3d] hover:bg-[#144e52] disabled:opacity-45 whitespace-nowrap shrink-0"
                                >
                                  {decidingId === activeCase.id
                                    ? '正在下发...'
                                    : recOption.label}
                                </button>
                              )}
                              {altOption && (
                                <button
                                  type="button"
                                  disabled={decidingId === activeCase.id}
                                  onClick={() =>
                                    submitDecision(
                                      activeCase,
                                      altOption.id,
                                      '总控台选择备选方案拍板'
                                    )
                                  }
                                  className="px-3.5 py-2 text-xs font-medium text-[#0e3a3d] bg-white hover:border-[#ff5a3c] border border-[#d3e8e7] whitespace-nowrap shrink-0 disabled:opacity-45"
                                >
                                  {altOption.label}
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* Extra Agent Note + Escape Hatches */}
                    <div className="pt-2.5 border-t border-[#d3e8e7] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <input
                        type="text"
                        aria-label="给AI捎句话"
                        value={extraNotesMap[activeCase.id] || ''}
                        onChange={(e) =>
                          setExtraNotesMap((prev) => ({
                            ...prev,
                            [activeCase.id]: e.target.value,
                          }))
                        }
                        placeholder={`顺便给 ${activeCase.sourceAgentName || 'AI'} 捎句额外要求（随拍板一并下发）...`}
                        className="flex-1 min-w-0 px-3 py-1.5 text-xs bg-white border border-[#d3e8e7] text-[#0e3a3d] focus:outline-none focus:border-[#0f9d8a]"
                      />

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={explaining}
                          onClick={() => handleExplainClick(activeCase.id, false)}
                          className="medusa-btn inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <HelpCircle
                            className="w-3 h-3 text-[#0f9d8a]"
                            aria-hidden="true"
                          />
                          <span>
                            {explaining ? '翻译中...' : '看不懂？翻成大白话'}
                          </span>
                        </button>

                        <button
                          type="button"
                          aria-expanded={detailOpen}
                          onClick={() => setDetailOpen((v) => !v)}
                          className="medusa-btn inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <span>
                            {detailOpen
                              ? '收起节点与细节'
                              : '有疑虑 · 展开详情与节点图'}
                          </span>
                          {detailOpen ? (
                            <ChevronUp className="w-3 h-3" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="w-3 h-3" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Non-Coder Analogy Drawer */}
                    {explanationMap[activeCase.id] && (
                      <div className="bg-[#f4fbfa] border border-[#d3e8e7] p-3 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[#0e3a3d] inline-flex items-center gap-1.5">
                            <Sparkles
                              className="w-3.5 h-3.5 text-[#0f9d8a]"
                              aria-hidden="true"
                            />
                            <span>给非技术老板的 5 秒大白话翻译</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleExplainClick(activeCase.id, true)}
                            disabled={explaining}
                            className="text-[#0f9d8a] hover:underline whitespace-nowrap"
                          >
                            用 AI 再举个生活例子
                          </button>
                        </div>
                        <p className="text-[#0e3a3d] leading-relaxed font-medium">
                          {explanationMap[activeCase.id].explanation.bossAnalogy}
                        </p>
                        <p className="text-[#5d8284] leading-relaxed">
                          <span className="font-medium text-[#0e3a3d]">
                            核心结论：
                          </span>
                          {
                            explanationMap[activeCase.id].explanation
                              .recommendedAction
                          }
                        </p>
                        {explanationMap[activeCase.id].note && (
                          <p className="text-[#ff5a3c]">
                            {explanationMap[activeCase.id].note}
                          </p>
                        )}
                      </div>
                    )}

                    {/* On-Demand Doubt & Causality Inspection Stage */}
                    {detailOpen && (
                      <div
                        data-testid="detail-stage"
                        className="pt-3 border-t border-[#d3e8e7] space-y-3"
                      >
                        <ProjectStagePipeline
                          projectName={activeCaseProject?.name}
                          stages={activeCaseProject?.stages}
                          currentStageLabel={activeCase.stageLabel}
                          currentTaskNodeLabel={activeCase.taskNodeLabel}
                        />

                        <CauseEffectFlowDiagram
                          goalText={
                            activeCaseThread?.resumeBrief.anchorGoal.text ||
                            activeCaseProject?.currentGoalSummary ||
                            '按项目既定目标安全推进'
                          }
                          agentActionText={
                            activeCase.plainSummary || activeCase.whyNow
                          }
                          gateBlockText={activeCase.whyNow}
                          agentName={activeCase.sourceAgentName || 'AI 助手'}
                        />

                        <div className="bg-[#f4fbfa] border border-[#d3e8e7] p-3 text-xs space-y-1">
                          <div className="font-semibold text-[#0e3a3d]">
                            反方提醒（避坑参考）
                          </div>
                          <p className="text-[#5d8284] leading-relaxed">
                            {activeCase.devilAdvocateNote}
                          </p>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <div className="space-y-1">
                            <label className="flex items-center gap-2 text-[#0e3a3d] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={saveAsRule}
                                onChange={(e) => setSaveAsRule(e.target.checked)}
                              />
                              <span>
                                以后遇到同类事直接按这次决定拦下，不再麻烦我
                              </span>
                            </label>
                            <label className="flex items-center gap-2 text-[#5d8284] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={markFalsePositive}
                                onChange={(e) =>
                                  setMarkFalsePositive(e.target.checked)
                                }
                              />
                              <span>
                                其实系统多虑了（记为一次误拦，帮我越用越准）
                              </span>
                            </label>
                          </div>

                          {activeCaseThread && (
                            <button
                              type="button"
                              onClick={() => onSelectThread(activeCaseThread.id)}
                              className="text-xs font-medium text-[#0f9d8a] hover:underline whitespace-nowrap shrink-0"
                            >
                              进入底层线程与 Hook 模拟 →
                            </button>
                          )}
                        </div>

                        <div>
                          <button
                            type="button"
                            aria-expanded={techDrawerOpen}
                            onClick={() => setTechDrawerOpen((v) => !v)}
                            className="inline-flex items-center gap-1.5 text-xs text-[#5d8284] hover:text-[#0e3a3d]"
                          >
                            <span>
                              {techDrawerOpen
                                ? '收起底层技术凭据'
                                : '查看技术人员看的底层凭据（非程序员可不看）'}
                            </span>
                            {techDrawerOpen ? (
                              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronDown
                                className="w-3.5 h-3.5"
                                aria-hidden="true"
                              />
                            )}
                          </button>

                          {techDrawerOpen && (
                            <div className="mt-2 space-y-1.5 text-xs">
                              {activeCase.facts.map((f, idx) => (
                                <div
                                  key={idx}
                                  className="p-2 bg-white border border-[#d3e8e7] flex items-start justify-between gap-2"
                                >
                                  <span className="text-[#0e3a3d]">{f.text}</span>
                                  <span className="font-mono text-[#5d8284] shrink-0">
                                    {f.source}
                                  </span>
                                </div>
                              ))}
                              {activeCaseThread?.evidences
                                .slice(0, 2)
                                .map((ev) => (
                                  <pre
                                    key={ev.id}
                                    className="p-2 text-[11px] font-mono text-[#5d8284] bg-white border border-[#d3e8e7] whitespace-pre-wrap break-all"
                                  >
                                    [{ev.title}] {ev.rawRef}
                                  </pre>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                ) : (
                  /* Serene 0-Issue Mode */
                  <div className="medusa-hero-card p-5 space-y-2.5">
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0f9d8a]">
                      <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>运行平静 · 全线在护栏内托管</span>
                    </div>
                    <h2 className="font-display text-xl font-bold text-[#0e3a3d] leading-snug">
                      {activeProjectFilter
                        ? `「${activeProjectFilter.name}」当前没有任何卡点，不需要你介入`
                        : '今日所有待拍板事项已全部清零'}
                    </h2>
                    <p className="text-xs text-[#5d8284] leading-relaxed">
                      {activeProjectFilter
                        ? activeProjectFilter.currentGoalSummary
                        : '所有接入的 AI 工具都在你的底线护栏内正常工作；一旦触及红线或对外不可逆动作，才会第一时间送到这里。'}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="text-[#0e3a3d] font-medium tabular-nums">
                        已静默处理 {quietCount} 件日常事项 · 自动打回 {autoBouncedCount} 次越界尝试
                      </span>
                      <button
                        type="button"
                        onClick={() => setRailTab('handled')}
                        className="text-[#0f9d8a] font-medium hover:underline whitespace-nowrap"
                      >
                        在左侧查看代劳明细 →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* RIGHT RAIL: Cards 04, 05, 06, 07 */}
          <aside
            aria-label="右侧阶段象限与核心控制"
            className="hidden lg:flex flex-col gap-2 min-h-0 pointer-events-auto"
          >
            {/* CARD 04: Stage & Eisenhower Attitude Dial */}
            <section className="medusa-card p-2.5 shrink-0 space-y-1.5">
              <div className="medusa-ct">
                <span className="medusa-ct-label">卡点阶段与象限</span>
                <small className="text-[10px] text-[#9dbcbc] font-normal">04</small>
              </div>
              <div className="flex items-center gap-2.5">
                <svg
                  viewBox="-50 -50 100 100"
                  aria-hidden="true"
                  className="w-14 h-14 shrink-0"
                >
                  <defs>
                    <clipPath id="fos-dial-clip">
                      <circle r="47" />
                    </clipPath>
                  </defs>
                  <circle r="47" fill="#f7fdfc" stroke="#cfe5e4" />
                  <g clipPath="url(#fos-dial-clip)">
                    <g
                      transform={`rotate(${dialRoll.toFixed(1)}) translate(0 ${dialPitch.toFixed(1)})`}
                    >
                      <rect
                        x="-80"
                        y="0"
                        width="160"
                        height="90"
                        fill="#dcf0ee"
                      />
                      <line
                        x1="-80"
                        x2="80"
                        stroke="#0e3a3d"
                        strokeWidth="1"
                      />
                    </g>
                  </g>
                  <path
                    d="M-16 0h10l4 5 4-5h12"
                    fill="none"
                    stroke="#ff5a3c"
                    strokeWidth="1.8"
                  />
                </svg>

                <dl className="flex-1 min-w-0 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] font-mono">
                  <dt className="text-[#5d8284]">当前项目</dt>
                  <dd className="text-right font-medium text-[#0e3a3d] truncate">
                    {activeCaseProject?.name || '全部总览'}
                  </dd>
                  <dt className="text-[#5d8284]">所处阶段</dt>
                  <dd className="text-right font-medium text-[#0e3a3d] truncate">
                    {activeCase?.stageLabel || '全线平稳'}
                  </dd>
                  <dt className="text-[#5d8284]">卡点节点</dt>
                  <dd className="text-right font-medium text-[#0e3a3d] truncate">
                    {activeCase?.taskNodeLabel || '无卡点'}
                  </dd>
                  <dt className="text-[#5d8284]">象限分级</dt>
                  <dd
                    className={`text-right font-semibold ${
                      activePos?.quadrant === 'do_now'
                        ? 'text-[#ff5a3c]'
                        : 'text-[#0f9d8a]'
                    }`}
                  >
                    {activePos
                      ? activePos.quadrant === 'do_now'
                        ? '重要且紧急'
                        : '重要可从容定'
                      : '正常运行中'}
                  </dd>
                </dl>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-[#5d8284] pt-1 border-t border-[#d3e8e7]">
                <span>
                  处理耗时{' '}
                  <b className="text-[#0e3a3d]">
                    {activeCase ? `约 ${activeCase.estimatedMinutes} 分钟` : '0 分钟'}
                  </b>
                </span>
                <span>
                  风险{' '}
                  <b className="text-[#0e3a3d]">
                    {activeCase ? `${activeCase.priorityScore ?? 85}/100` : 'LOW'}
                  </b>
                </span>
              </div>
            </section>

            {/* CARD 05: Workspace Views & 3D Subsystem Navigation */}
            <section className="medusa-card p-2.5 shrink-0 space-y-1.5">
              <div className="medusa-ct">
                <span className="medusa-ct-label">视图与拆解焦点</span>
                <small className="text-[10px] text-[#9dbcbc] font-normal">05</small>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={onOpenMemory}
                  className="medusa-btn"
                >
                  规矩与账本
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = activeCaseThread || scopedThreads[0] || threads[0];
                    if (target) onSelectThread(target.id);
                  }}
                  className="medusa-btn"
                >
                  高级线程验货
                </button>
                {(
                  [
                    ['hero', '全景'],
                    ['optics', '语义镜'],
                    ['bell', '舱壁'],
                    ['pump', '调度核'],
                    ['arm', '链路'],
                    ['siphon', '外发闸'],
                  ] as [CoreSection, string][]
                ).map(([sec, label]) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => jumpCoreSection(sec)}
                    className={`medusa-btn ${
                      activeCoreSection === sec ? 'on' : ''
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            {/* CARD 06: 3D Core Display Toggles */}
            <section className="medusa-card p-2.5 shrink-0 space-y-1.5">
              <div className="medusa-ct">
                <span className="medusa-ct-label">核心透视控制</span>
                <small className="text-[10px] text-[#9dbcbc] font-normal">06</small>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setShowLabels((v) => !v)}
                  className={`medusa-btn ${showLabels ? 'on' : ''}`}
                >
                  3D 标注
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExploded((v) => !v);
                    setManualSection(null);
                  }}
                  className={`medusa-btn ${exploded ? 'on' : ''}`}
                >
                  机械拆解
                </button>
                <button
                  type="button"
                  onClick={() => setShowWake((v) => !v)}
                  className={`medusa-btn ${showWake ? 'on' : ''}`}
                >
                  尾流脉冲
                </button>
                <button
                  type="button"
                  onClick={() => setTurntable((v) => !v)}
                  className={`medusa-btn ${turntable ? 'on' : ''}`}
                >
                  巡航旋转
                </button>
                <button
                  type="button"
                  onClick={() => setZenMode((v) => !v)}
                  className={`medusa-btn ${zenMode ? 'on' : ''}`}
                >
                  3D 净空巡检
                </button>
              </div>
            </section>

            {/* CARD 07: Connected Agent Subsystems */}
            <section className="medusa-card p-2.5 flex-1 min-h-0 overflow-y-auto medusa-scroll space-y-1">
              <div className="medusa-ct">
                <span className="medusa-ct-label">子系统与 AI 接入</span>
                <small className="text-[10px] text-[#9dbcbc] font-normal">07</small>
              </div>
              <div className="space-y-1 pt-0.5">
                {subsystemRows.map((row) => (
                  <div
                    key={row.idx}
                    className={`grid grid-cols-[1.25rem_1fr_auto] items-center gap-1 text-[10.5px] font-mono relative leading-tight ${
                      row.hot ? 'text-[#ff5a3c] pl-1.5 border-l-2 border-[#ff5a3c]' : 'text-[#0e3a3d]'
                    }`}
                  >
                    <span className="text-[#9dbcbc] text-[10px]">{row.idx}</span>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{row.name}</div>
                      <div className="text-[9px] text-[#5d8284] truncate">
                        {row.sub}
                      </div>
                    </div>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 font-semibold tracking-wider text-white shrink-0 ${
                        row.hot ? 'bg-[#ff5a3c]' : 'bg-[#0f9d8a]'
                      }`}
                    >
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>

        {/* BOTTOM HUD DOCK: Card 08 (Proactive Command + Playhead Scrubber) + Footer */}
        <footer className="shrink-0 px-5 pb-2.5 flex flex-col gap-1.5 pointer-events-auto">
          <section
            aria-label="主动指令发射台与时间轴"
            data-testid="proactive-command-bar"
            className="medusa-card px-4 py-2 space-y-1.5 max-w-[1020px] w-full mx-auto"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="medusa-ct">
                <span className="medusa-ct-label">主动指令与巡航日志</span>
                <small className="text-[10px] text-[#9dbcbc] font-normal ml-2">
                  08
                </small>
              </div>

              <div className="flex items-center gap-2 text-[10px] font-mono">
                {cmdFeedback ? (
                  <span className="text-[#0f9d8a] font-semibold inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span>{cmdFeedback}</span>
                  </span>
                ) : (
                  <span className="text-[#ff5a3c] font-semibold">
                    {activeCase
                      ? `OPERATOR · 拦截 ${activeCase.sourceAgentName || 'AI'} 动作`
                      : 'SYSTEM · 全项目静默护航中'}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-[40px_1fr] gap-3 items-center">
              <button
                type="button"
                aria-label={playing ? '暂停 3D 巡航' : '继续 3D 巡航'}
                onClick={() => setPlaying((v) => !v)}
                className="w-10 h-10 rounded-full bg-[#ff5a3c] text-white flex items-center justify-center shrink-0 hover:brightness-105 cursor-pointer"
              >
                {playing ? (
                  <Pause className="w-4 h-4 fill-current" aria-hidden="true" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" aria-hidden="true" />
                )}
              </button>

              <div className="space-y-1.5 min-w-0">
                {/* Proactive Founder-to-Agent Command Bar */}
                <form
                  onSubmit={handleDispatchProactiveCommand}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-1.5 items-center"
                >
                  <div className="sm:col-span-3">
                    <select
                      aria-label="选择指令所属项目"
                      value={cmdProjectId}
                      onChange={(e) => setCmdProjectId(e.target.value)}
                      className="w-full px-2 py-1 text-[11px] bg-white border border-[#d3e8e7] text-[#0e3a3d]"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <select
                      aria-label="选择目标 AI"
                      value={cmdAgent}
                      onChange={(e) => setCmdAgent(e.target.value)}
                      className="w-full px-2 py-1 text-[11px] bg-white border border-[#d3e8e7] text-[#0e3a3d]"
                    >
                      <option value="WorkBuddy">WorkBuddy</option>
                      <option value="Claude Code">Claude Code</option>
                      <option value="DeepSeek Web">DeepSeek Web</option>
                      <option value="售后质检 Agent">售后质检 Agent</option>
                    </select>
                  </div>

                  <div className="sm:col-span-7 flex items-center gap-1.5">
                    <input
                      type="text"
                      aria-label="输入给 AI 的主动指令"
                      value={cmdText}
                      onChange={(e) => setCmdText(e.target.value)}
                      placeholder={`直接向 ${cmdAgent} 下达指令...`}
                      className="flex-1 min-w-0 px-2.5 py-1 text-[11px] bg-white border border-[#d3e8e7] text-[#0e3a3d] focus:outline-none focus:border-[#0f9d8a]"
                    />

                    <label className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#5d8284] hover:text-[#0e3a3d] bg-white border border-[#d3e8e7] cursor-pointer whitespace-nowrap shrink-0">
                      <Paperclip className="w-3 h-3" aria-hidden="true" />
                      <span>{cmdAttachmentName || '附件'}</span>
                      <input
                        type="file"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setCmdAttachmentName(f.name);
                        }}
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={dispatchingCmd || !cmdText.trim()}
                      className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-semibold text-white bg-[#0e3a3d] hover:bg-[#144e52] disabled:opacity-45 whitespace-nowrap shrink-0"
                    >
                      <Send className="w-3 h-3" aria-hidden="true" />
                      <span>{dispatchingCmd ? '下发中' : '下达指令'}</span>
                    </button>
                  </div>
                </form>

                {/* Medusa Scrubber Rail */}
                <div className="flex items-center gap-3">
                  <div
                    ref={railBarRef}
                    role="slider"
                    tabIndex={0}
                    aria-label="3D 巡航时间轴"
                    aria-valuemin={0}
                    aria-valuemax={25}
                    aria-valuenow={Math.round(hudTime)}
                    onPointerDown={(e) => {
                      setScrubbing(true);
                      e.currentTarget.setPointerCapture(e.pointerId);
                      handleRailScrub(e.clientX);
                    }}
                    onPointerMove={(e) => {
                      if (scrubbing) handleRailScrub(e.clientX);
                    }}
                    onPointerUp={() => setScrubbing(false)}
                    onPointerCancel={() => setScrubbing(false)}
                    className="relative flex-1 h-3 cursor-pointer touch-none flex items-center"
                  >
                    <div className="w-full h-[2px] bg-[#d3e8e7]" />
                    <div
                      className="absolute left-0 h-[2px] bg-[#ff5a3c]"
                      style={{ width: `${(hudTime / 25) * 100}%` }}
                    />
                    <div
                      className="absolute w-2.5 h-2.5 rounded-full bg-white border-2 border-[#ff5a3c] -ml-1"
                      style={{ left: `${(hudTime / 25) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-[#5d8284] tabular-nums shrink-0">
                    00:{String(Math.floor(hudTime)).padStart(2, '0')} / 00:25 · {totalHandledAllProjects} 已护航
                  </span>
                </div>
              </div>
            </div>
          </section>

          <div className="hidden sm:flex items-center justify-between font-mono text-[10px] tracking-[0.16em] text-[#5d8284]">
            <span>
              FOUNDER OS · COGNITIVE FIREWALL · {projects.length} PARALLEL PROJECTS · 5 DECISION PROTOCOLS
            </span>
            <span>
              MEDUSA HUD ARCHITECTURE · DEEP CONTROL{' '}
              <b className="text-[#ff5a3c] font-medium">//////</b>
            </span>
          </div>
        </footer>
      </div>

      {/* Quick Ingest Modal Drawer ("投递 AI 汇报") */}
      {ingestOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="多 AI 消息快速投递分拣台"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e3a3d]/35 p-4"
        >
          <div className="bg-white border border-[#d3e8e7] w-full max-w-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#d3e8e7] pb-3">
              <div>
                <h2 className="text-sm font-semibold text-[#0e3a3d]">
                  把任何 AI（DeepSeek / WorkBuddy / Claude）的回复粘进来，系统自动帮您判断需不需要管
                </h2>
                <p className="text-xs text-[#5d8284] mt-0.5">
                  也可点击下方预设直接测试拦截与静默归档效果
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIngestOpen(false)}
                className="p-1 text-[#5d8284] hover:text-[#0e3a3d]"
                aria-label="关闭快速投递台"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {QUICK_INGEST_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setIngestAgentName(p.agentName);
                    setIngestChannel(p.agentChannel);
                    setIngestRaw(p.rawMessage);
                    setIngestResult(null);
                    setIngestError(null);
                  }}
                  className="medusa-btn"
                >
                  填入测试：{p.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmitIngest} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="ingest-project"
                    className="block text-xs font-medium text-[#5d8284] mb-1"
                  >
                    属于哪个项目
                  </label>
                  <select
                    id="ingest-project"
                    value={ingestProjectId}
                    onChange={(e) => setIngestProjectId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#d3e8e7] text-[#0e3a3d]"
                  >
                    {projects.map((proj) => (
                      <option key={proj.id} value={proj.id}>
                        {proj.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="ingest-agent"
                    className="block text-xs font-medium text-[#5d8284] mb-1"
                  >
                    来自哪个 AI 工具
                  </label>
                  <select
                    id="ingest-agent"
                    value={ingestAgentName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setIngestAgentName(val);
                      if (val === 'WorkBuddy') setIngestChannel('desktop_app');
                      else if (val === 'Claude Code') setIngestChannel('cli_hook');
                      else setIngestChannel('web_chat');
                    }}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#d3e8e7] text-[#0e3a3d]"
                  >
                    <option value="DeepSeek Web">DeepSeek（网页对话）</option>
                    <option value="WorkBuddy">WorkBuddy（桌面软件）</option>
                    <option value="Claude Code">Claude Code（终端/编程）</option>
                    <option value="ChatGPT Web">ChatGPT（网页对话）</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="ingest-raw"
                  className="block text-xs font-medium text-[#5d8284] mb-1"
                >
                  AI 回复或动作内容
                </label>
                <div className="flex gap-2">
                  <input
                    id="ingest-raw"
                    value={ingestRaw}
                    onChange={(e) => setIngestRaw(e.target.value)}
                    placeholder="直接粘贴 AI 说的话或准备执行的动作..."
                    className="flex-1 min-w-0 px-3 py-2 text-xs bg-white border border-[#d3e8e7] text-[#0e3a3d] focus:outline-none focus:border-[#0f9d8a]"
                  />
                  <button
                    type="submit"
                    disabled={ingesting || !ingestRaw.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0e3a3d] hover:bg-[#144e52] disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{ingesting ? '分拣中...' : '送去分拣'}</span>
                  </button>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-[#5d8284] cursor-pointer">
                <input
                  type="checkbox"
                  checked={ingestUseAi}
                  onChange={(e) => setIngestUseAi(e.target.checked)}
                />
                <span>同时调用 AI 翻译官把技术黑话翻成大白话</span>
              </label>
            </form>

            {ingestResult && (
              <div className="px-3.5 py-2.5 text-xs text-[#0e3a3d] bg-[#effaf8] border border-[#0f9d8a]/40">
                {ingestResult}
              </div>
            )}
            {ingestError && (
              <div
                role="alert"
                className="px-3.5 py-2.5 text-xs text-[#ff5a3c] bg-[#fff4f2] border border-[#ffc6bc]"
              >
                {ingestError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Thread Modal */}
      {showNewModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-thread-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e3a3d]/35 p-4"
        >
          <div className="bg-white border border-[#d3e8e7] w-full max-w-lg p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#d3e8e7] pb-3">
              <h3
                id="new-thread-title"
                className="text-base font-semibold text-[#0e3a3d]"
              >
                为项目新建一条 AI 并行任务
              </h3>
              <button
                type="button"
                aria-label="关闭弹窗"
                onClick={() => setShowNewModal(false)}
                className="p-1 text-[#5d8284] hover:text-[#0e3a3d]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitNewThread} className="space-y-4">
              <div>
                <label
                  htmlFor="new-proj"
                  className="block text-xs font-medium text-[#0e3a3d] mb-1"
                >
                  所属项目
                </label>
                <select
                  id="new-proj"
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#d3e8e7] text-[#0e3a3d]"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="new-title"
                  className="block text-xs font-medium text-[#0e3a3d] mb-1"
                >
                  任务名称（用人话说清楚让 AI 做什么）
                </label>
                <input
                  id="new-title"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="例如：把近三年机床主轴维修单导入离线问答库"
                  className="w-full px-3 py-2 text-sm bg-white border border-[#d3e8e7] text-[#0e3a3d]"
                />
              </div>

              <div>
                <label
                  htmlFor="new-goal"
                  className="block text-xs font-medium text-[#0e3a3d] mb-1"
                >
                  任务底线与约束（AI 不能越过的边界）
                </label>
                <textarea
                  id="new-goal"
                  required
                  rows={2}
                  value={newGoal}
                  onChange={(e) => setNewGoal(e.target.value)}
                  placeholder="例如：只整理维修文本，严禁修改标准公差底表，禁止外传客户联系方式"
                  className="w-full px-3 py-2 text-sm bg-white border border-[#d3e8e7] text-[#0e3a3d]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#d3e8e7]">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="medusa-btn"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating || !newTitle.trim() || !newGoal.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0e3a3d] hover:bg-[#144e52] disabled:opacity-50"
                >
                  {creating ? '创建中...' : '创建并挂入护栏'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
