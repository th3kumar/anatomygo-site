#!/usr/bin/env python3
"""Import Z-Anatomy candidate pins into the Playground as unreviewed community proposals.

Dry run by default: prints the planned inserts and every blocker, and writes nothing. --apply
writes one bounded batch in a single transaction. Reruns are safe: every candidate has a
deterministic key, proposal ID and (when needed) landmark ID, recorded privately in
playground_private.imports, so a candidate is written once and an interrupted batch simply
runs again. Existing landmarks, placements, votes, comments and publication pointers are
never changed; imported proposals have no author and are never approved here.

The database URL is read from an environment variable (default ANATOMYGO_IMPORT_DATABASE_URL),
never from the command line. Without one, --snapshot plans against the local seed export
(offline; it cannot see live contributions or earlier imports).

Candidates come from tools/research/z_anatomy_candidates.py in the AnatomyGo app repository.
"""
import argparse
import hashlib
import json
import math
import os
import re
import struct
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMPORT_DIR = ROOT / "imports/z-anatomy"
SOURCE = "z-anatomy"
IMPORTER_VERSION = 1
NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "https://anatomygo.in/imports/z-anatomy")
PROJECT_REF = "ntxarpmsqnokcxmxorjd"
MAX_BATCH = 40
# Text that reads like engineering or source commentary is not a biology description.
# ("Projection" is ordinary anatomy, so only unambiguous technical words count.)
UNSUITABLE = re.compile(r"(?i)\b(registration|z-anatomy|apk|candidate pin|icp|barycentric)\b|\d\s?mm\b")
STOPWORDS = {"of", "the", "for", "a", "an", "and", "left", "right"}


class ImportFailure(Exception):
    pass


def sha256_json(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def label_key(label, bone):
    """Words that identify a feature on one structure; the structure's own name and side add nothing."""
    bone_words = set(re.findall(r"[a-z0-9]+", bone.lower()))
    return tuple(sorted(w for w in re.findall(r"[a-z0-9]+", label.lower()) if w not in STOPWORDS | bone_words))


def latin_key(latin):
    return tuple(sorted(re.findall(r"[a-z0-9]+", latin.lower())))


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def candidate_key(row):
    """Identity of one source annotation on one exact target geometry (independent of method settings)."""
    anchor = row["anchor"]
    return hashlib.sha256("|".join([SOURCE, row["source_sha256"], row["object"], anchor["mesh_id"],
                                    anchor["geometry"]]).encode()).hexdigest()


def new_landmark_id(mesh_id, label):
    base = f"z-{mesh_id.lower()}-{slug(label)}"
    if len(base) <= 80:
        return base
    return base[:71].rstrip("-") + "-" + hashlib.sha256(base.encode()).hexdigest()[:8]


# ---------------------------------------------------------------- inputs

def load_candidates(directory):
    rows = []
    for path in sorted(Path(directory).glob("*.json")):
        if path.name == "summary.json":
            continue
        record = json.loads(path.read_text())
        for annotation in record["annotations"]:
            rows.append({**annotation, "host": record["source_host"], "bone": re.sub(r"\.(l|r)$", "", record["source_host"]),
                         "side": record["side"], "source_sha256": record["source_sha256"],
                         "method_version": record["method_version"], "settings_sha256": record["settings_sha256"],
                         "cache_key": record.get("cache_key"), "target": record.get("target") or {},
                         "registration": record["registration"]})
    if not rows:
        raise ImportFailure(f"No candidate files in {directory}")
    return rows


def load_batches(path):
    batches = json.loads(Path(path).read_text())["batches"]
    names = [b["name"] for b in batches]
    if len(names) != len(set(names)):
        raise ImportFailure("Batch names must be unique")
    return batches


class SiteModel:
    """The site's own served geometry, used to rebuild every anchor independently of the research tools."""

    def __init__(self, root):
        self.root = Path(root)
        self.atlas = json.loads((self.root / "models/atlas.json").read_text())
        self.manifest = json.loads((self.root / "models/playground-geometry.json").read_text())
        self.parts = {p["id"]: p for p in self.atlas["parts"]}
        self._chunks = {}

    def corners(self, mesh_id, triangle):
        part = self.parts[mesh_id]
        if part["chunk"] not in self._chunks:
            self._chunks[part["chunk"]] = (self.root / "models" / Path(self.atlas["chunks"][part["chunk"]]["url"]).name).read_bytes()
        data = self._chunks[part["chunk"]]
        index = struct.unpack_from("<3I", data, part["indices"] + triangle * 12)
        return [struct.unpack_from("<3f", data, part["positions"] + i * 12) for i in index]

    def point(self, mesh_id, triangle, u, v):
        a, b, c = self.corners(mesh_id, triangle)
        w = 1 - u - v
        return [a[k] * w + b[k] * u + c[k] * v for k in range(3)]


# ---------------------------------------------------------------- state

class State:
    def __init__(self, origin, structures, landmarks, proposals, imports, imports_table=True):
        self.origin = origin
        self.structures = structures  # id -> row
        self.landmarks = landmarks  # list of rows (all meshes requested, including archived)
        self.proposals = proposals  # list of rows
        self.imports = imports  # candidate_key -> row
        self.imports_table = imports_table


def snapshot_state(root, meshes):
    site = SiteModel(root)
    seed = json.loads((Path(root) / "public/playground-seed.json").read_text())
    structures = {}
    for mesh in meshes:
        part = site.parts.get(mesh)
        info = site.manifest["meshes"].get(mesh)
        if part and info:
            structures[mesh] = {"id": mesh, "name": part["name"], "geometry": site.manifest["geometry"],
                                "mesh_digest": info["digest"], "triangle_count": part["indexCount"] // 3,
                                "invalid_triangles": info["invalidTriangles"]}
    landmarks = [{**l, "archived": False, "published_proposal": l.get("published_proposal")}
                 for l in seed["landmarks"] if l["mesh_id"] in meshes]
    proposals = [{**p, "status": "community"} for p in seed["proposals"] if p["mesh_id"] in meshes]
    return State("offline snapshot: public/playground-seed.json (not live)", structures, landmarks, proposals, {}, False)


def database_state(cur, meshes, landmark_ids):
    cur.execute("select id,name,geometry,mesh_digest,triangle_count,invalid_triangles from public.pg_structures where id=any(%s)", (meshes,))
    structures = {r["id"]: r for r in cur.fetchall()}
    cur.execute("select id,mesh_id,label,latin_name,description,published_proposal,archived from public.pg_landmarks "
                "where mesh_id=any(%s) or id=any(%s)", (meshes, landmark_ids))
    landmarks = cur.fetchall()
    cur.execute("select id,landmark_id,mesh_id,geometry,triangle,u,v,status,author_id from public.pg_proposals "
                "where mesh_id=any(%s)", (meshes,))
    proposals = cur.fetchall()
    cur.execute("select to_regclass('playground_private.imports') is not null as present")
    present = cur.fetchone()["present"]
    imports = {}
    if present:
        cur.execute("select candidate_key,batch,proposal_id,landmark_id,content_sha256,created_landmark "
                    "from playground_private.imports where source=%s", (SOURCE,))
        imports = {r["candidate_key"]: r for r in cur.fetchall()}
    return State("database", structures, landmarks, proposals, imports, present)


# ---------------------------------------------------------------- planning

def validate_anchor(anchor, structure, site):
    """Problems with an anchor against the live structure row and the site's own geometry."""
    problems = []
    triangle, u, v = anchor.get("triangle"), anchor.get("u"), anchor.get("v")
    if not isinstance(triangle, int) or isinstance(triangle, bool):
        return ["triangle is not an integer"]
    if not all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) for x in (u, v)):
        return ["barycentric weights are not finite numbers"]
    if not (0 <= triangle < structure["triangle_count"]):
        problems.append("triangle outside the structure")
    if triangle in (structure["invalid_triangles"] or []):
        problems.append("degenerate triangle")
    if not (0 <= u <= 1 and 0 <= v <= 1 and u + v <= 1):
        problems.append("barycentric weights outside the triangle")
    return problems


