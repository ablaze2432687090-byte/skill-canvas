import { t } from '../application/i18n';
import type { ParameterValue, SkillParameterDefinition } from '../domain/skill';
import { parameterOptions } from '../domain/manifest';
import { ParameterControl, SelectControl } from './primitives';

export function DynamicParameters({ definitions, values, onChange }: { definitions: SkillParameterDefinition[]; values: Record<string, ParameterValue>; onChange: (id: string, value: ParameterValue) => void }) {
  if (!definitions.length) return <p className="muted parameter-empty">{t("此 Skill 未声明参数，使用默认输出设置。")}</p>;
  return <>{definitions.map(definition => {
    const value = values[definition.id] ?? definition.default;
    if (definition.type === 'select') {
      const options = parameterOptions(definition, values);
      if(options.length===1)return <div className="parameter-readonly" key={definition.id}><span>{t(definition.label)}</span><output>{t(options[0])}</output></div>;
      return options.length > 1 && options.length <= 4 && options.every(option => option.length < 6)
        ? <ParameterControl key={definition.id} label={definition.label} values={options} value={String(value)} onChange={next => onChange(definition.id, next)} />
        : <SelectControl key={definition.id} label={definition.label} value={String(value)} onChange={next => onChange(definition.id, next)} options={options.map(option => ({ value: option, label: option }))} />;
    }
    return <div key={definition.id} className="dynamic-parameter"><label htmlFor={`parameter-${definition.id}`}>{t(definition.label)}{definition.type === 'range' && <output>{String(value)}</output>}</label>
      {definition.type === 'boolean' ? <input id={`parameter-${definition.id}`} type="checkbox" checked={Boolean(value)} onChange={event => onChange(definition.id, event.target.checked)} />
        : definition.type === 'text' ? <input id={`parameter-${definition.id}`} type="text" maxLength={500} value={String(value)} onChange={event => onChange(definition.id, event.target.value)} />
          : <input id={`parameter-${definition.id}`} aria-label={t(definition.label)} type={definition.type} min={definition.min} max={definition.max} step={definition.step} value={Number(value)} onChange={event => onChange(definition.id, event.target.valueAsNumber)} />}
    </div>;
  })}</>;
}
