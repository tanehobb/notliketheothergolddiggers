// Exact passage retrieval, shared by the browser and MCP. No generated answers.
const STOP = new Set('a an and are as at be been but by can could do does for from had has have how i if in into is it its me my of on or our she so some than that the their them there these they this to was we were what when where which who why will with would you your'.split(' '));
const ALLOWED = new Set(['become-the-gold-digger-you-wish-to-see-in-the-world','woman-who-chooses-lower-ground','wilson-mom-summer']);
export function tokens(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(t => t.length > 1 && !STOP.has(t)).map(t => t.endsWith('s') && !t.endsWith('ss') ? t.slice(0,-1) : t);
}
export function createSearch(corpus) {
  if (!Array.isArray(corpus) || corpus.length !== 3 || new Set(corpus.map(d=>d.slug)).size !== 3) throw new Error('Expected the three approved public essays.');
  const passages=[];
  for (const doc of corpus) {
    if (!ALLOWED.has(doc.slug) || doc.url !== `https://www.notliketheothergolddiggers.com/${doc.slug}/`) throw new Error('Source is outside the public allowlist.');
    if (doc.author !== 'Kara Hobby' || typeof doc.text !== 'string') throw new Error('Missing source attribution.');
    const paragraphs=doc.text.split(/\n\s*\n/).map(x=>x.trim()).filter(x=>x && !x.startsWith('#') && !x.startsWith('- URL:') && !x.startsWith('!['));
    paragraphs.forEach((quote,i)=>{
      const terms=tokens(quote);
      const counts=new Map(); for (const t of terms) counts.set(t,(counts.get(t)||0)+1);
      passages.push({doc,quote,index:i,terms,counts,titleTokens:new Set(tokens(doc.title))});
    });
  }
  const averageLength=passages.reduce((n,p)=>n+p.terms.length,0)/passages.length;
  const frequency=new Map();
  for(const p of passages) for(const t of new Set(p.terms)) frequency.set(t,(frequency.get(t)||0)+1);
  return function search(query, limit=3) {
    if(typeof query!=='string' || query.trim().length<2 || query.length>300) throw new Error('Use a search phrase between 2 and 300 characters.');
    if(!Number.isInteger(limit) || limit<1 || limit>5) throw new Error('Limit must be an integer from 1 to 5.');
    const aliases={money:['economic','estate','billionaire','purse','check','digger'],dating:['dating','romance','boyfriend'],hiking:['hiking','mountain','trail']};
    const terms=[...new Set(tokens(query).flatMap(t=>[t,...(aliases[t]||[])]))];
    if(!terms.length) return {query,results:[],message:'Enter a subject to search the three published essays.'};
    const hits=[];
    for(const p of passages) {
      let score=0, matched=0;
      for(const t of terms){
        const tf=p.counts.get(t)||0;
        if(tf){
          const n=frequency.get(t)||0;
          const idf=Math.log(1+(passages.length-n+0.5)/(n+0.5));
          score+=idf*(tf*2.2)/(tf+1.2*(0.25+0.75*p.terms.length/averageLength));
          matched++;
        }
      }
      if(!matched) continue;
      // Prioritize passages that answer more of the phrase, not title-only matches.
      score*=matched/terms.length;
      if(matched===terms.length)score*=1.5;
      hits.push({...p,score});
    }
    hits.sort((a,b)=>b.score-a.score || a.index-b.index);
    const chosen=[],perDoc=new Map();
    for(const hit of hits){
      if((perDoc.get(hit.doc.slug)||0)>=2)continue;
      perDoc.set(hit.doc.slug,(perDoc.get(hit.doc.slug)||0)+1);
      chosen.push({title:hit.doc.title,author:hit.doc.author,url:hit.doc.url,published:hit.doc.published,
        quote:hit.quote,slug:hit.doc.slug,source_mirror:hit.doc.source_mirror,source_commit:hit.doc.source_commit,
        source_license:hit.doc.license,score:Number(hit.score.toFixed(4))});
      if(chosen.length===limit)break;
    }
    return {query,results:chosen,message:chosen.length?'Exact passages from previously published work. Satire and personal observations are not independent factual evidence.':'No matching passage in the three published essays. This collection contains no private notes or unreleased show material.'};
  };
}
