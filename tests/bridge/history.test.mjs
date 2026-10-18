import test from 'node:test';
import assert from 'node:assert/strict';
import {CodexClient,BridgeFailure} from '../../bridge/codex/client.mjs';
const remote=(code,message)=>new BridgeFailure('TURN_FAILED','Codex 返回错误。',JSON.stringify({code,message}));
test('现代 Codex 分页读取指定 Turn，加载完整图片事件且不调用全历史旧接口',async()=>{
 const client=new CodexClient(),calls=[],turn={id:'target',status:'completed',items:[{type:'imageGeneration',result:'original bytes'}]};
 client.request=async(method,params)=>{calls.push({method,params});return params.cursor?{data:[turn],nextCursor:null}:{data:[{id:'newer'}],nextCursor:'older'};};
 assert.equal(await client.readTurn('thread','target'),turn);assert.equal(calls.length,2);assert.equal(calls[0].method,'thread/turns/list');assert.equal(calls[0].params.itemsView,'full');assert.equal(calls[1].params.cursor,'older');
});
test('旧 CLI 只在方法确实不支持时回退，并记住能力；不隐藏网络错误',async()=>{
 const client=new CodexClient(),calls=[];client.request=async method=>{calls.push(method);if(method==='thread/turns/list')throw remote(-32601,'Method not found');return {thread:{turns:[{id:'turn'}]}};};
 assert.equal((await client.readTurn('thread','turn')).id,'turn');await client.readTurn('thread','turn');assert.deepEqual(calls,['thread/turns/list','thread/read','thread/read']);
 const modern=new CodexClient();modern.request=async()=>{throw remote(-32603,'permission denied');};await assert.rejects(modern.readTurn('thread','turn'),/Codex/);
});
test('新线程未落盘暂时没有 Turn，不冒充失败或成功；拒绝重复游标',async()=>{
 const client=new CodexClient();client.request=async()=>({data:[],nextCursor:null});assert.equal(await client.readTurn('thread','turn'),null);
 client.request=async()=>{throw remote(-32603,'rollout at session.jsonl is empty');};assert.equal(await client.readTurn('thread','turn'),null);
 client.request=async()=>({data:[],nextCursor:'same'});await assert.rejects(client.readTurn('thread','turn'),/游标/);
});
