"""Importer checks against a disposable local PostgreSQL database built from the real migrations.

Run: PGHOST=127.0.0.1 PGPORT=… PGUSER=… python -m pytest scripts/tests/test_import_z_anatomy.py
Never point these at a hosted database: every test creates and drops its own database.
"""
import importlib.util
import json
import math
import os
import subprocess
import uuid
from pathlib import Path

import pytest

psycopg = pytest.importorskip("psycopg")
from psycopg.rows import dict_row  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("import_z_anatomy", ROOT / "scripts/import-z-anatomy.py")
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)

MESH = "FJ3152"
SOURCE_SHA = "9" * 64
OTHER_PROPOSAL = "aaaaaaaa-0000-4000-8000-000000000001"
USER = "00000000-0000-0000-0000-0000000000a1"


def local_server():
    host = os.environ.get("PGHOST", "")
    return host in ("localhost", "127.0.0.1") or host.startswith("/")


pytestmark = pytest.mark.skipif(not local_server(), reason="Set PGHOST to a local PostgreSQL server")


@pytest.fixture
def database(tmp_path, monkeypatch):
    name = f"zimport_{uuid.uuid4().hex[:10]}"
    with psycopg.connect(dbname="postgres", autocommit=True) as admin:
        admin.execute(f'create database "{name}"')
    try:
        files = [ROOT / "supabase/tests/bootstrap.sql", *sorted((ROOT / "supabase/migrations").glob("*.sql"))]
        for path in files:
            subprocess.run(["psql", "-q", "-d", name, "-v", "ON_ERROR_STOP=1", "-f", str(path)], check=True,
                           capture_output=True)
        url = psycopg.conninfo.make_conninfo(dbname=name)
        monkeypatch.setenv("ANATOMYGO_IMPORT_DATABASE_URL", url)
        with psycopg.connect(url, row_factory=dict_row, autocommit=True) as db:
            seed(db)
            yield db
    finally:
        with psycopg.connect(dbname="postgres", autocommit=True) as admin:
            admin.execute(f'drop database if exists "{name}" with (force)')


