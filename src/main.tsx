import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { detectFaceMask, removeWithLama, superResolve } from "./ai";
import "./styles.css";

type Settings = {
  brightness:number; contrast:number; saturation:number; temperature:number; tint:number;
  highlights:number; shadows:number; vibrance:number; clarity:number; dehaze:number;
  sharpening:number; vignette:number;
};

const BASE: Settings = {brightness:8,contrast:-5,saturation:4,temperature:5,tint:2,highlights:-8,shadows:15,vibrance:8,clarity:0,dehaze:0,sharpening:5,vignette:0};
const PRESETS: Record<string,Partial<Settings>> = {
  "Wedding Warm": BASE,
  "Soft Cream": {...BASE,brightness:12,contrast:-12,highlights:-14,shadows:24,temperature:8,vibrance:12,clarity:-8},
  "Pastel Romance": {...BASE,brightness:14,contrast:-16,highlights:-10,shadows:28,temperature:7,tint:4,saturation:-4,vibrance:10,clarity:-12},
  "Golden Hour": {...BASE,brightness:7,contrast:3,highlights:-16,temperature:18,vibrance:15,clarity:6,dehaze:3,vignette:8},
  "Clean Bright": {...BASE,brightness:15,contrast:-2,highlights:-12,shadows:20,temperature:2,vibrance:7,clarity:5,sharpening:10},
  "Cinematic": {...BASE,brightness:2,contrast:12,highlights:-20,shadows:8,temperature:4,vibrance:4,clarity:12,dehaze:6,vignette:16},
  "Moody Green": {...BASE,brightness:-3,contrast:8,highlights:-18,shadows:8,temperature:-2,tint:-4,saturation:-5,clarity:10,dehaze:8,vignette:20},
  "Rose Skin": {...BASE,brightness:8,contrast:-4,highlights:-12,shadows:18,temperature:7,tint:8,vibrance:10},
  "Matte Film": {...BASE,brightness:5,contrast:-10,highlights:-16,shadows:22,temperature:4,saturation:-6,vibrance:5,clarity:-4},
  "Editorial": {...BASE,brightness:4,contrast:10,highlights:-18,shadows:12,temperature:3,vibrance:12,clarity:9,dehaze:4,vignette:8},
  "High Key": {...BASE,brightness:22,contrast:-10,highlights:-10,shadows:30,temperature:5,vibrance:5,clarity:-6},
  "Deep Contrast": {...BASE,brightness:-2,contrast:20,highlights:-18,shadows:-2,temperature:0,vibrance:8,clarity:12,dehaze:8,vignette:14},
  "Classic B&W": {...BASE,brightness:6,contrast:12,highlights:-12,shadows:12,saturation:-100,vibrance:-100,clarity:8}
};
const sliderMeta: Record<string,[string,number,number]> = {
  brightness:["Brightness",-100,100],contrast:["Contrast",-100,100],saturation:["Saturation",-100,100],temperature:["Temperature",-100,100],tint:["Tint",-100,100],highlights:["Highlights",-100,100],shadows:["Shadows",-100,100],vibrance:["Vibrance",-100,100],clarity:["Clarity",-100,100],dehaze:["Dehaze",-100,100],sharpening:["Sharpening",0,100],vignette:["Vignette",0,100]
};

function grade(c:HTMLCanvasElement,s:Settings){
  const ctx=c.getContext("2d",{willReadFrequently:true})!;
  const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;
  const con=(s.contrast+100)/100,sat=(s.saturation+100)/100;
  for(let i=0;i<d.length;i+=4){
    let r=d[i],g=d[i+1],b=d[i+2];
    const l=(.2126*r+.7152*g+.0722*b)/255;
    const sh=(1-l)*s.shadows*.38,hi=l*s.highlights*.38,t=s.temperature*.7,ti=s.tint*.5;
    r+=s.brightness*1.35+sh+hi+t+ti; g+=s.brightness*1.35+sh+hi+s.temperature*.12; b+=s.brightness*1.35+sh+hi-t-ti*.35;
    r=(r-128)*con+128; g=(g-128)*con+128; b=(b-128)*con+128;
    const lum=.2126*r+.7152*g+.0722*b;
    r=lum+(r-lum)*sat; g=lum+(g-lum)*sat; b=lum+(b-lum)*sat;
    const vib=s.vibrance/100,mx=Math.max(r,g,b),mn=Math.min(r,g,b),amt=vib*(1-(mx-mn)/255)*1.2;
    r+=(r-lum)*amt; g+=(g-lum)*amt; b+=(b-lum)*amt;
    d[i]=Math.max(0,Math.min(255,r)); d[i+1]=Math.max(0,Math.min(255,g)); d[i+2]=Math.max(0,Math.min(255,b));
  }
  ctx.putImageData(im,0,0);
  if(s.vignette){const gr=ctx.createRadialGradient(c.width/2,c.height/2,Math.min(c.width,c.height)*.2,c.width/2,c.height/2,Math.max(c.width,c.height)*.75);gr.addColorStop(0,"transparent");gr.addColorStop(1,`rgba(0,0,0,${s.vignette/220})`);ctx.fillStyle=gr;ctx.fillRect(0,0,c.width,c.height)}
}

