"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

import { formatCurrency } from "@/lib/utils";

const SPACING = 18;
const REACH = 170;
const INVOICE_TOTAL = 4800;
const MAX_STAMPS = 14;
const LIME = [209, 253, 57] as const;
const PAPER = [251, 249, 244] as const;

type Stamp = { id: number; rotate: number; x: number; y: number };
type Ripple = { born: number; x: number; y: number };

function locate(event: PointerEvent<HTMLDivElement>) {
  const box = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

/**
 * The idle half of the sign-in screen: a halftone field that leans toward the
 * pointer, an invoice that tilts to face it, and a PAID stamp for every click.
 * Purely decorative, so it is hidden from assistive tech and stands still when
 * motion is unwelcome.
 */
export function AuthPlayground() {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const pointer = useRef({ active: false, x: 0, y: 0 });
  const ripples = useRef<Array<Ripple>>([]);
  const nextId = useRef(0);
  const [stamps, setStamps] = useState<Array<Stamp>>([]);
  const [paid, setPaid] = useState(0);

  useEffect(() => {
    const host = root.current;
    const surface = canvas.current;
    const context = surface?.getContext("2d");
    if (!host || !surface || !context) {
      return;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let frame = 0;
    // The eased point the field actually follows; the pointer only sets its target.
    const eased = { x: 0, y: 0 };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = host.clientWidth;
      height = host.clientHeight;
      surface.width = Math.round(width * ratio);
      surface.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      eased.x = width / 2;
      eased.y = height / 2;
    };

    const draw = (time: number) => {
      // With no pointer over the panel, a slow figure of eight keeps it alive.
      const target = pointer.current.active
        ? pointer.current
        : {
            x: width / 2 + Math.sin(time / 2300) * width * 0.3,
            y: height / 2 + Math.sin(time / 1500) * height * 0.26,
          };
      eased.x += (target.x - eased.x) * 0.12;
      eased.y += (target.y - eased.y) * 0.12;
      ripples.current = ripples.current.filter((ripple) => time - ripple.born < 1400);

      context.clearRect(0, 0, width, height);
      for (let y = SPACING / 2; y < height; y += SPACING) {
        for (let x = SPACING / 2; x < width; x += SPACING) {
          const dx = x - eased.x;
          const dy = y - eased.y;
          const distance = Math.hypot(dx, dy);
          let pull = Math.max(0, 1 - distance / REACH) ** 2;
          for (const ripple of ripples.current) {
            const age = (time - ripple.born) / 1400;
            const ring = Math.abs(Math.hypot(x - ripple.x, y - ripple.y) - age * 520);
            pull = Math.max(pull, Math.max(0, 1 - ring / 46) * (1 - age));
          }
          // Dots lean away from the pointer as they swell.
          const push = pull * 7;
          const px = distance > 0 ? x + (dx / distance) * push : x;
          const py = distance > 0 ? y + (dy / distance) * push : y;
          const mix = (from: number, to: number) => Math.round(from + (to - from) * pull);
          context.fillStyle = `rgba(${mix(PAPER[0], LIME[0])},${mix(PAPER[1], LIME[1])},${mix(PAPER[2], LIME[2])},${0.16 + pull * 0.84})`;
          context.beginPath();
          context.arc(px, py, 1.05 + pull * 4.4, 0, Math.PI * 2);
          context.fill();
        }
      }

      if (paper.current) {
        const tiltX = ((eased.y - height / 2) / height) * -11;
        const tiltY = ((eased.x - width / 2) / width) * 13;
        paper.current.style.transform = `rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) rotate(-3deg)`;
      }
      if (!still) {
        frame = requestAnimationFrame(draw);
      }
    };

    resize();
    const observer = new ResizeObserver(() => {
      resize();
      if (still) {
        draw(0);
      }
    });
    observer.observe(host);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="auth-playground relative h-full min-h-[22rem] cursor-crosshair overflow-hidden bg-[#1f1b16] text-[#fbf9f4] select-none"
      data-testid="auth-playground"
      onPointerDown={(event) => {
        const point = locate(event);
        ripples.current.push({ born: performance.now(), ...point });
        nextId.current += 1;
        const stamp = { id: nextId.current, rotate: -16 + Math.random() * 26, ...point };
        setStamps((current) => [...current.slice(1 - MAX_STAMPS), stamp]);
        setPaid((current) => current + 1);
      }}
      onPointerLeave={() => {
        pointer.current.active = false;
      }}
      onPointerMove={(event) => {
        pointer.current = { active: true, ...locate(event) };
      }}
      ref={root}
    >
      <canvas className="absolute inset-0 size-full" ref={canvas} />

      <div className="pointer-events-none absolute inset-0 grid place-items-center [perspective:1100px]">
        <div
          className="w-[min(21rem,62%)] bg-[#fffefb] p-6 text-[#1f1b16] shadow-[14px_14px_0_rgb(0_0_0/35%)] will-change-transform"
          ref={paper}
          style={{ transform: "rotate(-3deg)" }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-black/10 pb-4">
            <span className="grid size-9 place-items-center rounded-md bg-[#d1fd39] text-sm font-bold">
              N
            </span>
            <div className="text-right">
              <p className="text-2xl font-bold tracking-[-0.04em]">Invoice</p>
              <p className="font-mono text-[11px] text-[#6b655c]">INV-0042</p>
            </div>
          </div>
          <div className="flex items-end justify-between gap-4 py-5">
            <p className="nota-label text-[#6b655c]">Total due</p>
            <p className="font-mono text-2xl font-bold tracking-[-0.04em]">
              {formatCurrency(INVOICE_TOTAL, "EUR")}
            </p>
          </div>
          <div className="flex h-10 items-center justify-between bg-[#d1fd39] px-3.5 text-sm font-bold">
            <span>Pay {formatCurrency(INVOICE_TOTAL, "EUR")}</span>
            <span className="font-mono text-xs">→</span>
          </div>
        </div>
      </div>

      {stamps.map((stamp) => (
        <span
          className="auth-stamp pointer-events-none absolute"
          key={stamp.id}
          style={{
            ["--stamp-rotate" as string]: `${stamp.rotate}deg`,
            left: stamp.x,
            top: stamp.y,
          }}
        >
          Paid
        </span>
      ))}

      <p className="pointer-events-none absolute top-6 right-6 text-right font-mono text-xs text-[#fbf9f4]/70">
        <span className="nota-label block text-[#fbf9f4]/50">Paid today</span>
        <span className="mt-1 block text-lg font-bold text-[#d1fd39] tabular-nums" key={paid}>
          {formatCurrency(paid * INVOICE_TOTAL, "EUR")}
        </span>
      </p>
      <p className="pointer-events-none absolute bottom-6 left-6 font-voice text-lg text-[#fbf9f4]/75">
        {paid === 0 ? "Click anywhere to get paid." : "Feels good. Now do it for real."}
      </p>
    </div>
  );
}
