import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  PauseCircle,
  RefreshCw,
} from 'lucide-react';
import type { ThreadStatus } from '../types/founderOs';

interface StatusLabelProps {
  status: ThreadStatus;
  reason?: string;
}

export function StatusLabel({ status, reason }: StatusLabelProps) {
  switch (status) {
    case 'Needs You':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#c93a1f] whitespace-nowrap shrink-0">
          <span className="w-2 h-2 rounded-full bg-[#ff5a3c] shrink-0" aria-hidden="true" />
          <span>等你拍板</span>
        </span>
      );
    case 'Auto-Fixing':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#8a5300] whitespace-nowrap shrink-0">
          <RefreshCw className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>打回重做中</span>
        </span>
      );
    case 'Blocked':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#8a5300] whitespace-nowrap shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>{reason ? `卡住了，不是你的事（${reason}）` : '卡住了，不是你的事'}</span>
        </span>
      );
    case 'Running':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0b7265] whitespace-nowrap shrink-0">
          <Clock className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>正在做</span>
        </span>
      );
    case 'Quiet':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0b7265] whitespace-nowrap shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>检查通过</span>
        </span>
      );
  }
}

export function getThreadPlainStatusText(status: ThreadStatus): string {
  switch (status) {
    case 'Needs You':
      return '等你拍板';
    case 'Auto-Fixing':
      return '打回重做中';
    case 'Blocked':
      return '卡住了，不是你的事';
    case 'Running':
      return '正在做';
    case 'Quiet':
    default:
      return '检查通过';
  }
}

export function VerificationTierText({
  tier,
}: {
  tier: 'tier_full' | 'tier_build_only' | 'tier_diff_only';
}) {
  if (tier === 'tier_full') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#0b7265] whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span>系统实测过</span>
      </span>
    );
  }
  if (tier === 'tier_build_only') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#8a5300] whitespace-nowrap shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span>只做了基础检查</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[#456669] whitespace-nowrap shrink-0">
      <PauseCircle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span>只看了内容，没实测</span>
    </span>
  );
}
