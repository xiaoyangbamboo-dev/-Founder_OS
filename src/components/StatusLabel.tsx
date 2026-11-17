import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  PauseCircle,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import type { ThreadStatus } from '../types/founderOs';

interface StatusLabelProps {
  status: ThreadStatus;
}

export function StatusLabel({ status }: StatusLabelProps) {
  switch (status) {
    case 'Needs You':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap shrink-0">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>等你拍板</span>
        </span>
      );
    case 'Auto-Fixing':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap shrink-0">
          <RefreshCw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>系统已打回重修</span>
        </span>
      );
    case 'Blocked':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 whitespace-nowrap shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>环境未就绪</span>
        </span>
      );
    case 'Running':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 whitespace-nowrap shrink-0">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>后台进行中</span>
        </span>
      );
    case 'Quiet':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>已自动过关</span>
        </span>
      );
  }
}

export function VerificationTierText({
  tier,
}: {
  tier: 'tier_full' | 'tier_build_only' | 'tier_diff_only';
}) {
  if (tier === 'tier_full') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
        <span>完整自动检查</span>
      </span>
    );
  }
  if (tier === 'tier_build_only') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-700 whitespace-nowrap shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>无自动测试·仅检查打包</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap shrink-0">
      <PauseCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>仅内容抽检</span>
    </span>
  );
}
