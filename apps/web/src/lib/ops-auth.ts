import { timingSafeEqual } from "node:crypto";

export function hasBearerSecret(request: Request, secret: string) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }
  const actual = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}
