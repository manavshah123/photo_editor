import * as ort from "onnxruntime-web";
import { pipeline } from "@huggingface/transformers";

export const MODELS = {
  face: "Xenova/face-parsing",
  sr2: "https://huggingface.co/SceneWorks/real-esrgan-onnx/resolve/main/real_esrgan_x2.onnx",
  sr4: "https://huggingface.co/SceneWorks/real-esrgan-onnx/resolve/main/real_esrgan_x4.onnx",
  lama: "https://huggingface.co/sapienkit/LaMa-ONNX/resolve/main/lama_fp32.onnx"
};

let facePipe:any=null;
const sessions:Record<string,any>={};

export async function loadFaceModel(onProgress?:(x:string)=>void){
  if(facePipe)return facePipe;
  onProgress?.("Downloading face-parsing model…");
  facePipe=await pipeline("image-segmentation",MODELS.face,{dtype:"q8"});
  onProgress?.("Face model ready.");
  return facePipe;
}

async function loadSession(kind:"sr2"|"sr4"|"lama",onProgress?:(x:string)=>void){
  if(sessions[kind])return sessions[kind];
  const url=MODELS[kind];
  onProgress?.(`Downloading ${kind==="lama"?"object-removal":"super-resolution"} model…`);
  // WebGPU first where available; WASM is the fallback.
  try{
    sessions[kind]=await ort.InferenceSession.create(url,{executionProviders:["webgpu","wasm"],graphOptimizationLevel:"all"});
  }catch{
    sessions[kind]=await ort.InferenceSession.create(url,{executionProviders:["wasm"],graphOptimizationLevel:"all"});
  }
  onProgress?.(`${kind==="lama"?"Object-removal":"Super-resolution"} model ready.`);
  return sessions[kind];
}

function canvasToCHW(canvas:HTMLCanvasElement){
  const c=canvas.getContext("2d",{willReadFrequently:true})!;
  const d=c.getImageData(0,0,canvas.width,canvas.height).data;
  const n=canvas.width*canvas.height;
  const out=new Float32Array(n*3);
  for(let i=0;i<n;i++){out[i]=d[i*4]/255;out[n+i]=d[i*4+1]/255;out[n*2+i]=d[i*4+2]/255;}
  return new ort.Tensor("float32",out,[1,3,canvas.height,canvas.width]);
}

function tensorToCanvas(t:any){
  const dims=t.dims; const h=dims[dims.length-2],w=dims[dims.length-1],data=t.data;
  const c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d")!,im=x.createImageData(w,h);
  const n=w*h;
  for(let i=0;i<n;i++){im.data[i*4]=Math.max(0,Math.min(255,data[i]*255));im.data[i*4+1]=Math.max(0,Math.min(255,data[n+i]*255));im.data[i*4+2]=Math.max(0,Math.min(255,data[n*2+i]*255));im.data[i*4+3]=255;}
  x.putImageData(im,0,0);return c;
}

export async function superResolve(source:HTMLImageElement,scale:2|4,onProgress?:(x:string)=>void){
  const session=await loadSession(scale===2?"sr2":"sr4",onProgress);
  // Keep inference dimensions reasonable for browser memory; the model itself performs the true 2x/4x reconstruction.
  const maxSide=720;
  const f=Math.min(1,maxSide/Math.max(source.naturalWidth,source.naturalHeight));
  const w=Math.max(32,Math.round(source.naturalWidth*f)),h=Math.max(32,Math.round(source.naturalHeight*f));
  const input=document.createElement("canvas");input.width=w;input.height=h;input.getContext("2d")!.drawImage(source,0,0,w,h);
  onProgress?.(`Running Real-ESRGAN ${scale}× inference…`);
  const tensor=canvasToCHW(input);
  const name=session.inputNames[0];
  const result=await session.run({[name]:tensor});
  const out=result[session.outputNames[0]];
  return tensorToCanvas(out);
}

export async function detectFaceMask(url:string,onProgress?:(x:string)=>void){
  const pipe=await loadFaceModel(onProgress);
  const result=await pipe(url);
  const c=document.createElement("canvas");
  const first=result?.[0]?.mask;
  if(first){
    const mc=first.toCanvas ? first.toCanvas() : null;
    if(mc){c.width=mc.width;c.height=mc.height;c.getContext("2d")!.drawImage(mc,0,0);return c;}
  }
  return null;
}

export async function removeWithLama(source:HTMLImageElement,maskCanvas:HTMLCanvasElement,onProgress?:(x:string)=>void){
  const session=await loadSession("lama",onProgress);
  const size=512;
  const image=document.createElement("canvas");image.width=size;image.height=size;
  image.getContext("2d")!.drawImage(source,0,0,size,size);
  const mask=document.createElement("canvas");mask.width=size;mask.height=size;
  mask.getContext("2d")!.drawImage(maskCanvas,0,0,size,size);
  const ic=image.getContext("2d")!.getImageData(0,0,size,size).data;
  const mc=mask.getContext("2d")!.getImageData(0,0,size,size).data;
  const n=size*size, imgData=new Float32Array(n*3), maskData=new Float32Array(n);
  for(let i=0;i<n;i++){imgData[i]=ic[i*4]/255;imgData[n+i]=ic[i*4+1]/255;imgData[n*2+i]=ic[i*4+2]/255;maskData[i]=mc[i*4]/255;}
  const inputs:any={};
  const ins=session.inputNames;
  inputs[ins.find((x:string)=>x.toLowerCase().includes("image"))||ins[0]]=new ort.Tensor("float32",imgData,[1,3,size,size]);
  inputs[ins.find((x:string)=>x.toLowerCase().includes("mask"))||ins[1]]=new ort.Tensor("float32",maskData,[1,1,size,size]);
  onProgress?.("Running LaMa inpainting…");
  const result=await session.run(inputs);
  const out=result[session.outputNames[0]];
  const c=tensorToCanvas(out);
  return c;
}