def resolve_text(row, landmark, metadata):
    """Label, Latin name and description: suitable existing landmark text first, then curated metadata."""
    entry = metadata["features"].get(f"{row['bone']}|{row['label']}", {})
    sources = {}
    if landmark:
        label, sources["label"] = landmark["label"], "existing_landmark"
    else:
        label, sources["label"] = entry.get("label") or row["label"], "metadata" if entry.get("label") else "annotation"
    latin = (landmark or {}).get("latin_name", "").strip()
    sources["latin"] = "existing_landmark"
    if not latin:
        latin, sources["latin"] = entry.get("latin", "").strip(), "metadata"
    description = (landmark or {}).get("description", "").strip()
    sources["description"] = "existing_landmark"
    if not description or UNSUITABLE.search(description):
        description, sources["description"] = entry.get("description", "").strip(), "metadata"
    missing = [name for name, value in (("latin", latin), ("description", description)) if not value]
    if UNSUITABLE.search(description):
        missing.append("suitable description")
    if len(label.strip()) > 160 or len(latin) > 200 or len(description) > 4000:
        missing.append("text within database limits")
    return {"label": label.strip(), "latin_name": latin, "description": description}, sources, entry, missing


def match_landmark(row, landmarks, aliases):
    """Exactly one existing landmark with the same meaning on this structure, or a reason."""
    keys = {label_key(row["label"], row["bone"])} | {label_key(a, row["bone"]) for a in aliases}
    mesh = row["anchor"]["mesh_id"]
    by_label = [l for l in landmarks if l["mesh_id"] == mesh and label_key(l["label"], row["bone"]) in keys]
    found = by_label
    method = "label"
    if not found and row.get("latin"):
        found = [l for l in landmarks if l["mesh_id"] == mesh and l["latin_name"] and latin_key(l["latin_name"]) == latin_key(row["latin"])]
        method = "latin"
    if any(l["archived"] for l in found):
        return None, method, "archived_landmark_match: an archived landmark has this meaning; needs an admin decision"
    if len(found) > 1:
        return None, method, "ambiguous_landmark_match: " + ", ".join(sorted(l["id"] for l in found))
    return (found[0] if found else None), method, None


