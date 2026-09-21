import type { Frame } from '../types/imaging';
import { imageToWorld,distance3D } from '../core/geometry';
export type Point=[number,number];
export type Shape='distance'|'polyline'|'angle'|'rectangle'|'ellipse';
export function measure(f:Frame,shape:Shape,points:Point[],pixels:Float32Array) {
  if(points.length<2)throw new Error('Two points required.');
  const world=points.map(p=>imageToWorld(f,...p));
  if(shape==='distance'||shape==='polyline')return `${world.slice(1).reduce((n,p,i)=>n+distance3D(p,world[i]),0).toFixed(2)} mm`;
  if(shape==='angle'){
    if(world.length!==3)throw new Error('Three points required.');
    const a=world[0].map((v,i)=>v-world[1][i]),b=world[2].map((v,i)=>v-world[1][i]);
    const norm=Math.hypot(...a)*Math.hypot(...b);if(norm===0)return 'Undefined angle (coincident points)';
    return `${(Math.acos(Math.max(-1,Math.min(1,a.reduce((n,v,i)=>n+v*b[i],0)/norm)))*180/Math.PI).toFixed(1)}°`;
  }
  const [p,q]=points,w=Math.abs(q[0]-p[0]),h=Math.abs(q[1]-p[1]);
  const area=w*f.spacing[1]*h*f.spacing[0]*(shape==='ellipse'?Math.PI/4:1);
  let n=0,mean=0,m2=0,min=Infinity,max=-Infinity;
  const cx=(p[0]+q[0])/2,cy=(p[1]+q[1])/2;
  for(let j=Math.max(0,Math.ceil(Math.min(p[1],q[1])));j<=Math.min(f.rows-1,Math.floor(Math.max(p[1],q[1])));j++)for(let i=Math.max(0,Math.ceil(Math.min(p[0],q[0])));i<=Math.min(f.columns-1,Math.floor(Math.max(p[0],q[0])));i++){
    if(shape==='ellipse'&&(w===0||h===0||((i-cx)/(w/2))**2+((j-cy)/(h/2))**2>1))continue;
    const v=pixels[j*f.columns+i];if(!Number.isFinite(v))continue;
    n++;const d=v-mean;mean+=d/n;m2+=d*(v-mean);min=Math.min(min,v);max=Math.max(max,v);
  }
  return `${(w*f.spacing[1]).toFixed(1)} × ${(h*f.spacing[0]).toFixed(1)} mm · ${area.toFixed(2)} mm²${n?` · mean ${mean.toFixed(1)}, min ${min.toFixed(1)}, max ${max.toFixed(1)}, SD ${Math.sqrt(m2/n).toFixed(1)} ${f.calibratedHU?'HU':'intensity'} (${n} px)`:' · no sampled pixels'}`;
}
