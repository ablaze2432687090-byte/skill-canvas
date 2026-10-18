export function desktopSourceFiles(source: DesktopSource): File[] {
  return source.files.map(item => {
    const binary = atob(item.data), bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const file = new File([bytes], item.path.split('/').at(-1)!);
    Object.defineProperty(file, 'webkitRelativePath', { value: `${source.folder}/${item.path}` });
    return file;
  });
}
