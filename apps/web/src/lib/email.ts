import { Resend } from "resend";

import { getEmailEnv } from "@/lib/env";

let cachedResend: Resend | null = null;

export function getResend() {
  if (!cachedResend) {
    cachedResend = new Resend(getEmailEnv().RESEND_API_KEY);
  }

  return cachedResend;
}
