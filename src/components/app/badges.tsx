import { BadgeCheck, CircleDashed, FlaskConical, ShieldAlert, Signal } from "lucide-react";
import type { Confidence } from "@/lib/calc/confidence";
import type { DataKind, VerificationStatus } from "@/lib/domain/types";
import { Badge } from "@/components/ui/badge";

export function VerificationBadge({ status, lastVerified }: { status: VerificationStatus; lastVerified?: string | null }) {
  if (status === "verified")
    return (
      <Badge variant="success" title={lastVerified ? `Verified ${lastVerified}` : "Verified"}>
        <BadgeCheck /> Verified{lastVerified ? ` ${lastVerified}` : ""}
      </Badge>
    );
  if (status === "demo")
    return (
      <Badge variant="warning">
        <FlaskConical /> Demo
      </Badge>
    );
  if (status === "estimated")
    return (
      <Badge variant="warning">
        <CircleDashed /> Estimated
      </Badge>
    );
  return (
    <Badge variant="outline" title="Not yet verified against the official source">
      <ShieldAlert /> Unverified
    </Badge>
  );
}

export function DataKindBadge({ kind }: { kind: DataKind }) {
  if (kind === "live") return <Badge variant="success"><Signal /> Live</Badge>;
  if (kind === "cached") return <Badge variant="accent"><Signal /> Cached</Badge>;
  return <Badge variant="warning"><FlaskConical /> Demo estimate</Badge>;
}

export function ConfidenceBadge({ confidence, showScore = true }: { confidence: Confidence; showScore?: boolean }) {
  const variant = confidence.level === "high" ? "success" : confidence.level === "medium" ? "accent" : "warning";
  return (
    <Badge variant={variant} title={confidence.reasons.join(" · ")}>
      <span className="inline-flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-2.5 w-1 rounded-full bg-current" style={{ opacity: i < (confidence.level === "high" ? 3 : confidence.level === "medium" ? 2 : 1) ? 1 : 0.25 }} />
        ))}
      </span>
      {confidence.level[0]!.toUpperCase() + confidence.level.slice(1)} confidence{showScore ? ` · ${confidence.score}` : ""}
    </Badge>
  );
}
