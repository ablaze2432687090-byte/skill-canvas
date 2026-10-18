import { t } from '../application/i18n';
import { declaredPromptExample } from '../domain/promptGuidance';
export function SkillPromptGuidance({instructions,prompt,onExample}:{instructions:string;prompt:string;onExample:(value:string)=>void}) {
  const example=declaredPromptExample(instructions);
  return <div className="skill-prompt-guidance" id="prompt-guidance">
    <p>{t(instructions.trim() ? '生成时会自动应用此 Skill 的基础指令。' : '此 Skill 未提供基础指令，请先到 Skill 管理检查。')}</p>
    <p>{t('这里填写本次内容与要求，不必复制 Skill 的使用规则。')}</p>
    {instructions.trim() && <details><summary>{t('查看 Skill 基础指令')}</summary><pre>{instructions}</pre></details>}
    {example && <div className="prompt-example-action"><button type="button" disabled={!!prompt.trim()} onClick={()=>{if(!prompt.trim())onExample(example);}}>{t('填入 Skill 示例')}</button><span>{t('来自 Skill 原文，仅在输入框为空时填入。')}</span></div>}
  </div>;
}