def make_plan(candidates, metadata, state, site, batch, structures=None, features=None):
    selected = [c for c in candidates
                if c["target"].get("mesh_id") in batch["structures"]
                and (not structures or c["target"].get("mesh_id") in structures)
                and (not batch.get("features") or c["label"] in batch["features"])
                and (not features or c["label"] in features)]
    inserts, already, blocked = [], [], []
    planned_landmarks = {}
    for row in selected:
        def block(code, detail=""):
            blocked.append({"mesh_id": row["target"].get("mesh_id"), "label": row["label"], "object": row["object"],
                            "reason": code, "detail": detail})
        if row["status"] != "extracted":
            first = (row["reasons"] or ["blocked"])[0]
            block(first.split(":")[0], "; ".join(row["reasons"]))
            continue
        if row.get("anatomical_status") != "not_reviewed":
            block("unexpected_review_state", str(row.get("anatomical_status")))
            continue
        anchor = row["anchor"]
        mesh = anchor["mesh_id"]
        structure = state.structures.get(mesh)
        if structure is None:
            block("structure_missing")
            continue
        if structure["geometry"] != anchor["geometry"] or structure["mesh_digest"] != row["target"].get("digest") \
                or site.manifest["meshes"].get(mesh, {}).get("digest") != structure["mesh_digest"]:
            block("stale_geometry", "Candidate, site model and database geometry differ")
            continue
        problems = validate_anchor(anchor, structure, site)
        if problems:
            block("malformed_anchor", "; ".join(problems))
            continue
        rebuilt = site.point(mesh, anchor["triangle"], anchor["u"], anchor["v"])
        expected = row.get("diagnostics", {}).get("projected_xyz")
        error = math.dist(rebuilt, expected) if expected else math.inf
        if error > 1e-6:
            block("anchor_reconstruction", f"{error:.3g} m from the candidate's projected point")
            continue
        entry = metadata["features"].get(f"{row['bone']}|{row['label']}", {})
        landmark, match_method, problem = match_landmark({**row, "latin": entry.get("latin", "")}, state.landmarks,
                                                         entry.get("aliases", []))
        if problem:
            block(problem.split(":")[0], problem)
            continue
        created = landmark is None
        if created:
            text, sources, entry, missing = resolve_text(row, None, metadata)
            landmark_id = new_landmark_id(mesh, text["label"])
            clash = next((l for l in state.landmarks if l["id"] == landmark_id), None)
            if clash or landmark_id in planned_landmarks and planned_landmarks[landmark_id] != (mesh, text["label"]):
                block("landmark_id_conflict", landmark_id)
                continue
        else:
            text, sources, entry, missing = resolve_text(row, landmark, metadata)
            landmark_id = landmark["id"]
        if missing:
            block("metadata_missing", ", ".join(missing))
            continue
        key = candidate_key(row)
        content = {"landmark_id": landmark_id, "mesh_id": mesh, **text, "geometry": anchor["geometry"],
                   "triangle": anchor["triangle"], "u": anchor["u"], "v": anchor["v"]}
        content_sha = sha256_json(content)
        existing = state.imports.get(key)
        if existing:
            (already if existing["content_sha256"] == content_sha else blocked).append(
                {"mesh_id": mesh, "label": row["label"], "object": row["object"], "proposal_id": str(existing["proposal_id"]),
                 "reason": "already_imported" if existing["content_sha256"] == content_sha else "imported_content_differs",
                 "detail": "" if existing["content_sha256"] == content_sha else "An earlier import wrote different content; it is left unchanged"})
            continue
        if any(p["landmark_id"] == landmark_id and p["geometry"] == anchor["geometry"] and p["triangle"] == anchor["triangle"]
               and abs(p["u"] - anchor["u"]) < 1e-9 and abs(p["v"] - anchor["v"]) < 1e-9 for p in state.proposals):
            block("duplicate_placement", "An identical placement already exists for this landmark")
            continue
        if created:
            planned_landmarks[landmark_id] = (mesh, text["label"])
        diagnostics = row["diagnostics"]
        inserts.append({
            "candidate_key": key,
            "proposal_id": str(uuid.uuid5(NAMESPACE, "proposal:" + key)),
            "request_id": str(uuid.uuid5(NAMESPACE, "request:" + key)),
            "created_landmark": created, "landmark_match": None if created else match_method,
            "content": content, "content_sha256": content_sha,
            "provenance": {
                "source": metadata["sources"]["z_anatomy"],
                "annotation": {"object": row["object"], "source_name": row["source_name"], "host": row["host"],
                               "side": row["side"], "pin_side": row["diagnostics"].get("target_side"),
                               "feature_class": row["feature_class"],
                               "endpoint_method": row["endpoint"]["method"]},
                "target": {"mesh_id": mesh, "digest": row["target"]["digest"], "geometry": anchor["geometry"]},
                "method": {"version": row["method_version"], "settings_sha256": row["settings_sha256"],
                           "cache_key": row["cache_key"]},
                "text": {"sources": sources, "latin_reference": entry.get("latin_source"),
                         "references": entry.get("references", []), "checked": entry.get("checked")},
                "terminology": metadata["sources"].get("ta2"),
                "importer": {"version": IMPORTER_VERSION, "batch": batch["name"]},
            },
            "geometry_checks": {
                "host_surface_rms_mm": row["registration"].get("independent_surface_rms_mm"),
                "host_surface_p95_mm": row["registration"].get("independent_surface_p95_mm"),
                "endpoint_distances_to_source_mm": row["endpoint"]["distances_to_source_mm"],
                "guarded_projection_mm": diagnostics.get("guarded_projection_mm"),
                "projected_normal_dot": diagnostics.get("projected_normal_dot"),
                "nearest_projection_mm": diagnostics.get("nearest_projection_mm"),
                "nearest_normal_dot": diagnostics.get("nearest_normal_dot"),
                "alignment_start_sensitivity_mm": diagnostics.get("alignment_start_sensitivity_mm"),
                "anchor_reconstruction_m": error,
                "note": "Engineering diagnostics only; not anatomical accuracy.",
            },
        })
    return {"batch": batch["name"], "selected": len(selected), "inserts": inserts, "already_imported": already,
            "blocked": blocked, "plan_sha256": sha256_json([[i["candidate_key"], i["content_sha256"]] for i in inserts])}


