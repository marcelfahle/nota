"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ADDRESS_FIELDS, addressChanges, type AddressFieldKey } from "@/lib/onboarding-address";
import {
  PROFILE_FIELDS,
  type ProfileField,
  type ProfileFieldKey,
  type ReaderEvent,
  type ReaderStep,
  type SiteProfile,
} from "@/lib/site-reader/types";
import type { TaxIdentifierInput } from "@/lib/tax-identifier";

export type ReadStatus = "done" | "error" | "idle" | "reading";
export type StepState = "active" | "done" | "skipped";
export type VatReply = "invalid" | "tax-id" | "unavailable" | "valid" | "valid-with-details";

type Edits = {
  brandColor?: string;
  confirm: Partial<Record<ProfileFieldKey, ProfileField>>;
  fields: Record<string, string>;
  review: Set<ProfileFieldKey>;
};

function emptyEdits(): Edits {
  return { confirm: {}, fields: {}, review: new Set() };
}

// Events can arrive in one burst (a cached read replays instantly). Revealing
// them a beat apart keeps the page reading like something is being written.
const REVEAL_MS = 190;

function apply(profile: SiteProfile, event: ReaderEvent, edits: Edits): SiteProfile {
  if (event.type === "field") {
    if (Object.hasOwn(edits.fields, event.key) || edits.confirm[event.key]) {
      return profile;
    }
    const field = edits.review.has(event.key)
      ? { ...event.field, confirmed: false, reviewRequired: true }
      : event.field;
    return { ...profile, fields: { ...profile.fields, [event.key]: field } };
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
  const edits = useRef<Edits>(emptyEdits());
  const dirty = useRef(false);
  const saved = useRef(Boolean(initial));
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushing = useRef<Promise<void> | null>(null);
  const settled = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);

  const flush = useCallback(async () => {
    const previous = flushing.current ?? Promise.resolve();
    const operation = previous.then(async () => {
      while (saved.current && dirty.current) {
        // Send each edit once. Edits made during this request are sent by the
        // next loop iteration, so account creation cannot race an older PATCH.
        const sent = edits.current;
        edits.current = emptyEdits();
        dirty.current = false;
        const ok = await fetch("/api/onboarding/session", {
          body: JSON.stringify({ ...sent, review: [...sent.review] }),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        })
          .then((response) => response.ok)
          .catch(() => false);
        if (!ok) {
          // Put them back for the next attempt; anything edited meanwhile wins.
          edits.current = {
            brandColor: edits.current.brandColor ?? sent.brandColor,
            confirm: { ...sent.confirm, ...edits.current.confirm },
            fields: { ...sent.fields, ...edits.current.fields },
            review: new Set([...sent.review, ...edits.current.review]),
          };
          dirty.current = true;
          break;
        }
      }
    });
    flushing.current = operation;
    await operation;
    if (flushing.current === operation) {
      flushing.current = null;
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
      setProfile((current) => (current ? apply(current, event, edits.current) : current));
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
      edits.current = emptyEdits();
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

  const editAddress = useCallback(
    (key: AddressFieldKey, value: string) => {
      const trimmed = value.trim();
      setProfile((current) => {
        if (!current) {
          return current;
        }
        const fields = { ...current.fields };
        const { changes, split } = addressChanges(key, trimmed, fields);
        for (const [field, nextValue] of Object.entries(changes) as Array<
          [AddressFieldKey, string]
        >) {
          edits.current.fields[field] = nextValue;
          delete edits.current.confirm[field];
          if (nextValue) {
            fields[field] = {
              confidence: 1,
              confirmed: false,
              ...(split ? { detail: "split from your city entry" } : {}),
              reviewRequired: true,
              source: "user",
              value: nextValue,
            };
          } else {
            delete fields[field];
          }
        }
        for (const field of ADDRESS_FIELDS) {
          if (fields[field]) {
            edits.current.review.add(field);
            fields[field] = { ...fields[field], confirmed: false, reviewRequired: true };
          }
        }
        return { ...current, fields };
      });
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const confirm = useCallback(
    (keys: Array<ProfileFieldKey>) => {
      setProfile((current) => {
        if (!current) {
          return current;
        }
        const fields = { ...current.fields };
        for (const key of keys) {
          if (fields[key]) {
            fields[key] = { ...fields[key], confirmed: true };
            delete fields[key].reviewRequired;
            edits.current.confirm[key] = fields[key];
            edits.current.review.delete(key);
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
    async (taxIdentifier: TaxIdentifierInput): Promise<VatReply | { error: string }> => {
      await settle();
      let result: VatReply | { error: string } = {
        error: "We couldn't check that right now.",
      };
      let returnedProfile: SiteProfile | null = null;
      const previous = flushing.current ?? Promise.resolve();
      const operation = previous.then(async () => {
        try {
          const response = await fetch("/api/onboarding/vat", {
            body: JSON.stringify({ taxIdentifier }),
            headers: { "content-type": "application/json" },
            method: "POST",
          });
          const reply = (await response.json()) as {
            error?: string;
            outcome?: VatReply;
            profile?: SiteProfile;
          };
          if (!response.ok || !reply.outcome || !reply.profile) {
            result = { error: reply.error ?? "We couldn't check that right now." };
            return;
          }
          result = reply.outcome;
          returnedProfile = reply.profile;
        } catch {
          result = { error: "We couldn't check that right now." };
        }
      });
      flushing.current = operation;
      await operation;
      if (flushing.current === operation) {
        flushing.current = null;
      }
      if (returnedProfile) {
        setProfile((current) => {
          if (!current) {
            return returnedProfile;
          }
          const fields = { ...returnedProfile!.fields };
          for (const key of PROFILE_FIELDS) {
            const currentField = current.fields[key];
            if (
              Object.hasOwn(edits.current.fields, key) ||
              edits.current.confirm[key] ||
              edits.current.review.has(key) ||
              currentField?.source === "user" ||
              (currentField?.confirmed && currentField.source !== "registry")
            ) {
              if (currentField) {
                fields[key] = currentField;
              } else {
                delete fields[key];
              }
            }
          }
          return { ...returnedProfile!, fields };
        });
      }
      // Edits made while the registry was answering are ordered after it.
      await flush();
      return result;
    },
    [flush, settle],
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

  return {
    checkVat,
    confirm,
    edit,
    editAddress,
    error,
    pickColor,
    profile,
    read,
    reset,
    settle,
    status,
    steps,
  };
}

export type SiteRead = ReturnType<typeof useSiteRead>;
