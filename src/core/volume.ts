import type { Series } from '../types/imaging';
import { volumeGeometry } from './geometry/volume';
import type { VolumeData } from './geometry/sampling';
import { loadPixels } from './dicom/client';
export async function createVolume(series:Series,onProgress:(n:number)=>void,cancelled:()=>boolean,maxDimension=255,preserveInPlane=false):Promise<VolumeData> {
  const g=volumeGeometry(series),strides=g.dimensions.map((n,i)=>Math.max(1,preserveInPlane&&i<2?1:Math.ceil((n-1)/(maxDimension-1)))),dimensions=g.dimensions.map((n,i)=>Math.floor((n-1)/strides[i])+1),spacing=g.spacing.map((v,i)=>v*strides[i]);
  const values=new Float32Array(dimensions[0]*dimensions[1]*dimensions[2]);
  for(let k=0;k<dimensions[2];k++){
    if(cancelled())throw new Error('Cancelled');
    const f=series.frames[k*strides[2]],pixels=await loadPixels(f);
    if(cancelled())throw new Error('Cancelled');
    for(let j=0;j<dimensions[1];j++)for(let i=0;i<dimensions[0];i++)values[(k*dimensions[1]+j)*dimensions[0]+i]=pixels[j*strides[1]*f.columns+i*strides[0]];
    onProgress(Math.round((k+1)/dimensions[2]*100));await new Promise(resolve=>setTimeout(resolve,0));
  }
  const bounds=[Infinity,-Infinity,Infinity,-Infinity,Infinity,-Infinity];
  for(let k=0;k<2;k++)for(let j=0;j<2;j++)for(let i=0;i<2;i++){
    const xyz=g.origin.map((p,a)=>p+i*(dimensions[0]-1)*spacing[0]*g.direction[a]+j*(dimensions[1]-1)*spacing[1]*g.direction[3+a]+k*(dimensions[2]-1)*spacing[2]*g.direction[6+a]);
    xyz.forEach((v,a)=>{bounds[2*a]=Math.min(bounds[2*a],v);bounds[2*a+1]=Math.max(bounds[2*a+1],v);});
  }
  return {...g,dimensions,spacing,strides,values,bounds};
}
