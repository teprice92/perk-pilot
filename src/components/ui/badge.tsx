import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-5 [&_svg]:size-3", {
  variants: {
    variant: {
      neutral: "bg-muted text-fg-muted",
      accent: "bg-accent-soft text-accent",
      gold: "bg-gold-soft text-[color:var(--gold)]",
      success: "bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-success",
      warning: "bg-[color-mix(in_oklab,var(--warning)_14%,transparent)] text-warning",
      danger: "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-danger",
      outline: "border border-border text-fg-muted",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export function Badge({ className, variant, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
