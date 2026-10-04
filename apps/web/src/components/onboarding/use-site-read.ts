"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ProfileFieldKey,
  ReaderEvent,
  ReaderStep,
  SiteProfile,
} from "@/lib/site-reader/types";

export type ReadStatus = "done" | "error" | "idle" | "reading";
export type StepState = "active" | "done" | "skipped";
export type VatReply = "invalid" | "tax-id" | "unavailable" | "valid" | "valid-with-details";

type Edits = { brandColor?: string; confirm: Set<string>; fields: Record<string, string> };

// Events can arrive in one burst (a cached read replays instantly). Revealing
// them a beat apart keeps the page reading like something is being written.
const REVEAL_MS = 190;

function apply(profile: SiteProfile, event: ReaderEvent): SiteProfile {
  if (event.type === "field") {
    return { ...profile, fields: { ...profile.fields, [event.key]: event.field } };
  }
  if (event.type === "logo") {
    return { ...profile, favicon: event.favicon, logo: event.logo };
  }
  if (event.type === "colors") {
    return {
      ...profile,
      brandColor: profile.brandColor ?? event.colors[0]?.hex ?? null,
      colors: event.colors,
    };
  }
  return profile;
}

export function useSiteRead(initial: SiteProfile | null) {
  const [profile, setProfile] = useState<SiteProfile | null>(initial);
  const [status, setStatus] = useState<ReadStatus>(initial ? "done" : "idle");
  const [steps, setSteps] = useState<Partial<Record<ReaderStep, StepState>>>({});
  const [error, setError] = useState<string | null>(null);

  const queue = useRef<Array<ReaderEvent>>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const edits = useRef<Edits>({ confirm: new Set(), fields: {} });
  const dirty = useRef(false);
  const saved = useRef(Boolean(initial));
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settled = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);

  const flush = useCallback(async () => {
    if (!saved.current || !dirty.current) {
      return;
    }
    // Send each edit once: a replayed edit would overwrite what the registry
    // or a later edit put in its place.
    const sent = edits.current;
    edits.current = { confirm: new Set(), fields: {} };
    dirty.current = false;
    const ok = await fetch("/api/onboarding/session", {
      body: JSON.stringify({
        brandColor: sent.brandColor,
        confirm: [...sent.confirm],
        fields: sent.fields,
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    })
      .then((response) => response.ok)
      .catch(() => false);
    if (!ok) {
      // Put them back for the next attempt; anything edited meanwhile wins.
      edits.current = {
        brandColor: edits.current.brandColor ?? sent.brandColor,
        confirm: new Set([...sent.confirm, ...edits.current.confirm]),
        fields: { ...sent.fields, ...edits.current.fields },
      };
      dirty.current = true;
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    dirty.current = true;
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
    }
    flushTimer.current = setTimeout(() => void flush(), 600);
  }, [flush]);

  const drain = useCallback(() => {
    timer.current = null;
    const event = queue.current.shift();
    if (!event) {
      return;
    }
    if (event.type === "done") {
      saved.current = true;
      setStatus("done");
      void flush().then(() => settled.current?.resolve());
    } else if (event.type === "error") {
      setError(event.message);
      setStatus("error");
      settled.current?.resolve();
    } else {
      setProfile((current) => (current ? apply(current, event) : current));
    }
    if (queue.current.length > 0) {
      timer.current = setTimeout(drain, REVEAL_MS);
    }
  }, [flush]);

  const push = useCallback(
    (event: ReaderEvent) => {
      if (event.type === "start") {
        setProfile({
          brandColor: null,
          colors: [],
          domain: event.domain,
          favicon: null,
          fields: {},
          logo: null,
          website: event.website,
        });
        return;
      }
      if (event.type === "step") {
        setSteps((current) => ({ ...current, [event.step]: event.state }));
        return;
      }
      queue.current.push(event);
      if (!timer.current) {
        timer.current = setTimeout(drain, 0);
      }
    },
    [drain],
  );

  const read = useCallback(
    async (website: string) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      queue.current = [];
      edits.current = { confirm: new Set(), fields: {} };
      dirty.current = false;
      saved.current = false;
      let resolve = () => {};
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      settled.current = { promise, resolve };
      setError(null);
      setSteps({});
      setStatus("reading");

      try {
        const response = await fetch("/api/onboarding/read", {
          body: JSON.stringify({ website }),
          headers: { "content-type": "application/json" },
          method: "POST",
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          const refusal = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(refusal?.message ?? "We couldn't read that website right now.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finished = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.trim()) {
              const event = JSON.parse(line) as ReaderEvent;
              finished ||= event.type === "done" || event.type === "error";
              push(event);
            }
          }
        }
        if (!finished) {
          throw new Error("The read stopped early. Try again.");
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        push({
          code: "unreachable",
          message: error instanceof Error ? error.message : "We couldn't read that website.",
          type: "error",
        });
      }
    },
    [push],
  );

  const reset = useCallback(() => {
    abort.current?.abort();
    queue.current = [];
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    saved.current = false;
    setProfile(null);
    setSteps({});
    setError(null);
    setStatus("idle");
    void fetch("/api/onboarding/session", { method: "DELETE" }).catch(() => {});
  }, []);

  const edit = useCallback(
    (key: ProfileFieldKey, value: string) => {
      const trimmed = value.trim();
      edits.current.fields[key] = trimmed;
      setProfile((current) => {
        if (!current) {
          return current;
        }
        const fields = { ...current.fields };
        if (trimmed) {
          fields[key] = { confidence: 1, confirmed: true, source: "user", value: trimmed };
        } else {
          delete fields[key];
        }
        return { ...current, fields };
      });
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const confirm = useCallback(
    (keys: Array<ProfileFieldKey>) => {
      for (const key of keys) {
        edits.current.confirm.add(key);
      }
      setProfile((current) => {
        if (!current) {
          return current;
        }
        const fields = { ...current.fields };
        for (const key of keys) {
          if (fields[key]) {
            fields[key] = { ...fields[key], confirmed: true };
          }
        }
        return { ...current, fields };
      });
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const pickColor = useCallback(
    (hex: string) => {
      edits.current.brandColor = hex;
      setProfile((current) => (current ? { ...current, brandColor: hex } : current));
      scheduleFlush();
    },
    [scheduleFlush],
  );

  /** Resolves once the read has finished and every edit has reached the session. */
  const settle = useCallback(async () => {
    await settled.current?.promise;
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
    }
    await flush();
  }, [flush]);

  const checkVat = useCallback(
    async (vatNumber: string): Promise<VatReply | { error: string }> => {
      await settle();
      try {
        const response = await fetch("/api/onboarding/vat", {
          body: JSON.stringify({ vatNumber }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        const reply = (await response.json()) as {
          error?: string;
          outcome?: VatReply;
          profile?: SiteProfile;
        };
        if (!response.ok || !reply.outcome || !reply.profile) {
          return { error: reply.error ?? "We couldn't check that right now." };
        }
        setProfile(reply.profile);
        return reply.outcome;
      } catch {
        return { error: "We couldn't check that right now." };
      }
    },
    [settle],
  );

  useEffect(
    () => () => {
      abort.current?.abort();
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  return { checkVat, confirm, edit, error, pickColor, profile, read, reset, settle, status, steps };
}

export type SiteRead = ReturnType<typeof useSiteRead>;
