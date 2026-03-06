import { authenticateApiRequest, type ApiRequestAuthContext } from "@/lib/api-auth";

export type Pagination = {
  page: number;
  perPage: number;
  total: number;
};

export function json<T>(data: T, status = 200) {
  return Response.json(data, { status });
}

export function error(message: string, status = 400) {
  return json({ error: message }, status);
}

export function paginated<T>(data: Array<T>, pagination: Pagination, status = 200) {
  return json({ data, pagination }, status);
}

export async function requireAuth(
  request: Request,
): Promise<{ auth: ApiRequestAuthContext } | { error: Response }> {
  const auth = await authenticateApiRequest(request);
  if (!auth) {
    return { error: error("Unauthorized", 401) };
  }

  return { auth };
}
