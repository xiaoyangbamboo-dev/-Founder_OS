import type {
  AgentChannel,
  AgentFeedbackMessage,
  DecisionCase,
  PolicyRule,
  Project,
} from '../types/founderOs.ts';

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
  if (lower.includes('workbuddy')) return '桌面事务执行';
  if (lower.includes('deepseek') || lower.includes('chatgpt') || channel === 'web_chat') {
    return '方案参谋';
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
        urgencyLabel: '今天要定 · 碰到了规矩',
        plainSummary:
          translatedSummary ||
          `${agentName} 的动作碰到了受保护的内容（${target}），系统已拦下，等你决定放不放行。`,
        handledOutcome: `碰到规矩「${rule.title}」，已拦下等你拍板`,
        matchedRule: rule,
        detectedExternalRisk: false,
        priorityScore: 93,
        question: `${agentName} 碰到了「${rule.title}」，要不要放行？`,
        costOfDelay: translatedRisk || '关系重要数据或既有承诺，你不点头系统不会放行。',
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
      urgencyLabel: '今天要定 · 对外不能反悔',
      plainSummary:
        translatedSummary ||
        `${agentName} 准备做一件发出去就收不回来的事（涉及「${hitExternal}」），系统已拦下等你定。`,
      handledOutcome: `已拦下对外动作（${hitExternal}），还没发给任何人`,
      detectedExternalRisk: true,
      priorityScore: 91,
      question: `${agentName} 想做涉及「${hitExternal}」的事，同不同意？`,
      costOfDelay: translatedRisk || '发给客户、改价或覆盖老数据后就收不回来了。',
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
      urgencyLabel: '重要 · 与已有方向冲突',
      plainSummary:
        translatedSummary ||
        `${agentName} 建议「${hitStrategy}」，和你之前定下的方向不太一样。`,
      handledOutcome: `发现和已有方向冲突（${hitStrategy}），送来请你定一下`,
      detectedExternalRisk: false,
      priorityScore: 82,
      question: `${agentName} 建议「${hitStrategy}」，是坚持原样还是改路线？`,
      costOfDelay: translatedRisk || '直接照做会改动原有做法，建议先看一眼再决定。',
    };
  }

  // 4. Otherwise: safe progress / routine feedback -> Handle quietly without disturbing founder
  const compactSnippet =
    rawMessage.replace(/\s+/g, ' ').trim().slice(0, 72) +
    (rawMessage.trim().length > 72 ? '…' : '');

  return {
    triageStatus: 'handled_for_you',
    escalationLayer: 'probabilistic_checker',
    urgencyLabel: '正常进展 · 已替你处理',
    plainSummary:
      translatedSummary || `${agentName} 汇报进展：${compactSnippet}`,
    handledOutcome:
      agentChannel === 'web_chat'
        ? '已自动整理归档，没有碰到你的规矩，不打扰你'
        : '系统已检查通过并归档，不用你操心',
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
 * Generates a 1-paragraph pasteable instruction that works with any AI tool.
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
    `【Founder OS 接入说明】`,
    `从现在起，你负责「${project.name}」项目里的【${roleLabel}】。`,
    `项目目标与底线：${project.currentGoalSummary || project.stage}`,
    ``,
    `必须遵守的规矩（碰到之前先停下问我）：`,
    scopedRules || `1. 不要擅自发消息给外部客户、改价格、改动锁定数据或偏离既定方向。`,
    ``,
    `汇报方式（按你的能力选一种）：`,
    `① 如果你能联网发请求：开工前先看规则 ${cleanBase}/api/hooks/active-rules?projectId=${project.id} ；完成关键一步或碰到上面规矩前，往 ${cleanBase}/api/ingest/agent-message 发一条 JSON（带上 agentName, projectId="${project.id}", rawMessage）。`,
    `② 如果你是网页对话，不能自己发请求：每次给结论或准备动手前，在回答最后加一段【人话汇报】，写清“我做了什么 + 有没有碰到规矩或对外动作”，方便我复制过去让系统判断。`,
    ``,
    `请用一句大白话回复「已按 ${project.name} · ${roleLabel} 记好规矩」，不用写代码。`,
  ].join('\n');
}

