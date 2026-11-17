import {
  AlertTriangle,
  ArrowRight,
  Check,
  Code2,
  Dumbbell,
  Factory,
  Film,
  Headphones,
  Lock,
  ShieldCheck,
  Target,
  Undo2,
} from 'lucide-react';
import type { Project, ProjectStageNode } from '../types/founderOs';

export function ProjectDomainIcon({
  domainIcon,
  accentColor,
  size = 'md',
}: {
  domainIcon?: Project['domainIcon'];
  accentColor?: Project['accentColor'];
  size?: 'sm' | 'md';
}) {
  const toneClass =
    accentColor === 'blue'
      ? 'bg-[#e6f4f3] text-[#0e3a3d] border-[#cde3e2]'
      : accentColor === 'emerald'
        ? 'bg-[#e4f6f1] text-[#0f9d8a] border-[#c4ebe1]'
        : accentColor === 'amber'
          ? 'bg-[#fff2ee] text-[#ff5a3c] border-[#ffd8cf]'
          : 'bg-white/80 text-[#5d8284] border-[#d3e8e7]';

  const boxSize = size === 'sm' ? 'w-6 h-6 rounded-lg' : 'w-8 h-8 rounded-xl';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  const IconComponent =
    domainIcon === 'factory'
      ? Factory
      : domainIcon === 'fitness'
        ? Dumbbell
        : domainIcon === 'comic'
          ? Film
          : domainIcon === 'support'
            ? Headphones
            : Code2;

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center shrink-0 border ${boxSize} ${toneClass}`}
    >
      <IconComponent className={iconSize} />
    </span>
  );
}

/**
 * Compact Stage Pulse Tracker for the Right Rail top slot
 * Encodes where the currently inspected decision sits along the project's lifecycle
 * without scatter-plot clutter or overlapping labels.
 */
export function CompactStageTracker({
  projectName,
  stages,
  currentStageLabel,
  currentTaskNodeLabel,
  quadrantLabel,
  isUrgent,
}: {
  projectName?: string;
  stages?: ProjectStageNode[];
  currentStageLabel?: string;
  currentTaskNodeLabel?: string;
  quadrantLabel: string;
  isUrgent: boolean;
}) {
  return (
    <div
      aria-label="当前卡点阶段进度"
      className="aqua-glass-card rounded-2xl p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-[#0e3a3d] truncate">
          {projectName || '当前项目进度'}
        </span>
        <span
          className={`font-medium shrink-0 ${
            isUrgent ? 'text-[#ff5a3c]' : 'text-[#0f9d8a]'
          }`}
        >
          {quadrantLabel}
        </span>
      </div>

      {stages && stages.length > 0 && (
        <div className="space-y-2">
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
            {stages.map((st) => {
              const isMatch = currentStageLabel && st.label === currentStageLabel;
              const isBlocked = st.status === 'blocked' || isMatch;
              const isDone = st.status === 'done' && !isMatch;
              const isActive = st.status === 'active' && !isMatch;

              const barTone = isBlocked
                ? 'bg-[#ff5a3c]'
                : isDone
                  ? 'bg-[#0f9d8a]'
                  : isActive
                    ? 'bg-[#0e3a3d]'
                    : 'bg-[#d3e8e7]';

              return (
                <div key={st.id} className="space-y-1">
                  <div className={`h-1.5 w-full rounded-full ${barTone}`} />
                  <div
                    className={`text-[11px] truncate ${
                      isBlocked
                        ? 'font-semibold text-[#ff5a3c]'
                        : isDone
                          ? 'text-[#0f9d8a]'
                          : 'text-[#5d8284]'
                    }`}
                    title={`${st.label}：${st.taskName}`}
                  >
                    {st.label.replace(/^\d+\.\s*/, '')}
                  </div>
                </div>
              );
            })}
          </div>

          {(currentStageLabel || currentTaskNodeLabel) && (
            <div className="text-xs text-[#5d8284] truncate pt-1 border-t border-[#d3e8e7]/70">
              当前卡点：<span className="text-[#0e3a3d] font-medium">{currentTaskNodeLabel || currentStageLabel}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Expanded Project Stage & Task Node Pipeline
 * Revealed cleanly on demand when the founder clicks "有疑虑 · 展开详情与节点图"
 */
export function ProjectStagePipeline({
  projectName,
  stages,
  currentStageLabel,
  currentTaskNodeLabel,
}: {
  projectName?: string;
  stages?: ProjectStageNode[];
  currentStageLabel?: string;
  currentTaskNodeLabel?: string;
}) {
  if (!stages || stages.length === 0) return null;

  return (
    <div
      aria-label="项目当前进度与卡点节点图"
      className="bg-[#f4fbfa] border border-[#d3e8e7] rounded-xl p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-[#0e3a3d]">
          {projectName ? `「${projectName}」阶段流水线与卡点位置` : '当前项目阶段与任务节点'}
        </span>
        {(currentStageLabel || currentTaskNodeLabel) && (
          <span className="text-[#ff5a3c] font-medium">
            卡在：{currentStageLabel || '当前阶段'}
            {currentTaskNodeLabel ? ` · ${currentTaskNodeLabel}` : ''}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {stages.map((st) => {
          const isMatch = currentStageLabel && st.label === currentStageLabel;
          const isBlocked = st.status === 'blocked' || isMatch;
          const isDone = st.status === 'done' && !isMatch;
          const isActive = st.status === 'active' && !isMatch;

          return (
            <div
              key={st.id}
              className={`rounded-lg border p-2.5 space-y-1 ${
                isBlocked
                  ? 'bg-[#fff4f2] border-[#ffc6bc]'
                  : isDone
                    ? 'bg-[#effaf8] border-[#bce6df]'
                    : isActive
                      ? 'bg-white border-[#9dbcbc]'
                      : 'bg-white/75 border-[#d3e8e7]'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5 text-xs font-semibold">
                <span
                  className={
                    isBlocked
                      ? 'text-[#ff5a3c]'
                      : isDone
                        ? 'text-[#0f9d8a]'
                        : isActive
                          ? 'text-[#0e3a3d]'
                          : 'text-[#5d8284]'
                  }
                >
                  {st.label}
                </span>
                {isDone && <Check className="w-3.5 h-3.5 text-[#0f9d8a] shrink-0" aria-hidden="true" />}
                {isBlocked && (
                  <AlertTriangle className="w-3.5 h-3.5 text-[#ff5a3c] shrink-0" aria-hidden="true" />
                )}
              </div>
              <div className="text-[11px] text-[#5d8284] leading-snug">{st.taskName}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Pre-Attentive Risk & Reversibility Gauge (No pill boxes, clean typography)
 */
export function RiskSeverityBars({
  priorityScore,
  isIrreversible,
}: {
  priorityScore: number;
  isIrreversible: boolean;
}) {
  const level = priorityScore >= 90 ? 3 : priorityScore >= 75 ? 2 : 1;
  const barColor =
    level === 3 ? 'bg-[#ff5a3c]' : level === 2 ? 'bg-[#0e3a3d]' : 'bg-[#5d8284]';
  const label = level === 3 ? '高危紧急' : level === 2 ? '重要冲突' : '常规确认';

  return (
    <div className="inline-flex items-center gap-2 shrink-0 text-xs">
      <span className="inline-flex items-end gap-0.5 h-3" aria-hidden="true">
        <span className={`w-1 h-1.5 rounded-xs ${level >= 1 ? barColor : 'bg-[#d3e8e7]'}`} />
        <span className={`w-1 h-2.5 rounded-xs ${level >= 2 ? barColor : 'bg-[#d3e8e7]'}`} />
        <span className={`w-1 h-3 rounded-xs ${level >= 3 ? barColor : 'bg-[#d3e8e7]'}`} />
      </span>
      <span className={level === 3 ? 'font-semibold text-[#ff5a3c]' : 'font-medium text-[#0e3a3d]'}>
        {label}
      </span>
      <span className="text-[#9dbcbc]" aria-hidden="true">
        ·
      </span>
      <span className="inline-flex items-center gap-1 text-[#5d8284]">
        {isIrreversible ? (
          <>
            <Lock className="w-3 h-3 text-[#ff5a3c]" aria-hidden="true" />
            <span className="text-[#ff5a3c]">不可逆风险</span>
          </>
        ) : (
          <>
            <Undo2 className="w-3 h-3 text-[#0f9d8a]" aria-hidden="true" />
            <span>可撤回</span>
          </>
        )}
      </span>
    </div>
  );
}

/**
 * 3-Node Horizontal Cause-Effect Visual Flow Diagram (Shown on-demand inside Detail Expansion)
 */
export function CauseEffectFlowDiagram({
  goalText,
  agentActionText,
  gateBlockText,
  agentName,
}: {
  goalText: string;
  agentActionText: string;
  gateBlockText: string;
  agentName: string;
}) {
  return (
    <div
      aria-label="事件因果流程图"
      className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-2.5 bg-[#f4fbfa] border border-[#d3e8e7] rounded-xl p-3.5"
    >
      <div className="bg-white/90 border border-[#d3e8e7] rounded-lg p-3 flex flex-col justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#0e3a3d]">
          <Target className="w-3.5 h-3.5 text-[#0f9d8a] shrink-0" aria-hidden="true" />
          <span>1. 你原本让它干嘛</span>
        </div>
        <p className="text-xs text-[#5d8284] leading-relaxed">{goalText}</p>
      </div>

      <div className="hidden md:flex items-center justify-center text-[#9dbcbc]">
        <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </div>

      <div className="bg-white/90 border border-[#d3e8e7] rounded-lg p-3 flex flex-col justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#0e3a3d]">
          <AlertTriangle className="w-3.5 h-3.5 text-[#ff5a3c] shrink-0" aria-hidden="true" />
          <span>2. {agentName} 实际动作</span>
        </div>
        <p className="text-xs text-[#0e3a3d] leading-relaxed">{agentActionText}</p>
      </div>

      <div className="hidden md:flex items-center justify-center text-[#9dbcbc]">
        <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </div>

      <div className="bg-[#fff6f4] border border-[#ffc6bc] rounded-lg p-3 flex flex-col justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#ff5a3c]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#ff5a3c] shrink-0" aria-hidden="true" />
          <span>3. 系统门禁卡在哪里</span>
        </div>
        <p className="text-xs text-[#0e3a3d] leading-relaxed">{gateBlockText}</p>
      </div>
    </div>
  );
}
