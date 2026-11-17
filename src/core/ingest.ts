import type {
  AgentChannel,
  AgentFeedbackMessage,
  DecisionCase,
  PolicyRule,
  Project,
} from '../types/founderOs';

export interface IngestTriageInput {
  agentName: string;
  agentChannel: AgentChannel;
  roleLabel?: string;
  project: Project;
  rawMessage: string;
  rules: PolicyRule[];
  translatedSummary?: string;
  translatedRisk?: string;
}

export interface IngestTriageResult {
  triageStatus: 'needs_you' | 'handled_for_you';
  escalationLayer: 'deterministic_gateway' | 'probabilistic_checker';
  urgencyLabel: string;
  plainSummary: string;
  handledOutcome: string;
  matchedRule?: PolicyRule;
  detectedExternalRisk: boolean;
  priorityScore: number;
  question?: string;
  costOfDelay?: string;
}

const EXTERNAL_IRREVERSIBLE_KEYWORDS = [
  '群发',
  '发送邮件',
  '发给客户',
  '发给甲方',
  '公开报价',
  '降价',
  '打折',
  '7折',
  '5折',
  '退款',
  '删除生产',
  '删除数据',
  '覆盖历史',
  '自动覆盖',
  '正式发布',
  '上线收款',
  '承诺交期',
  '免费换新',
  'bulk email',
  'send to all',
  'pricing cut',
];

const STRATEGY_CONFLICT_KEYWORDS = [
  '定制开发',
  '接单定制',
  '大客户专属',
  '引入 redis',
  'ioredis',
  'kafka',
  '微服务拆分',
  '重做架构',
  '迁移云端',
  '上传云端',
  '外部云端',
  '公有云',
];

export function defaultRoleForChannel(channel: AgentChannel, agentName: string): string {
  const lower = agentName.toLowerCase();
  if (lower.includes('workbuddy')) return '桌面运营执行';
  if (lower.includes('deepseek') || lower.includes('chatgpt') || channel === 'web_chat') {
    return '方案顾问参谋';
  }
  if (channel === 'cli_hook') return '程序与脚本执行';
  if (channel === 'desktop_app') return '桌面业务助手';
  return '外部 AI 助手';
}

export function triageAgentMessage(input: IngestTriageInput): IngestTriageResult {
  const { agentName, agentChannel, project, rawMessage, rules, translatedSummary, translatedRisk } =
    input;
  const textLower = rawMessage.toLowerCase();

  const activeRules = rules.filter(
    (r) => r.active && (r.projectId === 'global' || r.projectId === project.id)
  );

  // 1. Check deterministic keyword / path matchers in active rules
  for (const rule of activeRules) {
    const m = rule.matcher;
    if (!m) continue;
    const hitPath = (m.protectedPaths ?? []).find((p) => textLower.includes(p.toLowerCase()));
    const hitKw = (m.bannedKeywords ?? []).find((k) => textLower.includes(k.toLowerCase()));
    const hitCmd = (m.bannedCommands ?? []).find((c) => textLower.includes(c.toLowerCase()));

    if (hitPath || hitKw || hitCmd) {
      const target = hitPath || hitKw || hitCmd;
      return {
        triageStatus: 'needs_you',
        escalationLayer: 'deterministic_gateway',
        urgencyLabel: '高紧急 · 触及核心红线',
        plainSummary:
          translatedSummary ||
          `${agentName} 的动作涉及受保护边界（${target}），系统已拦截在门外，等你决定要不要放行。`,
        handledOutcome: `触发红线「${rule.title}」，已暂停执行并送来给你拍板`,
        matchedRule: rule,
        detectedExternalRisk: false,
        priorityScore: 93,
        question: `「${agentName}」触及了「${rule.title}」，是否允许这次破例放行？`,
        costOfDelay: translatedRisk || '关系核心业务数据与既有承诺，在您拍板前系统不会放行。',
      };
    }
  }

  // 2. Check irreversible commercial / external actions
  const hitExternal = EXTERNAL_IRREVERSIBLE_KEYWORDS.find((kw) =>
    textLower.includes(kw.toLowerCase())
  );
  if (hitExternal) {
    return {
      triageStatus: 'needs_you',
      escalationLayer: 'deterministic_gateway',
      urgencyLabel: '高紧急 · 对外不可逆动作',
      plainSummary:
        translatedSummary ||
        `${agentName} 准备或建议执行对外不可逆动作（涉及「${hitExternal}」），系统已拦下等你一句话拍板。`,
      handledOutcome: `已为你挡住对外动作（${hitExternal}），未发给任何外部人员`,
      detectedExternalRisk: true,
      priorityScore: 91,
      question: `「${agentName}」请求执行涉及「${hitExternal}」的外部动作，是否授权执行？`,
      costOfDelay: translatedRisk || '一旦对外发出、改价或覆盖历史记录就无法撤回，直接影响客户与信任。',
    };
  }

  // 3. Check strategic / architecture conflict signals
  const hitStrategy = STRATEGY_CONFLICT_KEYWORDS.find((kw) =>
    textLower.includes(kw.toLowerCase())
  );
  if (hitStrategy) {
    return {
      triageStatus: 'needs_you',
      escalationLayer: 'probabilistic_checker',
      urgencyLabel: '重要 · 与已有约定冲突',
      plainSummary:
        translatedSummary ||
        `${agentName} 提出的方案包含「${hitStrategy}」，和你此前定下的「${project.currentGoalSummary || project.name}」思路冲突。`,
      handledOutcome: `发现方向冲突（${hitStrategy}），已升级到待拍板队列`,
      detectedExternalRisk: false,
      priorityScore: 82,
      question: `「${agentName}」建议「${hitStrategy}」，是坚持原路线还是调整策略？`,
      costOfDelay: translatedRisk || '若直接采纳会推翻现有部署/商业约束，建议确认后再继续。',
    };
  }

  // 4. Otherwise: safe progress / routine feedback -> Handle quietly without disturbing founder
  const compactSnippet =
    rawMessage.replace(/\s+/g, ' ').trim().slice(0, 72) +
    (rawMessage.trim().length > 72 ? '…' : '');

  return {
    triageStatus: 'handled_for_you',
    escalationLayer: 'probabilistic_checker',
    urgencyLabel: '正常进展 · 已静默处理',
    plainSummary:
      translatedSummary || `${agentName} 汇报常规进展：${compactSnippet}`,
    handledOutcome:
      agentChannel === 'web_chat'
        ? '已自动整理归档，未碰到底线红线，无需你操心'
        : '系统已静默检查通过并归档，没有打扰你的注意力',
    detectedExternalRisk: false,
    priorityScore: 25,
  };
}

