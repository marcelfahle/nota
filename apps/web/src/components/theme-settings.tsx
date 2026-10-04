"use client";

import { useState, useTransition } from "react";

import { updateTheme } from "@/actions/theme";

export function ThemeSettings({ theme }: { theme: "system" | "light" | "dark" }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <section aria-labelledby="appearance-heading" className="space-y-3">
      <h2 className="text-sm font-semibold" id="appearance-heading">
        Appearance
      </h2>
      <p className="text-sm text-muted-foreground">
        Paper by day, Terminal by night. Saved to your account.
      </p>
      <label className="flex items-center gap-4 text-sm">
        Theme
        <select
          className="rounded-md border border-input bg-card px-3 py-2"
          disabled={pending}
          onChange={(event) => {
            const value = event.target.value;
            setError("");
            startTransition(async () => {
              try {
                await updateTheme(value);
              } catch {
                setError("Could not save your theme. Please try again.");
              }
            });
          }}
          value={theme}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
