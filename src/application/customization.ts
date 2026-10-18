import type {Customization,SkillOverride} from '../domain/customization.ts';
import {personalCategoryId} from '../domain/customization.ts';
import type {Skill} from '../domain/types.ts';
import {getLanguage} from './i18n.ts';
import type {SkillExampleView} from './presentation.ts';
import type {SkillManifest} from '../domain/skill.ts';
export function categoryName(category:Customization['categories'][number]){return getLanguage()==='en'?category.englishName||category.name:category.name;}
export function recommendedPersonalCategory(manifest:SkillManifest|undefined,category:string){
 if(manifest?.name==='imagegen')return 'general';
 if(manifest&&(manifest.categories.some(c=>/^(信息图|信息设计|infographic|information design)$/i.test(c))||/^(?:baoyu-)?infographic$/i.test(manifest.name)))return 'information';
 return personalCategoryId(category);
}
export function skillCategoryId(skill:Skill,value:Customization){return value.skills[skill.id]?.categoryId||recommendedPersonalCategory(skill.manifest,skill.categories[0]||'');}
export function personalizeSkill(skill:Skill,value:Customization):Skill {
 const entry=value.skills[skill.id]||{},translation=entry.translations?.[getLanguage()],category=value.categories.find(c=>c.id===skillCategoryId(skill,value));
 const copy={...skill,categoryId:skillCategoryId(skill,value),name:translation?.name?.trim()||skill.name,description:translation?.description?.trim()||skill.description,categories:[category?categoryName(category):'未分类'],personal:entry};
 if(skill.manifest)copy.manifest={...skill.manifest,installation:{...skill.manifest.installation,favorite:entry.favorite??skill.manifest.installation.favorite}};
 const image=(role:'cover'|'example'):SkillExampleView|undefined=>{const media=entry[role];return media?{id:'personal-'+media.id,image:'personal-media:'+media.id,label:role==='cover'?'Personal cover':'Personal example',exampleSource:'personal_upload',verified:false,skillId:skill.id,skillVersion:skill.manifest?.version.installed||null,sha256:media.id,width:media.width,height:media.height,recordedAt:media.createdAt,purpose:media.source,role:role==='cover'?'cover':'case',ordinal:role==='cover'?0:1}:undefined;};
 if(copy.presentation){const cover=image('cover')||copy.presentation.featuredExample,example=image('example')||copy.presentation.examples.find(e=>e.id!==copy.presentation?.featuredExample?.id);copy.presentation={...copy.presentation,displayName:copy.name,displayDescription:copy.description,displayCategory:copy.categories,featuredExample:cover,examples:[cover,example].filter((v):v is SkillExampleView=>!!v)};if(cover)copy.cover=copy.homeCover=cover.image;copy.examples=copy.presentation.examples.map(e=>e.image);}
 return copy;
}
export function mergeSkillOverride(previous:SkillOverride,patch:Partial<SkillOverride>):SkillOverride{return {...previous,...patch,translations:patch.translations?{...previous.translations,...patch.translations}:previous.translations};}
