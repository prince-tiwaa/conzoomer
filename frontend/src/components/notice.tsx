import { AlertTriangle, Info, CheckCircle2, XCircle } from "lucide-react";

const tones = {
  info: { cls: "border-cobalt/20 bg-cobalt-wash text-cobalt-deep", Icon: Info },
  warn: { cls: "border-warn/25 bg-warn-wash text-warn", Icon: AlertTriangle },
  error: { cls: "border-danger/25 bg-danger-wash text-danger", Icon: XCircle },
  success: { cls: "border-success/25 bg-success-wash text-success", Icon: CheckCircle2 },
};

export function Notice({
  tone = "info",
  title,
  children,
  role,
  className = "",
  id,
}: {
  tone?: keyof typeof tones;
  title?: React.ReactNode;
  children?: React.ReactNode;
  role?: "alert" | "status";
  className?: string;
  id?: string;
}) {
  const { cls, Icon } = tones[tone];
  return (
    <div id={id} role={role} tabIndex={role === "alert" ? -1 : undefined} className={`flex gap-3 rounded-2xl border px-4 py-3.5 ${cls} ${className}`}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-1" : ""}>{children}</div>}
      </div>
    </div>
  );
}