def seed(db):
    site = importer.SiteModel(ROOT)
    part = site.parts[MESH]
    info = site.manifest["meshes"][MESH]
    db.execute("insert into public.pg_structures values(%s,%s,'skeletal',%s,%s,%s,%s)",
               (MESH, part["name"], site.manifest["geometry"], info["digest"], part["indexCount"] // 3, info["invalidTriangles"]))
    for lid, label, latin, description in [
        ("hip-asis", "Anterior superior iliac spine", "Spina iliaca anterior superior", ""),
        ("hip-notch", "Greater sciatic notch", "Incisura ischiadica major", "Existing notch text."),
        ("hip-spine", "Ischial spine", "Spina ischiadica", "Existing spine text."),
    ]:
        db.execute("insert into public.pg_landmarks(id,mesh_id,label,latin_name,description) values(%s,%s,%s,%s,%s)",
                   (lid, MESH, label, latin, description))
    # An existing community placement with a vote, a comment and a publication pointer must survive untouched.
    db.execute("insert into auth.users values(%s)", (USER,))
    db.execute("insert into public.pg_profiles values(%s,'Existing contributor')", (USER,))
    db.execute("insert into public.pg_proposals(id,landmark_id,mesh_id,author_id,label,latin_name,description,geometry,triangle,u,v,"
               "request_id,request_body) values(%s,'hip-notch',%s,null,'Greater sciatic notch','Incisura ischiadica major',"
               "'Existing notch text.',%s,10,.2,.2,%s,'{}')", (OTHER_PROPOSAL, MESH, site.manifest["geometry"], str(uuid.uuid4())))
    db.execute("insert into public.pg_votes values(%s,%s,1)", (OTHER_PROPOSAL, USER))
    db.execute("insert into public.pg_comments(proposal_id,author_id,body,request_id) values(%s,%s,'Looks right',%s)",
               (OTHER_PROPOSAL, USER, str(uuid.uuid4())))
    db.execute("update public.pg_landmarks set published_proposal=%s where id='hip-notch'", (OTHER_PROPOSAL,))


def annotation(site, label, triangle, u=.25, v=.25, **changes):
    item = {"object": f"{label}.j", "source_name": label, "label": label, "suffix": ".j", "inconstant": False,
            "nonstandard_term": False, "feature_class": "point", "feature_class_reason": "test", "status": "extracted",
            "reasons": [], "anatomical_status": "not_reviewed",
            "endpoint": {"distances_to_source_mm": [.02, 20.0], "attached_index": 0, "method": "hook+distance"},
            "anchor": {"mesh_id": MESH, "geometry": site.manifest["geometry"], "triangle": triangle, "u": u, "v": v},
            "diagnostics": {"projected_xyz": site.point(MESH, triangle, u, v), "guarded_projection_mm": 1.0,
                            "projected_normal_dot": .9, "nearest_projection_mm": 1.0, "nearest_normal_dot": .9,
                            "alignment_start_sensitivity_mm": 2.0, "target_side": "right"}}
    item.update(changes)
    return item


def write_inputs(tmp_path, annotations, features=None):
    site = importer.SiteModel(ROOT)
    record = {"method_version": 3, "settings_sha256": "s" * 64, "source_sha256": SOURCE_SHA, "source_host": "Hip bone.r",
              "side": "right", "cache_key": "c" * 64,
              "target": {"mesh_id": MESH, "name": "Right hip bone", "system": "skeletal", "geometry": site.manifest["geometry"],
                         "digest": site.manifest["meshes"][MESH]["digest"]},
              "registration": {"gate": "pass", "independent_surface_rms_mm": 2.0, "independent_surface_p95_mm": 4.0},
              "annotations": annotations}
    candidates = tmp_path / "candidates"
    candidates.mkdir(exist_ok=True)
    (candidates / "Hip_bone_r.json").write_text(json.dumps(record))
    entries = {f"Hip bone|{a['label']}": {"latin": "Latin " + a["label"], "latin_source": "TA2 test",
                                         "description": f"Checked description of the {a['label'].lower()}.",
                                         "references": ["test"], "checked": "2026-10-06"} for a in annotations}
    entries.update(features or {})
    metadata = {"schema": 1, "sources": {"z_anatomy": {"name": "Z-Anatomy", "license": "CC BY-SA 4.0"}, "ta2": {"name": "TA2"}},
                "features": entries}
    (tmp_path / "metadata.json").write_text(json.dumps(metadata))
    (tmp_path / "batches.json").write_text(json.dumps({"batches": [{"name": "test-hip", "structures": [MESH]}]}))
    return candidates


def run(tmp_path, *extra):
    argv = ["--candidates", str(tmp_path / "candidates"), "--metadata", str(tmp_path / "metadata.json"),
            "--batches", str(tmp_path / "batches.json"), "--ledger", str(tmp_path / "ledger.json"), "--batch", "test-hip", *extra]
    return importer.main(argv)


def snapshot(db):
    return {
        "landmarks": db.execute("select id,mesh_id,label,latin_name,description,published_proposal,archived from public.pg_landmarks order by id").fetchall(),
        "proposals": db.execute("select id,landmark_id,label,triangle,u,v,status,author_id from public.pg_proposals order by id").fetchall(),
        "votes": db.execute("select * from public.pg_votes order by proposal_id").fetchall(),
        "comments": db.execute("select id,body,hidden from public.pg_comments order by id").fetchall(),
        "imports": db.execute("select candidate_key,proposal_id,content_sha256 from playground_private.imports order by 1").fetchall(),
    }


def three(site):
    return [annotation(site, "Anterior superior iliac spine", 100), annotation(site, "Greater sciatic notch", 200),
            annotation(site, "Iliac tubercle", 300)]


def test_dry_run_plans_but_writes_nothing(database, tmp_path):
    write_inputs(tmp_path, three(importer.SiteModel(ROOT)))
    before = snapshot(database)
    plan = run(tmp_path)
    assert [i["created_landmark"] for i in plan["inserts"]] == [False, False, True]
    assert snapshot(database) == before


def test_apply_once_then_rerun_creates_no_duplicates(database, tmp_path):
    write_inputs(tmp_path, three(importer.SiteModel(ROOT)))
    before = snapshot(database)
    plan = run(tmp_path, "--apply")
    assert len(plan["inserts"]) == 3
    after = snapshot(database)
    imported = database.execute("select p.*, i.anatomical_review, i.provenance, i.geometry_checks from public.pg_proposals p "
                                "join playground_private.imports i on i.proposal_id=p.id order by p.label").fetchall()
    assert len(imported) == 3
    assert all(r["author_id"] is None and r["status"] == "community" and r["anatomical_review"] == "not_reviewed" for r in imported)
    assert all(r["request_body"] == {"import": "z-anatomy"} for r in imported)
    assert all(r["geometry_checks"]["note"].startswith("Engineering diagnostics") for r in imported)
    asis = next(r for r in imported if r["label"] == "Anterior superior iliac spine")
    assert asis["landmark_id"] == "hip-asis"
    assert asis["description"] == "Checked description of the anterior superior iliac spine."  # existing text was empty
    notch = next(r for r in imported if r["label"] == "Greater sciatic notch")
    assert notch["description"] == "Existing notch text." and notch["latin_name"] == "Incisura ischiadica major"
    assert database.execute("select 1 from public.pg_landmarks where id='z-fj3152-iliac-tubercle'").fetchone()
    # Existing contributions and publication are untouched.
    for table in ("votes", "comments"):
        assert after[table] == before[table]
    assert [l for l in after["landmarks"] if l["id"] in {"hip-asis", "hip-notch", "hip-spine"}] == before["landmarks"]
    assert next(p for p in after["proposals"] if str(p["id"]) == OTHER_PROPOSAL) == next(p for p in before["proposals"] if str(p["id"]) == OTHER_PROPOSAL)
    # Rerun: everything is already imported; zero writes.
    again = run(tmp_path, "--apply")
    assert again["inserts"] == [] and len(again["already_imported"]) == 3
    assert snapshot(database) == after
    ledger = json.loads((tmp_path / "ledger.json").read_text())
    assert ledger["totals"]["imported"] == 3 and ledger["structures"][MESH]["imported"] == 3


def test_interrupted_batch_rolls_back_then_resumes(database, tmp_path):
    write_inputs(tmp_path, three(importer.SiteModel(ROOT)))
    before = snapshot(database)
    database.execute("""create function public.fail_third() returns trigger language plpgsql as $$
        begin if new.label='Iliac tubercle' then raise exception 'simulated interruption'; end if; return new; end $$;
        create trigger fail_third before insert on public.pg_proposals for each row execute function public.fail_third();""")
    with pytest.raises(psycopg.errors.RaiseException, match="simulated interruption"):
        run(tmp_path, "--apply")
    assert snapshot(database) == before  # the two earlier inserts and the new landmark were rolled back
    database.execute("drop trigger fail_third on public.pg_proposals")
    plan = run(tmp_path, "--apply")
    assert len(plan["inserts"]) == 3
    assert database.execute("select count(*) as n from playground_private.imports").fetchone()["n"] == 3
    assert run(tmp_path, "--apply")["inserts"] == []


def test_ambiguous_landmark_match_is_blocked(database, tmp_path):
    database.execute("insert into public.pg_landmarks(id,mesh_id,label) values('hip-spine-2',%s,'Spine (ischial)')", (MESH,))
    write_inputs(tmp_path, [annotation(importer.SiteModel(ROOT), "Ischial spine", 100)])
    plan = run(tmp_path)
    assert plan["inserts"] == []
    assert plan["blocked"][0]["reason"] == "ambiguous_landmark_match"
    assert "hip-spine" in plan["blocked"][0]["detail"] and "hip-spine-2" in plan["blocked"][0]["detail"]


def test_archived_match_is_not_reused_or_duplicated(database, tmp_path):
    database.execute("update public.pg_landmarks set archived=true where id='hip-spine'")
    write_inputs(tmp_path, [annotation(importer.SiteModel(ROOT), "Ischial spine", 100)])
    assert run(tmp_path)["blocked"][0]["reason"] == "archived_landmark_match"


def test_stale_geometry_is_blocked(database, tmp_path):
    site = importer.SiteModel(ROOT)
    stale_candidate = annotation(site, "Anterior superior iliac spine", 100)
    stale_candidate["anchor"] = {**stale_candidate["anchor"], "geometry": "0" * 64}
    write_inputs(tmp_path, [stale_candidate])
    assert run(tmp_path)["blocked"][0]["reason"] == "stale_geometry"
    write_inputs(tmp_path, [annotation(site, "Anterior superior iliac spine", 100)])
    database.execute("update public.pg_structures set mesh_digest=%s where id=%s", ("f" * 64, MESH))
    assert run(tmp_path)["blocked"][0]["reason"] == "stale_geometry"


@pytest.mark.parametrize("anchor_change, expected", [
    ({"u": math.nan}, "malformed_anchor"),
    ({"triangle": 10 ** 6}, "malformed_anchor"),
    ({"triangle": 5.0}, "malformed_anchor"),
    ({"u": .7, "v": .6}, "malformed_anchor"),
    ({"u": -.1}, "malformed_anchor"),
    ({"triangle": 7, "u": .3}, "anchor_reconstruction"),  # anchor no longer rebuilds the candidate's point
])
def test_malformed_anchors_are_blocked(database, tmp_path, anchor_change, expected):
    item = annotation(importer.SiteModel(ROOT), "Anterior superior iliac spine", 5)
    item["anchor"] = {**item["anchor"], **anchor_change}
    write_inputs(tmp_path, [item])
    plan = run(tmp_path)
    assert plan["inserts"] == [] and plan["blocked"][0]["reason"] == expected


def test_degenerate_triangle_is_blocked(database, tmp_path):
    database.execute("update public.pg_structures set invalid_triangles=array[100] where id=%s", (MESH,))
    write_inputs(tmp_path, [annotation(importer.SiteModel(ROOT), "Anterior superior iliac spine", 100)])
    assert run(tmp_path)["blocked"][0]["reason"] == "malformed_anchor"


def test_changed_candidate_after_import_is_reported_not_overwritten(database, tmp_path):
    site = importer.SiteModel(ROOT)
    write_inputs(tmp_path, [annotation(site, "Anterior superior iliac spine", 100)])
    run(tmp_path, "--apply")
    after = snapshot(database)
    write_inputs(tmp_path, [annotation(site, "Anterior superior iliac spine", 101)])
    plan = run(tmp_path, "--apply")
    assert plan["inserts"] == [] and plan["blocked"][0]["reason"] == "imported_content_differs"
    assert snapshot(database) == after


def test_blocked_research_reasons_and_missing_metadata_stay_out(database, tmp_path):
    site = importer.SiteModel(ROOT)
    region = annotation(site, "Iliac fossa", 100, status="blocked", reasons=["unsupported_region: Head noun 'fossa'"])
    no_text = annotation(site, "Iliopubic eminence", 101)
    write_inputs(tmp_path, [region, no_text], {"Hip bone|Iliopubic eminence": {"latin": "Eminentia iliopubica"}})
    plan = run(tmp_path, "--apply")
    assert plan["inserts"] == []
    assert sorted(b["reason"] for b in plan["blocked"]) == ["metadata_missing", "unsupported_region"]
    assert database.execute("select count(*) as n from playground_private.imports").fetchone()["n"] == 0


def test_plan_hash_and_batch_limit_guard_apply(database, tmp_path):
    write_inputs(tmp_path, three(importer.SiteModel(ROOT)))
    with pytest.raises(importer.ImportFailure, match="plan changed"):
        run(tmp_path, "--apply", "--expect-plan", "0" * 64)
    with pytest.raises(importer.ImportFailure, match="exceed the batch limit"):
        run(tmp_path, "--apply", "--max", "2")
    assert database.execute("select count(*) as n from playground_private.imports").fetchone()["n"] == 0
    planned = run(tmp_path)["plan_sha256"]
    assert len(run(tmp_path, "--apply", "--expect-plan", planned)["inserts"]) == 3


def test_reconcile_rebuilds_ledger_from_database(database, tmp_path):
    write_inputs(tmp_path, three(importer.SiteModel(ROOT)))
    run(tmp_path, "--apply")
    (tmp_path / "ledger.json").unlink()
    result = run(tmp_path, "--reconcile")
    assert result["totals"]["imported"] == 3 and result["batches_applied"] == ["test-hip"]


def psql(db, *args):
    """Run SQL the way the MCP and the SQL editor do: as text, outside the importer's own connection."""
    return subprocess.run(["psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", db.info.dbname, *args],
                          capture_output=True, text=True)


def save_state(db, tmp_path, capsys, name="state.json"):
    """Run the printed state queries as an operator would and save their JSON results as a --state-file."""
    capsys.readouterr()
    run(tmp_path, "--print-state-query")
    main_query, imports_query = capsys.readouterr().out.strip().split("\n")
    result = psql(db, "-c", main_query)
    assert result.returncode == 0, result.stderr
    state = json.loads(result.stdout)
    if state["imports_table"]:
        result = psql(db, "-c", imports_query)
        assert result.returncode == 0, result.stderr
        state["imports"] = json.loads(result.stdout)
    else:
        state["imports"] = None
    state["origin"] = "local test database via psql"
    path = tmp_path / name
    path.write_text(json.dumps(state))
    return path


def emit(db, tmp_path, capsys):
    state_file = save_state(db, tmp_path, capsys)
    sql = tmp_path / "batch.sql"
    planned = run(tmp_path, "--state-file", str(state_file))["plan_sha256"]
    plan = run(tmp_path, "--state-file", str(state_file), "--emit-sql", str(sql), "--expect-plan", planned)
    return plan, sql


def awkward(site):
    """Three candidates whose floats and text exercise SQL literal round-tripping."""
    tubercle = annotation(site, "Iliac tubercle", 300, 1 / 3, 0.2718281828459045)
    text = {"Hip bone|Iliac tubercle": {"latin": "Tuberculum iliacum", "references": ["test"], "checked": "2026-10-07",
                                        "description": "The iliac crest's tubercle; 'quoted', $$dollar$$ and 50% survive."}}
    return [annotation(site, "Anterior superior iliac spine", 100), annotation(site, "Greater sciatic notch", 200), tubercle], text


@pytest.mark.parametrize("migrated", [True, False])
def test_state_file_plan_matches_direct_plan(database, tmp_path, capsys, migrated):
    site = importer.SiteModel(ROOT)
    if migrated:
        write_inputs(tmp_path, [annotation(site, "Anterior superior iliac spine", 100)])
        run(tmp_path, "--apply")  # an earlier import that the saved state must report
    else:
        database.execute("drop table playground_private.imports")  # production before the migration
    # The last candidate repeats the existing community placement exactly, so it is a duplicate.
    duplicate = annotation(site, "Greater sciatic notch", 10, .2, .2, object="Greater sciatic notch.dup")
    write_inputs(tmp_path, [*three(site), duplicate])
    direct = run(tmp_path)
    saved = run(tmp_path, "--state-file", str(save_state(database, tmp_path, capsys)))
    assert saved == direct
    assert [b["reason"] for b in direct["blocked"]] == ["duplicate_placement"]
    assert (len(direct["inserts"]), len(direct["already_imported"])) == ((2, 1) if migrated else (3, 0))


def test_state_file_must_cover_the_batch(database, tmp_path, capsys):
    write_inputs(tmp_path, three(importer.SiteModel(ROOT)))
    path = save_state(database, tmp_path, capsys)
    state = json.loads(path.read_text())
    path.write_text(json.dumps({**state, "requested_meshes": ["FJ0000"]}))
    with pytest.raises(importer.ImportFailure, match="saved for other structures"):
        run(tmp_path, "--state-file", str(path))
    path.write_text(json.dumps({**state, "imports_table": True, "imports": None}))
    with pytest.raises(importer.ImportFailure, match="lacks the imports query result"):
        run(tmp_path, "--state-file", str(path))


def test_emitted_sql_imports_once_and_refuses_a_rerun(database, tmp_path, capsys):
    site = importer.SiteModel(ROOT)
    candidates, text = awkward(site)
    write_inputs(tmp_path, candidates, text)
    before = snapshot(database)
    state_file = save_state(database, tmp_path, capsys)
    with pytest.raises(importer.ImportFailure, match="plan changed"):
        run(tmp_path, "--state-file", str(state_file), "--emit-sql", str(tmp_path / "stale.sql"), "--expect-plan", "0" * 64)
    assert not (tmp_path / "stale.sql").exists()
    plan, sql = emit(database, tmp_path, capsys)
    assert snapshot(database) == before  # emitting writes nothing
    assert sql.read_text().count("do $zimport$") == 1

    result = psql(database, "-f", str(sql))
    assert result.returncode == 0, result.stderr
    assert "Imported 3 proposals (1 new landmarks) for batch test-hip" in result.stderr
    after = snapshot(database)
    imported = database.execute("select p.*, i.candidate_key, i.batch, i.content_sha256, i.created_landmark, i.anatomical_review, "
                                "i.provenance, i.geometry_checks from public.pg_proposals p "
                                "join playground_private.imports i on i.proposal_id=p.id").fetchall()
    by_key = {r["candidate_key"]: r for r in imported}
    assert sorted(by_key) == sorted(i["candidate_key"] for i in plan["inserts"])
    for item in plan["inserts"]:
        row, c = by_key[item["candidate_key"]], item["content"]
        assert str(row["id"]) == item["proposal_id"] and str(row["request_id"]) == item["request_id"]
        assert (row["author_id"], row["status"], row["anatomical_review"], row["batch"]) == (None, "community", "not_reviewed", "test-hip")
        assert {k: row[k] for k in ("landmark_id", "mesh_id", "label", "latin_name", "description", "geometry", "triangle", "u", "v")} == \
            {k: c[k] for k in ("landmark_id", "mesh_id", "label", "latin_name", "description", "geometry", "triangle", "u", "v")}
        assert (row["content_sha256"], row["created_landmark"]) == (item["content_sha256"], item["created_landmark"])
        assert row["provenance"] == item["provenance"] and row["geometry_checks"] == item["geometry_checks"]
        assert row["request_body"] == {"import": "z-anatomy"}
    tubercle = next(r for r in imported if r["landmark_id"] == "z-fj3152-iliac-tubercle")
    assert (tubercle["u"], tubercle["v"]) == (1 / 3, 0.2718281828459045)  # floats round-trip exactly
    assert tubercle["description"] == "The iliac crest's tubercle; 'quoted', $$dollar$$ and 50% survive."
    # Existing contributions and publication are untouched.
    assert (after["votes"], after["comments"]) == (before["votes"], before["comments"])
    assert [l for l in after["landmarks"] if l["id"] in {"hip-asis", "hip-notch", "hip-spine"}] == before["landmarks"]
    assert [p for p in after["proposals"] if str(p["id"]) == OTHER_PROPOSAL] == \
        [p for p in before["proposals"] if str(p["id"]) == OTHER_PROPOSAL]

    again = psql(database, "-f", str(sql))
    assert again.returncode != 0 and "already imported" in again.stderr
    assert snapshot(database) == after
    replanned = run(tmp_path, "--state-file", str(save_state(database, tmp_path, capsys, "after.json")))
    assert replanned["inserts"] == [] and len(replanned["already_imported"]) == 3


PUBLICATION_MOVES = """create function public.move_publication() returns trigger language plpgsql as $$
    begin update public.pg_landmarks set published_proposal=null where id='hip-notch'; return null; end $$;
    create trigger move_publication after insert on public.pg_proposals for each statement execute function public.move_publication();"""


@pytest.mark.parametrize("change, message", [
    (f"update public.pg_structures set mesh_digest=repeat('f',64) where id='{MESH}'", "Structure geometry changed"),
    ("update public.pg_landmarks set description='Edited after the dry run.' where id='hip-notch'", "A reused landmark changed"),
    ("update public.pg_landmarks set latin_name='Spina iliaca anterior' where id='hip-asis'", "A reused landmark changed"),
    ("update public.pg_landmarks set archived=true where id='hip-asis'", "A reused landmark changed"),
    (PUBLICATION_MOVES, "Publication pointers changed"),
])
def test_emitted_sql_stops_without_writing_when_the_database_moved(database, tmp_path, capsys, change, message):
    write_inputs(tmp_path, three(importer.SiteModel(ROOT)))
    plan, sql = emit(database, tmp_path, capsys)
    assert len(plan["inserts"]) == 3
    database.execute(change)
    before = snapshot(database)
    result = psql(database, "-f", str(sql))
    assert result.returncode != 0 and message in result.stderr
    assert snapshot(database) == before


def test_hosted_writes_need_explicit_project():
    importer.require_write_confirmation(True, "127.0.0.1", None)
    with pytest.raises(importer.ImportFailure, match="--confirm-project"):
        importer.require_write_confirmation(False, "db.example.supabase.co", None)
    with pytest.raises(importer.ImportFailure, match="does not point"):
        importer.require_write_confirmation(False, "db.other.supabase.co", importer.PROJECT_REF)
    importer.require_write_confirmation(False, f"db.{importer.PROJECT_REF}.supabase.co", importer.PROJECT_REF)


def test_label_matching_ignores_side_bone_and_word_order():
    assert importer.label_key("Lateral epicondyle of humerus", "Humerus") == importer.label_key("Lateral epicondyle (humerus)", "Humerus")
    assert importer.label_key("Inferior angle of scapula", "Scapula") == importer.label_key("Inferior angle", "Scapula")
    assert importer.label_key("Lateral tubercle", "Talus") != importer.label_key("Medial tubercle", "Talus")
    assert len(importer.new_landmark_id("FJ3256", "Groove for tendon of flexor hallucis longus of calcaneus and more words")) <= 80
