import path from 'node:path';
import {mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {digest,validatePng,replaceRecord} from './workspace.mjs';

export async function readImageEvidence(file) {
  const proof=JSON.parse(await readFile(file,'utf8'));
  if(proof.schema!==2||proof.status!=='completed'||proof.requiresApiKey!==false||!proof.threadId||!proof.turnId)throw Error('未验证的图片能力记录。');
  const target=path.join(path.dirname(file),'probes',proof.probeId+'.png');
  if(!/^[0-9a-f-]{36}$/i.test(proof.probeId)||proof.outputPath!==target||await realpath(target)!==target)throw Error('检测文件位置不匹配。');
  const bytes=await readFile(target);validatePng(bytes);if(digest(bytes)!==proof.sha256)throw Error('检测原图校验失败。');return proof;
}
export class ImageProbe {
  constructor({client,evidenceFile,imageCacheRoot,hasActiveTasks=()=>false}) {Object.assign(this,{client,evidenceFile,imageCacheRoot,hasActiveTasks});this.state={status:'idle',message:'尚未执行图片能力检测。'};}
  snapshot(){return {...this.state};}
  active(){return this.state.status==='running';}
  async start(){
    if(this.active())return this.snapshot();if(this.hasActiveTasks())throw Error('请先完成当前生成任务，再检测图片能力。');
    this.state={status:'running',probeId:randomUUID(),message:'正在验证内置 ImageGen；本次会真实生成一张测试图并使用账号额度。'};
    const probeId=this.state.probeId;
    this.work=this.run().catch(error=>{if(this.state.probeId===probeId&&this.state.status!=='cancelled')this.state={...this.state,status:'failed',message:error.message||'图片能力验证失败，未标记为可用。'};});return this.snapshot();
  }
  async cancel(){if(this.active()&&this.state.threadId&&this.state.turnId)await this.client.request('turn/interrupt',{threadId:this.state.threadId,turnId:this.state.turnId}).catch(()=>{});this.state={...this.state,status:'cancelled',message:'图片检测已取消。'};}
  async run(){
    const state=this.state,current=()=>this.state===state&&state.status==='running';
    await this.client.start();if(!current())return;const directory=path.join(path.dirname(this.evidenceFile),'probes');await mkdir(directory,{recursive:true});
    const start=await this.client.request('thread/start',{cwd:directory,approvalPolicy:'never',sandbox:'workspace-write'});if(!current())return;
    this.state.threadId=start.thread.id;
    const result=await this.client.request('turn/start',{threadId:start.thread.id,cwd:directory,input:[{type:'text',text:'Environment capability test. Use only the built-in image_gen tool to generate exactly one small square image: one white circle centered on a plain black background, no text. Do not use APIs, API keys, scripts, SVG, screenshots or local image editing. Discover the tool if needed. Generate the image once, inspect it, then briefly confirm completion. If the tool is unavailable, report failure, do not substitute.'}]});
    if(!current()){await this.client.request('turn/interrupt',{threadId:start.thread.id,turnId:result.turn.id}).catch(()=>{});return;}this.state.turnId=result.turn.id;
    const deadline=Date.now()+8*60*1000;
    while(current()){
      const turn=this.client.readTurn?await this.client.readTurn(this.state.threadId,this.state.turnId):(await this.client.request('thread/read',{threadId:this.state.threadId,includeTurns:true})).thread?.turns?.find(t=>t.id===this.state.turnId);
      if(!current())return;
      if(turn&&['completed','failed','interrupted'].includes(turn.status)){
        if(turn.status!=='completed')throw Error('Codex 未完成图片能力检测，可稍后重试。');
        const images=turn.items.filter(i=>i.type==='imageGeneration'&&i.status==='completed');
        if(images.length!==1)throw Error('未收到唯一的内置图片生成成功事件，不能将文字连接当作生图可用。');
        const image=images[0];
        if(!/^[0-9a-f-]{36}$/i.test(this.state.threadId)||!/^exec-[a-f0-9-]{36}$/i.test(image.id)||!image.savedPath||!image.revisedPrompt||typeof image.result!=='string'||image.result.length>100*1024*1024)throw Error('原生图片证据不完整。');
        const source=await realpath(image.savedPath),root=await realpath(this.imageCacheRoot);
        if(path.dirname(source)!==path.join(root,this.state.threadId)||path.basename(source)!==image.id+'.png')throw Error('原生图片与检测线程不匹配。');
        const bytes=await readFile(source),geometry=validatePng(bytes);if(digest(bytes)!==digest(Buffer.from(image.result,'base64')))throw Error('图片字节与原生事件不一致。');
        const outputPath=path.join(directory,this.state.probeId+'.png');await writeFile(outputPath,bytes,{flag:'wx'});
        const proof={schema:2,status:'completed',probeId:this.state.probeId,threadId:this.state.threadId,turnId:this.state.turnId,imageId:image.id,sha256:digest(bytes),...geometry,outputPath,requiresApiKey:false,codexVersion:this.client.version,checkedAt:new Date().toISOString()};
        await writeFile(this.evidenceFile+'.tmp',JSON.stringify(proof,null,2));await replaceRecord(this.evidenceFile+'.tmp',this.evidenceFile);
        this.state={...this.state,status:'completed',message:'内置 ImageGen 已通过真实事件和 PNG 字节校验。',checkedAt:proof.checkedAt};return;
      }
      if(Date.now()>deadline){await this.cancel();throw Error('图片能力检测超时，已请求中断；未自动重试。');}
      await new Promise(resolve=>setTimeout(resolve,3000));
    }
  }
}
