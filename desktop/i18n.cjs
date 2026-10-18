const english = {...require('./locales/en.json'), ...require('./locales/skill-en.json')};
function normalizeLanguage(value) { return typeof value==='string' && /^zh(?:-|$)/i.test(value) ? 'zh-CN' : 'en'; }
function translate(value,language) {
  if(language!=='en'||typeof value!=='string')return value;
  const key=value.trim();return english[key]?value.replace(key,()=>english[key]):value;
}
function dialogOptions(options,language) {
  const result={...options};
  for(const key of ['title','message','detail','buttonLabel'])if(result[key])result[key]=translate(result[key],language);
  if(result.buttons)result.buttons=result.buttons.map(value=>translate(value,language));
  return result;
}
async function initialLanguage({saved,system,execute,platform=process.platform}) {
  if(saved==='zh-CN'||saved==='en')return saved;
  if(platform==='win32')try {
    const {stdout}=await execute('reg.exe',['query','HKCU\\Software\\SkillCanvas','/v','InstallerLanguage'],{windowsHide:true,timeout:3000});
    const value=stdout.match(/InstallerLanguage\s+REG_SZ\s+(\d+)/i)?.[1];
    if(value==='2052')return 'zh-CN';if(value==='1033')return 'en';
  }catch{ /* A portable/development launch follows the operating system. */ }
  return normalizeLanguage(system);
}
module.exports={english,translate,normalizeLanguage,dialogOptions,initialLanguage};