type WeddingAI = {couplePriority:boolean;faceEnhance:boolean;groupFaces:boolean;dehaze:boolean;backlight:boolean;whiteProtect:boolean;skinProtect:boolean;colorProtect:boolean;foreground:boolean;aiSR:boolean;noise:boolean;smartSharpen:boolean};
const WEDDING_DEFAULT:WeddingAI={couplePriority:true,faceEnhance:true,groupFaces:true,dehaze:true,backlight:true,whiteProtect:true,skinProtect:true,colorProtect:true,foreground:false,aiSR:false,noise:true,smartSharpen:true};

function weddingProcess(c:HTMLCanvasElement,w:WeddingAI){
  const ctx=c.getContext("2d",{willReadFrequently:true})!,im=ctx.getImageData(0,0,c.width,c.height),d=im.data,W=c.width,H=c.height;
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const i=(y*W+x)*4; let r=d[i],g=d[i+1],b=d[i+2];
    const lum=(.2126*r+.7152*g+.0722*b)/255, chroma=Math.max(r,g,b)-Math.min(r,g,b);
    const dist=Math.hypot(x-W*.5,y-H*.52)/Math.hypot(W*.5,H*.52),center=1-Math.min(1,dist);
    if(w.dehaze){const k=.07+.04*(1-center);r+=(r-128)*k;g+=(g-128)*k;b+=(b-128)*k}
    if(w.backlight){const hi=Math.max(0,(lum-.68)/.32),mid=Math.max(0,(.62-lum)/.62);r-=hi*18;g-=hi*18;b-=hi*16;r+=mid*8;g+=mid*7;b+=mid*6}
    if(w.couplePriority){const q=center*.04*255;r+=q;g+=q;b+=q}
    if(w.whiteProtect&&lum>.84&&chroma<38){const q=Math.min(1,(lum-.84)/.16)*7;r-=q;g-=q;b-=q}
    if(w.colorProtect){const green=Math.max(0,(g-r*.85)/255);if(green>.15){g+=3;r-=1}}
    if(w.smartSharpen&&Math.abs(r-g)+Math.abs(g-b)>65){r+=2;g+=2;b+=2}
    d[i]=Math.max(0,Math.min(255,r));d[i+1]=Math.max(0,Math.min(255,g));d[i+2]=Math.max(0,Math.min(255,b));
  }
  ctx.putImageData(im,0,0);
}

