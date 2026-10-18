import type {SkillManifest} from '../domain/skill.ts';
import type {Draft} from '../domain/types.ts';
import {applySkillParameters} from './skillViews.ts';
export function applyDefaultImageLanguage(draft:Draft,manifest:SkillManifest,language:string):Draft {
 const definition=manifest.parameters.find(parameter=>/(?:^|_)(?:language|lang)$/.test(parameter.id));
 if(!language.trim()||!definition)return draft;
 if(definition.type==='select'){const selected=definition.options.find(option=>option.toLowerCase()===language.trim().toLowerCase());if(!selected)return draft;return applySkillParameters({...draft,parameters:{...draft.parameters,[definition.id]:selected}},manifest);}
 if(definition.type==='text')return applySkillParameters({...draft,parameters:{...draft.parameters,[definition.id]:language.trim()}},manifest);
 return draft;
}
