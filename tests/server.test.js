'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createServer,validateImage}=require('../server');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
test('HTTP service, CORS, input validation, health and private config boundary',async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const health=await(await fetch(base+'/api/health')).json();assert.equal(health.version,require('../package.json').version);assert.equal(health.provider,'DeepSeek');assert.equal(health.apiKey,undefined);
  const allowed=await fetch(base+'/api/health',{headers:{Origin:base}});assert.equal(allowed.headers.get('access-control-allow-origin'),base);
  const forbidden=await fetch(base+'/api/analyze',{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:'{}'});assert.equal(forbidden.status,403);
  for(const body of ['{bad','{}',JSON.stringify({text:42})]){const response=await fetch(base+'/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body});assert.equal(response.status,400);}
  assert.equal((await fetch(base+'/.env')).status,404);
  const html=await(await fetch(base+'/')).text();assert.match(html,/V2\.5\.0/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('image bytes checked, malicious extension and oversized image rejected',()=>{
 assert.equal(validateImage({mimeType:'image/png',data:png}).mimeType,'image/png');
 assert.throws(()=>validateImage({mimeType:'image/png',data:Buffer.from('<svg/>').toString('base64')}),/损坏/);
 assert.throws(()=>validateImage({mimeType:'image/heic',data:png}),/不支持/);
 assert.throws(()=>validateImage({mimeType:'image/png',data:Buffer.alloc(10*1024*1024+1).toString('base64')}),/超过/);
});
