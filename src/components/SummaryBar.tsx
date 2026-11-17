interface SummaryBarProps {
  totalHandledToday: number;
  bouncedCount: number;
  onOpenDigest: () => void;
}

export function SummaryBar({
  totalHandledToday,
  bouncedCount,
  onOpenDigest,
}: SummaryBarProps) {
  return (
    <div className="min-h-[44px] shrink-0 bg-[#f5f8f7] border-b border-[#c9d6d5] px-4 sm:px-6 py-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] leading-[22px] text-[#0e3a3d]">
      {totalHandledToday === 0 ? (
        <span className="text-[#456669]">今天还没有需要处理的事。</span>
      ) : (
        <>
          <span>
            今天替你处理了{' '}
            <strong className="font-semibold tabular-nums">{totalHandledToday}</strong> 件，没打扰你。
          </span>
          {bouncedCount > 0 && (
            <span>
              其中 <strong className="font-semibold tabular-nums">{bouncedCount}</strong>{' '}
              件是 AI 说做完了、其实没过检查，已打回重做。
            </span>
          )}
          <button
            type="button"
            onClick={onOpenDigest}
            className="min-h-8 px-1 text-[14px] font-medium text-[#0b7265] hover:underline cursor-pointer"
          >
            看明细
          </button>
        </>
      )}
    </div>
  );
}