export function buildAgentMessageRecord(params: {
  projectId: string;
  threadId?: string;
  agentName: string;
  agentChannel: AgentChannel;
  roleLabel?: string;
  rawMessage: string;
  triage: IngestTriageResult;
  timestamp: string;
}): AgentFeedbackMessage {
  return {
    id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    threadId: params.threadId,
    projectId: params.projectId,
    agentName: params.agentName,
    agentChannel: params.agentChannel,
    roleLabel:
      params.roleLabel || defaultRoleForChannel(params.agentChannel, params.agentName),
    plainSummary: params.triage.plainSummary,
    rawContent: params.rawMessage,
    triageStatus: params.triage.triageStatus,
    handledOutcome: params.triage.handledOutcome,
    urgencyLabel: params.triage.urgencyLabel,
    timestamp: params.timestamp,
  };
}

/**
 * Generates a Pachat-style 1-paragraph pasteable handshake instruction.
 * Non-technical founders simply copy this paragraph and send it to ANY AI (DeepSeek, WorkBuddy, Claude Code, etc.).
 */
export function generateAgentHandshakePrompt(params: {
  baseUrl: string;
  project: Project;
  roleLabel: string;
  rules: PolicyRule[];
}): string {
  const { baseUrl, project, roleLabel, rules } = params;
  const scopedRules = rules
    .filter((r) => r.active && (r.projectId === 'global' || r.projectId === project.id))
    .slice(0, 4)
    .map((r, idx) => `${idx + 1}. ${r.title}：${r.ruleText}`)
    .join('\n');

  const cleanBase = baseUrl.replace(/\/+$/, '');

  return [
    `【接入指令 · Founder OS 决策驾驶舱】`,
    `从现在起，你担任我在「${project.name}」项目中的【${roleLabel}】。`,
    `请记住本项目底线与目标：${project.currentGoalSummary || project.stage}`,
    ``,
    `必须严格遵守的红线（触及前必须先停下问我）：`,
    scopedRules || `1. 严禁未授权对外发送、改价、删改核心历史数据或偏离既定极简方向。`,
    ``,
    `你的接入与汇报方式（自动择一执行）：`,
    `① 如果你支持联网或调用接口：启动时先读取规则 ${cleanBase}/api/hooks/active-rules?projectId=${project.id} ；每当完成关键一步，或遇到红线/外部操作前，请向 ${cleanBase}/api/ingest/agent-message 发送 POST JSON（字段：agentName, projectId="${project.id}", rawMessage）。`,
    `② 如果你是网页对话 AI 无法主动发请求：每次给出方案结论或准备动手前，请在回答末尾附上一句【人话汇报】说明“我做了什么 + 有无碰到底线/对外风险”，方便我一键复制进驾驶舱分拣。`,
    ``,
    `请用一句大白话回复确认“已按【${project.name} · ${roleLabel}】接入完毕”，不要输出技术代码。`,
  ].join('\n');
}

