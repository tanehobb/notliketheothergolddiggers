#!/usr/bin/env python3
"""Local quantized sentence embeddings over an explicit allowlist of published essays."""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ALLOWED = {'become-the-gold-digger-you-wish-to-see-in-the-world','woman-who-chooses-lower-ground','wilson-mom-summer'}

def passages():
    corpus = json.loads((ROOT/'corpus.json').read_text())
    if len(corpus)!=3 or {d['slug'] for d in corpus}!=ALLOWED:
        raise ValueError('Only the three approved public essays may be indexed.')
    rows=[]
    for doc in corpus:
        if doc['url']!='https://www.notliketheothergolddiggers.com/'+doc['slug']+'/':
            raise ValueError('Invalid canonical source')
        for paragraph in re.split(r'\n\s*\n',doc['text']):
            paragraph=paragraph.strip()
            if not paragraph or paragraph.startswith(('#','- URL:','![')):
                continue
            rows.append({k:doc[k] for k in ['slug','title','url','author','published','source_mirror','source_commit']})
            rows[-1]['quote']=paragraph
    return rows

def encoder():
    import numpy as np
    import onnxruntime as ort
    from tokenizers import Tokenizer
    tokenizer=Tokenizer.from_file(str(ROOT/'models/minilm/tokenizer.json'))
    tokenizer.enable_truncation(max_length=256)
    tokenizer.enable_padding()
    settings=ort.SessionOptions()
    settings.intra_op_num_threads=2
    settings.inter_op_num_threads=1
    session=ort.InferenceSession(str(ROOT/'models/minilm/onnx/model_quantized.onnx'),sess_options=settings,providers=['CPUExecutionProvider'])
    inputs={d.name for d in session.get_inputs()}
    def encode(texts):
        encoded=tokenizer.encode_batch(texts)
        ids=np.asarray([e.ids for e in encoded],dtype=np.int64)
        masks=np.asarray([e.attention_mask for e in encoded],dtype=np.int64)
        feed={'input_ids':ids,'attention_mask':masks,'token_type_ids':np.zeros_like(ids)}
        output=session.run(None,{k:v for k,v in feed.items() if k in inputs})[0]
        pooled=(output*masks[:,:,None]).sum(axis=1)/np.maximum(masks.sum(axis=1)[:,None],1e-9)
        return (pooled/np.maximum(np.linalg.norm(pooled,axis=1,keepdims=True),1e-9)).astype('float32')
    return encode

def fingerprint():
    return hashlib.sha256((ROOT/'corpus.json').read_bytes()).hexdigest()

def build():
    import numpy as np
    rows=passages()
    encode=encoder()
    chunks=[]
    for offset in range(0,len(rows),16):
        chunks.append(encode([r['quote'] for r in rows[offset:offset+16]]))
    vectors=np.concatenate(chunks)
    np.save(ROOT/'vectors.npy',vectors)
    (ROOT/'vector_index.json').write_text(json.dumps({'corpus_sha256':fingerprint(),'model':'Xenova/all-MiniLM-L6-v2','model_revision':'751bff37182d3f1213fa05d7196b954e230abad9','dimensions':384,'normalization':'L2; masked mean pooling','rows':rows},ensure_ascii=False,indent=2)+'\n')
    return {'passages':len(rows),'dimensions':int(vectors.shape[1]),'model_bytes':(ROOT/'models/minilm/onnx/model_quantized.onnx').stat().st_size}

def search(query,limit=3):
    import numpy as np
    if not isinstance(query,str) or not 2<=len(query.strip())<=300:
        raise ValueError('Use a phrase between 2 and 300 characters.')
    if not isinstance(limit,int) or isinstance(limit,bool) or not 1<=limit<=5:
        raise ValueError('Limit must be an integer from 1 to 5.')
    index=json.loads((ROOT/'vector_index.json').read_text())
    if index['corpus_sha256']!=fingerprint():
        raise ValueError('Corpus changed. Rebuild the local vector index.')
    vectors=np.load(ROOT/'vectors.npy',allow_pickle=False)
    scores=vectors@encoder()([query])[0]
    selected=[]
    per_doc={}
    for i in np.argsort(-scores):
        score=float(scores[i])
        # A relevance heuristic, not a probability or a guarantee of factual relevance.
        if score<0.3:continue
        row=index['rows'][int(i)]
        if per_doc.get(row['slug'],0)>=2:continue
        per_doc[row['slug']]=per_doc.get(row['slug'],0)+1
        selected.append({**row,'cosine_similarity':round(score,4)})
        if len(selected)==limit:break
    return {'query':query,'method':'local quantized semantic retrieval','results':selected,
            'message':'Exact published passages, selected by meaning. Similarity scores are not confidence probabilities. Satire and personal observations are not independent factual evidence.' if selected else 'No sufficiently similar passage in the three published essays. No private notes or unreleased show material are indexed.'}

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--build',action='store_true')
    parser.add_argument('--query')
    parser.add_argument('--stdin',action='store_true')
    args=parser.parse_args()
    try:
        if args.build:result=build()
        elif args.stdin:
            payload=json.loads(sys.stdin.read(8193))
            if not isinstance(payload,dict) or set(payload)-{'query','limit'}:
                raise ValueError('Invalid query arguments')
            result=search(payload.get('query'),payload.get('limit',3))
        else:result=search(args.query)
        print(json.dumps(result,ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({'error':str(exc)}))
        sys.exit(1)
