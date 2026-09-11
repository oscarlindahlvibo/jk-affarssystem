import { AlertTriangle, AlertOctagon, Info } from "lucide-react";
import type { TransportRule } from "../../lib/transportRules";

const SEVERITY_STYLES: Record<TransportRule["severity"], string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-slate-200 bg-slate-50 text-slate-600",
};

const SEVERITY_ICON: Record<TransportRule["severity"], React.ComponentType<{ size?: number; className?: string }>> = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  info: Info,
};

export function TransportRuleList({ rules, compact = false }: { rules: TransportRule[]; compact?: boolean }) {
  if (rules.length === 0) return null;

  return (
    <div className="space-y-2">
      {rules.map((rule) => {
        const Icon = SEVERITY_ICON[rule.severity];
        return (
          <div key={rule.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${SEVERITY_STYLES[rule.severity]}`}>
            <Icon size={14} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">{rule.label}</div>
              {!compact && <div className="mt-0.5 opacity-90">{rule.detail}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