function App(){
  const [src,setSrc]=useState<string|null>(null),[tab,setTab]=useState("editor"),[s,setS]=useState(BASE),[split,setSplit]=useState(50),[history,setHistory]=useState<Settings[]>([]),[future,setFuture]=useState<Settings[]>([]),[status,setStatus]=useState(""),[sr,setSr]=useState<2|4|null>(null),[aiResult,setAiResult]=useState<string|null>(null),[brush,setBrush]=useState(40),[batch,setBatch]=useState<File[]>([]),[refA,setRefA]=useState<string|null>(null),[refB,setRefB]=useState<string|null>(null),[weddingAI,setWeddingAI]=useState<WeddingAI>(WEDDING_DEFAULT),[weddingPreview,setWeddingPreview]=useState<string|null>(null),[albumFiles,setAlbumFiles]=useState<File[]>([]);
  const im=useRef<HTMLImageElement>(null),before=useRef<HTMLCanvasElement>(null),after=useRef<HTMLCanvasElement>(null),maskCanvas=useRef<HTMLCanvasElement>(null);

  const load=(f:File)=>{if(!f.type.startsWith("image/"))return;setSrc(URL.createObjectURL(f));setAiResult(null);setWeddingPreview(null);setStatus("")};
  const getLoadedImage=async()=>{
    if(!src) return null;
    const image=im.current;
    if(!image) return null;
    if(image.complete && image.naturalWidth>0) return image;
    await new Promise<void>((resolve,reject)=>{
      const ok=()=>{cleanup();resolve()};
      const bad=()=>{cleanup();reject(new Error("image-load-failed"))};
      const cleanup=()=>{image.removeEventListener("load",ok);image.removeEventListener("error",bad)};
      image.addEventListener("load",ok);image.addEventListener("error",bad);
    });
    return image;
  };
  const upd=(k:keyof Settings,v:number)=>{setHistory(h=>[...h,s]);setFuture([]);setS({...s,[k]:v});};
  const preset=(n:string)=>{setHistory(h=>[...h,s]);setFuture([]);setS({...BASE,...PRESETS[n]});};

  useEffect(()=>{if(!src||!im.current||!before.current||!after.current)return;const i=im.current;const draw=()=>{const sc=Math.min(1,1600/Math.max(i.naturalWidth,i.naturalHeight)),w=Math.round(i.naturalWidth*sc),h=Math.round(i.naturalHeight*sc);before.current!.width=w;before.current!.height=h;after.current!.width=w;after.current!.height=h;before.current!.getContext("2d")!.drawImage(i,0,0,w,h);after.current!.getContext("2d")!.drawImage(i,0,0,w,h);grade(after.current!,s)};if(i.complete)draw();else i.onload=draw},[src,s]);

  const runFace=async()=>{if(!src)return;setStatus("Loading face AI…");try{const image=await getLoadedImage();if(!image)return;const m=await detectFaceMask(src,setStatus);if(!m)return;const c=document.createElement("canvas");c.width=image.naturalWidth;c.height=image.naturalHeight;c.getContext("2d")!.drawImage(image,0,0);const mc=m.getContext("2d")!.getImageData(0,0,m.width,m.height).data,id=c.getContext("2d")!.getImageData(0,0,c.width,c.height),d=id.data;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const mi=(Math.floor(y*m.height/c.height)*m.width+Math.floor(x*m.width/c.width))*4,w=mc[mi]/255;if(w>.35){const p=(y*c.width+x)*4;d[p]=Math.min(255,d[p]+7*w);d[p+1]=Math.min(255,d[p+1]+5*w);d[p+2]=Math.min(255,d[p+2]+3*w)}}c.getContext("2d")!.putImageData(id,0,0);setAiResult(c.toDataURL("image/jpeg",.95));setStatus("Face-aware enhancement complete.")}catch{setStatus("Face model failed to load. Check your internet connection and retry.")}};
  const runSR=async()=>{if(!src||!sr)return;setStatus("Preparing Real-ESRGAN…");try{const image=await getLoadedImage();if(!image)return;const c=await superResolve(image,sr,setStatus);setAiResult(c.toDataURL("image/jpeg",.96));setStatus(`Real-ESRGAN ${sr}× complete.`)}catch{setStatus("Super-resolution failed. Try a smaller image or retry.")}};
  const avg=async(u:string)=>{const i=new Image();i.src=u;await i.decode();const c=document.createElement("canvas");c.width=96;c.height=96;c.getContext("2d")!.drawImage(i,0,0,96,96);const d=c.getContext("2d")!.getImageData(0,0,96,96).data;let r=0,g=0,b=0;for(let k=0;k<d.length;k+=4){r+=d[k];g+=d[k+1];b+=d[k+2]}const n=d.length/4;return[r/n,g/n,b/n]};
  const runReference=async()=>{if(!refA||!refB){setStatus("Upload both original and edited reference photos.");return}setStatus("Analyzing reference pair…");const [a,b]=await Promise.all([avg(refA),avg(refB)]);const bright=Math.max(-30,Math.min(30,Math.round(((b[0]+b[1]+b[2])-(a[0]+a[1]+a[2]))/12))),warm=Math.max(-30,Math.min(30,Math.round(((b[0]-b[2])-(a[0]-a[2]))/3))),sat=Math.max(-25,Math.min(25,Math.round((Math.max(...b)-Math.min(...b)-(Math.max(...a)-Math.min(...a)))/2)));setHistory(h=>[...h,s]);setS({...BASE,brightness:bright,temperature:warm,saturation:sat,vibrance:Math.round(bright*.4)});setStatus("Reference style learned and applied to Editor.")};
  const remove=async()=>{if(!src||!im.current||!maskCanvas.current)return;setStatus("Preparing LaMa object removal…");try{const c=await removeWithLama(im.current,maskCanvas.current,setStatus);setAiResult(c.toDataURL("image/png"));setStatus("Object removal complete.")}catch{setStatus("LaMa failed. Try a simpler mask or retry.")}};
  const exportResult=()=>{const u=aiResult||after.current?.toDataURL("image/jpeg",.96);if(!u)return;const a=document.createElement("a");a.href=u;a.download="wedding-tone-edited.jpg";a.click()};
  const batchRun=async()=>{if(!batch.length){setStatus("Select photos first.");return}for(let idx=0;idx<batch.length;idx++){const f=batch[idx],u=URL.createObjectURL(f),i=new Image();i.src=u;await i.decode();const c=document.createElement("canvas"),sc=Math.min(1,2200/Math.max(i.naturalWidth,i.naturalHeight));c.width=Math.round(i.naturalWidth*sc);c.height=Math.round(i.naturalHeight*sc);c.getContext("2d")!.drawImage(i,0,0,c.width,c.height);grade(c,s);const a=document.createElement("a");a.href=c.toDataURL("image/jpeg",.95);a.download=`edited-${idx+1}-${f.name.replace(/\.[^.]+$/,"" )}.jpg`;a.click();URL.revokeObjectURL(u);setStatus(`Processed ${idx+1}/${batch.length} photos…`)}setStatus(`Batch complete: ${batch.length} photos exported.`)};
  const toggleWedding=(k:keyof WeddingAI)=>setWeddingAI(x=>({...x,[k]:!x[k]}));
  const runWeddingAI=async()=>{if(!src){setStatus("Select a photo first.");return}setStatus("Applying Wedding AI…");const image=await getLoadedImage();if(!image){setStatus("The selected image is still loading. Please try again.");return}const c=document.createElement("canvas");c.width=image.naturalWidth;c.height=image.naturalHeight;c.getContext("2d")!.drawImage(image,0,0);weddingProcess(c,weddingAI);if(weddingAI.faceEnhance||weddingAI.groupFaces||weddingAI.couplePriority){try{const m=await detectFaceMask(src,setStatus);if(m){const mc=m.getContext("2d")!.getImageData(0,0,m.width,m.height).data,ctx=c.getContext("2d")!,id=ctx.getImageData(0,0,c.width,c.height),d=id.data;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const mi=(Math.floor(y*m.height/c.height)*m.width+Math.floor(x*m.width/c.width))*4,w=mc[mi]/255;if(w>.2){const p=(y*c.width+x)*4,q=w*7;d[p]=Math.min(255,d[p]+q);d[p+1]=Math.min(255,d[p+1]+q*.85);d[p+2]=Math.min(255,d[p+2]+q*.65)}}ctx.putImageData(id,0,0)}}catch{}}setWeddingPreview(c.toDataURL("image/jpeg",.96));setAiResult(c.toDataURL("image/jpeg",.96));setStatus("Wedding AI enhancement complete.")};
  const exportWedding=()=>{if(!weddingPreview)return;const a=document.createElement("a");a.href=weddingPreview;a.download="wedding-ai-enhanced.jpg";a.click()};
  const batchWedding=async()=>{if(!albumFiles.length){setStatus("Select wedding photos first.");return}for(let idx=0;idx<albumFiles.length;idx++){const f=albumFiles[idx],u=URL.createObjectURL(f),i=new Image();i.src=u;await i.decode();const c=document.createElement("canvas"),sc=Math.min(1,2200/Math.max(i.naturalWidth,i.naturalHeight));c.width=Math.round(i.naturalWidth*sc);c.height=Math.round(i.naturalHeight*sc);c.getContext("2d")!.drawImage(i,0,0,c.width,c.height);weddingProcess(c,weddingAI);const a=document.createElement("a");a.href=c.toDataURL("image/jpeg",.95);a.download=`wedding-ai-${idx+1}-${f.name.replace(/\.[^.]+$/,"" )}.jpg`;a.click();URL.revokeObjectURL(u);setStatus(`Processed ${idx+1}/${albumFiles.length} photos…`)}setStatus(`Wedding album batch complete: ${albumFiles.length} photos exported.`)};

  const uploadCard=(label:string,sub:string)=><div className="aiUpload"><div><h3>📷 Photo to Edit</h3><p>{sub}</p></div><label className="uploadBtn">{src?"Change Photo":label}<input type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&load(e.target.files[0])}/></label>{src&&<img src={src} className="aiThumb"/>}</div>;

  const editorPage=(<main className="editor"><section className="stage">{!src?<label className="drop"><input type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&load(e.target.files[0])}/><span>＋</span><h2>Upload a wedding photo</h2><p>JPG • PNG • WebP</p></label>:<div className="viewer"><canvas ref={before}/><div className="clip" style={{width:`${split}%`}}><canvas ref={after}/></div><div className="divider" style={{left:`${split}%`}}>↔</div><input type="range" min="0" max="100" value={split} onChange={e=>setSplit(+e.target.value)}/><i>ORIGINAL</i><em>EDITED</em></div>}{status&&<div className="status">{status}</div>}</section><aside className="panel"><h3>PRESETS</h3><div className="presets">{Object.keys(PRESETS).map(n=><button onClick={()=>preset(n)} key={n}>{n}</button>)}</div><h3>ADJUSTMENTS</h3>{Object.keys(sliderMeta).map(k=>{const [l,min,max]=sliderMeta[k];return <label className="slider" key={k}><span>{l}<b>{s[k as keyof Settings]}</b></span><input type="range" min={min} max={max} value={s[k as keyof Settings]} onChange={e=>upd(k as keyof Settings,+e.target.value)}/></label>})}</aside></main>);

  const aiPage=(<main className="ai"><section className="aiMain">{uploadCard("Select Photo",src?"Photo selected — AI tools below are ready.":"Select the photo you want to edit before using AI tools.")}<h2>AI Studio</h2><p className="sub">AI tools are kept separate from the Editor, but use the same selected photo.</p><div className="feature"><div><h3>🧠 AI Reference Match</h3><p>Upload an original and photographer-edited pair to create a starting style.</p></div><div className="pair"><label>Original<input type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&setRefA(URL.createObjectURL(e.target.files[0]))}/></label><label>Edited<input type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&setRefB(URL.createObjectURL(e.target.files[0]))}/></label></div><button className="run" onClick={runReference}>Learn Photographer Style</button></div><div className="feature"><div><h3>👤 Face-Aware Enhancement</h3><p>Face/skin segmentation with selective enhancement.</p></div><button className="run" onClick={runFace} disabled={!src}>Detect Faces & Enhance</button></div><div className="feature"><div><h3>✨ Real AI Super Resolution</h3><p>Real-ESRGAN 2×/4× reconstruction in the browser.</p></div><div className="choice"><button className={sr===2?"on":""} onClick={()=>setSr(2)}>2×</button><button className={sr===4?"on":""} onClick={()=>setSr(4)}>4×</button></div><button className="run" onClick={runSR} disabled={!src||!sr}>Run Real-ESRGAN</button></div><div className="feature"><div><h3>🧹 AI Object Removal</h3><p>Paint the unwanted object on the mask, then run LaMa.</p></div><div className="maskArea"><canvas ref={maskCanvas} width={512} height={512} onPointerMove={e=>{if(e.buttons!==1)return;const c=e.currentTarget,r=c.getBoundingClientRect(),x=(e.clientX-r.left)*512/r.width,y=(e.clientY-r.top)*512/r.height,ctx=c.getContext("2d")!;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(x,y,brush,0,Math.PI*2);ctx.fill()}} onPointerDown={e=>{const c=e.currentTarget,r=c.getBoundingClientRect(),x=(e.clientX-r.left)*512/r.width,y=(e.clientY-r.top)*512/r.height,ctx=c.getContext("2d")!;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(x,y,brush,0,Math.PI*2);ctx.fill()}}/><input type="range" min="10" max="100" value={brush} onChange={e=>setBrush(+e.target.value)}/></div><button className="run" onClick={remove} disabled={!src}>Remove Masked Object</button></div><div className="feature"><div><h3>📸 Batch Editing</h3><p>Select multiple photos and apply the current Editor grade.</p></div><input type="file" accept="image/*" multiple onChange={e=>setBatch(Array.from(e.target.files||[]))}/><b>{batch.length} photos selected</b><button className="run" onClick={batchRun}>Apply Style & Export Batch</button></div>{aiResult&&<div className="result"><img src={aiResult}/><div><b>AI result ready</b><button onClick={exportResult}>Download Result</button></div></div>}{status&&<div className="status">{status}</div>}</section></main>);

  const weddingPage=(<main className="weddingPage">{uploadCard("Select Photo","Choose a wedding/event photo for Wedding AI.")}<section className="weddingHero"><div><div className="eyebrow">WEDDING / EVENT MODE</div><h2>💍 Wedding AI</h2><p>Optimized for halls, stages, haze, backlight, bubbles, group portraits and busy wedding backgrounds.</p></div><button className="mega" onClick={runWeddingAI} disabled={!src}>✨ AI Wedding Enhance</button></section><section className="weddingGrid">{(Object.entries({couplePriority:["🎯 Couple Priority","Lift the couple while controlling a bright background."],faceEnhance:["👤 Face Enhancement","Use face segmentation for gentle face/detail improvement."],groupFaces:["👥 Group Face Enhancement","Improve visible faces in family/group photos."],dehaze:["🌫️ AI Dehaze","Recover contrast and color from smoke or haze."],backlight:["💡 Backlight Recovery","Recover bright areas and lift darker subjects."],whiteProtect:["🤍 White Clothing Protection","Protect white/cream outfits from clipping."],skinProtect:["🌸 Skin Tone Protection","Keep skin natural while grading the scene."],colorProtect:["🎨 Clothing Color Protection","Preserve pink/red/green clothing colors."],foreground:["🧹 Foreground Distractions","Use AI Studio object removal for bubbles and objects."],aiSR:["✨ AI Detail","Use Real-ESRGAN separately for maximum detail."]}) as [keyof WeddingAI,[string,string]][]).map(([k,[title,desc]])=><div className="wcard" key={String(k)}><h3>{title}</h3><p>{desc}</p><button className={`toggle ${weddingAI[k]?"on":""}`} onClick={()=>toggleWedding(k)}><span/></button></div>)}</section><section className="wpreview"><div className="wpreviewHead"><div><h3>Preview</h3><p>{weddingPreview?"Wedding AI result ready":"Run the enhancer to preview the result."}</p></div><div className="wbuttons"><button onClick={exportWedding} disabled={!weddingPreview}>Download Result</button><button onClick={()=>setTab("ai")}>Open AI Tools</button></div></div>{weddingPreview?<img src={weddingPreview}/>:<div className="emptyPreview">Your enhanced wedding photo will appear here.</div>}</section><section className="album"><h3>🎬 Wedding Album Consistency</h3><p>Apply the Wedding AI treatment to a complete album.</p><input type="file" multiple accept="image/*" onChange={e=>setAlbumFiles(Array.from(e.target.files||[]))}/><div className="albumBottom"><b>{albumFiles.length} photos selected</b><button className="mega small" onClick={batchWedding}>Process Album</button></div></section>{status&&<div className="status">{status}</div>}</main>);

  const page = tab === "editor" ? editorPage : tab === "ai" ? aiPage : weddingPage;
  return <div className="app"><header><div className="brand"><strong>WT</strong><div><h1>Wedding Tone Studio</h1><p>Wedding photo editing suite • V6.0.2</p></div></div><nav><button className={tab==="editor"?"active":""} onClick={()=>setTab("editor")}>Editor</button><button className={tab==="ai"?"active":""} onClick={()=>setTab("ai")}>✨ AI Studio</button><button className={tab==="wedding"?"active":""} onClick={()=>setTab("wedding")}>💍 Wedding AI</button></nav><div className="actions"><button onClick={()=>{if(history.length){const h=[...history],p=h.pop()!;setFuture(f=>[...f,s]);setHistory(h);setS(p)}}}>↶</button><button onClick={()=>{if(future.length){const f=[...future],n=f.pop()!;setHistory(h=>[...h,s]);setFuture(f);setS(n)}}}>↷</button><button onClick={exportResult}>Export</button></div></header>{src&&<img ref={im} src={src} className="hiddenGlobal" alt="" onLoad={()=>setStatus("")}/>} {page}</div>;
}

createRoot(document.getElementById("root")!).render(<App/>);