/**
 * Deterministic plain-language boss analogy generator ("帮我翻成大白话 / 打个比方")
 * Guarantees non-programmers always understand technical or ambiguous AI escalations within seconds.
 */
export function buildPlainBossExplanation(params: {
  decisionCase: DecisionCase;
  project?: Project;
}): {
  whatHappened: string;
  bossAnalogy: string;
  ifIgnored: string;
  recommendedAction: string;
} {
  const { decisionCase, project } = params;
  const recommendedOpt = decisionCase.options.find((o) => o.recommended) || decisionCase.options[0];
  const titleLower = `${decisionCase.title} ${decisionCase.whyNow}`.toLowerCase();

  let bossAnalogy =
    '打个比方：就像你请了一位很能干的车间老师傅去修一台机器，他顺手把旁边没坏的报价单或客户档案也改了。系统在门卫处把修改拦了下来，只等你点头决定改还是不改。';

  if (titleLower.includes('公差') || titleLower.includes('机床') || titleLower.includes('数据库')) {
    bossAnalogy =
      '打个比方：好比你让新来的资料员把机床零件目录整理得更顺手，结果他顺手把老师傅手写核准的“老零件公差底表”也改成允许自动覆盖。万一 AI 算错一次，车间加工出来的零件尺寸就会报废。';
  } else if (titleLower.includes('打折') || titleLower.includes('降价') || titleLower.includes('群发')) {
    bossAnalogy =
      '打个比方：就像店员为了拉回头客，没问老板就印了一批 7 折优惠券准备群发出去。钱和口碑一旦发出去就收不回来了，所以门卫先按住没让发。';
  } else if (titleLower.includes('甲方') || titleLower.includes('外发') || titleLower.includes('漫剧')) {
    bossAnalogy =
      '打个比方：好比剪辑助理熬夜剪完了 24 集片子，其中第 7 集主角长相突然变样了，他还没检查就要一键打包发给甲方。系统帮你卡在微信发送前最后一步。';
  } else if (titleLower.includes('云端') || titleLower.includes('redis') || titleLower.includes('架构')) {
    bossAnalogy =
      '打个比方：你本来只想要一辆能马上上路拉货的五菱宏光（单机极简版），结果顾问建议先盖一座专业立体车库才能发车，不仅多花钱还拖慢交付。';
  }

  return {
    whatHappened:
      decisionCase.plainSummary ||
      `在「${project?.name || '当前项目'}」里，${decisionCase.sourceAgentName || 'AI 助手'}提出的动作触发了安全拦截：${decisionCase.title}`,
    bossAnalogy,
    ifIgnored: decisionCase.costOfDelay,
    recommendedAction: recommendedOpt
      ? `最稳妥的选择是「${recommendedOpt.label}」——${recommendedOpt.benefit}`
      : '建议先退回按原定范围执行，守住既有底线。',
  };
}

export function computeEisenhowerPosition(
  urgencyScore = 70,
  importanceScore = 75
): {
  quadrant: 'do_now' | 'plan_carefully' | 'quick_delegate' | 'defer';
  quadrantLabel: string;
  xPct: number;
  yPct: number;
} {
  const x = Math.max(8, Math.min(92, urgencyScore));
  const y = Math.max(8, Math.min(92, importanceScore));

  if (importanceScore >= 60 && urgencyScore >= 60) {
    return { quadrant: 'do_now', quadrantLabel: '重要且紧急（立即拍板）', xPct: x, yPct: y };
  }
  if (importanceScore >= 60 && urgencyScore < 60) {
    return {
      quadrant: 'plan_carefully',
      quadrantLabel: '重要不紧急（从容定调）',
      xPct: x,
      yPct: y,
    };
  }
  if (importanceScore < 60 && urgencyScore >= 60) {
    return {
      quadrant: 'quick_delegate',
      quadrantLabel: '紧急不重要（快批/交办）',
      xPct: x,
      yPct: y,
    };
  }
  return { quadrant: 'defer', quadrantLabel: '低优待观察', xPct: x, yPct: y };
}

