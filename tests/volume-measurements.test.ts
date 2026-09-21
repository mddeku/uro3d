import { describe,it,expect } from 'vitest';
import { parseFrame } from '../src/core/dicom/parser';
import { syntheticDicom } from '../src/core/dicom/demo';
import { buildSeries } from '../src/core/geometry';
import { volumeGeometry } from '../src/core/geometry/volume';
import { measure } from '../src/measurements';
const f=parseFrame(syntheticDicom(0,3,16).buffer as ArrayBuffer,'0');
describe('physical measurements and 3D geometry',()=>{
  it('measures physical anisotropic distance and polyline',()=>{const a={...f,spacing:[2,3] as [number,number]};expect(measure(a,'distance',[[0,0],[1,2]],new Float32Array())).toBe('5.00 mm');expect(measure(a,'polyline',[[0,0],[1,0],[1,2]],new Float32Array())).toBe('7.00 mm');});
  it('measures physical angle with vertex in the middle',()=>expect(measure(f,'angle',[[0,1],[0,0],[1,0]],new Float32Array())).toBe('90.0°'));
  it('reports zero-vector angle as undefined',()=>expect(measure(f,'angle',[[0,0],[0,0],[1,0]],new Float32Array())).toMatch(/Undefined/));
  it('calculates ROI area and calibrated intensity statistics',()=>{const pixels=new Float32Array(256).fill(50),a={...f,spacing:[2,3] as [number,number]};expect(measure(a,'rectangle',[[0,0],[2,2]],pixels)).toContain('24.00 mm² · mean 50.0, min 50.0, max 50.0, SD 0.0 HU');expect(measure(a,'ellipse',[[0,0],[2,2]],pixels)).toContain('18.85 mm²');});
  it('never labels MR ROI as HU',()=>expect(measure({...f,calibratedHU:false},'rectangle',[[0,0],[2,2]],new Float32Array(256))).toContain('intensity'));
  const series=()=>buildSeries([0,1,2,3].map(i=>({...f,id:String(i),position:[0,0,i] as [number,number,number]})))[0];
  it('produces patient LPS origin, spacing and basis',()=>{const g=volumeGeometry(series());expect(g.spacing).toEqual([20,20,1]);expect(g.direction).toEqual([1,0,0,0,1,0,0,0,1]);});
  it.each(['gap','duplicate','tilt','orientation'])('blocks unsafe volume construction: %s',kind=>{const s=series();if(kind==='gap')s.frames[2].position[2]=2.5;if(kind==='duplicate')s.frames[2].position[2]=1;if(kind==='tilt')s.frames[2].position[0]=1;if(kind==='orientation')s.frames[2].orientation=[0,1,0,1,0,0];expect(()=>volumeGeometry(s)).toThrow(/3D blocked/);});
});
