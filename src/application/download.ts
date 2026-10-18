export async function downloadOriginalPng(url: string, filename: string, save?: (blob: Blob, name: string) => Promise<void>) {
  const response = await fetch(url); if (!response.ok) throw new Error('无法读取结果文件。');
  const blob = await response.blob();
  if (blob.type !== 'image/png') throw new Error('结果不是已验证的 PNG。');
  return saveBlob(blob, filename, save);
}
function saveBlob(blob: Blob, filename: string, save?: (blob: Blob, name: string) => Promise<void>) {
  if (save) return save(blob, `${filename}.png`);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = objectUrl; link.download = `${filename}.png`;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
export async function downloadPng(url: string, filename: string, size: string, save?: (blob: Blob, name: string) => Promise<void>) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const [width, height] = size.split('×').map(value => Number(value.trim()));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器不支持图片导出。');
  context.fillStyle = '#f1ede5'; context.fillRect(0, 0, width, height);
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale, drawHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG 导出失败。')), 'image/png'));
  return saveBlob(blob, filename, save);
}
