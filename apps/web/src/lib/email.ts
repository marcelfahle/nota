import { Resend } from "resend";

import { getEmailEnv } from "@/lib/env";

export const resend = new Resend(getEmailEnv().RESEND_API_KEY);
