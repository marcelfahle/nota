import { describe, expect, test } from "bun:test";

import { PgDialect } from "drizzle-orm/pg-core";

import { searchPattern, workspaceSearch } from "./admin-search";
import { orgs } from "./db/schema";

const dialect = new PgDialect();

describe("searchPattern", () => {
  test("wraps the trimmed term in wildcards", () => {
    expect(searchPattern("  alice@example.com ")).toBe("%alice@example.com%");
  });

  test("is null when nothing was typed", () => {
    expect(searchPattern("")).toBeNull();
    expect(searchPattern("   ")).toBeNull();
    expect(searchPattern(undefined)).toBeNull();
  });

  test("escapes ILIKE wildcards so a typed % or _ matches itself", () => {
    expect(searchPattern("100%_done")).toBe(String.raw`%100\%\_done%`);
    expect(searchPattern(String.raw`a\b`)).toBe(String.raw`%a\\b%`);
  });
});

describe("workspaceSearch", () => {
  test("is one ILIKE condition over workspace, business and member fields", () => {
    const query = dialect.sqlToQuery(workspaceSearch(orgs, "%acme%"));
    const sql = query.sql.toLowerCase();
    expect(sql).toContain('"orgs"."name" ilike');
    expect(sql).toContain('"orgs"."business_name" ilike');
    expect(sql).toContain("exists (select u.email from");
    expect(sql).toContain("u.email ilike");
    expect(sql).toContain("u.name ilike");
    expect(query.params).toEqual(["%acme%", "%acme%", "%acme%", "%acme%"]);
  });
});
