import { describe, expect, it } from "vitest";
import { formatSql } from "./sqlFormat";

describe("formatSql", () => {
  it("breaks major clauses onto their own lines", () => {
    const out = formatSql("select a, b from t where x = 1");
    expect(out).toBe("SELECT a, b\nFROM t\nWHERE x = 1");
  });

  it("indents AND / OR under the clause", () => {
    const out = formatSql("SELECT a FROM t WHERE x = 1 AND y = 2 OR z = 3");
    expect(out).toBe("SELECT a\nFROM t\nWHERE x = 1\n  AND y = 2\n  OR z = 3");
  });

  it("keeps GROUP BY and ORDER BY on one line each", () => {
    const out = formatSql("select a, count(*) from t group by a order by a desc limit 5");
    expect(out).toContain("GROUP BY a");
    expect(out).toContain("ORDER BY a DESC");
    expect(out).toContain("LIMIT 5");
  });

  it("starts each JOIN on a new line", () => {
    const out = formatSql("select * from a inner join b on a.id = b.id left join c on b.id = c.id");
    const lines = out.split("\n");
    expect(lines.some((l) => l.startsWith("INNER JOIN b"))).toBe(true);
    expect(lines.some((l) => l.startsWith("LEFT JOIN c"))).toBe(true);
  });

  it("keeps strings untouched, including quotes inside them", () => {
    const out = formatSql("select * from t where name = 'O''Brien and co'");
    expect(out).toContain("'O''Brien and co'");
    // The AND inside the string must not start a new clause line.
    expect(out.split("\n").some((l) => l.trimStart().startsWith("AND"))).toBe(false);
  });

  it("preserves comments", () => {
    const out = formatSql("select a -- pick a\nfrom t");
    expect(out).toContain("-- pick a");
  });

  it("can lowercase keywords instead", () => {
    const out = formatSql("SELECT a FROM t", { uppercase: false });
    expect(out).toBe("select a\nfrom t");
  });

  it("returns an empty string for empty input", () => {
    expect(formatSql("")).toBe("");
    expect(formatSql("   ")).toBe("");
  });
});