# ---------------------------------------------------------------- database

def connect(env_name):
    url = os.environ.get(env_name)
    if not url:
        raise ImportFailure(f"Set {env_name} to a PostgreSQL connection string (it is never printed or stored).")
    import psycopg
    from psycopg.rows import dict_row
    connection = psycopg.connect(url, row_factory=dict_row, autocommit=False)
    host = connection.info.host or ""
    local = host in ("localhost", "127.0.0.1", "::1") or host.startswith("/")
    return connection, local, host


def database_label(local, host):
    return "local PostgreSQL" if local else (f"Supabase project {PROJECT_REF}" if PROJECT_REF in host else "remote PostgreSQL")


def require_write_confirmation(local, host, confirm):
    """Writing anywhere but a local server needs the project named explicitly, and the URL must point at it."""
    if local:
        return
    if confirm != PROJECT_REF:
        raise ImportFailure(f"Writing to {database_label(local, host)} needs --confirm-project {PROJECT_REF}")
    if PROJECT_REF not in host:
        raise ImportFailure(f"The database URL does not point at project {PROJECT_REF}")


def apply_plan(connection, candidates, metadata, site, batch, args):
    meshes = sorted(set(batch["structures"]))
    with connection.transaction():
        cur = connection.cursor()
        cur.execute("set local lock_timeout='5s'")
        cur.execute("set local statement_timeout='120s'")
        cur.execute("select pg_advisory_xact_lock(hashtextextended('anatomygo-import:z-anatomy',0))")
        cur.execute("select id from public.pg_structures where id=any(%s) for share", (meshes,))
        state = database_state(cur, meshes, landmark_ids(candidates, batch))
        if not state.imports_table:
            raise ImportFailure("playground_private.imports is missing: apply supabase/migrations/202610070001_import_provenance.sql first")
        plan = make_plan(candidates, metadata, state, site, batch, args.structure, args.feature)
        if args.expect_plan and plan["plan_sha256"] != args.expect_plan:
            raise ImportFailure(f"The plan changed since the dry run ({plan['plan_sha256']}); review it again")
        if len(plan["inserts"]) > args.max:
            raise ImportFailure(f"{len(plan['inserts'])} inserts exceed the batch limit of {args.max}")
        cur.execute("select id,published_proposal from public.pg_landmarks where mesh_id=any(%s) order by id", (meshes,))
        published_before = cur.fetchall()
        for item in plan["inserts"]:
            c = item["content"]
            if item["created_landmark"]:
                cur.execute("insert into public.pg_landmarks(id,mesh_id,label,latin_name,description) values(%s,%s,%s,%s,%s) "
                            "on conflict(id) do nothing", (c["landmark_id"], c["mesh_id"], c["label"], c["latin_name"], c["description"]))
                if cur.rowcount == 0:
                    cur.execute("select mesh_id,label from public.pg_landmarks where id=%s", (c["landmark_id"],))
                    existing = cur.fetchone()
                    if (existing["mesh_id"], existing["label"]) != (c["mesh_id"], c["label"]):
                        raise ImportFailure(f"Landmark {c['landmark_id']} exists with different content")
            # The validate_anchor trigger checks geometry, triangle range and host again.
            cur.execute("insert into public.pg_proposals(id,landmark_id,mesh_id,author_id,label,latin_name,description,geometry,"
                        "triangle,u,v,status,request_id,request_body) values(%s,%s,%s,null,%s,%s,%s,%s,%s,%s,%s,'community',%s,%s) "
                        "on conflict(id) do nothing",
                        (item["proposal_id"], c["landmark_id"], c["mesh_id"], c["label"], c["latin_name"], c["description"],
                         c["geometry"], c["triangle"], c["u"], c["v"], item["request_id"], json.dumps({"import": SOURCE})))
            if cur.rowcount == 0:
                raise ImportFailure(f"Proposal {item['proposal_id']} already exists without an import record")
            cur.execute("insert into playground_private.imports(candidate_key,source,batch,proposal_id,landmark_id,created_landmark,"
                        "content_sha256,provenance,geometry_checks) values(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                        (item["candidate_key"], SOURCE, batch["name"], item["proposal_id"], c["landmark_id"], item["created_landmark"],
                         item["content_sha256"], json.dumps(item["provenance"]), json.dumps(item["geometry_checks"])))
        cur.execute("select id,published_proposal from public.pg_landmarks where mesh_id=any(%s) and id=any(%s) order by id",
                    (meshes, [r["id"] for r in published_before]))
        if cur.fetchall() != published_before:
            raise ImportFailure("Publication pointers changed during the import; rolled back")
        cur.execute("select count(*) as n from public.pg_proposals p join playground_private.imports i on i.proposal_id=p.id "
                    "where i.candidate_key=any(%s) and p.author_id is null and p.status='community'",
                    ([i["candidate_key"] for i in plan["inserts"]],))
        if cur.fetchone()["n"] != len(plan["inserts"]):
            raise ImportFailure("Written rows do not match the plan; rolled back")
    return plan


