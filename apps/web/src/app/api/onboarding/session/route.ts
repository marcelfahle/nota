import {
  applyProfileEdits,
  cookieValueFromHeader,
  deleteOnboardingSession,
  getOnboardingSession,
  onboardingCookie,
  saveOnboardingProfile,
  type ProfileEdits,
} from "@/lib/onboarding-session";

async function sessionFrom(request: Request) {
  return getOnboardingSession(cookieValueFromHeader(request.headers.get("cookie")));
}

/** The visitor's own edits to the preview. Still nothing is saved to an account. */
export async function PATCH(request: Request) {
  const session = await sessionFrom(request);
  if (!session?.profile) {
    return Response.json({ error: "No website has been read yet" }, { status: 404 });
  }
  const edits = (await request.json().catch(() => null)) as ProfileEdits | null;
  if (!edits || typeof edits !== "object") {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const profile = applyProfileEdits(session.profile, edits);
  await saveOnboardingProfile(session.id, profile);
  return Response.json({ profile });
}

/** "Use a different website": forget this read. */
export async function DELETE(request: Request) {
  const session = await sessionFrom(request);
  if (session) {
    await deleteOnboardingSession(session.id);
  }
  return new Response(null, {
    headers: { "set-cookie": onboardingCookie("", 0) },
    status: 204,
  });
}
