/** Target canvas geometry, independent of catalog thumbnails and source image dimensions. */
export function canvasRatio(value: string): number {
  const match = /^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/.exec(value);
  const ratio = match ? Number(match[1]) / Number(match[2]) : 1;
  return Number.isFinite(ratio) && ratio >= .1 && ratio <= 10 ? ratio : 1;
}
export function fitCanvas(ratio: number, width: number, height: number) {
  const w = Math.max(0, Math.min(width, height * ratio));
  return { width: w, height: w / ratio };
}