def landmark_ids(candidates, batch):
    return sorted({new_landmark_id(c["target"]["mesh_id"], c["label"]) for c in candidates
                   if c["target"].get("mesh_id") in batch["structures"]})


# ---------------------------------------------------------------- read-only state file and SQL for the dashboard

def sql_literal(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ImportFailure("Refusing to write a non-finite number")
        return repr(value)  # shortest form that round-trips exactly to double precision
    if isinstance(value, (dict, list)):
        return sql_literal(json.dumps(value, ensure_ascii=False, sort_keys=True)) + "::jsonb"
    return "'" + str(value).replace("'", "''") + "'"


def sql_array(values, kind):
    return "array[" + ",".join(sql_literal(v) for v in values) + f"]::{kind}[]" if values else f"'{{}}'::{kind}[]"


def state_queries(meshes, landmark_ids):
    """Two read-only queries whose JSON results, saved together, stand in for a live connection."""
    m, ids = sql_array(meshes, "text"), sql_array(landmark_ids, "text")
    main = ("select jsonb_build_object("
            f"'structures', coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from (select id,name,geometry,mesh_digest,triangle_count,invalid_triangles from public.pg_structures where id=any({m})) s),'[]'),"
            f"'landmarks', coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from (select id,mesh_id,label,latin_name,description,published_proposal,archived from public.pg_landmarks where mesh_id=any({m}) or id=any({ids})) l),'[]'),"
            f"'proposals', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from (select id,landmark_id,mesh_id,geometry,triangle,u,v,status,author_id from public.pg_proposals where mesh_id=any({m})) p),'[]'),"
            f"'requested_meshes', to_jsonb({m}), 'imports_table', to_regclass('playground_private.imports') is not null) as state;")
    imports = ("select coalesce(jsonb_agg(to_jsonb(i) order by i.candidate_key),'[]') as imports from (select candidate_key,batch,proposal_id,"
               f"landmark_id,content_sha256,created_landmark from playground_private.imports where source={sql_literal(SOURCE)}) i;")
    return main, imports


def load_state_file(path):
    """{"origin", "structures", "landmarks", "proposals", "imports_table", "imports"} saved from state_queries()."""
    data = json.loads(Path(path).read_text())
    present = bool(data.get("imports_table"))
    if present and data.get("imports") is None:
        raise ImportFailure("The state file lacks the imports query result although the table exists")
    imports = {i["candidate_key"]: i for i in (data.get("imports") or [])} if present else {}
    state = State(data.get("origin") or f"state file {path}", {s["id"]: s for s in data["structures"]},
                  data["landmarks"], data["proposals"], imports, present)
    state.requested_meshes = data.get("requested_meshes") or []
    return state


def emit_sql(plan, state):
    """One atomic statement for the SQL editor that re-checks the dry run's assumptions on the server.

    It stops without writing if geometry, a reused landmark's text or any candidate changed since the
    dry run, if any part is already imported, or if a publication pointer would move.
    """
    inserts = plan["inserts"]
    if not inserts:
        raise ImportFailure("Nothing to write for this batch")
    keys = [i["candidate_key"] for i in inserts]
    proposal_ids = [i["proposal_id"] for i in inserts]
    meshes = sorted({i["content"]["mesh_id"] for i in inserts})
    new = [i for i in inserts if i["created_landmark"]]
    new_ids = [i["content"]["landmark_id"] for i in new]
    reused = sorted({i["content"]["landmark_id"] for i in inserts if not i["created_landmark"]})
    by_id = {l["id"]: l for l in state.landmarks}
    rows = lambda items: ",\n    ".join("(" + ",".join(sql_literal(v) for v in item) + ")" for item in items)
    structures = [(m, state.structures[m]["geometry"], state.structures[m]["mesh_digest"]) for m in meshes]
    landmarks = [(l, by_id[l]["mesh_id"], by_id[l]["label"], by_id[l]["latin_name"], by_id[l]["description"]) for l in reused]
    lines = [
        f"-- AnatomyGo · Z-Anatomy import · batch {plan['batch']} · plan {plan['plan_sha256']}",
        f"-- Generated {datetime.now(timezone.utc).isoformat(timespec='seconds')} from: {state.origin}",
        f"-- Writes {len(inserts)} unreviewed community proposals and {len(new)} new landmarks as ONE statement:",
        "-- all of it or nothing. Running it a second time stops with \"already imported\" and writes nothing.",
        "do $zimport$",
        "declare published_before jsonb; written integer;",
        "begin",
        "  perform set_config('lock_timeout','5s',true);",
        "  perform pg_advisory_xact_lock(hashtextextended('anatomygo-import:z-anatomy',0));",
        "  if to_regclass('playground_private.imports') is null then",
        "    raise exception 'Apply supabase/migrations/202610070001_import_provenance.sql first'; end if;",
        "  if exists(select 1 from (values\n    " + rows(structures) + "\n  ) v(id,geometry,digest) left join public.pg_structures s on s.id=v.id",
        "    where s.id is null or s.geometry<>v.geometry or s.mesh_digest<>v.digest) then",
        "    raise exception 'Structure geometry changed since the dry run. Nothing was written; run the dry run again.'; end if;",
    ]
    if landmarks:
        lines += [
            "  if exists(select 1 from (values\n    " + rows(landmarks) + "\n  ) v(id,mesh_id,label,latin_name,description) left join public.pg_landmarks l on l.id=v.id",
            "    where l.id is null or l.archived or l.mesh_id<>v.mesh_id or l.label<>v.label or l.latin_name<>v.latin_name or l.description<>v.description) then",
            "    raise exception 'A reused landmark changed since the dry run. Nothing was written; run the dry run again.'; end if;",
        ]
    lines += [
        f"  if exists(select 1 from playground_private.imports where candidate_key=any({sql_array(keys, 'text')}))",
        f"     or exists(select 1 from public.pg_proposals where id=any({sql_array(proposal_ids, 'uuid')}))",
        f"     or exists(select 1 from public.pg_landmarks where id=any({sql_array(new_ids, 'text')})) then",
        "    raise exception 'Part of this batch is already imported. Nothing was written; run the dry run again.'; end if;",
        f"  select coalesce(jsonb_object_agg(id,published_proposal),'{{}}') into published_before from public.pg_landmarks where mesh_id=any({sql_array(meshes, 'text')});",
    ]
    if new:
        lines.append("  insert into public.pg_landmarks(id,mesh_id,label,latin_name,description) values\n    " + rows(
            (i["content"]["landmark_id"], i["content"]["mesh_id"], i["content"]["label"], i["content"]["latin_name"],
             i["content"]["description"]) for i in new) + ";")
    lines.append("  insert into public.pg_proposals(id,landmark_id,mesh_id,author_id,label,latin_name,description,geometry,triangle,u,v,status,request_id,request_body) values\n    " + rows(
        (i["proposal_id"], i["content"]["landmark_id"], i["content"]["mesh_id"], None, i["content"]["label"], i["content"]["latin_name"],
         i["content"]["description"], i["content"]["geometry"], i["content"]["triangle"], i["content"]["u"], i["content"]["v"],
         "community", i["request_id"], {"import": SOURCE}) for i in inserts) + ";")
    lines.append("  insert into playground_private.imports(candidate_key,source,batch,proposal_id,landmark_id,created_landmark,content_sha256,provenance,geometry_checks) values\n    " + rows(
        (i["candidate_key"], SOURCE, plan["batch"], i["proposal_id"], i["content"]["landmark_id"], i["created_landmark"],
         i["content_sha256"], i["provenance"], i["geometry_checks"]) for i in inserts) + ";")
    lines += [
        f"  if (select coalesce(jsonb_object_agg(id,published_proposal),'{{}}') from public.pg_landmarks where mesh_id=any({sql_array(meshes, 'text')}) and id<>all({sql_array(new_ids, 'text')}))",
        "     is distinct from published_before then raise exception 'Publication pointers changed; rolled back'; end if;",
        "  select count(*) into written from public.pg_proposals p join playground_private.imports i on i.proposal_id=p.id",
        f"   where i.candidate_key=any({sql_array(keys, 'text')}) and p.author_id is null and p.status='community';",
        f"  if written<>{len(inserts)} then raise exception 'Expected {len(inserts)} imported proposals, found %; rolled back', written; end if;",
        f"  raise notice 'Imported {len(inserts)} proposals ({len(new)} new landmarks) for batch {plan['batch']}';",
        "end",
        "$zimport$;",
    ]
    text = "\n".join(lines) + "\n"
    if text.count("$zimport$") != 2:
        raise ImportFailure("Imported text collides with the SQL quoting delimiter")
    return text


# ---------------------------------------------------------------- ledger

def ledger(candidates, metadata, batches, imports, origin):
    """Per-structure progress. Imported counts come from the database import records only."""
    imported_by_key = imports
    structures = {}
    for row in candidates:
        mesh = row["target"].get("mesh_id") or f"unmatched:{row['host']}"
        s = structures.setdefault(mesh, {"name": row["target"].get("name"), "source_host": row["host"],
                                         "discovered": 0, "matched": 0, "extracted": 0, "blocked": 0,
                                         "metadata_ready": 0, "imported": 0 if imported_by_key is not None else None,
                                         "reasons": {}})
        s["discovered"] += 1
        matched = bool(row["target"].get("mesh_id")) and not any(r.startswith(("ambiguous_target", "no_target", "side_conflict"))
                                                                for r in row["reasons"])
        s["matched"] += matched
        if row["status"] != "extracted":
            s["blocked"] += 1
            code = (row["reasons"] or ["blocked"])[0].split(":")[0]
            s["reasons"][code] = s["reasons"].get(code, 0) + 1
            continue
        s["extracted"] += 1
        entry = metadata["features"].get(f"{row['bone']}|{row['label']}", {})
        if entry.get("latin") and entry.get("description"):
            s["metadata_ready"] += 1
        else:
            s["blocked"] += 1
            s["reasons"]["metadata_missing"] = s["reasons"].get("metadata_missing", 0) + 1
        if imported_by_key is not None and row.get("anchor") and candidate_key(row) in imported_by_key:
            s["imported"] += 1
    totals = {k: sum((s[k] or 0) for s in structures.values()) for k in
              ("discovered", "matched", "extracted", "blocked", "metadata_ready", "imported")}
    if imported_by_key is None:
        totals["imported"] = None
    reasons = {}
    for s in structures.values():
        for code, n in s["reasons"].items():
            reasons[code] = reasons.get(code, 0) + n
    applied = {r["batch"] for r in (imports or {}).values()}
    upcoming = [b["name"] for b in batches if b["name"] not in applied]
    return {"source": SOURCE, "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "imported_counts_from": origin, "definitions": {
                "discovered": "Source annotations on a host whose name matches an AnatomyGo structure",
                "matched": "Host resolved to exactly one target structure with consistent side",
                "extracted": "Point-like feature with a resolved endpoint and a surface anchor passing the geometric gates",
                "blocked": "Not importable now; see reasons (geometry, attachment type, endpoint, metadata)",
                "metadata_ready": "Extracted, with a Latin name and a checked biology description",
                "imported": "Proposal recorded in playground_private.imports (database), or null when not connected"},
            "totals": totals, "reasons": dict(sorted(reasons.items(), key=lambda x: -x[1])),
            "batches_applied": sorted(applied), "next_batch": upcoming[0] if upcoming else None,
            "structures": dict(sorted(structures.items()))}


