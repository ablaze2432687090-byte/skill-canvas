/** Read only an explicitly named, plain-text prompt example. Never invent a template. */
export function declaredPromptExample(instructions: string): string | null {
  const section = /^#{1,6}\s+(?:示例提示词|基础提示词|Example Prompt|Sample Prompt|Prompt Template)\s*:?\s*\r?\n([\s\S]*?)(?=^#{1,6}\s|$(?![\s\S]))/mi.exec(instructions)?.[1];
  if (!section) return null;
  const example = /^\s*```(?:text|plaintext|prompt)?\s*\r?\n([\s\S]*?)\r?\n```/i.exec(section)?.[1]?.trim();
  return example && example.length <= 8000 ? example : null;
}
