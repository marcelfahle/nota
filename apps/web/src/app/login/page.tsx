import { Suspense } from "react";

import { LoginForm } from "@/components/login-form";
import { googleCredentials } from "@/lib/social-auth";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm googleEnabled={Boolean(googleCredentials())} />
    </Suspense>
  );
}