# ---------------------------------------------------------------- command line

def print_plan(plan, origin):
    print(f"Batch {plan['batch']} against {origin}")
    print(f"  selected candidates: {plan['selected']}")
    print(f"  proposals to insert: {len(plan['inserts'])} "
          f"(new landmarks: {sum(i['created_landmark'] for i in plan['inserts'])})")
    for i in plan["inserts"]:
        c = i["content"]
        where = "new landmark" if i["created_landmark"] else f"landmark {c['landmark_id']} ({i['landmark_match']})"
        print(f"    + {c['mesh_id']} {c['label']!r} [{c['latin_name']}] -> {where}; triangle {c['triangle']}")
    print(f"  already imported: {len(plan['already_imported'])}")
    counts = {}
    for b in plan["blocked"]:
        counts[b["reason"]] = counts.get(b["reason"], 0) + 1
    print(f"  blocked: {len(plan['blocked'])} {json.dumps(counts)}")
    print(f"  plan sha256: {plan['plan_sha256']}")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--candidates", type=Path, required=True, help="z_anatomy_candidates.py output directory")
    parser.add_argument("--metadata", type=Path, default=IMPORT_DIR / "metadata.json")
    parser.add_argument("--batches", type=Path, default=IMPORT_DIR / "batches.json")
    parser.add_argument("--batch", help="Batch name from the batch file (default: the next unapplied batch)")
    parser.add_argument("--structure", action="append", help="Limit to these mesh IDs within the batch")
    parser.add_argument("--feature", action="append", help="Limit to these feature labels within the batch")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Plan only (default)")
    mode.add_argument("--apply", action="store_true", help="Write the batch in one transaction")
    mode.add_argument("--reconcile", action="store_true", help="Rebuild the ledger from database import records")
    parser.add_argument("--snapshot", action="store_true", help="Plan offline against public/playground-seed.json")
    parser.add_argument("--database-url-env", default="ANATOMYGO_IMPORT_DATABASE_URL")
    parser.add_argument("--confirm-project", help=f"Required to write to a hosted database; must be {PROJECT_REF}")
    parser.add_argument("--expect-plan", help="Refuse to apply unless the plan hash matches this dry-run hash")
    parser.add_argument("--max", type=int, default=MAX_BATCH, help="Largest batch allowed")
    parser.add_argument("--ledger", type=Path, default=IMPORT_DIR / "ledger.json")
    parser.add_argument("--write-ledger", action="store_true", help="Also write the ledger after a dry run")
    parser.add_argument("--plan-out", type=Path, help="Write the full plan (including blockers) as JSON")
    parser.add_argument("--print-state-query", action="store_true",
                        help="Print the read-only SQL whose saved results make a --state-file, then stop")
    parser.add_argument("--state-file", type=Path, help="Plan against live rows saved from --print-state-query")
    parser.add_argument("--emit-sql", type=Path, help="Dry run only: write the batch as one guarded SQL statement for the SQL editor")
    args = parser.parse_args(argv)

    candidates = load_candidates(args.candidates)
    metadata = json.loads(args.metadata.read_text())
    batches = load_batches(args.batches)
    site = SiteModel(ROOT)
    if args.print_state_query:
        batch = select_batch(batches, args.batch, set())
        for query in state_queries(sorted(set(batch["structures"])), landmark_ids(candidates, batch)):
            print(query)
        return None
    if args.snapshot and args.state_file:
        raise ImportFailure("Use either --snapshot or --state-file")
    offline = args.snapshot or args.state_file is not None
    if offline and args.apply:
        raise ImportFailure("--apply needs a database connection; use --emit-sql for the SQL editor instead")
    if args.snapshot and (args.reconcile or args.emit_sql):
        raise ImportFailure("--reconcile and --emit-sql need live data, not the offline --snapshot")
    if args.emit_sql and (args.apply or args.reconcile):
        raise ImportFailure("--emit-sql is a dry-run output")
    connection = local = host = None
    if not offline:
        connection, local, host = connect(args.database_url_env)
    try:
        if args.apply:
            require_write_confirmation(local, host, args.confirm_project)
        return run(args, connection, database_label(local, host) if connection else None, candidates, metadata, batches, site)
    finally:
        if connection:
            connection.close()


