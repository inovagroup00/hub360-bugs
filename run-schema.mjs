import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const supabase = createClient(
  "https://gtnnuoyimddhbklrlpje.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0bm51b3lpbWRkaGJrbHJscGplIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjgyMzUwNCwiZXhwIjoyMDYyMzk5NTA0fQ.qDKpghRULKbO-oefEucE34fwASBjLHGscIQ7f9cqMWc"
);

const sql = readFileSync("setup-db.sql", "utf-8");

// Split by semicolons, but handle $$ blocks
function splitStatements(sql) {
  const statements = [];
  let current = "";
  let inDollar = false;

  const lines = sql.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("--") || trimmed === "") {
      current += line + "\n";
      continue;
    }

    if (trimmed.includes("$$")) {
      const count = (trimmed.match(/\$\$/g) || []).length;
      if (count % 2 === 1) {
        inDollar = !inDollar;
      }
    }

    current += line + "\n";

    if (!inDollar && trimmed.endsWith(";")) {
      const stmt = current.trim();
      if (stmt && !stmt.startsWith("--")) {
        statements.push(stmt);
      }
      current = "";
    }
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

const statements = splitStatements(sql);
console.log(`Found ${statements.length} statements to execute`);

let success = 0;
let errors = 0;

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  // Skip pure comments
  const nonComment = stmt
    .split("\n")
    .filter((l) => !l.trim().startsWith("--") && l.trim() !== "")
    .join("\n")
    .trim();
  if (!nonComment) continue;

  const { data, error } = await supabase.rpc("exec_sql", { sql: nonComment });
  if (error) {
    // Try via fetch to the SQL endpoint
    const res = await fetch(
      "https://gtnnuoyimddhbklrlpje.supabase.co/rest/v1/rpc/",
      {
        method: "POST",
        headers: {
          Authorization:
            "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0bm51b3lpbWRkaGJrbHJscGplIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjgyMzUwNCwiZXhwIjoyMDYyMzk5NTA0fQ.qDKpghRULKbO-oefEucE34fwASBjLHGscIQ7f9cqMWc",
          apikey:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0bm51b3lpbWRkaGJrbHJscGplIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjgyMzUwNCwiZXhwIjoyMDYyMzk5NTA0fQ.qDKpghRULKbO-oefEucE34fwASBjLHGscIQ7f9cqMWc",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: nonComment }),
      }
    );
    if (!res.ok) {
      const preview = nonComment.substring(0, 80).replace(/\n/g, " ");
      console.log(
        `[${i + 1}/${statements.length}] ERROR: ${error.message} | ${preview}...`
      );
      errors++;
    } else {
      success++;
    }
  } else {
    success++;
  }
}

console.log(`\nDone: ${success} success, ${errors} errors`);
