import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { AgentChannel, Project } from '../types/founderOs';

interface PasteReplyModalProps {
  open: boolean;
  projects: Project[];
  defaultProjectId: string;
  onClose: () => void;
  onSubmit: (payload: {
    agentName: string;
    agentChannel: AgentChannel;
    projectId: string;
    rawMessage: string;
    useAiTranslator?: boolean;
  }) => Promise<{
    triageStatus: 'needs_you' | 'handled_for_you';
    handledOutcome: string;
    plainSummary: string;
    createdCaseId?: string;
  }>;
  onSelectCreatedCase: (caseId: string) => void;
}

/**
 * Section 7: 粘贴 AI 的回复 (N-16 to N-22).
 */
export function PasteReplyModal({
  open,
  projects,
  defaultProjectId,
  onClose,
  onSubmit,
  onSelectCreatedCase,
}: PasteReplyModalProps) {
  const [rawMessage, setRawMessage] = useState('');
  const [projectId, setProjectId] = useState(
    defaultProjectId !== 'all' ? defaultProjectId : projects[0]?.id || ''
  );
  const [agentName, setAgentName] = useState('DeepSeek Web');
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [quietResult, setQuietResult] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (defaultProjectId !== 'all') {
      setProjectId(defaultProjectId);
    } else if (!projectId && projects[0]) {
      setProjectId(projects[0].id);
    }
  }, [defaultProjectId, projects]);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      setQuietResult(null);
      setErrorText(null);
      setTimeout(() => textareaRef.current?.focus(), 0);
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

  function resolveChannel(name: string): AgentChannel {
    if (name.includes('Claude')) return 'cli_hook';
    if (name.includes('WorkBuddy')) return 'desktop_app';
    return 'web_chat';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rawMessage.trim() || !projectId || submitting) return;

    setSubmitting(true);
    setErrorText(null);
    setQuietResult(null);
    try {
      const res = await onSubmit({
        agentName,
        agentChannel: resolveChannel(agentName),
        projectId,
        rawMessage: rawMessage.trim(),
        useAiTranslator: true,
      });

      setRawMessage('');
      if (res.triageStatus === 'needs_you') {
        if (res.createdCaseId) {
          onSelectCreatedCase(res.createdCaseId);
        }
        onClose();
      } else {
        setQuietResult(res.plainSummary || res.handledOutcome);
      }
    } catch (err: unknown) {
      setErrorText((err as Error).message || '没送过去，检查一下网络再试。');
    } finally {
      setSubmitting(false);
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
        aria-labelledby="paste-reply-title"
        className="fos-modal-shadow rounded-xl w-full max-w-[600px] p-6 space-y-5"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#c9d6d5] pb-3">
          <div>
            <h2 id="paste-reply-title" className="text-base font-semibold text-[#0e3a3d]">
              粘贴 AI 的回复
            </h2>
            <p className="text-[13px] text-[#456669] mt-1">
              系统会判断这件事需不需要你管。
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="min-h-8 min-w-8 inline-flex items-center justify-center rounded-md text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        {quietResult ? (
          <div className="space-y-4">
            <div className="p-4 rounded-md bg-[#eaf6f3] space-y-1.5">
              <div className="text-[15px] font-semibold text-[#0b7265]">
                这件不用你管，已替你处理。
              </div>
              <p className="text-[13px] text-[#0e3a3d]">{quietResult}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setQuietResult(null);
                  setTimeout(() => textareaRef.current?.focus(), 0);
                }}
                className="h-10 px-5 rounded-md bg-[#0e3a3d] text-[15px] font-semibold text-white cursor-pointer"
              >
                再粘一条
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-md border border-[#6f8c8b] bg-white text-[13px] font-medium text-[#0e3a3d] cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="paste-reply-content"
                className="block text-[13px] font-medium text-[#0e3a3d] mb-1.5"
              >
                AI 回复的内容
              </label>
              <textarea
                ref={textareaRef}
                id="paste-reply-content"
                rows={8}
                value={rawMessage}
                onChange={(e) => setRawMessage(e.target.value)}
                placeholder="把 DeepSeek、WorkBuddy 或 Claude Code 给你的话直接粘在这里…"
                className="w-full px-3 py-2.5 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="paste-reply-project"
                  className="block text-[13px] font-medium text-[#0e3a3d] mb-1"
                >
                  哪个项目
                </label>
                <select
                  id="paste-reply-project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
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
                  htmlFor="paste-reply-source"
                  className="block text-[13px] font-medium text-[#0e3a3d] mb-1"
                >
                  哪个 AI
                </label>
                <select
                  id="paste-reply-source"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
                >
                  <option value="DeepSeek Web">DeepSeek Web</option>
                  <option value="WorkBuddy">WorkBuddy</option>
                  <option value="Claude Code">Claude Code</option>
                  <option value="ChatGPT Web">ChatGPT Web</option>
                </select>
              </div>
            </div>

            {errorText && (
              <p role="alert" className="text-[13px] text-[#c93a1f]">
                {errorText}
              </p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={submitting || !rawMessage.trim()}
                className="h-10 px-5 rounded-md bg-[#0e3a3d] hover:bg-[#144c50] disabled:opacity-50 text-[15px] font-semibold text-white cursor-pointer"
              >
                {submitting ? '正在判断…' : '交给系统判断'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-3 text-[13px] text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
              >
                取消
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
