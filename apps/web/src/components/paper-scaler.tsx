"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** An A4 page in points: what the PDF is set on, and what the sheet is laid out at. */
export const PAGE = { height: 842, width: 595 };

/**
 * Shows a sheet laid out at page size scaled to the width it is given, the way
 * a PDF viewer does: nothing reflows, the format stays locked, only the zoom
 * changes. Taller content grows the page downward like a second sheet would.
 */
export function PaperScaler({ children, className }: { children: ReactNode; className?: string }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ height: number; scale: number } | null>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) {
      return;
    }
    const update = () => {
      const scale = outer.clientWidth / PAGE.width;
      setFit({ height: Math.ceil(inner.offsetHeight * scale), scale });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={className}
      ref={outerRef}
      style={fit ? { height: fit.height } : { aspectRatio: `${PAGE.width} / ${PAGE.height}` }}
    >
      <div
        ref={innerRef}
        style={{
          transform: `scale(${fit?.scale ?? 1})`,
          transformOrigin: "top left",
          visibility: fit ? "visible" : "hidden",
          width: PAGE.width,
        }}
      >
        {children}
      </div>
    </div>
  );
}