/**
 * Deterministic plain-language analogy generator ("换个说法 / 再举个例子").
 */
export function buildPlainBossExplanation(params: {
  decisionCase: DecisionCase;
  project?: Project;
  variantIndex?: number;
}): {
  whatHappened: string;
  bossAnalogy: string;
  ifIgnored: string;
  recommendedAction: string;
} {
  const { decisionCase, project, variantIndex = 0 } = params;
  const recommendedOpt = decisionCase.options.find((o) => o.recommended) || decisionCase.options[0];
  const titleLower = `${decisionCase.title} ${decisionCase.whyNow}`.toLowerCase();

  let bossAnalogy =
    '打个比方：就像你请了一位很能干的老师傅去修一台机器，他顺手把旁边没坏的报价单或客户档案也改了。系统在门口把修改拦了下来，只等你点头。';

  if (titleLower.includes('公差') || titleLower.includes('机床') || titleLower.includes('数据库')) {
    bossAnalogy =
      variantIndex % 2 === 1
        ? '打个比方：你让新资料员把工具箱整理得顺手一点，他却把老师傅用红笔锁在柜子里的标准图纸也拆封了。先把新抽屉在 1 号车间试三天，老图纸照旧锁好最稳妥。'
        : '打个比方：好比你让新来的资料员把机床零件目录整理得更顺手，结果他顺手把老师傅手写核准的“老零件公差底表”也改成允许自动覆盖。万一 AI 算错一次，车间加工出来的零件尺寸就会报废。';
  } else if (titleLower.includes('打折') || titleLower.includes('降价') || titleLower.includes('群发')) {
    bossAnalogy =
      variantIndex % 2 === 1
        ? '打个比方：老会员一直按原价续卡，今天突然收到 7 折券，不仅当月少收钱，以后大家都会干等打折才续费。改送一次体态对比评估，面子和利润都能保住。'
        : '打个比方：就像店员为了拉回头客，没问老板就印了一批 7 折优惠券准备群发出去。钱和口碑一旦发出去就收不回来了，所以门卫先按住没让发。';
  } else if (titleLower.includes('甲方') || titleLower.includes('外发') || titleLower.includes('漫剧')) {
    bossAnalogy =
      variantIndex % 2 === 1
        ? '打个比方：一桌菜里第 7 道菜明显咸了，服务员已经端在托盘上准备上桌。先撤回厨房 15 分钟重炒那一道，总比整桌被客人退掉强。'
        : '打个比方：好比剪辑助理熬夜剪完了 24 集片子，其中第 7 集主角长相突然变样了，他还没检查就要一键打包发给甲方。系统帮你卡在微信发送前最后一步。';
  } else if (titleLower.includes('非标') || titleLower.includes('改装') || titleLower.includes('电子标准')) {
    bossAnalogy =
      '打个比方：老师傅那 12 台老改装车床的尺寸只记在纸质本子上，AI 翻遍了公开说明书也找不到，所以它没有瞎猜，而是老老实实停下来找你要那本台账。';
  } else if (titleLower.includes('云端') || titleLower.includes('redis') || titleLower.includes('架构')) {
    bossAnalogy =
      '打个比方：你本来只想要一辆能马上上路拉货的小货车，结果顾问建议先盖一座立体车库才能发车，不仅多花钱还拖慢交付。';
  }

  return {
    whatHappened:
      decisionCase.plainSummary ||
      `在「${project?.name || '当前项目'}」里，${decisionCase.sourceAgentName || 'AI 助手'}提出的动作触发了规矩拦下：${decisionCase.title}`,
    bossAnalogy,
    ifIgnored: decisionCase.costOfDelay,
    recommendedAction: recommendedOpt
      ? `建议先选「${recommendedOpt.label}」——${recommendedOpt.benefit}`
      : '建议先按原定范围重做，守住已有规矩。',
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
