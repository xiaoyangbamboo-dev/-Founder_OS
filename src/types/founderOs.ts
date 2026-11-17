export type ThreadKind = 'code' | 'research' | 'ops';

export type ThreadStatus =
  | 'Running'
  | 'Auto-Fixing'
  | 'Needs You'
  | 'Blocked'
  | 'Quiet';

export type AdapterType =
  | 'claude_code_hook'
  | 'git_merge_gate'
  | 'desktop_webhook'
  | 'web_paste_bridge';

export type AgentChannel = 'cli_hook' | 'desktop_app' | 'web_chat' | 'firewall';

export type RepoVerificationTier = 'tier_full' | 'tier_build_only' | 'tier_diff_only';

export type FirewallVerdict = 'pass' | 'auto_bounce' | 'escalate' | 'blocked';

export type DecisionType =
  | 'yes_no'
  | 'multi_choice'
  | 'missing_context'
  | 'partial_approval'
  | 'checkpoint_review';

export interface ProjectStageNode {
  id: string;
  label: string;
  taskName: string;
  status: 'done' | 'active' | 'blocked' | 'upcoming';
}

export interface Project {
  id: string;
  name: string;
  stage: string;
  domainIcon?: 'factory' | 'fitness' | 'comic' | 'support' | 'code';
  accentColor?: 'slate' | 'emerald' | 'amber' | 'blue';
  currentGoalSummary?: string;
  stages?: ProjectStageNode[];
  repoPath: string;
  testCommand: string;
  buildCommand: string;
  verificationTier: RepoVerificationTier;
  verificationBudgetCapUsd: number;
  betPriority: 'Primary' | 'Secondary' | 'Paused';
}

export interface TraceableClaim {
  text: string;
  sourceLabel: string;
  evidenceId?: string;
  decisionId?: string;
  diffLocation?: string;
}

export interface ResumeBrief {
  threadId: string;
  anchorGoal: TraceableClaim;
  activeConstraints: TraceableClaim[];
  deltaSummary: TraceableClaim;
  blockerReason: TraceableClaim;
  costOfDelay: string;
  degradationNotice?: string;
  updatedAt: string;
}

export interface Evidence {
  id: string;
  threadId: string;
  kind: 'test' | 'build' | 'browser' | 'diff' | 'hook_log' | 'agent_message';
  title: string;
  summary: string;
  rawRef: string;
  passed: boolean | null;
  deterministic: boolean;
  createdAt: string;
}

export interface TraceEvent {
  id: string;
  timestamp: string;
  actor: string;
  kind: 'execution' | 'gateway' | 'checker' | 'human' | 'system';
  summary: string;
}

export interface WorkThread {
  id: string;
  projectId: string;
  title: string;
  kind: ThreadKind;
  adapterType: AdapterType;
  adapterLabel: string;
  sourceAgentName?: string;
  agentChannel?: AgentChannel;
  branchOrWorktree: string;
  status: ThreadStatus;
  bounceCount: number;
  maxBounces: number;
  verificationSpendUsd: number;
  lastHumanAt: string;
  updatedAt: string;
  priorityScore: number;
  degradedModeReason?: string;
  resumeBrief: ResumeBrief;
  evidences: Evidence[];
  trace: TraceEvent[];
}

export interface DecisionOption {
  id: string;
  label: string;
  actionSummary: string;
  benefit: string;
  costAndTradeoff: string;
  reversibility: 'Reversible' | 'Partially Reversible' | 'Irreversible';
  recommended?: boolean;
}

export interface DecisionCase {
  id: string;
  threadId: string;
  projectId: string;
  sourceAgentName?: string;
  sourceAgentChannel?: AgentChannel;
  urgencyLabel?: string;
  plainSummary?: string;
  decisionType?: DecisionType;
  systemRecommendation?: string;
  urgencyScore?: number;
  importanceScore?: number;
  stageLabel?: string;
  taskNodeLabel?: string;
  missingInfoPrompt?: string;
  enforcementLayer: 'deterministic_gateway' | 'probabilistic_checker' | 'l1_degradation';
  triggerType:
    | 'hard_guardrail'
    | 'semantic_conflict'
    | 'bounce_limit'
    | 'no_test_escalation';
  title: string;
  question: string;
  whyNow: string;
  costOfDelay: string;
  estimatedMinutes: number;
  priorityScore: number;
  facts: { text: string; source: string; deterministic: boolean }[];
  assumptionsAndUnknowns: string[];
  devilAdvocateNote: string;
  options: DecisionOption[];
  candidateRuleText: string;
  candidateRuleKind: 'deterministic_guardrail' | 'semantic_habit';
  status: 'Needs Human' | 'Decided';
  markedAsFalsePositive?: boolean;
  createdAt: string;
}

