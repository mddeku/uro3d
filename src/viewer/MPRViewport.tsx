import { useEffect,useRef,useState } from 'react';
import { Expand, Minimize } from 'lucide-react';
import type { Series,Vec3 } from '../types/imaging';
import { createVolume } from '../core/volume';
import { samplePatient } from '../core/geometry/sampling';
import type { VolumeData } from '../core/geometry/sampling';
import { windowPixel } from '../core/dicom/parser';
import { useWorkstation } from '../stores/workstation';
const planes=[{name:'Axial',fixed:2,u:0,v:1,flip:false,labels:['R','L','A','P']},{name:'Coronal',fixed:1,u:0,v:2,flip:true,labels:['R','L','S','I']},{name:'Sagittal',fixed:0,u:1,v:2,flip:true,labels:['A','P','S','I']}];
function Plane({volume,plane,point,onPoint}:{volume:VolumeData;plane:typeof planes[number];point:Vec3;onPoint:(p:Vec3)=>void}) {
  const canvas=useRef<HTMLCanvasElement>(null), overlay=useRef<HTMLCanvasElement>(null);const {center,width}=useWorkstation(s=>s.view);
  const {u,v,fixed,flip}=plane,b=volume.bounds,spanU=b[u*2+1]-b[u*2],spanV=b[v*2+1]-b[v*2];
  const fixedValue=point[fixed];
  const w=Math.max(2,Math.round(400*spanU/Math.max(spanU,spanV))),h=Math.max(2,Math.round(400*spanV/Math.max(spanU,spanV)));
  useEffect(()=>{
    const c=canvas.current;if(!c)return;const renderW=w,renderH=h;c.width=renderW;c.height=renderH;
    let raf=window.requestAnimationFrame(()=>{const ctx=c.getContext('2d')!,image=ctx.createImageData(renderW,renderH);
      for(let y=0;y<renderH;y++)for(let x=0;x<renderW;x++){
        const p=[0,0,0] as Vec3;p[fixed]=fixedValue;p[u]=b[u*2]+x/(renderW-1)*spanU;p[v]=b[v*2]+(flip?1-y/(renderH-1):y/(renderH-1))*spanV;
        const value=windowPixel(samplePatient(volume,p),center,width),index=(y*renderW+x)*4;image.data[index]=value;image.data[index+1]=value;image.data[index+2]=value;image.data[index+3]=255;
      }
      ctx.putImageData(image,0,0);
    });
    return()=>window.cancelAnimationFrame(raf);
  },[volume,fixedValue,center,width,u,v,fixed,flip,w,h,spanU,spanV,b]);
  useEffect(()=>{
    const c=overlay.current;if(!c)return;c.width=w;c.height=h;const ctx=c.getContext('2d')!;ctx.clearRect(0,0,w,h);ctx.strokeStyle='#78e7caaa';ctx.lineWidth=1;
    const cx=(point[u]-b[u*2])/spanU*(w-1),cy=(flip?1-(point[v]-b[v*2])/spanV:(point[v]-b[v*2])/spanV)*(h-1);ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx,h);ctx.moveTo(0,cy);ctx.lineTo(w,cy);ctx.stroke();
  },[point,u,v,flip,w,h,spanU,spanV,b]);
  return <section className="mpr-plane"><b>{plane.name.toUpperCase()} · {point[fixed].toFixed(1)} mm</b><div className="mpr-image"><canvas ref={canvas} data-testid={`mpr-${plane.name.toLowerCase()}`} style={{width:w,height:h,aspectRatio:`${w}/${h}`}} onClick={e=>{const r=e.currentTarget.getBoundingClientRect(),p=[...point] as Vec3;p[u]=b[u*2]+(e.clientX-r.left)/r.width*spanU;p[v]=b[v*2]+(flip?1-(e.clientY-r.top)/r.height:(e.clientY-r.top)/r.height)*spanV;onPoint(p);}}/><canvas ref={overlay} className="mpr-crosshair" aria-hidden="true" style={{width:w,height:h,aspectRatio:`${w}/${h}`}}/><span className="orientation west">{plane.labels[0]}</span><span className="orientation east">{plane.labels[1]}</span><span className="orientation north">{plane.labels[2]}</span><span className="orientation south">{plane.labels[3]}</span></div><input aria-label={`${plane.name} position`} type="range" min={b[fixed*2]} max={b[fixed*2+1]} step={Math.min(...volume.spacing)/2} value={point[fixed]} onChange={e=>{const p=[...point] as Vec3;p[fixed]=Number(e.target.value);onPoint(p);}}/></section>;
}
export default function MPRViewport({series,initialPlane='all'}:{series:Series;initialPlane?:'all'|'Axial'|'Coronal'|'Sagittal'}) {
  const panel=useRef<HTMLDivElement>(null); const [fullscreen,setFullscreen]=useState(false);
  useEffect(()=>{const onChange=()=>setFullscreen(document.fullscreenElement===panel.current);document.addEventListener('fullscreenchange',onChange);return()=>document.removeEventListener('fullscreenchange',onChange);},[]);
  const toggleFullscreen=async()=>{if(document.fullscreenElement) await document.exitFullscreen(); else await panel.current?.requestFullscreen();};
  const [volume,setVolume]=useState<VolumeData|null>(null),[point,setPoint]=useState<Vec3>([0,0,0]),[progress,setProgress]=useState(0),[error,setError]=useState(''),[selected,setSelected]=useState<'all'|'Axial'|'Coronal'|'Sagittal'>(initialPlane);
  useEffect(()=>{let cancelled=false;setVolume(null);setError('');void createVolume(series,setProgress,()=>cancelled,384,true).then(v=>{if(cancelled)return;setVolume(v);setPoint([0,1,2].map(i=>(v.bounds[2*i]+v.bounds[2*i+1])/2) as Vec3);}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;};},[series]);
  if(error)return <div className="import-problems" role="alert">{error}</div>;
  if(!volume)return <div className="empty-state">Preparing patient-space MPR… {progress}%</div>;
  return <div className={`mpr-panel${fullscreen?" is-fullscreen":""}`} ref={panel}><button className="icon-button mpr-fullscreen" aria-label={fullscreen?"Exit fullscreen":"Enter fullscreen"} onClick={toggleFullscreen}>{fullscreen?<Minimize size={16}/>:<Expand size={16}/>}</button><div className="mpr-toolbar" role="group" aria-label="MPR orientation"><span>View</span>{(['all','Axial','Coronal','Sagittal'] as const).map(name=><button key={name} className={selected===name?'active':''} onClick={()=>setSelected(name)}>{name==='all'?'All planes':name}</button>)}</div><div className={`mpr-grid mpr-${selected.toLowerCase()}`}>{planes.map(plane=><Plane key={plane.name} volume={volume} plane={plane} point={point} onPoint={setPoint}/>)}</div><p>Click to synchronize crosshair · LPS {point.map(v=>v.toFixed(1)).join(', ')} mm</p><p>MPR preview: {volume.dimensions.join(' × ')} · spacing {volume.spacing.map(v=>v.toFixed(2)).join(' × ')} mm. {volume.strides.some(v=>v>1)?'Reduced resolution; original detail and measurements remain in 2D.':'Original volume resolution.'}</p></div>;
}
