import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{ManualUpdates,officialReleasesUrl}=require('../../desktop/manual-updates.cjs'),{createDiagnostics}=require('../../desktop/diagnostics.cjs');
const config={owner:'author',repo:'skill-canvas'};
test('manual updates use only the configured GitHub endpoint, never run installers',async()=>{
 let calls=0;const update=new ManualUpdates({config,version:'1.3.1',fetcher:async(url,options)=>{calls++;assert.equal(url,'https://api.github.com/repos/author/skill-canvas/releases/latest');assert.equal(options.redirect,'error');return new Response(JSON.stringify({tag_name:'v1.4.0',body:'Release notes',html_url:'https://evil.com'}));}});
 assert.equal(calls,0);const result=await update.check();assert.equal(result.status,'available');assert.equal(result.releasesUrl,'https://github.com/author/skill-canvas/releases');assert.equal(result.releaseNotes,'Release notes');await assert.rejects(update.download());await assert.rejects(update.apply());
});
test('manual checks distinguish empty releases, current versions, malformed metadata and network failures',async()=>{
 for(const [response,status] of [[new Response('',{status:404}),'no_release'],[new Response(JSON.stringify({tag_name:'v1.3.1'})),'current'],[new Response(JSON.stringify({tag_name:'v1.4.0',prerelease:true})),'error'],[new Response('x'.repeat(512*1024+1)),'error'],[new Response('',{status:403}),'error']]){const update=new ManualUpdates({config,version:'1.3.1',fetcher:async()=>response});assert.equal((await update.check()).status,status);}
 const update=new ManualUpdates({config,version:'1.3.1',fetcher:async()=>{throw Error('offline');}});assert.equal((await update.check()).status,'error');
 for(const c of [{},{owner:'a/b',repo:'x'},{owner:'author',repo:'..'}])assert.throws(()=>officialReleasesUrl(c));
});
test('diagnostics exclude personal paths, prompts, credentials and raw errors',()=>{
 const report=createDiagnostics({version:'1.4.0',platform:'win32',arch:'x64',language:'en',bridgeReady:true,status:{connected:true,authenticated:true,version:'1.2.3',error:{code:'AUTH_REQUIRED',message:'secret prompt'},path:'C:/private',token:'secret token'},probe:{status:'failed',message:'private path'},capabilities:{automaticImageGeneration:false}});
 const text=JSON.stringify(report);for(const secret of ['secret','private','prompt','token'])assert.equal(text.includes(secret),false);assert.equal(report.codex.errorCode,'AUTH_REQUIRED');assert.equal(report.redacted,true);
});
