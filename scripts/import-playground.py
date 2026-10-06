#!/usr/bin/env python3
"""Read-only SQLite migration. Outputs reviewed SQL; never contacts a remote database."""
import argparse, hashlib, json, re, sqlite3, struct, uuid
from pathlib import Path

parser=argparse.ArgumentParser();parser.add_argument('--database',required=True);parser.add_argument('--downloads',required=True)
args=parser.parse_args();root=Path(__file__).resolve().parents[1];out=root/'.local';out.mkdir(exist_ok=True)
c=sqlite3.connect('file:'+str(Path(args.database).resolve())+'?mode=ro',uri=True);c.row_factory=sqlite3.Row
backup=out/'pre-supabase.sqlite'
if not backup.exists():
 target=sqlite3.connect(backup);c.backup(target);target.close()
atlas_bytes=(root/'models/atlas.json').read_bytes();atlas=json.loads(atlas_bytes);download_bytes=Path(args.downloads).read_bytes()
geometry=hashlib.sha256(atlas_bytes+download_bytes).hexdigest()
(root/'models/downloads.json').write_bytes(download_bytes)
meshes={r['id']:dict(r) for r in c.execute('select * from meshes')};buckets={r['id']:dict(r) for r in c.execute('select * from buckets')}
chunks={};metadata={};rows=[]
for part in atlas['parts']:
 chunk=part['chunk']
 if chunk not in chunks: chunks[chunk]=(root/'models'/Path(atlas['chunks'][chunk]['url']).name).read_bytes()
 buf=chunks[chunk];nv=part['vertexCount'];ni=part['indexCount']
 pos=buf[part['positions']:part['positions']+nv*12];norm=buf[part['normals']:part['normals']+nv*6];ind=buf[part['indices']:part['indices']+ni*4]
 digest=hashlib.sha256(pos+norm+ind).hexdigest()
 assert digest==meshes[part['id']]['digest'],part['id']+' geometry mismatch'
 assert geometry==meshes[part['id']]['geometry'],'Geometry fingerprint mismatch'
 indices=struct.unpack('<'+'I'*ni,ind);xyz=struct.unpack('<'+'f'*(nv*3),pos);invalid=[]
 for t in range(ni//3):
  a,b,d=[indices[t*3+k]*3 for k in range(3)];e=[xyz[b+k]-xyz[a+k] for k in range(3)];f=[xyz[d+k]-xyz[a+k] for k in range(3)]
  cross=[e[1]*f[2]-e[2]*f[1],e[2]*f[0]-e[0]*f[2],e[0]*f[1]-e[1]*f[0]]
  if sum(v*v for v in cross)<=1e-28:invalid.append(t)
 metadata[part['id']]={'digest':digest,'invalidTriangles':invalid}
 rows.append(dict(id=part['id'],name=part['name'],system=part['system'],geometry=geometry,mesh_digest=digest,triangle_count=ni//3,invalid_triangles=invalid))
(root/'models/playground-geometry.json').write_text(json.dumps({'geometry':geometry,'meshes':metadata},separators=(',',':'))+'\n')
# Only exact word matches, ignoring punctuation and word order. No fuzzy/side inference.
def key(name):return tuple(sorted(re.findall(r'[a-z0-9]+',name.lower())))
lookup={}
for p in atlas['parts']:lookup.setdefault(key(p['name']),[]).append(p['id'])
mapping={};report=[]
for b in buckets.values():
 matches=lookup.get(key(b['label']),[])
 mid=b['mesh_id'] or (matches[0] if len(matches)==1 else None)
 if mid:mapping[b['id']]=mid
 report.append({'bucket':b['id'],'label':b['label'],'meshId':mid,'method':'existing' if b['mesh_id'] else 'exact words' if mid else 'unresolved'})
landmarks=[];proposals=[];unmapped=[]
for r in c.execute('select * from landmarks order by id'):
 x=dict(r);mid=x['mesh_id'] or mapping.get(x['bucket_id'])
 if not mid or x['archived'] or x['merged_into']:
  unmapped.append(dict(id=x['id'],bucket_label=buckets[x['bucket_id']]['label'],state=x));continue
 landmarks.append(dict(id=x['id'],mesh_id=mid,label=x['label'],latin_name=x['latin_name'],description=x['description']))
 if x['anchor_triangle'] is not None:
  assert x['anchor_geometry']==geometry
  proposals.append(dict(id=str(uuid.uuid5(uuid.NAMESPACE_URL,'anatomygo:local:'+x['id']+':'+str(x['revision']))),landmark_id=x['id'],mesh_id=mid,author_id=None,label=x['label'],latin_name=x['latin_name'],description=x['description'],geometry=geometry,triangle=x['anchor_triangle'],u=x['anchor_u'],v=x['anchor_v'],request_id=str(uuid.uuid5(uuid.NAMESPACE_URL,'anatomygo:import:'+x['id'])),request_body={'importedRevision':x['revision']}))
 # Preserve blockers, references, authorship and old revisions privately, never as approval.
 unmapped.append(dict(id=x['id'],bucket_label=buckets[x['bucket_id']]['label'],state=x))
def literal(v):
 if v is None:return 'null'
 if isinstance(v,(dict,list)):return "'"+json.dumps(v,ensure_ascii=False).replace("'","''")+"'"
 if isinstance(v,str):return "'"+v.replace("'","''")+"'"
 return str(v)
sql=['begin;','-- Initial import only. Existing hosted contributions are never overwritten.']
for table,items in [('public.pg_structures',rows),('public.pg_landmarks',landmarks),('public.pg_proposals',proposals),('playground_private.unmapped_imports',unmapped)]:
 for row in items:
  vals=[("ARRAY["+','.join(map(str,v))+']::integer[]') if k=='invalid_triangles' else literal(v) for k,v in row.items()]
  sql.append('insert into '+table+' ('+','.join(row)+') values ('+','.join(vals)+') on conflict(id) do nothing;')
sql+=['commit;'];(out/'playground-seed.sql').write_text('\n'.join(sql)+'\n')
summary={'structures':len(rows),'mappedBuckets':len(mapping),'landmarks':len(landmarks),'proposals':len(proposals),'unresolvedBuckets':len(buckets)-len(mapping),'published':0,'mapping':report}
(out/'migration-report.json').write_text(json.dumps(summary,indent=2)+'\n')
# Deliberately limited to public biology and geometry. Used only for unconfigured local preview.
(root/'public/playground-seed.json').write_text(json.dumps({'landmarks':landmarks,'proposals':proposals},ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps({k:v for k,v in summary.items() if k!='mapping'},indent=2))
