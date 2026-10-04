import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function NotaGlyph({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      aria-hidden="true"
      className={cn("h-[1.375rem] w-auto", className)}
      viewBox="0 -1 26 33"
      {...props}
    >
      <rect className="fill-primary" height="23" rx="4" width="23" x="1" y="8" />
      <path
        className="stroke-primary-foreground"
        d="M5.6 18.6 10.6 23.6 22.6 1.6"
        fill="none"
        strokeLinecap="square"
        strokeWidth="4.4"
      />
      <polygon className="fill-primary" points="21.42,8.60 25.75,0.67 21.67,-1.55 16.14,8.60" />
    </svg>
  );
}

export function HighlighterSwipe({ className, ...props }: ComponentProps<"mark">) {
  return <mark className={cn("highlighter-swipe", className)} {...props} />;
}

/** Reserve stamps for invoice detail, never charts or navigation. */
export function RubberStamp({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("rubber-stamp", className)} {...props} />;
}

/** Reserve this shadow for the onboarding invoice. */
export function HalftoneShadow({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("halftone-shadow", className)} {...props} />;
}
