import 'dotenv/config';
import express from 'express';
import path from 'path';
import {
  detectRuleConflicts,
  routeSubmissionThroughFirewall,
  sortDecisionCasesByPriority,
} from './src/core/firewall.ts';
import {
  buildAgentMessageRecord,
  buildPlainBossExplanation,
  defaultRoleForChannel,
  generateAgentHandshakePrompt,
  triageAgentMessage,
} from './src/core/ingest.ts';
import {
  buildDecisionCaseFromEscalation,
  compileCorrectionWithGemini,
  explainDecisionForNonCoderWithGemini,
  runAdversarialSemanticChecker,
  synthesizeResumeBriefWithGemini,
  translateAgentMessageWithGemini,
} from './src/server/geminiService.ts';
import { loadState, resetState, saveState } from './src/server/store.ts';
import type {
  AgentChannel,
  DecisionCase,
  Evidence,
  PolicyRule,
  SubmissionPayload,
  WorkThread,
} from './src/types/founderOs.ts';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // 1. Get complete Founder OS state (with priority-sorted Decision Cases)
  app.get('/api/state', (_req, res) => {
    const state = loadState();
    res.json({
      ...state,
      decisionCases: sortDecisionCasesByPriority(state.decisionCases),
    });
  });

  // 2. Reset demo state
  app.post('/api/reset', (_req, res) => {
    const fresh = resetState();
    res.json(fresh);
  });

  // 3. Create a new concurrent WorkThread
  app.post('/api/threads', (req, res) => {
    const { projectId, title, anchorGoal, constraintsText, adapterType, sourceAgentName, branchOrWorktree } = req.body as {
      projectId?: string;
      title?: string;
      anchorGoal?: string;
      constraintsText?: string;
      adapterType?: 'claude_code_hook' | 'git_merge_gate';
      sourceAgentName?: string;
      branchOrWorktree?: string;
    };

    if (!projectId || !title || !anchorGoal) {
      res.status(400).json({ error: '请填写项目、要做什么以及限制条件' });
      return;
    }

    const state = loadState();
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) {
      res.status(404).json({ error: '未找到所属项目' });
      return;
    }

    const now = new Date().toISOString();
    const projectConstraints = state.policyRules
      .filter((r) => r.active && (r.projectId === 'global' || r.projectId === project.id))
      .slice(0, 3)
      .map((r) => ({
        text: r.title,
        sourceLabel: r.scopeLabel,
      }));

    const activeConstraints = constraintsText?.trim()
      ? [{ text: constraintsText.trim(), sourceLabel: '你的要求' }, ...projectConstraints]
      : projectConstraints;

    const chosenAdapter = adapterType === 'git_merge_gate' ? 'git_merge_gate' : 'claude_code_hook';
    const threadId = `thr-${Date.now()}`;
    const agentDisplay = sourceAgentName?.trim() || (chosenAdapter === 'claude_code_hook' ? 'Claude Code' : 'WorkBuddy');

    const newThread: WorkThread = {
      id: threadId,
      projectId: project.id,
      title: title.trim(),
      kind: 'code',
      adapterType: chosenAdapter,
      adapterLabel: agentDisplay,
      sourceAgentName: agentDisplay,
      agentChannel: chosenAdapter === 'claude_code_hook' ? 'cli_hook' : 'desktop_app',
      branchOrWorktree: branchOrWorktree?.trim() || `wt/${threadId.slice(-4)}`,
      status: 'Running',
      bounceCount: 0,
      maxBounces: 2,
      verificationSpendUsd: 0,
      lastHumanAt: now,
      updatedAt: now,
      priorityScore: 55,
      degradedModeReason:
        project.verificationTier === 'tier_build_only'
          ? '这个项目没有自动测试，系统只能检查到这一步。'
          : undefined,
      resumeBrief: {
        threadId,
        anchorGoal: {
          text: anchorGoal.trim(),
          sourceLabel: '你的要求',
        },
        activeConstraints,
        deltaSummary: {
          text: '刚建好，还没有收到 AI 交回来的进展',
          sourceLabel: '刚刚建好',
        },
        blockerReason: {
          text: '正在做，不用你管',
          sourceLabel: '进行中',
        },
        costOfDelay: '正常推进中',
        degradationNotice:
          project.verificationTier === 'tier_build_only'
            ? '这个项目没有自动测试，系统只能检查到这一步。'
            : undefined,
        updatedAt: now,
      },
      evidences: [],
      trace: [
        {
          id: `tr-${Date.now()}`,
          timestamp: now,
          actor: '你',
          kind: 'human',
          summary: `新建一件事「${title.trim()}」`,
        },
      ],
    };

    state.threads.unshift(newThread);
    saveState(state);
    res.status(201).json({ thread: newThread });
  });

  // 4. Real Hook / Firewall Verification Submission Endpoint
  // Handles both UI simulation & real Claude Code Hook / Git Merge Gate payloads
  async function handleHookSubmission(
    threadId: string,
    submission: SubmissionPayload,
    useSemanticAi: boolean
  ) {
    const state = loadState();
    const thread = state.threads.find((t) => t.id === threadId);
    if (!thread) {
      throw Object.assign(new Error('Thread not found'), { statusCode: 404 });
    }
    const project = state.projects.find((p) => p.id === thread.projectId);
    if (!project) {
      throw Object.assign(new Error('Project not found'), { statusCode: 404 });
    }

    const now = new Date().toISOString();
    const newEvidences: Evidence[] = [];

    if (submission.diffSnippet || submission.changedFiles.length > 0) {
      newEvidences.push({
        id: `ev-diff-${Date.now()}`,
        threadId: thread.id,
        kind: 'diff',
        title: `${submission.hookEvent} 变更 Diff`,
        summary: `改动文件：${submission.changedFiles.join(', ') || '未指定'}`,
        rawRef: submission.diffSnippet || '(empty diff)',
        passed: null,
        deterministic: true,
        createdAt: now,
      });
    }

    if (typeof submission.testExitCode === 'number') {
      newEvidences.push({
        id: `ev-test-${Date.now() + 1}`,
        threadId: thread.id,
        kind: 'test',
        title: `L1 测试运行 (${project.testCommand || 'n/a'})`,
        summary:
          submission.testExitCode === 0
            ? 'Tests passed (exit 0)'
            : `Tests failed (exit ${submission.testExitCode})`,
        rawRef: `exit code: ${submission.testExitCode}`,
        passed: submission.testExitCode === 0,
        deterministic: true,
        createdAt: now,
      });
    }

    if (submission.browserErrors && submission.browserErrors.length > 0) {
      newEvidences.push({
        id: `ev-browser-${Date.now() + 2}`,
        threadId: thread.id,
        kind: 'browser',
        title: '无头浏览器运行时检测',
        summary: submission.browserErrors.join(' | '),
        rawRef: submission.browserErrors.join('\n'),
        passed: false,
        deterministic: true,
        createdAt: now,
      });
    }

    let checkerAssessment: {
      passed: boolean;
      confidence: 'high' | 'medium' | 'low';
      findings: string[];
      matchedHabitIds: string[];
      suggestedFacts: { text: string; source: string }[];
      suggestedUnknowns: string[];
      devilNote: string;
    } = {
      passed: true,
      confidence: 'high',
      findings: [],
      matchedHabitIds: [],
      suggestedFacts: [],
      suggestedUnknowns: [],
      devilNote: '',
    };
    let semanticCostUsd = 0;

    if (useSemanticAi && !submission.environmentBlockedReason) {
      const aiRes = await runAdversarialSemanticChecker({
        project,
        thread,
        submission,
        activeRules: state.policyRules,
      });
      checkerAssessment = aiRes.assessment;
      semanticCostUsd = aiRes.estimatedCostUsd;
    }

    const totalRunCost = (submission.estimatedSpendUsd ?? 0) + semanticCostUsd;
    const outcome = routeSubmissionThroughFirewall({
      project,
      thread,
      submission: { ...submission, estimatedSpendUsd: totalRunCost },
      evidences: newEvidences,
      rules: state.policyRules,
      checkerAssessment,
    });

    thread.status = outcome.nextStatus;
    thread.bounceCount = outcome.nextBounceCount;
    thread.verificationSpendUsd = Number((thread.verificationSpendUsd + totalRunCost).toFixed(4));
    thread.updatedAt = now;
    thread.evidences = [...newEvidences, ...thread.evidences].slice(0, 12);

    state.qualityMetrics.totalRuns += 1;
    state.qualityMetrics.totalVerificationSpendUsd = Number(
      (state.qualityMetrics.totalVerificationSpendUsd + totalRunCost).toFixed(4)
    );

    if (outcome.verdict === 'pass') {
      state.qualityMetrics.quietSuccessCount += 1;
    } else if (outcome.verdict === 'auto_bounce' || outcome.verdict === 'escalate') {
      state.qualityMetrics.totalBouncesAndEscalations += 1;
    }

    // Update violated rules hit counter
    for (const vr of outcome.violatedGuardrails) {
      const target = state.policyRules.find((r) => r.id === vr.id);
      if (target) target.hitCount += 1;
    }

    let createdCase = null;
    if (outcome.verdict === 'escalate' && outcome.triggerType) {
      createdCase = buildDecisionCaseFromEscalation({
        thread,
        project,
        triggerType: outcome.triggerType,
        enforcementLayer: outcome.enforcementLayer,
        reasons: outcome.reasons,
        submission,
        assessment: checkerAssessment,
      });
      state.decisionCases.unshift(createdCase);
      thread.priorityScore = createdCase.priorityScore;
    }

    if (outcome.autoAppliedHabit) {
      const habitRef = state.policyRules.find((r) => r.id === outcome.autoAppliedHabit!.id);
      if (habitRef) habitRef.hitCount += 1;

      state.autoAppliedActions.unshift({
        id: `auto-${Date.now()}`,
        ruleId: outcome.autoAppliedHabit.id,
        ruleTitle: outcome.autoAppliedHabit.title,
        threadId: thread.id,
        threadTitle: thread.title,
        actionTaken: outcome.reasons[0],
        reversible: true,
        undone: false,
        timestamp: now,
      });
    }

    const digestType =
      outcome.verdict === 'auto_bounce'
        ? 'auto_bounced'
        : outcome.verdict === 'blocked'
          ? 'blocked'
          : outcome.autoAppliedHabit
            ? 'habit_auto_applied'
            : 'silent_pass';

    state.digestEvents.unshift({
      id: `dig-${Date.now()}`,
      threadId: thread.id,
      projectId: project.id,
      threadTitle: thread.title,
      eventType: digestType,
      summary: outcome.reasons[0] || '已处理交付检查',
      rawContent: submission.diffSnippet || submission.claims,
      timestamp: now,
    });
    state.digestEvents = state.digestEvents.slice(0, 30);

    state.agentMessages.unshift({
      id: `msg-${Date.now()}`,
      threadId: thread.id,
      projectId: project.id,
      agentName: submission.sourceAgent || 'Claude Code',
      agentChannel: thread.agentChannel || 'cli_hook',
      roleLabel: '代码开发',
      plainSummary: `“${submission.taskSummary}”`,
      rawContent: `${submission.hookEvent}: ${submission.claims} | Files: ${submission.changedFiles.join(', ') || 'none'}`,
      triageStatus: outcome.verdict === 'escalate' ? 'needs_you' : 'handled_for_you',
      handledOutcome:
        outcome.verdict === 'escalate'
          ? `触发规则拦截，已推到左边等你拍板`
          : outcome.verdict === 'auto_bounce'
            ? `系统发现问题，已自动打回让它重做，暂不打扰你`
            : `系统已核验通过并归档`,
      urgencyLabel:
        outcome.verdict === 'escalate'
          ? '高紧急 · 需你拍板'
          : outcome.verdict === 'auto_bounce'
            ? '已打回重做'
            : '已静默过关',
      timestamp: now,
    });
    state.agentMessages = state.agentMessages.slice(0, 30);

    thread.trace.push({
      id: `tr-${Date.now()}`,
      timestamp: now,
      actor: `${submission.sourceAgent} -> Firewall`,
      kind: outcome.enforcementLayer === 'deterministic_gateway' ? 'gateway' : 'checker',
      summary: `[${outcome.verdict.toUpperCase()}] ${outcome.reasons.join('；')}`,
    });

    const latestEv = newEvidences[0];
    thread.resumeBrief = {
      ...thread.resumeBrief,
      deltaSummary: {
        text: `${submission.taskSummary} -> ${outcome.reasons[0] || outcome.verdict}`,
        sourceLabel: latestEv ? latestEv.title : submission.hookEvent,
        evidenceId: latestEv?.id,
      },
      blockerReason: {
        text:
          outcome.verdict === 'pass'
            ? '已静默验收放行，无需创始人操心'
            : outcome.reasons[0] || '等待处理',
        sourceLabel: outcome.verdict,
      },
      degradationNotice: outcome.degradedWarning,
      updatedAt: now,
    };

    saveState(state);
    return { outcome, thread, createdCase, checkerAssessment };
  }

  app.post('/api/threads/:id/submit', async (req, res) => {
    try {
      const { useSemanticAi = true, ...payload } = req.body as SubmissionPayload & {
        useSemanticAi?: boolean;
      };
      const result = await handleHookSubmission(req.params.id, payload, Boolean(useSemanticAi));
      res.json(result);
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode || 502).json({ error: e.message || 'Verification failed' });
    }
  });

  // 5. Real External Hook Endpoints (Claude Code Hook & Git Merge Gate)
  app.get('/api/hooks/active-rules', (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : 'global';
    const state = loadState();
    const activeRules = state.policyRules.filter(
      (r) => r.active && (r.projectId === 'global' || r.projectId === projectId)
    );
    res.json({
      generatedAt: new Date().toISOString(),
      projectId,
      rules: activeRules,
      claudeMdSnippet: activeRules
        .map((r) => `- [${r.kind}] ${r.title}: ${r.ruleText}`)
        .join('\n'),
    });
  });

  app.post('/api/hooks/claude-code', async (req, res) => {
    try {
      const { threadId, ...payload } = req.body as SubmissionPayload & { threadId?: string };
      if (!threadId) {
        res.status(400).json({ error: 'threadId is required for hook dispatch' });
        return;
      }
      const result = await handleHookSubmission(threadId, payload, true);
      res.json(result);
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode || 502).json({ error: e.message });
    }
  });

  // 5b. Universal 3-Tier Agent Message Ingestion (WorkBuddy Desktop Webhook / DeepSeek Web Paste / Bookmarklet)
  app.post('/api/ingest/agent-message', async (req, res) => {
    try {
      const {
        agentName = 'DeepSeek Web',
        agentChannel = 'web_chat',
        projectId,
        rawMessage,
        useAiTranslator = false,
      } = req.body as {
        agentName?: string;
        agentChannel?: AgentChannel;
        projectId?: string;
        rawMessage?: string;
        useAiTranslator?: boolean;
      };

      if (!rawMessage || !rawMessage.trim()) {
        res.status(400).json({ error: '请填写或粘贴来自 Agent 的消息内容。' });
        return;
      }

      const state = loadState();
      const project =
        state.projects.find((p) => p.id === projectId) || state.projects[0];
      if (!project) {
        res.status(404).json({ error: '未找到所属项目' });
        return;
      }

      let translatedSummary: string | undefined;
      let translatedRisk: string | undefined;
      let aiTranslationNote: string | undefined;

      if (useAiTranslator) {
        try {
          const tr = await Promise.race([
            translateAgentMessageWithGemini({
              agentName: agentName.trim(),
              rawMessage: rawMessage.trim(),
              projectName: project.name,
              activeRules: state.policyRules,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('AI 翻译超时，已使用本地规则判断')), 4500)
            ),
          ]);
          translatedSummary = tr.plainSummary;
          translatedRisk = tr.plainRisk;
          state.qualityMetrics.totalVerificationSpendUsd = Number(
            (state.qualityMetrics.totalVerificationSpendUsd + 0.01).toFixed(4)
          );
        } catch (aiErr: unknown) {
          aiTranslationNote = (aiErr as Error).message;
        }
      }

      const triage = triageAgentMessage({
        agentName: agentName.trim(),
        agentChannel,
        project,
        rawMessage: rawMessage.trim(),
        rules: state.policyRules,
        translatedSummary,
        translatedRisk,
      });

      const now = new Date().toISOString();
      const threadId = `thr-ing-${Date.now()}`;
      const roleLabel = defaultRoleForChannel(agentChannel, agentName);

      if (triage.matchedRule) {
        const target = state.policyRules.find((r) => r.id === triage.matchedRule!.id);
        if (target) target.hitCount += 1;
      }

      state.qualityMetrics.totalRuns += 1;
      if (triage.triageStatus === 'handled_for_you') {
        state.qualityMetrics.quietSuccessCount += 1;
      } else {
        state.qualityMetrics.totalBouncesAndEscalations += 1;
      }

      let createdCase: DecisionCase | null = null;
      if (triage.triageStatus === 'needs_you') {
        const adapterType =
          agentChannel === 'desktop_app'
            ? 'desktop_webhook'
            : agentChannel === 'web_chat'
              ? 'web_paste_bridge'
              : 'claude_code_hook';

        const newThread: WorkThread = {
          id: threadId,
          projectId: project.id,
          title: `${agentName.trim()}：${triage.plainSummary.slice(0, 26)}`,
          kind: agentChannel === 'cli_hook' ? 'code' : 'ops',
          adapterType,
          adapterLabel: `${agentName.trim()} · ${
            agentChannel === 'desktop_app'
              ? '桌面软件接入'
              : agentChannel === 'web_chat'
                ? '网页快速投递'
                : '终端 Hook'
          }`,
          sourceAgentName: agentName.trim(),
          agentChannel,
          branchOrWorktree: agentChannel === 'web_chat' ? 'web-paste' : 'webhook-bridge',
          status: 'Needs You',
          bounceCount: 0,
          maxBounces: 2,
          verificationSpendUsd: useAiTranslator && !aiTranslationNote ? 0.01 : 0,
          lastHumanAt: now,
          updatedAt: now,
          priorityScore: triage.priorityScore,
          resumeBrief: {
            threadId,
            anchorGoal: {
              text: `确保「${project.name}」在创始人既定红线内推进`,
              sourceLabel: 'Active Guardrails',
            },
            activeConstraints: state.policyRules
              .filter((r) => r.active && (r.projectId === 'global' || r.projectId === project.id))
              .slice(0, 2)
              .map((r) => ({ text: r.title, sourceLabel: `Rule ${r.id}` })),
            deltaSummary: {
              text: triage.plainSummary,
              sourceLabel: `ev-msg-${Date.now()}`,
              evidenceId: `ev-msg-${Date.now()}`,
            },
            blockerReason: {
              text: triage.handledOutcome,
              sourceLabel: triage.urgencyLabel,
            },
            costOfDelay: triage.costOfDelay || '需要你拍板后才会继续执行',
            updatedAt: now,
          },
          evidences: [
            {
              id: `ev-msg-${Date.now()}`,
              threadId,
              kind: 'agent_message',
              title: `来自 ${agentName.trim()}（${roleLabel}）的原始反馈`,
              summary: triage.plainSummary,
              rawRef: rawMessage.trim(),
              passed: false,
              deterministic: triage.escalationLayer === 'deterministic_gateway',
              createdAt: now,
            },
          ],
          trace: [
            {
              id: `tr-ing-${Date.now()}`,
              timestamp: now,
              actor: agentName.trim(),
              kind: 'execution',
              summary: `通过${
                agentChannel === 'desktop_app'
                  ? '桌面软件 Webhook'
                  : agentChannel === 'web_chat'
                    ? '网页采集投递'
                    : 'CLI Hook'
              }提交反馈，触发规则分拣后升级为待拍板事项`,
            },
          ],
        };
        state.threads.unshift(newThread);

        createdCase = {
          id: `case-${Date.now()}`,
          threadId,
          projectId: project.id,
          sourceAgentName: agentName.trim(),
          sourceAgentChannel: agentChannel,
          urgencyLabel: triage.urgencyLabel,
          plainSummary: triage.plainSummary,
          decisionType:
            triage.escalationLayer === 'deterministic_gateway' ? 'yes_no' : 'multi_choice',
          systemRecommendation:
            '建议：驳回该建议，保持现有底线不变',
          urgencyScore: triage.escalationLayer === 'deterministic_gateway' ? 88 : 68,
          importanceScore: triage.escalationLayer === 'deterministic_gateway' ? 90 : 76,
          stageLabel: project.stages?.find((s) => s.status === 'blocked' || s.status === 'active')?.label || '当前推进阶段',
          taskNodeLabel: `${agentName.trim()} 反馈校验`,
          enforcementLayer: triage.escalationLayer,
          triggerType:
            triage.escalationLayer === 'deterministic_gateway'
              ? 'hard_guardrail'
              : 'semantic_conflict',
          title: triage.plainSummary,
          question: triage.question || '是否批准该 Agent 继续执行上述建议？',
          whyNow: triage.handledOutcome,
          costOfDelay: triage.costOfDelay || '影响既定业务边界与发版节奏',
          estimatedMinutes: 1,
          priorityScore: triage.priorityScore,
          facts: [
            {
              text: triage.plainSummary,
              source: `${agentName.trim()} 原始消息`,
              deterministic: triage.escalationLayer === 'deterministic_gateway',
            },
          ],
          assumptionsAndUnknowns: [
            `外部工具（${agentName.trim()}）仅提出建议或请求，在创始人拍板前尚未对外产生实际改动`,
          ],
          devilAdvocateNote:
            triage.escalationLayer === 'deterministic_gateway'
              ? '该请求命中你的硬性底线或不可逆对外动作，必须由本人显式拍板。'
              : '该建议与已有策略存在张力，请确认当前业务阶段是否需要破例调整。',
          options: [
            {
              id: 'opt-reject-rule',
              label: '驳回该建议，保持现有底线不变',
              actionSummary: `退回给 ${agentName.trim()}，要求按既有规则重新处理`,
              benefit: '守住业务承诺与极简节奏，零不可逆风险',
              costAndTradeoff: '放弃该次外部激进调整带来的潜在短期收益',
              reversibility: 'Reversible',
              recommended: true,
            },
            {
              id: 'opt-waive-approve',
              label: '批准执行并破例放行',
              actionSummary: `授权通过「${agentName.trim()}」的请求并记录到决策账本`,
              benefit: '立即采纳建议或推进对外动作',
              costAndTradeoff: '直接影响客户、价格或既有产品约束',
              reversibility: 'Partially Reversible',
            },
          ],
          candidateRuleText: triage.matchedRule
            ? triage.matchedRule.ruleText
            : `涉及「${agentName.trim()}」同类对外或策略冲突请求，一律先拦下经创始人确认`,
          candidateRuleKind:
            triage.escalationLayer === 'deterministic_gateway'
              ? 'deterministic_guardrail'
              : 'semantic_habit',
          status: 'Needs Human',
          createdAt: now,
        };
        state.decisionCases.unshift(createdCase);
      }

      const msgRecord = buildAgentMessageRecord({
        projectId: project.id,
        threadId: triage.triageStatus === 'needs_you' ? threadId : undefined,
        agentName: agentName.trim(),
        agentChannel,
        roleLabel,
        rawMessage: rawMessage.trim(),
        triage,
        timestamp: now,
      });
      state.agentMessages.unshift(msgRecord);
      state.agentMessages = state.agentMessages.slice(0, 30);

      state.digestEvents.unshift({
        id: `dig-ing-${Date.now()}`,
        threadId: msgRecord.threadId || project.id,
        projectId: project.id,
        threadTitle: `${project.shortName || project.name} · ${agentName.trim()}`,
        eventType: triage.triageStatus === 'needs_you' ? 'blocked' : 'silent_pass',
        summary: `${triage.handledOutcome}：${triage.plainSummary}`,
        rawContent: rawMessage.trim(),
        timestamp: now,
      });
      state.digestEvents = state.digestEvents.slice(0, 30);

      saveState(state);
      res.status(201).json({
        message: msgRecord,
        triage,
        createdCase,
        aiTranslationNote,
      });
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode || 500).json({ error: e.message || 'Agent 消息投递失败' });
    }
  });

  // 6. Refresh 10-second Resume Brief via Gemini
  app.post('/api/threads/:id/resume-brief', async (req, res) => {
    try {
      const state = loadState();
      const thread = state.threads.find((t) => t.id === req.params.id);
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' });
        return;
      }
      const project = state.projects.find((p) => p.id === thread.projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const refreshed = await synthesizeResumeBriefWithGemini({ thread, project });
      thread.resumeBrief = refreshed;
      thread.verificationSpendUsd = Number((thread.verificationSpendUsd + 0.01).toFixed(4));
      state.qualityMetrics.totalVerificationSpendUsd = Number(
        (state.qualityMetrics.totalVerificationSpendUsd + 0.01).toFixed(4)
      );
      saveState(state);
      res.json({ resumeBrief: refreshed });
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode || 502).json({ error: e.message || 'Failed to synthesize Resume Brief' });
    }
  });

  // 6b. Pachat-style 1-paragraph onboarding prompt generator
  app.get('/api/onboarding/agent-prompt', (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
    const roleLabel = typeof req.query.roleLabel === 'string' && req.query.roleLabel.trim()
      ? req.query.roleLabel.trim()
      : '执行助手';
    const state = loadState();
    const project = state.projects.find((p) => p.id === projectId) || state.projects[0];
    if (!project) {
      res.status(404).json({ error: '未找到目标项目' });
      return;
    }

    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol || 'http';
    const baseUrl = `${protocol}://${host}`;

    const prompt = generateAgentHandshakePrompt({
      baseUrl,
      project,
      roleLabel,
      rules: state.policyRules,
    });

    res.json({ projectId: project.id, projectName: project.name, roleLabel, prompt });
  });

  // 6c. Non-coder "换个说法 / 再举个例子" explanation for any Decision Case
  app.post('/api/cases/:id/explain', async (req, res) => {
    const state = loadState();
    const dCase = state.decisionCases.find((c) => c.id === req.params.id);
    if (!dCase) {
      res.status(404).json({ error: '未找到该待拍板事项' });
      return;
    }
    const project = state.projects.find((p) => p.id === dCase.projectId);
    const body = (req.body || {}) as { useAi?: boolean; variantIndex?: number };
    const useAi = Boolean(body.useAi);
    const variantIndex = typeof body.variantIndex === 'number' ? body.variantIndex : 0;

    if (useAi) {
      try {
        const explanation = await explainDecisionForNonCoderWithGemini({
          decisionCase: dCase,
          project,
        });
        state.qualityMetrics.totalVerificationSpendUsd = Number(
          (state.qualityMetrics.totalVerificationSpendUsd + 0.01).toFixed(4)
        );
        saveState(state);
        res.json({ source: 'gemini', explanation });
        return;
      } catch (err: unknown) {
        const fallback = buildPlainBossExplanation({
          decisionCase: dCase,
          project,
          variantIndex,
        });
        res.json({
          source: 'deterministic_fallback',
          note: (err as Error).message,
          explanation: fallback,
        });
        return;
      }
    }

    const fallback = buildPlainBossExplanation({
      decisionCase: dCase,
      project,
      variantIndex,
    });
    res.json({ source: 'deterministic', explanation: fallback });
  });

  // 7. Inject Human Fact into Thread Trace
  app.post('/api/threads/:id/inject-fact', (req, res) => {
    const { factText } = req.body as { factText?: string };
    if (!factText || !factText.trim()) {
      res.status(400).json({ error: 'factText is required' });
      return;
    }

    const state = loadState();
    const thread = state.threads.find((t) => t.id === req.params.id);
    if (!thread) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }

    const now = new Date().toISOString();
    thread.trace.push({
      id: `tr-${Date.now()}`,
      timestamp: now,
      actor: 'Founder',
      kind: 'human',
      summary: `补充客观事实并继续推进：${factText.trim()}`,
    });
    thread.status = 'Running';
    thread.lastHumanAt = now;
    thread.updatedAt = now;
    thread.resumeBrief.deltaSummary = {
      text: `创始人补充事实：${factText.trim()}`,
      sourceLabel: 'Human Fact Injection',
    };
    saveState(state);
    res.json({ thread });
  });

  // 8. Resolve a Decision Case (+ Optional Rule Capture + Snooze + Undo + Extra Note / Context Upload)
  app.post('/api/cases/:id/snooze', (req, res) => {
    const { preset } = req.body as {
      preset?: 'tonight' | 'tomorrow_morning' | 'next_monday';
    };
    const state = loadState();
    const dCase = state.decisionCases.find((c) => c.id === req.params.id);
    if (!dCase) {
      res.status(404).json({ error: '未找到这件待拍板的事' });
      return;
    }

    const nowDate = new Date();
    const target = new Date(nowDate);
    let reasonLabel = '你说今晚再看';

    if (preset === 'tomorrow_morning') {
      target.setDate(target.getDate() + 1);
      target.setHours(9, 0, 0, 0);
      reasonLabel = '你说留到明天上午';
    } else if (preset === 'next_monday') {
      const day = target.getDay();
      const daysUntilMon = day === 0 ? 1 : 8 - day;
      target.setDate(target.getDate() + daysUntilMon);
      target.setHours(9, 0, 0, 0);
      reasonLabel = '你说下周一再定';
    } else {
      target.setHours(20, 0, 0, 0);
      if (target.getTime() <= nowDate.getTime()) {
        target.setTime(nowDate.getTime() + 4 * 60 * 60 * 1000);
      }
      reasonLabel = '你说今晚再看';
    }

    dCase.snoozedUntil = target.toISOString();
    dCase.snoozeReasonLabel = reasonLabel;
    saveState(state);
    res.json({ decisionCase: dCase });
  });

  app.post('/api/cases/:id/decide', (req, res) => {
    const {
      chosenOptionId,
      userRationale,
      extraInstructionToAgent,
      uploadedContextNote,
      uploadedFileName,
      saveAsRule,
      customRuleText,
      markAsFalsePositive,
      dismissMode,
      decisionDurationSeconds,
    } = req.body as {
      chosenOptionId?: string;
      userRationale?: string;
      extraInstructionToAgent?: string;
      uploadedContextNote?: string;
      uploadedFileName?: string;
      saveAsRule?: boolean;
      customRuleText?: string;
      markAsFalsePositive?: boolean;
      dismissMode?: 'always' | 'once';
      decisionDurationSeconds?: number;
    };

    const state = loadState();
    const dCase = state.decisionCases.find((c) => c.id === req.params.id);
    if (!dCase) {
      res.status(404).json({ error: '未找到这件待拍板的事' });
      return;
    }

    const option = dCase.options.find((o) => o.id === chosenOptionId);
    if (!option) {
      res.status(400).json({ error: '请选择一个有效选项' });
      return;
    }

    const now = new Date().toISOString();
    dCase.status = 'Decided';
    dCase.snoozedUntil = undefined;
    dCase.snoozeReasonLabel = undefined;

    if (typeof decisionDurationSeconds === 'number' && decisionDurationSeconds > 0 && decisionDurationSeconds < 3600) {
      state.qualityMetrics.decisionDurationsSeconds = [
        ...(state.qualityMetrics.decisionDurationsSeconds || []),
        Math.round(decisionDurationSeconds),
      ].slice(-50);
    }

    if (markAsFalsePositive) {
      dCase.markedAsFalsePositive = true;
      state.qualityMetrics.falseBounceCount += 1;
    }

    let spawnedRule: PolicyRule | undefined;
    const projectObj = state.projects.find((p) => p.id === dCase.projectId);
    const scopeName = projectObj?.shortName || projectObj?.name || '当前项目';

    if (saveAsRule) {
      const ruleText = (customRuleText || dCase.candidateRuleText).trim();
      spawnedRule = {
        id: `rule-${Date.now()}`,
        projectId: dCase.projectId,
        kind: dCase.candidateRuleKind,
        executionMode: 'suggest_only',
        title: dCase.title.replace(/[？?]/g, '').slice(0, 20),
        ruleText,
        scopeLabel: scopeName,
        sourceDecisionId: dCase.id,
        version: 1,
        reviewAt: '2026-12-31',
        hitCount: 0,
        misappliedCount: 0,
        active: true,
        createdAt: now,
      };
      state.policyRules.unshift(spawnedRule);
    } else if (dismissMode === 'always') {
      spawnedRule = {
        id: `rule-mute-${Date.now()}`,
        projectId: dCase.projectId,
        kind: 'semantic_habit',
        executionMode: 'auto_apply_reversible',
        title: `不再问：${dCase.title.replace(/[？?]/g, '').slice(0, 16)}`,
        ruleText: `遇到与「${dCase.title}」同类的事，直接按「${option.label}」处理，不用再问我`,
        scopeLabel: scopeName,
        sourceDecisionId: dCase.id,
        version: 1,
        reviewAt: '2026-12-31',
        hitCount: 1,
        misappliedCount: 0,
        active: true,
        createdAt: now,
      };
      state.policyRules.unshift(spawnedRule);
    }

    const extraNoteClean = (extraInstructionToAgent || '').trim();
    const contextParts = [
      (uploadedContextNote || '').trim(),
      uploadedFileName ? `附件：${uploadedFileName}` : '',
    ].filter(Boolean);
    const contextClean = contextParts.join(' · ');

    const reviewAfterDate = new Date();
    reviewAfterDate.setDate(reviewAfterDate.getDate() + 3);

    const recordId = `dec-${Date.now()}`;
    state.decisionRecords.unshift({
      id: recordId,
      caseId: dCase.id,
      threadId: dCase.threadId,
      projectId: dCase.projectId,
      caseTitle: dCase.title,
      chosenOptionId: option.id,
      chosenOptionLabel: option.label,
      userRationale: (userRationale || '').trim() || `选择了「${option.label}」`,
      extraInstructionToAgent: extraNoteClean || undefined,
      uploadedContextNote: contextClean || undefined,
      spawnedRuleId: spawnedRule?.id,
      decisionDurationSeconds:
        typeof decisionDurationSeconds === 'number' ? Math.round(decisionDurationSeconds) : undefined,
      reviewAfterAt: reviewAfterDate.toISOString(),
      decidedAt: now,
    });

    if (spawnedRule) {
      spawnedRule.sourceDecisionId = recordId;
    }

    const thread = state.threads.find((t) => t.id === dCase.threadId);
    if (thread) {
      const isApprove = option.id.includes('approve') || option.id.includes('waive');
      thread.status = isApprove ? 'Quiet' : 'Running';
      thread.bounceCount = 0;
      thread.lastHumanAt = now;
      thread.updatedAt = now;
      thread.priorityScore = isApprove ? 20 : 60;
      thread.trace.push({
        id: `tr-${Date.now()}`,
        timestamp: now,
        actor: '你',
        kind: 'human',
        summary: `拍板选了「${option.label}」${extraNoteClean ? ` · 附言：「${extraNoteClean}」` : ''}${contextClean ? ` · 补充资料：「${contextClean}」` : ''}`,
      });
      thread.resumeBrief.deltaSummary = {
        text: `已按「${option.label}」处理${extraNoteClean ? `（附：${extraNoteClean}）` : ''}`,
        sourceLabel: `决定 ${recordId}`,
        decisionId: recordId,
      };
      thread.resumeBrief.blockerReason = {
        text: isApprove ? '已放行继续' : '已按你的决定发给 AI 执行',
        sourceLabel: option.id,
      };
    }

    for (const msg of state.agentMessages) {
      if (msg.threadId === dCase.threadId && msg.triageStatus === 'needs_you') {
        msg.triageStatus = 'handled_for_you';
        msg.handledOutcome = `你已拍板：${option.label}${extraNoteClean ? ` · 附言：${extraNoteClean}` : ''}`;
        msg.urgencyLabel = '已拍板处理';
      }
    }

    if (extraNoteClean || contextClean) {
      state.founderCommands.unshift({
        id: `cmd-${Date.now()}`,
        projectId: dCase.projectId,
        targetAgentName: dCase.sourceAgentName || '执行 AI',
        commandText: [
          `针对「${dCase.title}」已选「${option.label}」`,
          extraNoteClean ? `补充要求：${extraNoteClean}` : '',
          contextClean ? `补充资料：${contextClean}` : '',
        ]
          .filter(Boolean)
          .join(' | '),
        attachmentName: uploadedFileName || undefined,
        timestamp: now,
        status: 'dispatched',
      });
      state.founderCommands = state.founderCommands.slice(0, 30);
    }

    saveState(state);
    res.json({
      decisionRecord: state.decisionRecords[0],
      spawnedRule,
      thread,
    });
  });

  app.post('/api/cases/:id/undo-decide', (req, res) => {
    const { decisionRecordId } = (req.body || {}) as { decisionRecordId?: string };
    const state = loadState();
    const dCase = state.decisionCases.find((c) => c.id === req.params.id);
    if (!dCase) {
      res.status(404).json({ error: '未找到这件事项' });
      return;
    }

    dCase.status = 'Needs Human';
    if (dCase.markedAsFalsePositive) {
      dCase.markedAsFalsePositive = false;
      state.qualityMetrics.falseBounceCount = Math.max(
        0,
        state.qualityMetrics.falseBounceCount - 1
      );
    }

    const recIdx = state.decisionRecords.findIndex((r) =>
      decisionRecordId ? r.id === decisionRecordId : r.caseId === dCase.id
    );
    if (recIdx !== -1) {
      const removed = state.decisionRecords[recIdx];
      if (removed.spawnedRuleId) {
        state.policyRules = state.policyRules.filter((r) => r.id !== removed.spawnedRuleId);
      }
      state.decisionRecords.splice(recIdx, 1);
    }

    const thread = state.threads.find((t) => t.id === dCase.threadId);
    if (thread) {
      thread.status = 'Needs You';
      thread.updatedAt = new Date().toISOString();
      thread.trace.push({
        id: `tr-undo-${Date.now()}`,
        timestamp: thread.updatedAt,
        actor: '你',
        kind: 'human',
        summary: '撤回了刚才的拍板，退回等你重选',
      });
    }

    saveState(state);
    res.json({ decisionCase: dCase, thread });
  });

  app.post('/api/rules/from-decision/:decisionId', (req, res) => {
    const state = loadState();
    const rec = state.decisionRecords.find((r) => r.id === req.params.decisionId);
    if (!rec) {
      res.status(404).json({ error: '未找到这条决定记录' });
      return;
    }
    if (rec.spawnedRuleId) {
      const existing = state.policyRules.find((r) => r.id === rec.spawnedRuleId);
      if (existing) {
        res.json({ rule: existing });
        return;
      }
    }

    const dCase = state.decisionCases.find((c) => c.id === rec.caseId);
    const projectObj = state.projects.find((p) => p.id === rec.projectId);
    const ruleText =
      (req.body as { ruleText?: string })?.ruleText?.trim() ||
      dCase?.candidateRuleText ||
      `遇到「${rec.caseTitle}」同类的事，按「${rec.chosenOptionLabel}」处理`;

    const created: PolicyRule = {
      id: `rule-${Date.now()}`,
      projectId: rec.projectId,
      kind: dCase?.candidateRuleKind || 'semantic_habit',
      executionMode: 'suggest_only',
      title: rec.caseTitle.replace(/[？?]/g, '').slice(0, 20),
      ruleText,
      scopeLabel: projectObj?.shortName || projectObj?.name || '所有项目',
      sourceDecisionId: rec.id,
      version: 1,
      reviewAt: '2026-12-31',
      hitCount: 0,
      misappliedCount: 0,
      active: true,
      createdAt: new Date().toISOString(),
    };

    rec.spawnedRuleId = created.id;
    state.policyRules.unshift(created);
    saveState(state);
    res.status(201).json({ rule: created });
  });

  // 8b. Proactive Founder-to-Agent Command Dispatch (even when Agent has ZERO problems/errors)
  app.post('/api/commands/dispatch', (req, res) => {
    const { projectId, targetAgentName, commandText, attachmentName } = req.body as {
      projectId?: string;
      targetAgentName?: string;
      commandText?: string;
      attachmentName?: string;
    };

    if (!commandText || !commandText.trim()) {
      res.status(400).json({ error: '请输入要下达给 AI 的具体指令内容' });
      return;
    }

    const state = loadState();
    const project =
      state.projects.find((p) => p.id === projectId) || state.projects[0];
    if (!project) {
      res.status(404).json({ error: '未找到目标项目' });
      return;
    }

    const now = new Date().toISOString();
    const agent = (targetAgentName || 'WorkBuddy').trim();
    const cmd = {
      id: `cmd-${Date.now()}`,
      projectId: project.id,
      targetAgentName: agent,
      commandText: commandText.trim(),
      attachmentName: attachmentName?.trim() || undefined,
      timestamp: now,
      status: 'dispatched' as const,
    };

    state.founderCommands.unshift(cmd);
    state.founderCommands = state.founderCommands.slice(0, 30);

    state.agentMessages.unshift({
      id: `msg-cmd-${Date.now()}`,
      projectId: project.id,
      agentName: agent,
      agentChannel: agent.toLowerCase().includes('claude')
        ? 'cli_hook'
        : agent.toLowerCase().includes('deepseek')
          ? 'web_chat'
          : 'desktop_app',
      roleLabel: '收到老板主动指令',
      plainSummary: `老板直接下令：「${commandText.trim()}」${attachmentName ? `（附：${attachmentName}）` : ''}`,
      rawContent: `Proactive Founder Command -> ${agent}: ${commandText.trim()}`,
      triageStatus: 'handled_for_you',
      handledOutcome: `已直接下发给 ${agent} 执行，无需切到其他软件`,
      urgencyLabel: '已下达新指令',
      timestamp: now,
    });
    state.agentMessages = state.agentMessages.slice(0, 30);

    const matchingThread = state.threads.find((t) => t.projectId === project.id);
    if (matchingThread) {
      matchingThread.trace.push({
        id: `tr-cmd-${Date.now()}`,
        timestamp: now,
        actor: `老板 → ${agent}`,
        kind: 'human',
        summary: `主动下达指令：${commandText.trim()}`,
      });
    }

    saveState(state);
    res.status(201).json({ command: cmd });
  });

  // 9. Report False Negative (Escaped Defect) on a thread
  app.post('/api/threads/:id/report-missed', (req, res) => {
    const { note } = req.body as { note?: string };
    const state = loadState();
    const thread = state.threads.find((t) => t.id === req.params.id);
    if (!thread) {
      res.status(404).json({ error: '未找到这件事项' });
      return;
    }

    const now = new Date().toISOString();
    const reasonText = (note || '你指出这件事其实有问题，已打回让它重做').trim();
    state.qualityMetrics.escapedDefectsCount += 1;
    thread.status = 'Auto-Fixing';
    thread.updatedAt = now;
    thread.resumeBrief.blockerReason = {
      text: `打回重做中：${reasonText}`,
      sourceLabel: '你的反馈',
    };
    thread.trace.push({
      id: `tr-${Date.now()}`,
      timestamp: now,
      actor: '你',
      kind: 'human',
      summary: `指出有问题并打回重做：${reasonText}`,
    });
    saveState(state);
    res.json({ qualityMetrics: state.qualityMetrics, thread });
  });

  // 10. Undo an Auto-Applied Semantic Habit (and record misapplication)
  app.post('/api/auto-actions/:id/undo', (req, res) => {
    const state = loadState();
    const action = state.autoAppliedActions.find((a) => a.id === req.params.id);
    if (!action) {
      res.status(404).json({ error: 'Action not found' });
      return;
    }
    if (action.undone) {
      res.json({ action });
      return;
    }

    action.undone = true;
    const rule = state.policyRules.find((r) => r.id === action.ruleId);
    if (rule) {
      rule.misappliedCount += 1;
      if (rule.misappliedCount >= 2) {
        rule.executionMode = 'suggest_only';
      }
    }

    state.qualityMetrics.falseBounceCount += 1;
    const thread = state.threads.find((t) => t.id === action.threadId);
    if (thread) {
      thread.status = 'Needs You';
      thread.trace.push({
        id: `tr-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: 'Founder Undo',
        kind: 'human',
        summary: `撤销习惯「${action.ruleTitle}」的自动执行并退回人工处理`,
      });
    }

    saveState(state);
    res.json({ action, rule });
  });

  // 11. Quick Correction-to-Policy Compiler (via Gemini + Conflict Detector)
  app.post('/api/rules/compile', async (req, res) => {
    try {
      const { naturalText, projectId = 'global' } = req.body as {
        naturalText?: string;
        projectId?: string | 'global';
      };
      if (!naturalText || !naturalText.trim()) {
        res.status(400).json({ error: 'naturalText is required' });
        return;
      }

      const state = loadState();
      const compiled = await compileCorrectionWithGemini({
        naturalText: naturalText.trim(),
        projectId,
        existingRules: state.policyRules,
      });

      const conflicts = detectRuleConflicts(
        {
          projectId,
          title: compiled.title,
          ruleText: compiled.ruleText,
        },
        state.policyRules
      );

      state.qualityMetrics.totalVerificationSpendUsd = Number(
        (state.qualityMetrics.totalVerificationSpendUsd + 0.01).toFixed(4)
      );
      saveState(state);

      res.json({ compiled, conflicts });
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode || 502).json({ error: e.message || 'Failed to compile rule' });
    }
  });

  app.post('/api/rules', (req, res) => {
    const {
      projectId,
      kind,
      executionMode,
      title,
      ruleText,
      scopeLabel,
      matcher,
      deactivateConflictingRuleIds,
    } = req.body as Partial<PolicyRule> & { deactivateConflictingRuleIds?: string[] };

    if (!title || !ruleText) {
      res.status(400).json({ error: 'title and ruleText are required' });
      return;
    }

    const state = loadState();
    if (Array.isArray(deactivateConflictingRuleIds)) {
      for (const id of deactivateConflictingRuleIds) {
        const old = state.policyRules.find((r) => r.id === id);
        if (old) old.active = false;
      }
    }

    const created: PolicyRule = {
      id: `rule-${Date.now()}`,
      projectId: projectId || 'global',
      kind: kind === 'deterministic_guardrail' ? 'deterministic_guardrail' : 'semantic_habit',
      executionMode:
        kind === 'semantic_habit' && executionMode === 'auto_apply_reversible'
          ? 'auto_apply_reversible'
          : 'suggest_only',
      title: title.trim(),
      ruleText: ruleText.trim(),
      scopeLabel: scopeLabel || '全局策略',
      matcher,
      version: 1,
      reviewAt: '2026-12-31',
      hitCount: 0,
      misappliedCount: 0,
      active: true,
      createdAt: new Date().toISOString(),
    };

    state.policyRules.unshift(created);
    saveState(state);
    res.status(201).json({ rule: created });
  });

  app.patch('/api/rules/:id', (req, res) => {
    const { active, executionMode } = req.body as {
      active?: boolean;
      executionMode?: PolicyRule['executionMode'];
    };
    const state = loadState();
    const rule = state.policyRules.find((r) => r.id === req.params.id);
    if (!rule) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }
    if (typeof active === 'boolean') rule.active = active;
    if (executionMode && rule.kind === 'semantic_habit') {
      rule.executionMode = executionMode;
    }
    saveState(state);
    res.json({ rule });
  });

  app.post('/api/rules/:id/ack-review', (req, res) => {
    const { stillWorks } = (req.body || {}) as { stillWorks?: boolean };
    const state = loadState();
    const rule = state.policyRules.find((r) => r.id === req.params.id);
    if (!rule) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }
    if (stillWorks) {
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + 30);
      rule.reviewAt = nextDate.toISOString().slice(0, 10);
    } else {
      rule.active = false;
    }
    saveState(state);
    res.json({ rule });
  });

  // 11b. Digest Event Feedback ("这件该告诉我" / "撤销")
  app.post('/api/digest/:id/mark-missed', (req, res) => {
    const state = loadState();
    const item = state.digestEvents.find((d) => d.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: '未找到这条记录' });
      return;
    }
    if (!item.markedWrong) {
      item.markedWrong = true;
      state.qualityMetrics.escapedDefectsCount += 1;
      saveState(state);
    }
    res.json({ item, qualityMetrics: state.qualityMetrics });
  });

  app.post('/api/digest/:id/undo-missed', (req, res) => {
    const state = loadState();
    const item = state.digestEvents.find((d) => d.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: '未找到这条记录' });
      return;
    }
    if (item.markedWrong) {
      item.markedWrong = false;
      state.qualityMetrics.escapedDefectsCount = Math.max(
        0,
        state.qualityMetrics.escapedDefectsCount - 1
      );
      saveState(state);
    }
    res.json({ item, qualityMetrics: state.qualityMetrics });
  });

  // 12. L3/L4 Outcome Check
  app.post('/api/outcomes/:decisionId', (req, res) => {
    const { verdict, note } = req.body as {
      verdict?: 'win' | 'miss' | 'neutral';
      note?: string;
    };
    if (!verdict || !['win', 'miss', 'neutral'].includes(verdict)) {
      res.status(400).json({ error: 'Valid verdict (win/miss/neutral) is required' });
      return;
    }

    const state = loadState();
    const record = state.decisionRecords.find((d) => d.id === req.params.decisionId);
    if (!record) {
      res.status(404).json({ error: 'DecisionRecord not found' });
      return;
    }

    record.outcomeCheck = {
      verdict,
      note: (note || '').trim() || '已完成回看',
      checkedAt: new Date().toISOString(),
    };
    saveState(state);
    res.json({ record });
  });

  // 13. Toggle / Ping Adapter Connection
  app.patch('/api/connections/:id', (req, res) => {
    const { status } = req.body as { status?: 'Connected' | 'Degraded' | 'Paused' };
    const state = loadState();
    const conn = state.connections.find((c) => c.id === req.params.id);
    if (!conn) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    if (status) conn.status = status;
    conn.lastSyncAt = new Date().toISOString();
    saveState(state);
    res.json({ connection: conn });
  });

  // Dev vs Prod frontend serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Founder OS server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
