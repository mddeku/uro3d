import type { Series } from '../../types/imaging';
import { cross,dot,subtract,validateGeometry } from './index';
export function volumeGeometry(series:Series) {
  const frames=series.frames,f=frames[0];
  if(frames.length<3)throw new Error('3D requires at least three spatially positioned slices.');
  frames.forEach(validateGeometry);
  const x=f.orientation.slice(0,3),y=f.orientation.slice(3),normal=cross(x,y);
  const spacing=dot(subtract(frames[1].position,f.position),normal);
  if(spacing<=0.01)throw new Error('3D blocked: duplicate or reversed slice positions. Select a single reconstruction.');
  for(let i=0;i<frames.length;i++){
    const a=frames[i];
    if(a.rows!==f.rows||a.columns!==f.columns||a.modality!==f.modality||a.calibratedHU!==f.calibratedHU||a.orientation.some((v,j)=>Math.abs(v-f.orientation[j])>0.0001)||a.spacing.some((v,j)=>Math.abs(v-f.spacing[j])>0.0001))throw new Error('3D blocked: inconsistent dimensions, orientation, calibration, or pixel spacing.');
    const d=subtract(a.position,f.position);
    if(Math.abs(dot(d,normal)-i*spacing)>Math.max(0.05,spacing*.01))throw new Error('3D blocked: irregular spacing, duplicate positions, or missing slices.');
    if(Math.hypot(dot(d,x),dot(d,y))>0.1)throw new Error('3D blocked: gantry tilt / in-plane displacement requires resampling. Acquired 2D images remain available.');
  }
  return {dimensions:[f.columns,f.rows,frames.length],spacing:[f.spacing[1],f.spacing[0],spacing],origin:f.position,direction:[...x,...y,...normal]};
}
