import { useEffect, useRef, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import type {
  AdapterConnection,
  AgentChannel,
  PolicyRule,
  Project,
} from '../types/founderOs';
import { generateAgentHandshakePrompt } from '../core/ingest';
import { formatRelativeTime } from '../core/formatters';

interface ConnectionsModalProps {
  open: boolean;
  connections: AdapterConnection[];
  projects: Project[];
  policyRules: PolicyRule[];
  defaultProjectId?: string;
  onClose: () => void;
  onToggleConnection: (id: string, status: 'Connected' | 'Paused') => Promise<void>;
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
}

type OnboardingTab = 'prompt' | 'paste' | 'tech';

/**
 * Section 7: 接入面板 (N-01 to N-15).
 */
export function ConnectionsModal({
  open,
  connections,
  projects,
  policyRules,
  defaultProjectId,
  onClose,
  onToggleConnection,
  onIngestAgentMessage,
}: ConnectionsModalProps) {
  const [activeTab, setActiveTab] = useState<OnboardingTab>('prompt');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [promptProjectId, setPromptProjectId] = useState(
    defaultProjectId && defaultProjectId !== 'all' ? defaultProjectId : projects[0]?.id || ''
  );
  const [promptRole, setPromptRole] = useState('方案顾问与风险把关');

  const [webAgentName, setWebAgentName] = useState('DeepSeek Web');
  const [webMessage, setWebMessage] = useState('');
  const [submittingPaste, setSubmittingPaste] = useState(false);
  const [pasteFeedback, setPasteFeedback] = useState<string | null>(null);

  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (defaultProjectId && defaultProjectId !== 'all') {
      setPromptProjectId(defaultProjectId);
    } else if (!promptProjectId && projects[0]) {
      setPromptProjectId(projects[0].id);
    }
  }, [defaultProjectId, projects]);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      setPasteFeedback(null);
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
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

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const selectedProject =
    projects.find((p) => p.id === promptProjectId) || projects[0];

  const handshakePrompt = selectedProject
    ? generateAgentHandshakePrompt({
        baseUrl: origin,
        project: selectedProject,
        roleLabel: promptRole,
        rules: policyRules,
      })
    : '';

  const hookConfigSnippet = JSON.stringify(
    {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash|Edit|Write',
            hooks: [
              {
                type: 'command',
                command: `curl -sS -X POST ${origin}/api/hooks/claude-code -H "Content-Type: application/json" -d '{"threadId":"thr-cnc-tolerance","hookEvent":"PreToolUse","sourceAgent":"Claude Code"}'`,
              },
            ],
          },
        ],
      },
    },
    null,
    2
  );

  const workBuddyWebhookSnippet = `POST ${origin}/api/ingest/agent-message
Content-Type: application/json

{
  "agentName": "WorkBuddy",
  "agentChannel": "desktop_app",
  "projectId": "${selectedProject?.id || 'proj-cnc'}",
  "rawMessage": "WorkBuddy 准备将 24 集漫剧成片群发到甲方群..."
}`;

  const bookmarkletCode = `javascript:(()=>{const t=window.getSelection()?.toString()||'';if(!t){return;}fetch('${origin}/api/ingest/agent-message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agentName:'DeepSeek Web',agentChannel:'web_chat',projectId:'${selectedProject?.id || 'proj-cnc'}',rawMessage:t})});})();`;

  function copySnippet(key: string, text: string) {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  }

  async function handleWebPasteSend(e: React.FormEvent) {
    e.preventDefault();
    if (!webMessage.trim() || !selectedProject || submittingPaste) return;
    setSubmittingPaste(true);
    setPasteFeedback(null);
    try {
      const res = await onIngestAgentMessage({
        agentName: webAgentName,
        agentChannel: 'web_chat',
        projectId: selectedProject.id,
        rawMessage: webMessage.trim(),
        useAiTranslator: true,
      });
      setWebMessage('');
      if (res.triageStatus === 'needs_you') {
        onClose();
      } else {
        setPasteFeedback('这件不用你管，已替你处理。');
      }
    } catch (err: unknown) {
      setPasteFeedback((err as Error).message || '没发成功，检查一下网络再试。');
    } finally {
      setSubmittingPaste(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e3a3d]/30 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connections-dialog-title"
        className="fos-modal-shadow rounded-xl w-full max-w-[720px] max-h-[90vh] overflow-y-auto fos-scroll p-6 space-y-5"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#c9d6d5] pb-3">
          <div>
            <h2 id="connections-dialog-title" className="text-base font-semibold text-[#0e3a3d]">
              接入一个 AI
            </h2>
            <p className="text-[13px] text-[#456669] mt-1">
              把一段话发给你的 AI，它之后就会按你的规矩来汇报。
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="关闭接入面板"
            onClick={onClose}
            className="min-h-8 min-w-8 inline-flex items-center justify-center rounded-md text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* N-03: 3 Tabs without numbers */}
        <div
          role="tablist"
          aria-label="接入方式"
          className="flex flex-wrap gap-1.5 border-b border-[#c9d6d5] pb-3"
        >
          {(
            [
              { id: 'prompt' as const, label: '发一段话给它（推荐）' },
              { id: 'paste' as const, label: '我手动粘贴' },
              { id: 'tech' as const, label: '技术人员用' },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setActiveTab(tab.id);
                  setPasteFeedback(null);
                }}
                className={`h-9 px-3.5 rounded-md text-[13px] whitespace-nowrap cursor-pointer fos-transition ${
                  active
                    ? 'bg-[#f5f8f7] border border-[#0e3a3d] text-[#0e3a3d] font-semibold'
                    : 'bg-white border border-[#c9d6d5] text-[#456669] hover:text-[#0e3a3d]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: 发一段话给它（推荐） */}
        {activeTab === 'prompt' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="onboard-project"
                  className="block text-[13px] font-medium text-[#0e3a3d] mb-1.5"
                >
                  第 1 步：这个 AI 负责哪个项目
                </label>
                <select
                  id="onboard-project"
                  value={selectedProject?.id || ''}
                  onChange={(e) => setPromptProjectId(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
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
                  htmlFor="onboard-role"
                  className="block text-[13px] font-medium text-[#0e3a3d] mb-1.5"
                >
                  第 2 步：它负责什么
                </label>
                <select
                  id="onboard-role"
                  value={promptRole}
                  onChange={(e) => setPromptRole(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
                >
                  <option value="方案顾问与风险把关">方案顾问与风险把关</option>
                  <option value="数据库与代码执行助手">数据库与代码执行助手</option>
                  <option value="桌面制片与客户运营助手">桌面制片与客户运营助手</option>
                  <option value="售后客服质检员">售后客服质检员</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-[#0e3a3d]">
                  第 3 步：把下面这段话发给它
                </span>
                <button
                  type="button"
                  onClick={() => copySnippet('prompt', handshakePrompt)}
                  className="h-9 px-3.5 rounded-md bg-[#0e3a3d] hover:bg-[#144c50] text-[13px] font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  {copiedKey === 'prompt' ? (
                    <Check className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <Copy className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                  )}
                  <span>{copiedKey === 'prompt' ? '已复制' : '复制这段话'}</span>
                </button>
              </div>

              <pre className="p-4 text-[13px] leading-6 text-[#0e3a3d] bg-[#f5f8f7] border border-[#c9d6d5] rounded-md whitespace-pre-wrap break-words font-sans">
                {handshakePrompt}
              </pre>
            </div>
          </div>
        )}

        {/* TAB 2: 我手动粘贴 (N-07, N-08) */}
        {activeTab === 'paste' && (
          <form onSubmit={handleWebPasteSend} className="space-y-4">
            <p className="text-[13px] leading-5 text-[#456669]">
              网页版的 AI 不会自己来汇报。你可以把它的回复粘到这里。
            </p>

            <textarea
              rows={6}
              aria-label="粘贴 AI 的回复"
              value={webMessage}
              onChange={(e) => setWebMessage(e.target.value)}
              placeholder="把 AI 给你的回复粘到这里…"
              className="w-full px-3 py-2.5 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="paste-tab-project"
                  className="block text-[13px] font-medium text-[#0e3a3d] mb-1"
                >
                  哪个项目
                </label>
                <select
                  id="paste-tab-project"
                  value={selectedProject?.id || ''}
                  onChange={(e) => setPromptProjectId(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
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
                  htmlFor="paste-tab-agent"
                  className="block text-[13px] font-medium text-[#0e3a3d] mb-1"
                >
                  哪个 AI
                </label>
                <select
                  id="paste-tab-agent"
                  value={webAgentName}
                  onChange={(e) => setWebAgentName(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
                >
                  <option value="DeepSeek Web">DeepSeek Web</option>
                  <option value="ChatGPT Web">ChatGPT Web</option>
                  <option value="豆包网页版">豆包网页版</option>
                </select>
              </div>
            </div>

            {pasteFeedback && (
              <div className="px-3.5 py-2.5 rounded-md bg-[#eaf6f3] text-[#0b7265] text-[13px]">
                {pasteFeedback}
              </div>
            )}

            <button
              type="submit"
              disabled={submittingPaste || !webMessage.trim()}
              className="h-10 px-5 rounded-md bg-[#0e3a3d] hover:bg-[#144c50] disabled:opacity-50 text-[15px] font-semibold text-white cursor-pointer"
            >
              {submittingPaste ? '正在看…' : '交给系统判断'}
            </button>
          </form>
        )}

        {/* TAB 3: 技术人员用 (includes Bookmarklet per N-09) */}
        {activeTab === 'tech' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-[#0e3a3d]">
                  浏览器书签一键采集（划选网页 AI 回复后点书签直接送来）
                </span>
                <button
                  type="button"
                  onClick={() => copySnippet('bookmarklet', bookmarkletCode)}
                  className="h-9 px-3 rounded-md border border-[#6f8c8b] bg-white text-xs font-medium text-[#0e3a3d] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedKey === 'bookmarklet' ? (
                    <Check className="w-3.5 h-3.5 text-[#0b7265]" strokeWidth={1.75} />
                  ) : (
                    <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
                  )}
                  <span>{copiedKey === 'bookmarklet' ? '已复制' : '复制书签脚本'}</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-[#0e3a3d]">
                  Claude Code 终端拦截配置
                </span>
                <button
                  type="button"
                  onClick={() => copySnippet('hook', hookConfigSnippet)}
                  className="h-9 px-3 rounded-md border border-[#6f8c8b] bg-white text-xs font-medium text-[#0e3a3d] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedKey === 'hook' ? (
                    <Check className="w-3.5 h-3.5 text-[#0b7265]" strokeWidth={1.75} />
                  ) : (
                    <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
                  )}
                  <span>{copiedKey === 'hook' ? '已复制' : '复制配置'}</span>
                </button>
              </div>
              <pre className="p-3 bg-[#f5f8f7] border border-[#c9d6d5] rounded-md text-xs font-mono text-[#456669] overflow-x-auto whitespace-pre-wrap break-all">
                {hookConfigSnippet}
              </pre>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-[#0e3a3d]">
                  桌面软件接口格式（WorkBuddy）
                </span>
                <button
                  type="button"
                  onClick={() => copySnippet('wb', workBuddyWebhookSnippet)}
                  className="h-9 px-3 rounded-md border border-[#6f8c8b] bg-white text-xs font-medium text-[#0e3a3d] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedKey === 'wb' ? (
                    <Check className="w-3.5 h-3.5 text-[#0b7265]" strokeWidth={1.75} />
                  ) : (
                    <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
                  )}
                  <span>{copiedKey === 'wb' ? '已复制' : '复制格式'}</span>
                </button>
              </div>
              <pre className="p-3 bg-[#f5f8f7] border border-[#c9d6d5] rounded-md text-xs font-mono text-[#456669] overflow-x-auto whitespace-pre-wrap break-all">
                {workBuddyWebhookSnippet}
              </pre>
            </div>
          </div>
        )}

        {/* Active connections (N-10..N-14) */}
        <div className="space-y-2.5 pt-4 border-t border-[#c9d6d5]">
          <div className="text-[13px] font-semibold text-[#456669]">已经接入的</div>
          <div className="divide-y divide-[#c9d6d5] border-t border-b border-[#c9d6d5]">
            {connections.map((conn) => {
              const statusText =
                conn.status === 'Connected'
                  ? '正常'
                  : conn.status === 'Degraded'
                    ? '不稳定'
                    : '停了';
              const statusColor =
                conn.status === 'Connected'
                  ? 'text-[#0b7265]'
                  : conn.status === 'Degraded'
                    ? 'text-[#8a5300]'
                    : 'text-[#456669]';
              const isOn = conn.status === 'Connected';
              return (
                <div
                  key={conn.id}
                  title={conn.hookMechanism}
                  className="py-3 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2.5 text-sm">
                      <span className="font-semibold text-[#0e3a3d]">{conn.name}</span>
                      <span className={`text-xs font-medium ${statusColor}`}>
                        {statusText}
                      </span>
                    </div>
                    <div className="text-[13px] text-[#456669] tabular-nums">
                      {formatRelativeTime(conn.lastSyncAt)}来过消息
                    </div>
                  </div>

                  <div className="inline-flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isOn}
                      aria-label={`开关 ${conn.name}`}
                      onClick={() =>
                        onToggleConnection(conn.id, isOn ? 'Paused' : 'Connected')
                      }
                      className={`w-10 h-6 rounded-full border p-0.5 flex items-center cursor-pointer fos-transition ${
                        isOn
                          ? 'bg-[#0e3a3d] border-[#0e3a3d] justify-end'
                          : 'bg-white border-[#6f8c8b] justify-start'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full ${
                          isOn ? 'bg-white' : 'bg-[#6f8c8b]'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
