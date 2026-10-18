import type {ParameterValue} from './skill.ts';

export interface PersonalCategory {id:string;name:string;englishName:string;hidden:boolean}
export interface PersonalGroup {id:string;name:string}
export interface PersonalMedia {id:string;mime:string;width:number;height:number;createdAt:string;source:string;focusX:number;focusY:number}
export interface SkillOverride {
 translations?:Partial<Record<'zh-CN'|'en',{name?:string;description?:string}>>;
 categoryId?:string;tags?:string[];notes?:string;favorite?:boolean;pinned?:boolean;hidden?:boolean;order?:number;groupIds?:string[];
 cover?:PersonalMedia;previousCover?:PersonalMedia;example?:PersonalMedia;previousExample?:PersonalMedia;
}
export interface GenerationPreset {id:string;name:string;skillId:string;fingerprint:string;parameters:Record<string,ParameterValue>}
export interface PromptTemplate {id:string;name:string;prompt:string;requirements:string}
export interface Customization {
 projectGroups?:PersonalGroup[];
 workflow?:{maxConcurrency:number};
 schema:1;revision:number;categories:PersonalCategory[];groups:PersonalGroup[];skills:Record<string,SkillOverride>;
 library:{view:'grid'|'list';density:'compact'|'standard'|'comfortable';showVersion:boolean;showDescription:boolean;showTags:boolean};
 gallery:{view:'grid'|'list';density:'compact'|'standard'|'comfortable'};
 home:{showRecent:boolean;recentCount:number;order:('shortcuts'|'recommended'|'recent')[];categoryIds:string[]};
 defaults:{imageLanguage:string;referenceRole:string;exportNaming:'technical'|'project-version-date'};
 filters:{id:string;name:string;query:string;categoryId:string;favorite:boolean;tag:string;groupId:string;input?:string;output?:string;status?:string;hidden?:boolean}[];
 presets:GenerationPreset[];templates:PromptTemplate[];
}
export const defaultPersonalCategories:PersonalCategory[]=[
 ['poster','海报设计','Poster design'],['cover','封面设计','Cover design'],['brand','品牌视觉','Brand identity'],['photo','摄影影像','Photography'],['illustration','插画艺术','Illustration'],['3d','三维视觉','3D visuals'],['information','信息设计','Information design'],['general','综合创作','General creation'],['uncategorized','未分类','Uncategorized']
].map(([id,name,englishName])=>({id,name,englishName,hidden:false}));
export function defaultCustomization():Customization{return {schema:1,workflow:{maxConcurrency:2},revision:0,categories:structuredClone(defaultPersonalCategories),groups:[],projectGroups:[],skills:{},library:{view:'grid',density:'standard',showVersion:true,showDescription:true,showTags:true},gallery:{view:'grid',density:'standard'},home:{showRecent:true,recentCount:6,order:['shortcuts','recommended','recent'],categoryIds:[]},defaults:{imageLanguage:'',referenceRole:'style_reference',exportNaming:'technical'},filters:[],presets:[],templates:[]};}
const fail=()=>{throw Error('个人设置无效或超出支持范围。');};
const object=(value:unknown,keys:string[]):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))return fail();return value as Record<string,unknown>;};
const str=(value:unknown,max=100,empty=true):string=>{if(typeof value!=='string'||value.length>max||(!empty&&!value.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))return fail();return value;};
const list=<T>(value:unknown,fn:(value:unknown)=>T,max=100):T[]=>{if(!Array.isArray(value)||value.length>max)return fail();return value.map(fn);};
const bool=(value:unknown):boolean=>{if(typeof value!=='boolean')return fail();return value;};
const number=(value:unknown,min:number,max:number):number=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)return fail();return value;};
const option=<T extends string>(value:unknown,choices:readonly T[]):T=>{if(!choices.includes(value as T))return fail();return value as T;};
const id=(value:unknown)=>{const result=str(value,100,false);if(!/^[\w-]+$/.test(result)||['__proto__','constructor','prototype'].includes(result))return fail();return result;};
const unique=<T extends {id:string}>(items:T[])=>{if(new Set(items.map(i=>i.id)).size!==items.length)return fail();return items;};
function media(value:unknown):PersonalMedia {const o=object(value,['id','mime','width','height','createdAt','source','focusX','focusY']);if(!/^[a-f0-9]{64}$/.test(str(o.id,64)))return fail();return {id:o.id as string,mime:option(o.mime,['image/png']),width:number(o.width,1,32768),height:number(o.height,1,32768),createdAt:str(o.createdAt,40),source:str(o.source,200),focusX:number(o.focusX,0,100),focusY:number(o.focusY,0,100)};}
export function validateCustomization(value:unknown):Customization {
 const o=object(value,['schema','workflow','revision','categories','groups','projectGroups','skills','library','gallery','home','defaults','filters','presets','templates']);if(o.schema!==1)return fail();
 const workflow=object(o.workflow??{maxConcurrency:2},['maxConcurrency']);const maxConcurrency=number(workflow.maxConcurrency,1,4);if(!Number.isInteger(maxConcurrency))return fail();
 const categories=unique(list(o.categories,value=>{const x=object(value,['id','name','englishName','hidden']);return {id:id(x.id),name:str(x.name,24,false),englishName:str(x.englishName,60),hidden:bool(x.hidden)};},40));if(!categories.some(c=>c.id==='uncategorized'))return fail();
 const groups=unique(list(o.groups,value=>{const x=object(value,['id','name']);return {id:id(x.id),name:str(x.name,40,false)};}));
 const projectGroups=unique(list(o.projectGroups??[],value=>{const x=object(value,['id','name']);return {id:id(x.id),name:str(x.name,40,false)};}));
 const raw=o.skills;if(!raw||Array.isArray(raw)||typeof raw!=='object'||Object.keys(raw).length>2000)return fail();const skills:Record<string,SkillOverride>={};
 for(const [key,value] of Object.entries(raw)){id(key);const x=object(value,['translations','categoryId','tags','notes','favorite','pinned','hidden','order','groupIds','cover','previousCover','example','previousExample']),entry:SkillOverride={};
  if(x.translations!==undefined){const tx=object(x.translations,['zh-CN','en']);entry.translations={};for(const language of ['zh-CN','en'] as const)if(tx[language]!==undefined){const fields=object(tx[language],['name','description']);entry.translations[language]={};for(const field of ['name','description'] as const)if(fields[field]!==undefined)entry.translations[language]![field]=str(fields[field],field==='name'?100:1000);}}
  if(x.categoryId!==undefined){entry.categoryId=id(x.categoryId);if(!categories.some(c=>c.id===entry.categoryId))return fail();}
  if(x.tags!==undefined)entry.tags=[...new Set(list(x.tags,v=>str(v,40,false),30))];if(x.notes!==undefined)entry.notes=str(x.notes,4000);
  for(const field of ['favorite','pinned','hidden'] as const)if(x[field]!==undefined)entry[field]=bool(x[field]);if(x.order!==undefined)entry.order=number(x.order,0,1000000);
  if(x.groupIds!==undefined){entry.groupIds=list(x.groupIds,id,100);if(entry.groupIds.some(g=>!groups.some(item=>item.id===g)))return fail();}
  for(const field of ['cover','previousCover','example','previousExample'] as const)if(x[field]!==undefined)entry[field]=media(x[field]);skills[key]=entry;
 }
 const view=(value:unknown,library=false)=>{const x=object(value,library?['view','density','showVersion','showDescription','showTags']:['view','density']);return {view:option(x.view,['grid','list'] as const),density:option(x.density,['compact','standard','comfortable'] as const),...(library?{showVersion:bool(x.showVersion),showDescription:bool(x.showDescription),showTags:bool(x.showTags)}:{})};};
 const home=object(o.home,['showRecent','recentCount','order','categoryIds']),order=list(home.order,x=>option(x,['shortcuts','recommended','recent'] as const),3);if(new Set(order).size!==3)return fail();const categoryIds=list(home.categoryIds,id,40);if(categoryIds.some(c=>!categories.some(item=>item.id===c)))return fail();
 const defaults=object(o.defaults,['imageLanguage','referenceRole','exportNaming']);
 const filters=unique(list(o.filters,value=>{const x=object(value,['id','name','query','categoryId','favorite','tag','groupId','input','output','status','hidden']);return {id:id(x.id),name:str(x.name,60,false),query:str(x.query,1000),categoryId:str(x.categoryId),favorite:bool(x.favorite),tag:str(x.tag,40),groupId:str(x.groupId),input:str(x.input??'all'),output:str(x.output??'all'),status:str(x.status??'all'),hidden:bool(x.hidden??false)};},50));
 const presets=unique(list(o.presets,value=>{const x=object(value,['id','name','skillId','fingerprint','parameters']),p=x.parameters;if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length>100)return fail();const parameters:Record<string,ParameterValue>={};for(const [key,value] of Object.entries(p)){id(key);if(typeof value==='string')parameters[key]=str(value,4000);else if(typeof value==='boolean')parameters[key]=value;else parameters[key]=number(value,-1e9,1e9);}return {id:id(x.id),name:str(x.name,60,false),skillId:id(x.skillId),fingerprint:str(x.fingerprint,200),parameters};},200));
 const templates=unique(list(o.templates,value=>{const x=object(value,['id','name','prompt','requirements']);return {id:id(x.id),name:str(x.name,60,false),prompt:str(x.prompt,8000),requirements:str(x.requirements,8000)};},200));
 return {schema:1,workflow:{maxConcurrency},revision:number(o.revision,0,Number.MAX_SAFE_INTEGER),categories,groups,projectGroups,skills,library:view(o.library,true) as Customization['library'],gallery:view(o.gallery),home:{showRecent:bool(home.showRecent),recentCount:number(home.recentCount,1,24),order,categoryIds},defaults:{imageLanguage:str(defaults.imageLanguage,60),referenceRole:option(defaults.referenceRole,['edit_target','style_reference','subject_reference','composition_reference','brand_asset']),exportNaming:option(defaults.exportNaming,['technical','project-version-date'])},filters,presets,templates};
}
export function removePersonalCategory(value:Customization,categoryId:string,targetId='uncategorized'):Customization{
 if(categoryId==='uncategorized'||categoryId===targetId||!value.categories.some(c=>c.id===targetId))throw Error('请选择另一个现有目标分类。');
 const next=structuredClone(value);next.categories=next.categories.filter(c=>c.id!==categoryId);next.home.categoryIds=next.home.categoryIds.filter(id=>id!==categoryId);next.filters=next.filters.map(f=>f.categoryId===categoryId?{...f,categoryId:targetId}:f);for(const entry of Object.values(next.skills))if(entry.categoryId===categoryId)entry.categoryId=targetId;return validateCustomization(next);
}
const legacyCategory:Record<string,string>={'海报设计':'poster','封面设计':'cover','品牌视觉':'brand','摄影艺术':'photo','摄影影像':'photo','艺术插画':'illustration','插画艺术':'illustration','三维艺术':'3d','三维视觉':'3d','信息图':'information','信息设计':'information','综合创作':'general','未分类':'uncategorized'};
export function personalCategoryId(category:string){return legacyCategory[category]||'uncategorized';}
