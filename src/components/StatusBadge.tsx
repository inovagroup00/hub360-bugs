import { STATUS_CONFIG, type BugStatus } from "@/types";

export function StatusBadge({ status }: { status: BugStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border ${config.bgColor} ${config.color}`}
    >
      {config.label}
    </span>
  );
}
