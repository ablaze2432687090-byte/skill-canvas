import type {GenerationPreset,PromptTemplate} from '../domain/customization.ts';
import type {SkillManifest} from '../domain/skill.ts';
import type {Draft} from '../domain/types.ts';
import {normalizeParameters} from '../domain/manifest.ts';
export function inspectPreset(preset:GenerationPreset,manifest:SkillManifest){
 const suggested=normalizeParameters(manifest.parameters,preset.parameters),changes:string[]=[];
 for(const key of Object.keys(preset.parameters))if(!manifest.parameters.some(p=>p.id===key))changes.push(key+': removed');
 for(const [key,value] of Object.entries(suggested))if(preset.parameters[key]!==value)changes.push(key+': changed');
 return {stale:preset.fingerprint!==(manifest.version.bundle||manifest.source.fingerprint),compatible:changes.length===0&&preset.skillId===manifest.installation.id,changes,suggested};
}
export function insertTemplate(draft:Draft,template:PromptTemplate):Partial<Draft>{
 const prompt=[draft.prompt,template.prompt].filter(Boolean).join('\n\n'),requirements=[draft.requirements,template.requirements].filter(Boolean).join('\n\n');
 if(prompt.length>8000||requirements.length>8000)throw Error('插入后超过 8000 字，原有内容未修改。');return {prompt,requirements};
}
