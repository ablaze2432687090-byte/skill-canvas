// Strict allowlist: never include log contents, paths, names, prompts or credentials.
function createDiagnostics({version,platform,arch,bridgeReady,status,capabilities,probe,language}) {
  return {schema:1,createdAt:new Date().toISOString(),app:{version,platform,arch,language},bridge:{ready:!!bridgeReady},codex:{connected:status?.connected===true,authenticated:status?.authenticated===true,version:/^[\w. +()-]{1,80}$/.test(status?.version||'')?status.version:null,errorCode:/^[A-Z_]{1,60}$/.test(status?.error?.code||'')?status.error.code:null},images:{verified:capabilities?.automaticImageGeneration===true,probeStatus:['idle','running','completed','failed','cancelled'].includes(probe?.status)?probe.status:'unknown'},redacted:true};
}
module.exports={createDiagnostics};
