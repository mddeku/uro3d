import { cross,dot,subtract } from './index';
import type { Vec3 } from '../../types/imaging';
export interface VolumeData {dimensions:number[];spacing:number[];origin:Vec3;direction:number[];values:Float32Array;strides:number[];bounds:number[]}
export function samplePatient(volume:VolumeData,point:Vec3):number {
  const d=subtract(point,volume.origin),x=volume.direction.slice(0,3),y=volume.direction.slice(3,6),z=volume.direction.slice(6);
  const det=dot(x,cross(y,z));
  const ijk=[dot(d,cross(y,z))/det/volume.spacing[0],dot(d,cross(z,x))/det/volume.spacing[1],dot(d,cross(x,y))/det/volume.spacing[2]];
  if(ijk.some((v,i)=>v<-.00001||v>volume.dimensions[i]-1+.00001))return NaN;
  const p=ijk.map((v,i)=>Math.max(0,Math.min(volume.dimensions[i]-1,v))),a=p.map(Math.floor),b=a.map((v,i)=>Math.min(v+1,volume.dimensions[i]-1)),t=p.map((v,i)=>v-a[i]);
  let result=0;
  for(let k=0;k<2;k++)for(let j=0;j<2;j++)for(let i=0;i<2;i++){
    const weight=(i?t[0]:1-t[0])*(j?t[1]:1-t[1])*(k?t[2]:1-t[2]);if(weight===0)continue;
    const value=volume.values[((k?b[2]:a[2])*volume.dimensions[1]+(j?b[1]:a[1]))*volume.dimensions[0]+(i?b[0]:a[0])];
    if(!Number.isFinite(value))return NaN;result+=weight*value;
  }
  return result;
}

/** Fast nearest-voxel lookup used while scrubbing MPR sliders. */
export function samplePatientNearest(volume:VolumeData,point:Vec3):number {
  const d=subtract(point,volume.origin),x=volume.direction.slice(0,3),y=volume.direction.slice(3,6),z=volume.direction.slice(6);
  const det=dot(x,cross(y,z));
  const ijk=[dot(d,cross(y,z))/det/volume.spacing[0],dot(d,cross(z,x))/det/volume.spacing[1],dot(d,cross(x,y))/det/volume.spacing[2]];
  if(ijk.some((v,i)=>v<0||v>volume.dimensions[i]-1))return NaN;
  const i=Math.round(ijk[0]),j=Math.round(ijk[1]),k=Math.round(ijk[2]);
  return volume.values[(k*volume.dimensions[1]+j)*volume.dimensions[0]+i];
}
