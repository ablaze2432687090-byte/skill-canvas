// Preview-only cache. Durable originals and downloads never use this image.
export async function thumbnail(blob:Blob):Promise<Blob>{
 const image=await createImageBitmap(blob);try{
  const scale=Math.min(1,640/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const context=canvas.getContext('2d');if(!context)throw Error('图片预览不可用。');context.drawImage(image,0,0,canvas.width,canvas.height);
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('图片预览不可用。')),'image/webp',.86));
 }finally{image.close();}
}
