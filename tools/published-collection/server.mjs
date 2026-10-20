import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {spawnSync} from 'node:child_process';
import {createSearch} from './search.mjs';
const root=new URL('./',import.meta.url);
const corpus=JSON.parse(await readFile(new URL('corpus.json',root),'utf8'));
const search=createSearch(corpus);
const version='2025-06-18';
const tool={name:'search_published_essays',title:'Search published essays by Kara Hobby',
  description:'Find exact, attributed passages in three already published essays by Kara Hobby. Returns source links. Covers satire and personal observations; not a general source of verified facts about Jackson Hole. Contains no private notes or unreleased show material.',
  inputSchema:{type:'object',properties:{query:{type:'string',minLength:2,maxLength:300},limit:{type:'integer',minimum:1,maximum:5,default:3}},required:['query'],additionalProperties:false},
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}};
const semanticTool={...tool,name:'search_published_essays_by_meaning',title:'Search published essays by meaning',description:'Find exact passages by semantic similarity using a local quantized embedding model. Returns attribution and source links, not generated answers. Same three public essays only. Similarity is not confidence or independent factual verification.'};
function semanticSearch(args){
 const proc=spawnSync(process.env.KARA_PYTHON||'python3',[fileURLToPath(new URL('semantic_search.py',root)),'--stdin'],{input:JSON.stringify(args),encoding:'utf8',timeout:15000,maxBuffer:1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',TOKENIZERS_PARALLELISM:'false'}});
 if(proc.error)throw new Error('Local semantic model unavailable: '+proc.error.message);
 let result;try{result=JSON.parse(proc.stdout);}catch{throw new Error('Local semantic model could not run.');}
 if(proc.status!==0 || result.error)throw new Error(result.error||'Semantic search failed');
 return result;
}
export function rpc(message){
  const id=message?.id??null;
  const error=(code,text)=>({jsonrpc:'2.0',id,error:{code,message:text}});
  if(!message || Array.isArray(message) || message.jsonrpc!=='2.0' || typeof message.method!=='string')return error(-32600,'Invalid request');
  if(message.method==='initialize')return {jsonrpc:'2.0',id,result:{protocolVersion:version,capabilities:{tools:{}},serverInfo:{name:'kara-public-collection',version:'0.1.0'}}};
  if(message.id===undefined)return null;
  if(message.method==='ping')return {jsonrpc:'2.0',id,result:{}};
  if(message.method==='tools/list')return {jsonrpc:'2.0',id,result:{tools:[tool,semanticTool]}};
  if(message.method==='tools/call'){
    if(![tool.name,semanticTool.name].includes(message.params?.name))return error(-32602,'Unknown tool');
    const args=message.params.arguments;
    if(!args || typeof args!=='object' || Array.isArray(args) || Object.keys(args).some(k=>!['query','limit'].includes(k)))return error(-32602,'Invalid arguments');
    try{
      const result=message.params.name===semanticTool.name?semanticSearch(args):search(args.query,args.limit??3);
      return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError:false}};
    }catch(e){return error(-32602,e.message);}
  }
  return error(-32601,'Method not found');
}
function writeRPC(line){
  let response;
  try{response=rpc(JSON.parse(line));}catch{response={jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}};}
  if(response)process.stdout.write(JSON.stringify(response)+'\n');
}
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
const paths=new Map([['/',['index.html','.html']],['/search.mjs',['search.mjs','.mjs']],['/corpus.json',['corpus.json','.json']]]);
export function makeServer(){
  return createServer(async(req,res)=>{
    const send=(status,body,type='application/json; charset=utf-8')=>{
      res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'});
      res.end(typeof body==='string' || Buffer.isBuffer(body)?body:JSON.stringify(body));
    };
    const host=req.headers.host||'';
    if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))return send(403,{error:'Local preview only'});
    if(req.headers.origin && req.headers.origin!==`http://${host}`)return send(403,{error:'Origin not allowed'});
    const url=new URL(req.url,'http://'+host);
    if(req.method==='GET' && paths.has(url.pathname)){
      const [file,ext]=paths.get(url.pathname);
      return send(200,await readFile(new URL(file,root)),types[ext]);
    }
    if(req.method==='GET' && url.pathname==='/api/search'){
      try{return send(200,search(url.searchParams.get('q'),url.searchParams.has('limit')?Number(url.searchParams.get('limit')):3));}
      catch(e){return send(400,{error:e.message});}
    }
    if(url.pathname==='/api/semantic-search' && req.method==='POST'){
      if(!(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:'Use application/json'});
      let body='';
      try{
        for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>8192)return send(413,{error:'Request too large'});}
        const args=JSON.parse(body);
        if(!args || typeof args!=='object' || Array.isArray(args) || Object.keys(args).some(k=>!['query','limit'].includes(k)))return send(400,{error:'Invalid arguments'});
        return send(200,semanticSearch(args));
      }catch(e){return send(400,{error:e.message});}
    }
    if(url.pathname==='/mcp' && req.method==='POST'){
      if(!(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:'Use application/json'});
      let body='';
      try{
        for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>8192)return send(413,{error:'Request too large'});}
        const result=rpc(JSON.parse(body));
        if(result===null){res.writeHead(202);return res.end();}
        return send(200,result);
      }catch{return send(400,{jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});}
    }
    return send(url.pathname==='/mcp'?405:404,{error:'Not available'});
  });
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
  if(process.argv.includes('--stdio')){
    const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
    lines.on('line',writeRPC);
  }else{
    const at=process.argv.indexOf('--port');
    const port=at>=0?Number(process.argv[at+1]):8766;
    makeServer().listen(port,'127.0.0.1',()=>process.stderr.write(`Private preview http://127.0.0.1:${port}/\n`));
  }
}
