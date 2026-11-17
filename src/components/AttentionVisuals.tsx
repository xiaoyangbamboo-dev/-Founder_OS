import {
  AlertTriangle,
  Check,
  Code2,
  Dumbbell,
  Factory,
  Film,
  Headphones,
} from 'lucide-react';
import type { Project, ProjectStageNode } from '../types/founderOs';

export function ProjectDomainIcon({
  domainIcon,
  accentColor,
}: {
  domainIcon?: Project['domainIcon'];
  accentColor?: Project['accentColor'];
}) {
  const toneClass =
    accentColor === 'emerald'
      ? 'bg-[#eaf6f3] text-[#0b7265] border-[#c9d6d5]'
      : accentColor === 'amber'
        ? 'bg-[#fff6e0] text-[#8a5300] border-[#c9d6d5]'
        : 'bg-[#f5f8f7] text-[#0e3a3d] border-[#c9d6d5]';

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
      className={`inline-flex items-center justify-center shrink-0 w-5 h-5 rounded border ${toneClass}`}
    >
      <IconComponent className="w-3.5 h-3.5" strokeWidth={1.75} />
    </span>
  );
}

/**
 * Source row stage dots (P-07):
 * - Done: solid teal dot
 * - Current / blocked: hollow coral ring
 * - Upcoming: muted divider dot
 * Hover title shows all stage names in plain order.
 */
export function ProjectStageDots({
  stages,
  currentStageLabel,
}: {
  stages?: ProjectStageNode[];
  currentStageLabel?: string;
}) {
  if (!stages || stages.length === 0) return null;

  const currentIdx = stages.findIndex(
    (s) => s.label === currentStageLabel || s.status === 'blocked'
  );
  const resolvedIdx =
    currentIdx !== -1 ? currentIdx : stages.findIndex((s) => s.status === 'active');
  const displayIdx = resolvedIdx !== -1 ? resolvedIdx : 0;
  const activeStage = stages[displayIdx];
  const tooltip = stages.map((s) => s.label).join(' → ');

  return (
    <span className="inline-flex items-center gap-2 shrink-0" title={tooltip}>
      <span className="inline-flex items-center gap-1" aria-hidden="true">
        {stages.map((st, idx) => {
          const isCurrent = idx === displayIdx || st.status === 'blocked';
          const isDone = !isCurrent && (st.status === 'done' || idx < displayIdx);

          if (isDone) {
            return <span key={st.id} className="w-2 h-2 rounded-full bg-[#0b7265]" />;
          }
          if (isCurrent) {
            return (
              <span
                key={st.id}
                className="w-2.5 h-2.5 rounded-full border-2 border-[#ff5a3c] bg-white"
              />
            );
          }
          return <span key={st.id} className="w-2 h-2 rounded-full bg-[#c9d6d5]" />;
        })}
      </span>
      {activeStage && (
        <span className="text-[13px] leading-5 text-[#456669]">
          第 {displayIdx + 1} 步：{activeStage.label.replace(/^\d+\.\s*/, '')}
        </span>
      )}
    </span>
  );
}

/**
 * Full Stage Pipeline inside "看依据" -> "过程" (P-62).
 */
export function ProjectStagePipeline({
  projectName,
  stages,
  currentStageLabel,
}: {
  projectName?: string;
  stages?: ProjectStageNode[];
  currentStageLabel?: string;
}) {
  if (!stages || stages.length === 0) return null;

  return (
    <div
      aria-label="项目阶段进度"
      className="bg-[#f5f8f7] border border-[#c9d6d5] rounded-md p-4 space-y-3"
    >
      <div className="text-[13px] font-semibold text-[#0e3a3d]">
        {projectName ? `「${projectName}」走到哪一步了` : '项目进度'}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {stages.map((st) => {
          const isMatch = currentStageLabel && st.label === currentStageLabel;
          const isBlocked = st.status === 'blocked' || isMatch;
          const isDone = st.status === 'done' && !isMatch;

          return (
            <div
              key={st.id}
              className={`rounded-md border p-3 space-y-1 ${
                isBlocked
                  ? 'bg-[#fdf1ee] border-[#c93a1f]'
                  : isDone
                    ? 'bg-[#eaf6f3] border-[#c9d6d5]'
                    : 'bg-white border-[#c9d6d5]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                <span
                  className={
                    isBlocked
                      ? 'text-[#c93a1f]'
                      : isDone
                        ? 'text-[#0b7265]'
                        : 'text-[#0e3a3d]'
                  }
                >
                  {st.label}
                </span>
                {isDone && <Check className="w-3.5 h-3.5 text-[#0b7265] shrink-0" strokeWidth={1.75} aria-hidden="true" />}
                {isBlocked && (
                  <AlertTriangle className="w-3.5 h-3.5 text-[#c93a1f] shrink-0" strokeWidth={1.75} aria-hidden="true" />
                )}
              </div>
              <div className="text-xs text-[#456669] leading-[18px]">{st.taskName}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
