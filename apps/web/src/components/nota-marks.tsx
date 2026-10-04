import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

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
