import type { DecisionRecord, PolicyRule } from '../types/founderOs';

interface ReferenceSidebarProps {
  relatedDecisions: DecisionRecord[];
  relatedRules: PolicyRule[];
  onGoToRule?: () => void;
}

/**
 * 4.13 Optional Reference Column (>=1440px, 280px wide, flat, no cards).
 * Hidden completely when neither relatedDecisions nor relatedRules match (P-75).
 */
export function ReferenceSidebar({
  relatedDecisions,
  relatedRules,
  onGoToRule,
}: ReferenceSidebarProps) {
  if (relatedDecisions.length === 0 && relatedRules.length === 0) {
    return null;
  }

  return (
    <aside
      aria-label="相关参考"
      className="hidden min-[1440px]:block w-[280px] shrink-0 space-y-6 pt-1"
    >
      {relatedDecisions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[13px] leading-5 font-semibold text-[#456669]">
            你以前怎么定的
          </h2>
          <div className="divide-y divide-[#c9d6d5] border-t border-b border-[#c9d6d5]">
            {relatedDecisions.map((rec) => {
              const outcomeText = rec.outcomeCheck
                ? rec.outcomeCheck.verdict === 'win'
                  ? '管用'
                  : rec.outcomeCheck.verdict === 'miss'
                    ? '不管用'
                    : '说不好'
                : '还没回头看';
              return (
                <div key={rec.id} className="py-3 space-y-1">
                  <div className="text-[13px] leading-5 font-medium text-[#0e3a3d]">
                    {rec.caseTitle}
                  </div>
                  <div className="text-[13px] leading-5 text-[#456669]">
                    当时选：{rec.chosenOptionLabel}
                  </div>
                  <div
                    className={`text-xs ${
                      rec.outcomeCheck?.verdict === 'win'
                        ? 'text-[#0b7265]'
                        : rec.outcomeCheck?.verdict === 'miss'
                          ? 'text-[#c93a1f]'
                          : 'text-[#456669]'
                    }`}
                  >
                    后来：{outcomeText}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {relatedRules.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[13px] leading-5 font-semibold text-[#456669]">相关的规矩</h2>
            {onGoToRule && (
              <button
                type="button"
                onClick={onGoToRule}
                className="text-xs text-[#0b7265] hover:underline cursor-pointer"
              >
                去规矩页看
              </button>
            )}
          </div>
          <ul className="divide-y divide-[#c9d6d5] border-t border-b border-[#c9d6d5]">
            {relatedRules.map((rule) => (
              <li key={rule.id} className="py-2.5 text-[13px] leading-5 text-[#0e3a3d]">
                {rule.title}
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
