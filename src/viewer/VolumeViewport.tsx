import { useEffect,useRef,useState } from 'react';
import { Expand, Minimize } from 'lucide-react';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkAnnotatedCubeActor from '@kitware/vtk.js/Rendering/Core/AnnotatedCubeActor';
import vtkOrientationMarkerWidget from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget';
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkLineSource from '@kitware/vtk.js/Filters/Sources/LineSource';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkTubeFilter from '@kitware/vtk.js/Filters/General/TubeFilter';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import { loadPixels } from '../core/dicom/client';
import { volumeGeometry } from '../core/geometry/volume';
import type { Series } from '../types/imaging';
import { useWorkstation } from '../stores/workstation';
type Scene={window:ReturnType<typeof vtkGenericRenderWindow.newInstance>;mapper:ReturnType<typeof vtkVolumeMapper.newInstance>;color:ReturnType<typeof vtkColorTransferFunction.newInstance>;opacity:ReturnType<typeof vtkPiecewiseFunction.newInstance>;clip:ReturnType<typeof vtkPlane.newInstance>;bounds:number[];tract?:ReturnType<typeof vtkActor.newInstance>;tractSource?:ReturnType<typeof vtkLineSource.newInstance>;entry?:ReturnType<typeof vtkActor.newInstance>;target?:ReturnType<typeof vtkActor.newInstance>;corridor?:ReturnType<typeof vtkActor.newInstance>;corridorSource?:ReturnType<typeof vtkTubeFilter.newInstance>};
type Candidate={id:string;label:string;entry:[number,number,number];target:[number,number,number];length:number;angles:[number,number,number];score:number;notes:string[]};
export default function VolumeViewport({series,planner=false}:{series:Series;planner?:boolean}) {
  const panel=useRef<HTMLElement>(null);
  const [fullscreen,setFullscreen]=useState(false);
  useEffect(()=>{const onChange=()=>setFullscreen(document.fullscreenElement===panel.current);document.addEventListener('fullscreenchange',onChange);return()=>document.removeEventListener('fullscreenchange',onChange);},[]);
  const toggleFullscreen=async()=>{if(document.fullscreenElement) await document.exitFullscreen(); else await panel.current?.requestFullscreen();};
  const host=useRef<HTMLDivElement>(null),scene=useRef<Scene|null>(null);
  const {setTrajectory}=useWorkstation();
  const [progress,setProgress]=useState(0),[error,setError]=useState(''),[ready,setReady]=useState(false),[detail,setDetail]=useState('');
  const [threshold,setThreshold]=useState(150),[opacity,setOpacity]=useState(.35),[clip,setClip]=useState(0),[projection,setProjection]=useState(false);
  const [entry,setEntry]=useState<[number,number,number]>([0,0,0]),[target,setTarget]=useState<[number,number,number]>([0,0,0]),[corridor,setCorridor]=useState(5);
  const [candidates,setCandidates]=useState<Candidate[]>([]),[selectedCandidate,setSelectedCandidate]=useState('');
  const [side,setSide]=useState<'left'|'right'>('left');
  const [bounds,setBounds]=useState<number[]|null>(null);
  const hu=series.frames.every(f=>f.calibratedHU);
  useEffect(()=>{
    let cancelled=false,cleanup=()=>{};
    setReady(false);setProgress(0);setError('');
    void(async()=>{
      try{
        const geometry=volumeGeometry(series);
        const probe=document.createElement('canvas');const gl=probe.getContext('webgl2');
        if(!gl)throw new Error('3D requires WebGL2. Enable hardware acceleration or open in Edge/Chrome.');
        const maxTexture=gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) as number;gl.getExtension('WEBGL_lose_context')?.loseContext();
        const limit=Math.min(256,maxTexture);
        // Preview decimation only; acquired 2D always keeps original pixels.
        const strides=geometry.dimensions.map(n=>Math.max(1,Math.ceil((n-1)/(limit-1))));
        const dims=geometry.dimensions.map((n,i)=>Math.floor((n-1)/strides[i])+1);
        const values=new Float32Array(dims[0]*dims[1]*dims[2]);
        for(let k=0;k<dims[2];k++){
          if(cancelled)return;
          const f=series.frames[k*strides[2]],pixels=await loadPixels(f);
          if(cancelled)return;
          for(let j=0;j<dims[1];j++)for(let i=0;i<dims[0];i++){
            const value=pixels[j*strides[1]*f.columns+i*strides[0]];
            values[(k*dims[1]+j)*dims[0]+i]=Number.isFinite(value)?value:-32768;
          }
          setProgress(Math.round((k+1)/dims[2]*100));
          await new Promise(resolve=>setTimeout(resolve,0));
        }
        if(cancelled||!host.current)return;
        const image=vtkImageData.newInstance();image.setDimensions(dims[0],dims[1],dims[2]);image.setSpacing(geometry.spacing.map((v,i)=>v*strides[i]));image.setOrigin(geometry.origin);image.setDirection(geometry.direction as [number,number,number,number,number,number,number,number,number]);
        const scalars=vtkDataArray.newInstance({name:hu?'HU':'Intensity',values,numberOfComponents:1});image.getPointData().setScalars(scalars);
        const window=vtkGenericRenderWindow.newInstance({background:[.025,.04,.05]});window.setContainer(host.current);
        const mapper=vtkVolumeMapper.newInstance();mapper.setInputData(image);mapper.setSampleDistance(Math.min(...geometry.spacing)*.8);mapper.setMaximumSamplesPerRay(3000);
        const volume=vtkVolume.newInstance();volume.setMapper(mapper);
        const color=vtkColorTransferFunction.newInstance(),ofun=vtkPiecewiseFunction.newInstance();
        volume.getProperty().setRGBTransferFunction(0,color);volume.getProperty().setScalarOpacity(0,ofun);volume.getProperty().setInterpolationTypeToLinear();volume.getProperty().setShade(true);volume.getProperty().setAmbient(.25);volume.getProperty().setDiffuse(.75);volume.getProperty().setSpecular(.2);
        const plane=vtkPlane.newInstance();plane.setNormal(0,-1,0);mapper.addClippingPlane(plane);
        const renderer=window.getRenderer();renderer.addVolume(volume);const bounds=image.getBounds();
        const center=[(bounds[0]+bounds[1])/2,(bounds[2]+bounds[3])/2,(bounds[4]+bounds[5])/2];
        const camera=renderer.getActiveCamera();camera.setPosition(center[0],center[1]-1000,center[2]);camera.setFocalPoint(...center as [number,number,number]);camera.setViewUp(0,0,1);renderer.resetCamera();
        const tractSource=vtkLineSource.newInstance({point1:center as [number,number,number],point2:center as [number,number,number],resolution:24}), tractMapper=vtkMapper.newInstance();tractMapper.setInputConnection(tractSource.getOutputPort());const tract=vtkActor.newInstance({mapper:tractMapper});tract.getProperty().setColor(1,.18,.08);tract.getProperty().setLineWidth(5);
        const makeMarker=(color:[number,number,number])=>{const src=vtkSphereSource.newInstance({radius:6,thetaResolution:20,phiResolution:12}),map=vtkMapper.newInstance();map.setInputConnection(src.getOutputPort());const actor=vtkActor.newInstance({mapper:map});actor.getProperty().setColor(...color);return {src,actor};};
        const eMark=makeMarker([.1,.9,.7]),tMark=makeMarker([1,.75,.1]);renderer.addActor(tract);renderer.addActor(eMark.actor);renderer.addActor(tMark.actor);
        const corridorSource=vtkTubeFilter.newInstance({radius:5,numberOfSides:24,capping:true}),corridorMapper=vtkMapper.newInstance();corridorSource.setInputConnection(tractSource.getOutputPort());corridorMapper.setInputConnection(corridorSource.getOutputPort());const corridorActor=vtkActor.newInstance({mapper:corridorMapper});corridorActor.getProperty().setColor(1,.35,.15);corridorActor.getProperty().setOpacity(.2);renderer.addActor(corridorActor);
        scene.current={window,mapper,color,opacity:ofun,clip:plane,bounds,tract,tractSource,entry:eMark.actor,target:tMark.actor,corridor:corridorActor,corridorSource};setBounds(bounds);setEntry([bounds[0],(bounds[2]+bounds[3])/2,bounds[5]]);setTarget([bounds[1],(bounds[2]+bounds[3])/2,(bounds[4]+bounds[5])/2]);
        const cube=vtkAnnotatedCubeActor.newInstance();
        cube.setDefaultStyle({fontFamily:'Arial',fontColor:'#10231f',faceColor:'#aad7c3',edgeThickness:.1,edgeColor:'#173f35',resolution:256});
        cube.setXPlusFaceProperty({text:'L'});cube.setXMinusFaceProperty({text:'R'});cube.setYPlusFaceProperty({text:'P'});cube.setYMinusFaceProperty({text:'A'});cube.setZPlusFaceProperty({text:'S'});cube.setZMinusFaceProperty({text:'I'});
        const marker=vtkOrientationMarkerWidget.newInstance({actor:cube,interactor:window.getInteractor()});marker.setEnabled(true);marker.setViewportSize(.15);marker.setMinPixelSize(65);marker.setMaxPixelSize(110);
        const resize=new ResizeObserver(()=>{window.resize();window.getRenderWindow().render();});resize.observe(host.current);
        cleanup=()=>{resize.disconnect();scene.current=null;marker.setEnabled(false);marker.delete();cube.delete();tractSource.delete();tractMapper.delete();tract.delete();eMark.src.delete();eMark.actor.delete();tMark.src.delete();tMark.actor.delete();corridorSource.delete();corridorMapper.delete();corridorActor.delete();window.delete();volume.delete();mapper.delete();image.delete();scalars.delete();color.delete();ofun.delete();plane.delete();};
        window.resize();setDetail(`${dims.join(' × ')} voxels · ${strides.some(x=>x>1)?'3D preview reduced; 2D original':'Original resolution'} · LPS mm`);setReady(true);
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Unable to create 3D volume.');}
    })();
    return()=>{cancelled=true;cleanup();};
  },[series,hu]);
  useEffect(()=>{
    const s=scene.current;if(!ready||!s)return;
    s.color.removeAllPoints();s.color.addRGBPoint(threshold,.65,.32,.2);s.color.addRGBPoint(threshold+250,.95,.8,.6);s.color.addRGBPoint(threshold+1000,1,1,.95);
    s.opacity.removeAllPoints();s.opacity.addPoint(-32768,0);s.opacity.addPoint(threshold,0);s.opacity.addPoint(threshold+80,opacity*.35);s.opacity.addPoint(threshold+1000,opacity);
    s.clip.setOrigin(0,s.bounds[3]-(s.bounds[3]-s.bounds[2])*clip/100,0);
    s.window.getRenderer().getActiveCamera().setParallelProjection(projection);s.window.getRenderer().resetCameraClippingRange();s.window.getRenderWindow().render();
  },[ready,threshold,opacity,clip,projection]);
  const delta=target.map((v,i)=>v-entry[i]),tractLength=Math.hypot(...delta),angle=(axis:number)=>Math.atan2(Math.hypot(...delta.filter((_,i)=>i!==axis)),Math.abs(delta[axis]))*180/Math.PI;
  useEffect(()=>{if(!bounds||!planner)return;const mid=[(bounds[2]+bounds[3])/2,(bounds[4]+bounds[5])/2] as const;const specs=[['A','Posterior infracostal',bounds[0],bounds[5]],['B','Posterolateral infracostal',bounds[0],bounds[4]],['C','Lateral approach',bounds[1],bounds[5]],['D','Superior approach',bounds[0],bounds[5]] ] as const;const next=specs.map(([id,label,x,z])=>{const e:[number,number,number]=[x,mid[0],z],d=target.map((v,i)=>v-e[i]),len=Math.hypot(...d),angs:[number,number,number]=[Math.atan2(Math.hypot(d[1],d[2]),Math.abs(d[0]))*180/Math.PI,Math.atan2(Math.hypot(d[0],d[2]),Math.abs(d[1]))*180/Math.PI,Math.atan2(Math.hypot(d[0],d[1]),Math.abs(d[2]))*180/Math.PI];const notes:string[]=[];if(Math.abs(d[1])<corridor)notes.push('Near central plane');if(id==='D')notes.push('Review pleura/rib relationship');return {id,label,entry:e,target,length:len,angles:angs,score:Math.max(0,100-len*.15-notes.length*8),notes};}).sort((a,b)=>b.score-a.score);setCandidates(next);if(!selectedCandidate&&next[0])setSelectedCandidate(next[0].id);},[bounds,planner,target,corridor,selectedCandidate]);
  useEffect(()=>{const c=candidates.find(x=>x.id===selectedCandidate);if(c){setEntry(c.entry);setTarget(c.target);}},[selectedCandidate]);
  useEffect(()=>{const s=scene.current;if(!s||!bounds)return; s.tract?.setVisibility(planner);s.entry?.setVisibility(planner);s.target?.setVisibility(planner);s.corridor?.setVisibility(planner);if(planner){s.tractSource?.setPoint1(...entry);s.tractSource?.setPoint2(...target);s.corridorSource?.setRadius(corridor);const e=s.entry,t=s.target;e?.setPosition(...entry);t?.setPosition(...target);}s.window.getRenderWindow().render();},[planner,bounds,entry,target,corridor,tractLength]);
  useEffect(()=>{setTrajectory(planner&&bounds?{entry,target}:null);return()=>{if(planner)setTrajectory(null);};},[planner,bounds,entry,target,setTrajectory]);
  const slider=(axis:number,val:number)=>bounds&&setEntry(p=>{const n=[...p] as [number,number,number];n[axis]=bounds[axis*2]+(bounds[axis*2+1]-bounds[axis*2])*val/100;return n;});
  const targetSlider=(axis:number,val:number)=>bounds&&setTarget(p=>{const n=[...p] as [number,number,number];n[axis]=bounds[axis*2]+(bounds[axis*2+1]-bounds[axis*2])*val/100;return n;});
  return <section className={`volume-panel${fullscreen?" is-fullscreen":""}`} ref={panel}><div className="volume-toolbar"><b>{planner?'PCNL PLANNER · 3D TRACT':'3D VOLUME'}</b><button onClick={()=>setThreshold(150)}>Bone</button><button onClick={()=>setThreshold(-150)}>Soft tissue</button><button onClick={()=>setThreshold(500)}>High density</button><button onClick={()=>{const s=scene.current;if(s){const r=s.window.getRenderer(),c=r.getActiveCamera();c.setPosition(0,-1000,0);c.setFocalPoint(0,0,0);c.setViewUp(0,0,1);r.resetCamera();s.window.getRenderWindow().render();}}}>Reset camera</button><button className="icon-button" aria-label={fullscreen?"Exit fullscreen":"Enter fullscreen"} onClick={toggleFullscreen}>{fullscreen?<Minimize size={16}/>:<Expand size={16}/>}</button><label><input type="checkbox" checked={projection} onChange={e=>setProjection(e.target.checked)}/> Orthographic</label></div><div className="volume-settings"><label>Threshold ({hu?'HU':'intensity'}) <input type="number" value={threshold} onChange={e=>setThreshold(Number(e.target.value))}/></label><label>Opacity <input type="range" min="0.01" max="1" step="0.01" value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/></label><label>Posterior clip <input type="range" min="0" max="100" value={clip} onChange={e=>setClip(Number(e.target.value))}/></label></div>{planner&&bounds&&<div className="pcnl-controls"><b>AI ACCESS OPTIONS</b>{candidates.length>0&&<label>Candidate trajectory <select aria-label="Candidate trajectory" value={selectedCandidate} onChange={e=>setSelectedCandidate(e.target.value)}>{candidates.map(c=><option key={c.id} value={c.id}>{c.id} · {c.label} · score {c.score.toFixed(0)}</option>)}</select></label>}<div className="ai-candidate-list">{candidates.map(c=><button key={c.id} className={c.id===selectedCandidate?"active":""} onClick={()=>setSelectedCandidate(c.id)}>{c.id} {c.length.toFixed(0)} mm · {c.score.toFixed(0)}%</button>)}</div><b>PLANNING AID — theoretical access trajectory</b><label>Kidney side <select aria-label="Kidney side" value={side} onChange={e=>setSide(e.target.value as 'left'|'right')}><option value="left">Left kidney</option><option value="right">Right kidney</option></select></label><label>Skin entry X <input type="range" min="0" max="100" value={(entry[0]-bounds[0])/(bounds[1]-bounds[0])*100} onChange={e=>slider(0,Number(e.target.value))}/></label><label>Skin entry Y <input type="range" min="0" max="100" value={(entry[1]-bounds[2])/(bounds[3]-bounds[2])*100} onChange={e=>slider(1,Number(e.target.value))}/></label><label>Target calyx X <input type="range" min="0" max="100" value={(target[0]-bounds[0])/(bounds[1]-bounds[0])*100} onChange={e=>targetSlider(0,Number(e.target.value))}/></label><label>Target calyx Z <input type="range" min="0" max="100" value={(target[2]-bounds[4])/(bounds[5]-bounds[4])*100} onChange={e=>targetSlider(2,Number(e.target.value))}/></label><label>Corridor {corridor} mm <input type="range" min="3" max="10" step="1" value={corridor} onChange={e=>setCorridor(Number(e.target.value))}/></label><div className="pcnl-metrics"><span>Side <b>{side==='left'?'Left':'Right'} kidney</b></span><span>Target <b>Target calyx</b></span><span>Tract length <b>{tractLength.toFixed(1)} mm</b></span><span>Axial angle <b>{angle(2).toFixed(1)}°</b></span><span>Coronal angle <b>{angle(1).toFixed(1)}°</b></span><span>Sagittal angle <b>{angle(0).toFixed(1)}°</b></span><span>Target LPS <b>{target.map(v=>v.toFixed(1)).join(', ')} mm</b></span></div><div className="pcnl-warning">No intersection analysis: structures are not segmented. This line/cylinder is a planning aid and must not be interpreted as safe access.</div></div>}<div ref={host} className="volume-canvas" data-testid="volume-canvas"/>{!ready&&!error&&<div className="volume-status">Preparing local 3D volume… {progress}%</div>}{error&&<div className="volume-status error" role="alert">{error}</div>}<div className="volume-caption">{detail}<br/>Drag: rotate · Shift + drag: pan · Wheel: zoom · Orientation cube uses patient LPS: R/L, A/P, S/I<br/>Intensity rendering, not organ segmentation.</div></section>;
}

