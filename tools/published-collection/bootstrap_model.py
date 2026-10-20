#!/usr/bin/env python3
"""Download only the pinned public model files, verifying their SHA-256 hashes."""
from pathlib import Path
import hashlib,json,urllib.request
root=Path(__file__).resolve().parent
manifest=json.loads((root/'model_manifest.json').read_text())
for item in manifest['files']:
    rel=Path(item['path'])
    if rel.is_absolute() or '..' in rel.parts:
        raise ValueError('Invalid model path')
    expected='https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/'+manifest['revision']+'/'+item['path']
    if item['url']!=expected:
        raise ValueError('Unexpected download source')
    target=root/'models/minilm'/rel
    target.parent.mkdir(parents=True,exist_ok=True)
    with urllib.request.urlopen(expected,timeout=60) as response:
        raw=response.read(item['bytes']+1)
    if len(raw)!=item['bytes'] or hashlib.sha256(raw).hexdigest()!=item['sha256']:
        raise ValueError('Model file failed size/hash verification: '+item['path'])
    target.write_bytes(raw)
print('Verified public model files downloaded. Run semantic_search.py --build next.')
