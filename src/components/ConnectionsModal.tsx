import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Globe,
  RefreshCw,
  Send,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import type {
  AdapterConnection,
  AgentChannel,
  PolicyRule,
  Project,
} from '../types/founderOs';
import { generateAgentHandshakePrompt } from '../core/ingest';

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

type OnboardingTab = 'pachat_prompt' | 'web' | 'advanced';

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
  const [activeTab, setActiveTab] = useState<OnboardingTab>('pachat_prompt');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [pingOutput, setPingOutput] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);

  // Pachat-style 1-paragraph prompt state
  const [promptProjectId, setPromptProjectId] = useState(
    defaultProjectId && defaultProjectId !== 'all' ? defaultProjectId : projects[0]?.id || ''
  );
  const [promptRole, setPromptRole] = useState('方案顾问与风险把关');
  const [testPushing, setTestPushing] = useState(false);
  const [testPushResult, setTestPushResult] = useState<string | null>(null);

  // Web chat paste state
  const [webAgentName, setWebAgentName] = useState('DeepSeek Web');
  const [webMessage, setWebMessage] = useState('');

  useEffect(() => {
    if (defaultProjectId && defaultProjectId !== 'all') {
      setPromptProjectId(defaultProjectId);
    } else if (!promptProjectId && projects[0]) {
      setPromptProjectId(projects[0].id);
    }
  }, [defaultProjectId, projects]);

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

  const bookmarkletCode = `javascript:(()=>{const t=window.getSelection()?.toString()||'';if(!t){alert('请先在网页上划选一段 AI 回答');return;}fetch('${origin}/api/ingest/agent-message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agentName:'DeepSeek Web',agentChannel:'web_chat',projectId:'${selectedProject?.id || 'proj-cnc'}',rawMessage:t})}).then(()=>alert('已送入 Founder OS 分拣')).catch(()=>alert('发送失败，请使用驾驶舱粘贴框'));})();`;

  function copySnippet(key: string, text: string) {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  }

  async function testActiveRulesEndpoint() {
    setPinging(true);
    setPingOutput(null);
    try {
      const res = await fetch(`/api/hooks/active-rules?projectId=${selectedProject?.id || 'global'}`);
      const data = await res.json();
      setPingOutput(`HTTP ${res.status} · 已下发 ${data.rules?.length ?? 0} 条活跃规则（${selectedProject?.name}）`);
    } catch {
      setPingOutput('探测失败：无法连接到规则接口');
    } finally {
      setPinging(false);
    }
  }

  async function handleSimulateFirstReport() {
    if (!selectedProject) return;
    setTestPushing(true);
    setTestPushResult(null);
    try {
      const res = await onIngestAgentMessage({
        agentName: '我的外部 AI（模拟接入）',
        agentChannel: 'desktop_app',
        projectId: selectedProject.id,
        rawMessage: `已收到「${selectedProject.name}」的红线指令。现准备导出全部客户历史记录并准备对外发送报价。`,
        useAiTranslator: false,
      });
      setTestPushResult(`模拟首次回传成功 → ${res.handledOutcome}（可关闭弹窗在工作台查看）`);
    } catch (err: unknown) {
      setTestPushResult(`模拟失败：${(err as Error).message}`);
    } finally {
      setTestPushing(false);
    }
  }

  async function handleWebPasteSend(e: React.FormEvent) {
    e.preventDefault();
    if (!webMessage.trim() || !selectedProject) return;
    setTestPushing(true);
    setTestPushResult(null);
    try {
      const res = await onIngestAgentMessage({
        agentName: webAgentName,
        agentChannel: 'web_chat',
        projectId: selectedProject.id,
        rawMessage: webMessage.trim(),
        useAiTranslator: false,
      });
      setTestPushResult(`已送入分拣 → ${res.handledOutcome}`);
      setWebMessage('');
    } catch (err: unknown) {
      setTestPushResult(`投递失败：${(err as Error).message}`);
    } finally {
      setTestPushing(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="connections-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
          <div>
            <h2 id="connections-dialog-title" className="text-base font-semibold text-slate-900">
              1 句话接入任何 AI 工具（无需懂代码，像 Pachat 一样复制发给它就行）
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              不管你用的是 DeepSeek、ChatGPT、WorkBuddy 还是 Claude Code，把下面生成的指令发给它就能按你的规矩汇报
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭接入设置"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3-Tier Integration Selector */}
        <div
          role="tablist"
          aria-label="接入方式"
          className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 p-1 bg-slate-100 border border-slate-200/80 rounded-xl"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'pachat_prompt'}
            onClick={() => {
              setActiveTab('pachat_prompt');
              setTestPushResult(null);
            }}
            className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
              activeTab === 'pachat_prompt'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>1. 复制一句话发给 AI（最简单）</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'web'}
            onClick={() => {
              setActiveTab('web');
              setTestPushResult(null);
            }}
            className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
              activeTab === 'web'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Globe className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>2. 网页 AI 采集（DeepSeek）</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'advanced'}
            onClick={() => {
              setActiveTab('advanced');
              setTestPushResult(null);
            }}
            className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
              activeTab === 'advanced'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>3. 程序员高阶自动门禁</span>
          </button>
        </div>

        {/* TAB 1: Pachat-style 1-Prompt Copy Onboarding (Default & Recommended for Non-Coders) */}
        {activeTab === 'pachat_prompt' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="onboard-project" className="block text-xs font-medium text-slate-700 mb-1">
                  第 1 步：选这个 AI 负责哪个项目
                </label>
                <select
                  id="onboard-project"
                  value={selectedProject?.id || ''}
                  onChange={(e) => setPromptProjectId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="onboard-role" className="block text-xs font-medium text-slate-700 mb-1">
                  第 2 步：给它分工（它听你的）
                </label>
                <select
                  id="onboard-role"
                  value={promptRole}
                  onChange={(e) => setPromptRole(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
                >
                  <option value="方案顾问与风险把关">方案顾问与风险把关</option>
                  <option value="数据库与代码执行助手">数据库与代码执行助手</option>
                  <option value="桌面制片/客户运营助手">桌面制片/客户运营助手</option>
                  <option value="售后客服质检员">售后客服质检员</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700">
                  第 3 步：点击复制下面这段话，直接粘贴发给你的 Claude Code / WorkBuddy / DeepSeek：
                </span>
                <button
                  type="button"
                  onClick={() => copySnippet('pachat_prompt', handshakePrompt)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0"
                >
                  {copiedKey === 'pachat_prompt' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>{copiedKey === 'pachat_prompt' ? '已复制指令！去粘贴给 AI' : '复制这段指令发给 AI'}</span>
                </button>
              </div>

              <pre className="p-4 text-xs leading-relaxed text-slate-800 bg-slate-50 border border-slate-200 rounded-xl whitespace-pre-wrap break-words font-sans">
                {handshakePrompt}
              </pre>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <span className="text-xs text-slate-500">
                想立刻看看接入后的效果？点右边按钮模拟你的 AI 收到这段话后的首次汇报：
              </span>
              <button
                type="button"
                disabled={testPushing}
                onClick={handleSimulateFirstReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{testPushing ? '发送中...' : '模拟该 AI 首次汇报测试'}</span>
              </button>
            </div>

            {testPushResult && (
              <div className="px-3.5 py-2.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
                {testPushResult}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Web Chat AI (DeepSeek Web / ChatGPT) */}
        {activeTab === 'web' && (
          <div className="space-y-4">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 leading-relaxed">
              因为浏览器本身保护你的隐私安全，网页版 AI（如 DeepSeek 网页）不会在后台偷偷发请求。除了用 Tab 1 的汇报指令外，你还可以直接在这里把它的方案粘进来，或者用收藏夹书签 1 键抓取。
            </div>

            <div className="p-3.5 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">
                  浏览器书签一键采集器（在 DeepSeek 网页划选一段话后点书签直接送过来）
                </span>
                <button
                  type="button"
                  onClick={() => copySnippet('bookmarklet', bookmarkletCode)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg whitespace-nowrap shrink-0"
                >
                  {copiedKey === 'bookmarklet' ? (
                    <Check className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Copy className="w-3 h-3" aria-hidden="true" />
                  )}
                  <span>{copiedKey === 'bookmarklet' ? '已复制脚本' : '复制书签脚本'}</span>
                </button>
              </div>
              <p className="text-xs text-slate-500">
                在浏览器新建一个书签，把这段内容粘到“网址/URL”里即可。
              </p>
            </div>

            <form onSubmit={handleWebPasteSend} className="p-3.5 border border-slate-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="modal-web-paste" className="text-xs font-semibold text-slate-900">
                  直接粘贴网页 AI 刚给出的建议：
                </label>
                <select
                  value={webAgentName}
                  onChange={(e) => setWebAgentName(e.target.value)}
                  className="px-2 py-1 text-xs border border-slate-200 rounded-lg text-slate-700"
                >
                  <option value="DeepSeek Web">DeepSeek Web</option>
                  <option value="ChatGPT Web">ChatGPT Web</option>
                  <option value="豆包网页版">豆包网页版</option>
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  id="modal-web-paste"
                  value={webMessage}
                  onChange={(e) => setWebMessage(e.target.value)}
                  placeholder="粘贴 DeepSeek / ChatGPT 给你的方案或建议..."
                  className="flex-1 min-w-0 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
                />
                <button
                  type="submit"
                  disabled={testPushing || !webMessage.trim()}
                  className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0"
                >
                  送入分拣
                </button>
              </div>
            </form>

            {testPushResult && (
              <div className="px-3.5 py-2.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
                {testPushResult}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Advanced Engineering Hooks & Webhooks */}
        {activeTab === 'advanced' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-600">
                如果你有技术人员或自己用终端工具，可配以下硬拦截钩子（文件修改前自动阻断）：
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={testActiveRulesEndpoint}
                  disabled={pinging}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3 h-3 ${pinging ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>探测规则接口</span>
                </button>
                <button
                  type="button"
                  onClick={() => copySnippet('hook', hookConfigSnippet)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg whitespace-nowrap shrink-0"
                >
                  {copiedKey === 'hook' ? (
                    <Check className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Copy className="w-3 h-3" aria-hidden="true" />
                  )}
                  <span>{copiedKey === 'hook' ? '已复制' : '复制 Hook 配置'}</span>
                </button>
              </div>
            </div>

            {pingOutput && (
              <div className="px-3 py-2 text-xs font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
                {pingOutput}
              </div>
            )}

            <pre className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 overflow-x-auto whitespace-pre-wrap break-all">
              {hookConfigSnippet}
            </pre>

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs font-medium text-slate-700">
                桌面软件 Webhook 接口格式（WorkBuddy / OpenClaw）：
              </span>
              <button
                type="button"
                onClick={() => copySnippet('wb', workBuddyWebhookSnippet)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg whitespace-nowrap shrink-0"
              >
                {copiedKey === 'wb' ? (
                  <Check className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                ) : (
                  <Copy className="w-3 h-3" aria-hidden="true" />
                )}
                <span>{copiedKey === 'wb' ? '已复制' : '复制 Webhook'}</span>
              </button>
            </div>
            <pre className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 overflow-x-auto whitespace-pre-wrap break-all">
              {workBuddyWebhookSnippet}
            </pre>
          </div>
        )}

        {/* Active Adapters Status */}
        <div className="space-y-2.5 pt-3 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-700">已开启的接入通道</div>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {connections.map((conn) => (
              <div key={conn.id} className="p-3.5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-900">{conn.name}</span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span
                      className={
                        conn.status === 'Connected'
                          ? 'text-emerald-700 font-medium'
                          : 'text-slate-500'
                      }
                    >
                      {conn.status === 'Connected' ? '已启用' : '已暂停'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">{conn.hookMechanism}</div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onToggleConnection(
                      conn.id,
                      conn.status === 'Connected' ? 'Paused' : 'Connected'
                    )
                  }
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg whitespace-nowrap shrink-0"
                >
                  {conn.status === 'Connected' ? '暂停' : '启用'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