def select_batch(batches, name, applied):
    name = name or next((b["name"] for b in batches if b["name"] not in applied), None)
    batch = next((b for b in batches if b["name"] == name), None)
    if batch is None:
        raise ImportFailure(f"Unknown batch {name!r}" if name else "Every batch has been applied")
    return batch


def run(args, connection, origin, candidates, metadata, batches, site):
    saved = load_state_file(args.state_file) if args.state_file else None
    imports = None
    if saved:
        origin, imports = saved.origin, saved.imports
    elif connection:
        with connection.cursor() as cur:
            cur.execute("select to_regclass('playground_private.imports') is not null as present")
            if cur.fetchone()["present"]:
                cur.execute("select candidate_key,batch,proposal_id,content_sha256 from playground_private.imports where source=%s", (SOURCE,))
                imports = {r["candidate_key"]: r for r in cur.fetchall()}
        connection.rollback()
    if args.reconcile:
        result = ledger(candidates, metadata, batches, imports or {}, origin)
        args.ledger.write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n")
        print(json.dumps(result["totals"]))
        return result

    batch = select_batch(batches, args.batch, {r["batch"] for r in (imports or {}).values()})
    meshes = sorted(set(batch["structures"]))
    if args.apply:
        plan = apply_plan(connection, candidates, metadata, site, batch, args)
        print_plan(plan, origin + " (APPLIED)")
        cur = connection.cursor()
        cur.execute("select candidate_key,batch,proposal_id,content_sha256 from playground_private.imports where source=%s", (SOURCE,))
        imports = {r["candidate_key"]: r for r in cur.fetchall()}
        connection.rollback()
    else:
        if saved:
            if not set(meshes) <= set(saved.requested_meshes):
                raise ImportFailure(f"The state file was saved for other structures; print the query for batch {batch['name']}")
            state = saved
        elif connection:
            with connection.cursor() as cur:
                state = database_state(cur, meshes, landmark_ids(candidates, batch))
            connection.rollback()
        else:
            state = snapshot_state(ROOT, meshes)
            origin = state.origin
        plan = make_plan(candidates, metadata, state, site, batch, args.structure, args.feature)
        print_plan(plan, origin + " (DRY RUN, nothing written)")
        if args.emit_sql:
            if args.expect_plan and plan["plan_sha256"] != args.expect_plan:
                raise ImportFailure(f"The plan changed since the dry run ({plan['plan_sha256']}); review it again")
            if len(plan["inserts"]) > args.max:
                raise ImportFailure(f"{len(plan['inserts'])} inserts exceed the batch limit of {args.max}")
            args.emit_sql.write_text(emit_sql(plan, state))
            print(f"  SQL for the SQL editor: {args.emit_sql}")
    if args.plan_out:
        args.plan_out.write_text(json.dumps(plan, indent=1, ensure_ascii=False) + "\n")
    if args.apply or args.write_ledger:
        result = ledger(candidates, metadata, batches, imports, origin)
        args.ledger.write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n")
    return plan


if __name__ == "__main__":
    try:
        main()
        sys.exit(0)
    except ImportFailure as error:
        print(f"import-z-anatomy: {error}", file=sys.stderr)
        sys.exit(2)
