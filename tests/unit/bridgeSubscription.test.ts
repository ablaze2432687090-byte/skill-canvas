import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalCodexBridge } from '../../src/adapters/localCodexBridge.ts';
test('SSE 未收到终态时自动核对任务；取消订阅后清除核对计时器',async t=>{
 const originalFetch=globalThis.fetch,originalWindow=(globalThis as any).window;
 (globalThis as any).window={skillCanvasDesktop:{connection:async()=>({base:'http://127.0.0.1:1234',token:'test'})}};
 const calls:string[]=[],events:any[]=[];let stream:ReadableStreamDefaultController<Uint8Array>;
 globalThis.fetch=async(input:any)=>{const url=String(input);calls.push(url);if(url.endsWith('/events'))return new Response(new ReadableStream({start(controller){stream=controller;controller.enqueue(new TextEncoder().encode('data: {"taskId":"task","stage":"running"}\n\n'));}}));return Response.json({taskId:'task',stage:'completed',result:{outputs:[{id:'png'}]}});};
 t.after(()=>{globalThis.fetch=originalFetch;(globalThis as any).window=originalWindow;});
 t.mock.timers.enable({apis:['setInterval','setTimeout']});
 const unsubscribe=new LocalCodexBridge().subscribe('task',event=>events.push(event),()=>{});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(events[0].stage,'running');
 t.mock.timers.tick(15000);await new Promise(resolve=>setImmediate(resolve));assert.equal(events.at(-1).stage,'completed');assert.equal(calls.filter(url=>url.endsWith('/tasks/task')).length,1);
 unsubscribe();stream!.close();t.mock.timers.tick(30000);await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.filter(url=>url.endsWith('/tasks/task')).length,1);
});
