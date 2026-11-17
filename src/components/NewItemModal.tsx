import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Project } from '../types/founderOs';

interface NewItemModalProps {
  open: boolean;
  projects: Project[];
  defaultProjectId: string;
  onClose: () => void;
  onCreate: (payload: {
    projectId: string;
    title: string;
    anchorGoal: string;
    constraintsText?: string;
    sourceAgentName?: string;
    adapterType: 'claude_code_hook' | 'git_merge_gate';
  }) => Promise<void>;
}

/**
 * Section 7: 新建一件事 (N-23 to N-25).
 */
export function NewItemModal({
  open,
  projects,
  defaultProjectId,
  onClose,
  onCreate,
}: NewItemModalProps) {
  const [projectId, setProjectId] = useState(
    defaultProjectId !== 'all' ? defaultProjectId : projects[0]?.id || ''
  );
  const [title, setTitle] = useState('');
  const [constraintsText, setConstraintsText] = useState('');
  const [agentName, setAgentName] = useState('Claude Code');
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
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
      setErrorText(null);
      setTimeout(() => titleInputRef.current?.focus(), 0);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !projectId || submitting) return;
    setSubmitting(true);
    setErrorText(null);
    try {
      await onCreate({
        projectId,
        title: title.trim(),
        anchorGoal: title.trim(),
        constraintsText: constraintsText.trim() || undefined,
        sourceAgentName: agentName,
        adapterType: agentName === 'Claude Code' ? 'claude_code_hook' : 'git_merge_gate',
      });
      setTitle('');
      setConstraintsText('');
      onClose();
    } catch (err: unknown) {
      setErrorText((err as Error).message || '没建成功，再试一次。');
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
        aria-labelledby="new-item-title"
        className="fos-modal-shadow rounded-xl w-full max-w-[520px] p-6 space-y-5"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#c9d6d5] pb-3">
          <h2 id="new-item-title" className="text-base font-semibold text-[#0e3a3d]">
            新建一件事
          </h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="min-h-8 min-w-8 inline-flex items-center justify-center rounded-md text-[#456669] hover:text-[#0e3a3d] cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="new-item-project"
                className="block text-[13px] font-medium text-[#0e3a3d] mb-1"
              >
                哪个项目
              </label>
              <select
                id="new-item-project"
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
                htmlFor="new-item-agent"
                className="block text-[13px] font-medium text-[#0e3a3d] mb-1"
              >
                交给谁做
              </label>
              <select
                id="new-item-agent"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
              >
                <option value="Claude Code">Claude Code</option>
                <option value="WorkBuddy">WorkBuddy</option>
                <option value="DeepSeek Web">DeepSeek Web</option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="new-item-what"
              className="block text-[13px] font-medium text-[#0e3a3d] mb-1"
            >
              要 AI 做什么
            </label>
            <input
              ref={titleInputRef}
              id="new-item-what"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：把新来的 30 份车间维修记录转进离线库"
              className="w-full h-10 px-3 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
            />
          </div>

          <div>
            <label
              htmlFor="new-item-limit"
              className="block text-[13px] font-medium text-[#0e3a3d] mb-1"
            >
              不许它碰什么
            </label>
            <textarea
              id="new-item-limit"
              rows={3}
              value={constraintsText}
              onChange={(e) => setConstraintsText(e.target.value)}
              placeholder="例如：不许改老公差底表，也不许发给外部群"
              className="w-full px-3 py-2 text-sm bg-white border border-[#6f8c8b] rounded-md text-[#0e3a3d]"
            />
          </div>

          {errorText && (
            <p role="alert" className="text-[13px] text-[#c93a1f]">
              {errorText}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="h-10 px-5 rounded-md bg-[#0e3a3d] hover:bg-[#144c50] disabled:opacity-50 text-[15px] font-semibold text-white cursor-pointer"
            >
              {submitting ? '正在建…' : '建好'}
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
      </div>
    </div>
  );
}
