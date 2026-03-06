import { redirect } from "next/navigation";

import { getCurrentUserOrNull } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUserOrNull();
  redirect(user ? "/invoices" : "/login");
}