export interface AgentFeedbackMessage {
  id: string;
  threadId?: string;
  projectId: string;
  agentName: string;
  agentChannel: AgentChannel;
  roleLabel: string;
  plainSummary: string;
  rawContent: string;
  triageStatus: 'needs_you' | 'handled_for_you';
  handledOutcome?: string;
  urgencyLabel?: string;
  timestamp: string;
}

export interface RuleMatcher {
  protectedPaths?: string[];
  bannedKeywords?: string[];
  bannedCommands?: string[];
  requireTestsPass?: boolean;
  maxSpendUsd?: number;
  blockExternalSend?: boolean;
}

export type HabitExecutionMode = 'suggest_only' | 'auto_apply_reversible';

export interface PolicyRule {
  id: string;
  projectId: string | 'global';
  kind: 'deterministic_guardrail' | 'semantic_habit';
  executionMode: HabitExecutionMode;
  title: string;
  ruleText: string;
  scopeLabel: string;
  matcher?: RuleMatcher;
  sourceDecisionId?: string;
  version: number;
  reviewAt: string;
  hitCount: number;
  misappliedCount: number;
  active: boolean;
  createdAt: string;
}

export interface AutoAppliedAction {
  id: string;
  ruleId: string;
  ruleTitle: string;
  threadId: string;
  threadTitle: string;
  actionTaken: string;
  reversible: boolean;
  undone: boolean;
  timestamp: string;
}

export interface DecisionRecord {
  id: string;
  caseId: string;
  threadId: string;
  projectId: string;
  caseTitle: string;
  chosenOptionId: string;
  chosenOptionLabel: string;
  userRationale: string;
  extraInstructionToAgent?: string;
  uploadedContextNote?: string;
  spawnedRuleId?: string;
  decidedAt: string;
  outcomeCheck?: {
    verdict: 'win' | 'miss' | 'neutral';
    note: string;
    checkedAt: string;
  };
}

export interface FounderCommand {
  id: string;
  projectId: string;
  targetAgentName: string;
  commandText: string;
  attachmentName?: string;
  timestamp: string;
  status: 'dispatched' | 'acknowledged';
}

export interface DigestEvent {
  id: string;
  threadId: string;
  threadTitle: string;
  eventType: 'auto_bounced' | 'silent_pass' | 'blocked' | 'habit_auto_applied';
  summary: string;
  markedWrong?: boolean;
  timestamp: string;
}

export interface QualityMetrics {
  totalRuns: number;
  quietSuccessCount: number;
  escapedDefectsCount: number; // False Negatives reported by founder
  falseBounceCount: number; // False Positives marked by founder
  totalBouncesAndEscalations: number;
  totalVerificationSpendUsd: number;
}

export interface AdapterConnection {
  id: string;
  name: string;
  type: AdapterType;
  channel: AgentChannel;
  hookMechanism: string;
  endpointOrPath: string;
  status: 'Connected' | 'Degraded' | 'Paused';
  lastSyncAt: string;
  scopeSummary: string;
}

export interface SubmissionPayload {
  sourceAgent: string;
  hookEvent: 'PreToolUse' | 'Stop' | 'PrePush' | 'PRMergeGate';
  taskSummary: string;
  claims: string;
  changedFiles: string[];
  diffSnippet: string;
  shellCommandsAttempted?: string[];
  testExitCode?: number | null;
  buildExitCode?: number | null;
  browserErrors?: string[];
  estimatedSpendUsd?: number;
  externalActionRequested?: boolean;
  environmentBlockedReason?: string;
}

export interface RuleConflict {
  conflictingRuleId: string;
  conflictingRuleTitle: string;
  reason: string;
}

export interface FounderOsState {
  projects: Project[];
  threads: WorkThread[];
  decisionCases: DecisionCase[];
  agentMessages: AgentFeedbackMessage[];
  founderCommands: FounderCommand[];
  policyRules: PolicyRule[];
  decisionRecords: DecisionRecord[];
  autoAppliedActions: AutoAppliedAction[];
  digestEvents: DigestEvent[];
  connections: AdapterConnection[];
  qualityMetrics: QualityMetrics;
}
