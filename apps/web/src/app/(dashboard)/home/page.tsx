import Link from "next/link";

import { HighlighterSwipe } from "@/components/nota-marks";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <h1>
        Back to <HighlighterSwipe>work.</HighlighterSwipe>
      </h1>
      <p className="font-voice text-xl text-muted-foreground">
        Your clients, your invoices, a little less admin.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href="/invoices">View invoices</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/clients">View clients</Link>
        </Button>
      </div>
    </div>
  );
}
