import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type {
  AgentChannel,
  Project,
  SubmissionPayload,
  WorkThread,
} from '../types/founderOs';

interface DemoDrawerProps {
  open: boolean;
  projects: Project[];
  threads: WorkThread[];
  onClose: () => void;
  onResetDemo: () => Promise<void>;
  onIngestAgentMessage: (payload: {
    agentName: string;
    agentChannel: AgentChannel;
    projectId: string;
    rawMessage: string;
    useAiTranslator?: boolean;
  }) => Promise<{ handledOutcome: string }>;
  onSubmitToFirewall: (
    threadId: string,
    payload: SubmissionPayload & { useSemanticAi: boolean }
  ) => Promise<{ verdict: string; reasons: string[] }>;
}

/**
 * Section 9: 演示模式抽屉 (M-01 to M-05).
 * Only visible when demoMode is enabled (?demo=1 or toggled via URL/storage).
 */
export function DemoDrawer({
  open,
  projects,
  threads,
  onClose,
  onResetDemo,
  onIngestAgentMessage,
  onSubmitToFirewall,
}: DemoDrawerProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState(threads[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedThreadId && threads[0]) {
      setSelectedThreadId(threads[0].id);
    }
  }, [threads, selectedThreadId]);

  useEffect(() => {
    if (open) setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const firstProject = projects[0];

  const pastePresets: {
    label: string;
    agentName: string;
    channel: AgentChannel;
    projectId: string;
    rawMessage: string;
  }[] = [
    {
      label: '预设 1：WorkBuddy 准备群发 5 折续费',
      agentName: 'WorkBuddy',
      channel: 'desktop_app',
      projectId: projects.find((p) => p.id === 'proj-fitness')?.id || firstProject?.id || '',
      rawMessage: '已整理完 380 位过期会员名单，准备马上群发 5 折挽留优惠券。',
    },
    {
      label: '预设 2：DeepSeek 建议引入 Redis 集群',
      agentName: 'DeepSeek Web',
      channel: 'web_chat',
      projectId: projects.find((p) => p.id === 'proj-cnc')?.id || firstProject?.id || '',
      rawMessage: '建议机床检索系统改成先部署 Redis 集群再上线，方便以后扩架构。',
    },
    {
      label: '预设 3：DeepSeek 常规表单精简建议',
      agentName: 'DeepSeek Web',
      channel: 'web_chat',
      projectId: projects.find((p) => p.id === 'proj-support')?.id || firstProject?.id || '',
      rawMessage: '把客户报修表单从 6 个格子精简成 2 个，减少填写麻烦。',
    },
  ];

  const hookScripts: { label: string; payload: SubmissionPayload }[] = [
    {
      label: '1. 正常交付（自动过关，不打扰）',
      payload: {
        sourceAgent: 'Claude Code',
        hookEvent: 'Stop',
        taskSummary: '更新售后工单检索提示词',
        claims: '已完成修改，测试全部通过。',
        changedFiles: ['src/support/search.ts'],
        diffSnippet: '+ return formatReply(ticket);',
        testExitCode: 0,
        buildExitCode: 0,
      },
    },
    {
      label: '2. 碰到底线路径（拦下等你拍板）',
      payload: {
        sourceAgent: 'Claude Code',
        hookEvent: 'PrePush',
        taskSummary: '顺手优化公差表写入',
        claims: 'All tests pass!',
        changedFiles: ['db/master/cnc_tolerance_locked.sql'],
        diffSnippet: '+ allow_ai_overwrite = true;',
        testExitCode: 0,
        buildExitCode: 0,
      },
    },
    {
      label: '3. 测试没过（系统自动打回重做）',
      payload: {
        sourceAgent: 'Claude Code',
        hookEvent: 'Stop',
        taskSummary: '调整故障码匹配规则',
        claims: '全部改好了。',
        changedFiles: ['src/cnc/matcher.ts'],
        diffSnippet: '+ return matchCode(id);',
        testExitCode: 1,
        buildExitCode: 0,
      },
    },
    {
      label: '4. 准备外发客户群（拦下等你拍板）',
      payload: {
        sourceAgent: 'WorkBuddy',
        hookEvent: 'PRMergeGate',
        taskSummary: '准备对外发送新报价',
        claims: '清单已核对完毕，等待发送。',
        changedFiles: [],
        diffSnippet: '',
        testExitCode: 0,
        buildExitCode: 0,
        externalActionRequested: true,
      },
    },
    {
      label: '5. 本地测试数据库没启动（卡住提示）',
      payload: {
        sourceAgent: 'Claude Code',
        hookEvent: 'Stop',
        taskSummary: '运行全量离线库测试',
        claims: '等待环境恢复。',
        changedFiles: [],
        diffSnippet: '',
        environmentBlockedReason: '测试用的本地数据库没启动',
      },
    },
  ];

  async function runTask(fn: () => Promise<string>) {
    setBusy(true);
    setOutput(null);
    try {
      const msg = await fn();
      setOutput(msg);
    } catch (err: unknown) {
      setOutput((err as Error).message || '演示请求未成功');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#0e3a3d]/25"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-drawer-title"
        className="w-full max-w-[440px] h-full bg-white fos-modal-shadow flex flex-col"
      >
        <div className="px-6 py-4 border-b border-[#c9d6d5] flex items-center justify-between gap-4 shrink-0">
          <h2 id="demo-drawer-title" className="text-base font-semibold text-[#0e3a3d]">
            演示工具
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="关闭演示工具"
            onClick={onClose}
            className="min-h-8 min-w-8 inline-flex items-center justify-center rounded-md text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto fos-scroll p-6 space-y-6 text-sm">
          {output && (
            <div className="p-3 rounded-md bg-[#eaf6f3] text-[#0b7265] text-[13px]">
              {output}
            </div>
          )}

          {/* M-01: Reset demo state */}
          <section className="space-y-2">
            <h3 className="text-[13px] font-semibold text-[#456669]">恢复初始演示数据</h3>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                runTask(async () => {
                  await onResetDemo();
                  return '已恢复到最初的演示状态。';
                })
              }
              className="h-9 px-4 rounded-md border border-[#6f8c8b] bg-white text-[13px] font-medium text-[#0e3a3d] cursor-pointer"
            >
              重置演示数据
            </button>
          </section>

          {/* M-02: 3 Quick Paste Presets */}
          <section className="pt-4 border-t border-[#c9d6d5] space-y-2">
            <h3 className="text-[13px] font-semibold text-[#456669]">模拟 AI 发来消息</h3>
            <div className="space-y-2">
              {pastePresets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    runTask(async () => {
                      const res = await onIngestAgentMessage({
                        agentName: p.agentName,
                        agentChannel: p.channel,
                        projectId: p.projectId,
                        rawMessage: p.rawMessage,
                        useAiTranslator: false,
                      });
                      return `${p.label} → ${res.handledOutcome}`;
                    })
                  }
                  className="w-full text-left px-3 py-2.5 rounded-md border border-[#c9d6d5] hover:border-[#6f8c8b] text-[13px] text-[#0e3a3d] cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          {/* M-04 & M-05: Simulate first report + Probe active rules */}
          <section className="pt-4 border-t border-[#c9d6d5] space-y-2">
            <h3 className="text-[13px] font-semibold text-[#456669]">接入测试</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !firstProject}
                onClick={() =>
                  runTask(async () => {
                    const res = await onIngestAgentMessage({
                      agentName: '外部 AI（演示）',
                      agentChannel: 'desktop_app',
                      projectId: firstProject!.id,
                      rawMessage: `准备导出「${firstProject!.name}」全部数据并群发客户。`,
                      useAiTranslator: false,
                    });
                    return `首次汇报测试完成 → ${res.handledOutcome}`;
                  })
                }
                className="h-9 px-3 rounded-md border border-[#6f8c8b] bg-white text-[13px] text-[#0e3a3d] cursor-pointer"
              >
                模拟该 AI 首次汇报
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runTask(async () => {
                    const res = await fetch('/api/hooks/active-rules?projectId=global');
                    const data = await res.json();
                    return `规则接口返回 HTTP ${res.status}，共 ${data.rules?.length ?? 0} 条生效规矩。`;
                  })
                }
                className="h-9 px-3 rounded-md border border-[#6f8c8b] bg-white text-[13px] text-[#0e3a3d] cursor-pointer"
              >
                探测规则接口
              </button>
            </div>
          </section>

          {/* M-03: 5 Hook submission test scripts */}
          <section className="pt-4 border-t border-[#c9d6d5] space-y-2.5">
            <h3 className="text-[13px] font-semibold text-[#456669]">
              模拟事项交回检查（5 种剧本）
            </h3>
            <select
              aria-label="选择要测试的事项"
              value={selectedThreadId}
              onChange={(e) => setSelectedThreadId(e.target.value)}
              className="w-full h-10 px-3 text-[13px] bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
            >
              {threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>

            <div className="space-y-2">
              {hookScripts.map((sc) => (
                <button
                  key={sc.label}
                  type="button"
                  disabled={busy || !selectedThreadId}
                  onClick={() =>
                    runTask(async () => {
                      const res = await onSubmitToFirewall(selectedThreadId, {
                        ...sc.payload,
                        useSemanticAi: false,
                      });
                      return `检查结果：${res.verdict} — ${res.reasons.join('；')}`;
                    })
                  }
                  className="w-full text-left px-3 py-2.5 rounded-md border border-[#c9d6d5] hover:border-[#6f8c8b] text-[13px] text-[#0e3a3d] cursor-pointer"
                >
                  {sc.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
