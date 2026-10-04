"use client";

import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const tabs = [
  ["account", "Account"],
  ["brand", "Brand"],
  ["numbering", "Numbering and tax"],
  ["payments", "Getting paid"],
  ["email", "Email"],
  ["team", "Team"],
  ["api", "API"],
] as const;

type Tab = (typeof tabs)[number][0];

export function SettingsTabs({ panels }: { panels: Record<Tab, ReactNode> }) {
  const [active, setActive] = useState<Tab>("brand");

  useEffect(() => {
    function syncHash() {
      const hash = window.location.hash.slice(1);
      const mapped = hash === "connected-apps" ? "api" : hash;
      if (tabs.some(([id]) => id === mapped)) {
        setActive(mapped as Tab);
      }
    }
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  return (
    <div className="space-y-7">
      <div aria-label="Settings sections" className="flex flex-wrap border-b" role="tablist">
        {tabs.map(([id, label]) => (
          <button
            aria-controls={`settings-panel-${id}`}
            aria-selected={active === id}
            className={cn(
              "min-h-10 shrink-0 rounded-t-md border border-transparent px-3 text-sm font-medium text-muted-foreground",
              active === id &&
                "-mb-px border-foreground border-b-background bg-background text-foreground",
            )}
            id={`settings-tab-${id}`}
            key={id}
            onClick={() => {
              setActive(id);
              history.replaceState(null, "", `#${id}`);
            }}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      {tabs.map(([id]) => (
        <section
          aria-labelledby={`settings-tab-${id}`}
          hidden={active !== id}
          id={`settings-panel-${id}`}
          key={id}
          role="tabpanel"
        >
          {panels[id]}
        </section>
      ))}
    </div>
  );
}
