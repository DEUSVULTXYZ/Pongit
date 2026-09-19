"""Compare restored COPY rows and sequence values without printing private data."""
import hashlib
import json
import pathlib
import sys


def logical_data(path):
    sections = {}
    sequences = []
    table = None
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if table is not None:
            if line == "\\.":
                sections[table] = sorted(rows)
                table, rows = None, []
            else:
                rows.append(line)
        elif line.startswith("COPY "):
            if line in sections:
                raise ValueError("Duplicate table section")
            table = line
        elif line.startswith("SELECT pg_catalog.setval("):
            sequences.append(line)
        elif line.startswith(("INSERT INTO ", "SELECT pg_catalog.lo_")):
            raise ValueError("Unsupported data representation; inspect privately")
    if table is not None:
        raise ValueError("Incomplete COPY section")
    canonical = json.dumps([sections, sorted(sequences)], sort_keys=True).encode()
    return hashlib.sha256(canonical).hexdigest(), len(sections), sum(map(len, sections.values()))


root = pathlib.Path(sys.argv[1]).resolve()
results = []
for before in sorted(root.glob("pong_*.before.sql")):
    after = before.with_name(before.name.replace(".before.sql", ".after.sql"))
    source = logical_data(before)
    restored = logical_data(after)
    if source != restored:
        raise ValueError("Restored data differs: " + before.name)
    results.append({"database": before.name.removesuffix(".before.sql"), "tables": source[1], "rows": source[2], "sha256": source[0], "equal": True})
if not results:
    raise ValueError("No restore evidence")
report = {"databases": results, "passed": True, "scope": "All COPY rows and sequence values; database owners and ACLs excluded from isolated restore"}
(root / "verification.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps({"passed": True, "databases": len(results), "rows": sum(x["rows"] for x in results)}))
