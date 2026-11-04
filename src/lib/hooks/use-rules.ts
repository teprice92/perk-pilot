"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useMemo, useState } from "react";
import type { RulesDataset } from "@/lib/domain/types";
import { RulesRepository } from "@/lib/rules/repository";
import { SEED_RULES } from "@/lib/rules/seed";
import { useApp } from "@/lib/store/app-store";
import { todayISO } from "@/lib/utils";

let cached: RulesDataset | null = null;

/** Rules dataset from the server (database-backed when configured), falling back to the bundled seed. */
export function useRules(): RulesRepository {
  const overrides = useApp((s) => s.overrides);
  const [data, setData] = useState<RulesDataset>(cached ?? SEED_RULES);
  useEffect(() => {
    if (cached) return;
    let alive = true;
    apiFetch("/api/rules")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: RulesDataset | null) => {
        if (alive && d?.version) {
          cached = d;
          setData(d);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(() => new RulesRepository(data, todayISO(), overrides), [data, overrides]);
}
