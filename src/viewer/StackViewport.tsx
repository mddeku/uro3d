import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Expand, ScanLine } from "lucide-react";
import { cachedPixels, loadPixels, warmSeries } from "../core/dicom/client";
import { imageToWorld, orientationLabel } from "../core/geometry";
import { windowPixel } from "../core/dicom/parser";
import { useWorkstation } from "../stores/workstation";
import type { Frame, Series } from "../types/imaging";
import { measure } from '../measurements';
import type { Point,Shape } from '../measurements';
export function StackViewport({ series }: { series: Series }) {
  const { view, setView, hidePatient, demo } = useWorkstation();
  const frame = series.frames[view.slice];
  const canvas = useRef<HTMLCanvasElement>(null),
    host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [decoded, setDecoded] = useState<{
    frame: Frame;
    pixels: Float32Array;
  } | null>(null);
  const [error, setError] = useState("");
  const [smooth,setSmooth]=useState(true);
  const [ready,setReady]=useState(0);
  const [shape,setShape]=useState<Shape|''>('');
  const [points,setPoints]=useState<Point[]>([]);
  const [measurements,setMeasurements]=useState<{id:number;frame:string;shape:Shape;points:Point[];text:string}[]>([]);
  useEffect(()=>setPoints([]),[frame,shape]);
  const finish=(p:Point[])=>{if(!shape||decoded?.frame!==frame)return;setMeasurements(m=>[...m,{id:Date.now(),frame:frame.id,shape,points:p,text:measure(frame,shape,p,decoded.pixels)}]);setPoints([]);};
  useEffect(()=>warmSeries(series.frames,()=>useWorkstation.getState().view.slice,(n)=>setReady(n)),[series, Math.floor(view.slice/16)]);
  const [probe, setProbe] = useState(
    "Move over the image to inspect intensity",
  );
  const drag = useRef<{
    x: number;
    y: number;
    pan: [number, number];
    zoom: number;
    center: number;
    width: number;
  } | null>(null);
  useLayoutEffect(() => {
    let current = true;
    const cached=cachedPixels(frame);
    setDecoded(cached?{frame,pixels:cached}:null);
    setError("");
    setProbe("Move over the image to inspect intensity");
    if(!cached) loadPixels(frame)
      .then((pixels) => {
        if (current) setDecoded({ frame, pixels });
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [frame]);
  const windowed=useMemo(()=>{
    if(decoded?.frame!==frame)return null;
    const off=document.createElement('canvas');off.width=frame.columns;off.height=frame.rows;
    const ctx=off.getContext('2d')!;const image=ctx.createImageData(frame.columns,frame.rows);
    const invert=frame.photo==='MONOCHROME1';
    for(let i=0;i<decoded.pixels.length;i++) {const v=windowPixel(decoded.pixels[i],view.center,view.width,invert);image.data[i*4]=v;image.data[i*4+1]=v;image.data[i*4+2]=v;image.data[i*4+3]=255;}
    ctx.putImageData(image,0,0);return off;
  },[decoded,frame,view.center,view.width]);
  useLayoutEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([e]) =>
      setSize({ width: e.contentRect.width, height: e.contentRect.height }),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const physicalWidth = frame.columns * frame.spacing[1],
    physicalHeight = frame.rows * frame.spacing[0];
  const fit = Math.min(
    (size.width - 80) / physicalWidth,
    (size.height - 100) / physicalHeight,
  );
  const sx = fit * view.zoom * frame.spacing[1],
    sy = fit * view.zoom * frame.spacing[0];
  const left = (size.width - frame.columns * sx) / 2 + view.pan[0],
    top = (size.height - frame.rows * sy) / 2 + view.pan[1];
  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.width * dpr);
    c.height = Math.round(size.height * dpr);
    const context = c.getContext("2d");
    if (!context) return;
    context.scale(dpr, dpr);
    context.clearRect(0, 0, size.width, size.height);
    if (!windowed) return;
    context.imageSmoothingEnabled = smooth;
    context.imageSmoothingQuality = 'high';
    context.drawImage(windowed, left, top, frame.columns * sx, frame.rows * sy);
  }, [
    decoded,
    frame,
    view.center,
    view.width,
    view.zoom,
    view.pan,
    size,
    left,
    top,
    sx,
    sy,
    windowed,smooth,
  ]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = useWorkstation.getState().view;
      if (e.ctrlKey) {
        setView({
          zoom: Math.max(
            0.2,
            Math.min(8, v.zoom * Math.exp(-e.deltaY * 0.003)),
          ),
        });
      } else
        setView({
          slice: Math.max(
            0,
            Math.min(
              series.frames.length - 1,
              v.slice + (e.deltaY > 0 ? 1 : -1),
            ),
          ),
        });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [series, setView]);
  const row = frame.orientation.slice(0, 3),
    col = frame.orientation.slice(3);
  const inspect = (x: number, y: number) => {
    const i = Math.floor((x - left) / sx),
      j = Math.floor((y - top) / sy);
    if (
      decoded?.frame !== frame ||
      i < 0 ||
      j < 0 ||
      i >= frame.columns ||
      j >= frame.rows
    ) {
      setProbe("Outside image");
      return;
    }
    const value = decoded.pixels[j * frame.columns + i],
      world = imageToWorld(frame, i, j);
    setProbe(
      `${Number.isFinite(value) ? value.toFixed(1) : "Padding"} ${frame.calibratedHU ? "HU" : "intensity"}  ·  LPS ${world.map((x) => x.toFixed(1)).join(", ")} mm`,
    );
  };
  return (
    <section className="viewport">
      <div className="measurement-tools"><label>Measure <select aria-label="Measurement shape" value={shape} onChange={e=>setShape(e.target.value as Shape|'')}><option value="">Off</option><option value="distance">Distance (2 points)</option><option value="polyline">Polyline</option><option value="angle">Angle (3 points, vertex second)</option><option value="rectangle">Rectangle ROI (2 corners)</option><option value="ellipse">Ellipse ROI (2 corners)</option></select></label>{shape&&<span>Click image points</span>}{shape==='polyline'&&<button disabled={points.length<2} onClick={()=>finish(points)}>Finish line</button>}<button onClick={()=>{setMeasurements([]);setPoints([]);}}>Clear measurements</button></div>
      <div className="viewport-title">
        <span>
          <i /> {series.plane.toUpperCase()} <small>ACQUIRED STACK</small>
        </span>
        <button onClick={()=>setSmooth(v=>!v)} aria-label="Toggle image interpolation">{smooth?'Smooth':'Native pixels'}</button>
        <button
          className="icon-button"
          aria-label="Fit image"
          onClick={() => setView({ zoom: 1, pan: [0, 0] })}
        >
          <Expand size={16} />
        </button>
      </div>
      <div
        className={`canvas-host tool-${view.tool}`}
        ref={host}
        tabIndex={0}
        aria-label="DICOM image viewport. Use mouse wheel or arrow keys to scroll slices."
        onKeyDown={(e) => {
          if (["ArrowUp", "ArrowDown"].includes(e.key)) {
            e.preventDefault();
            setView({
              slice: Math.max(
                0,
                Math.min(
                  series.frames.length - 1,
                  view.slice + (e.key === "ArrowDown" ? 1 : -1),
                ),
              ),
            });
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if(shape){
            const rect=e.currentTarget.getBoundingClientRect();const p:Point=[(e.clientX-rect.left-left)/sx-.5,(e.clientY-rect.top-top)/sy-.5];
            if(decoded?.frame!==frame||p[0]<0||p[1]<0||p[0]>frame.columns-1||p[1]>frame.rows-1)return;
            const next=[...points,p];if(shape!=='polyline'&&next.length===(shape==='angle'?3:2))finish(next);else setPoints(next);return;
          }
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            pan: view.pan,
            zoom: view.zoom,
            center: view.center,
            width: view.width,
          };
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          inspect(e.clientX - rect.left, e.clientY - rect.top);
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x,
            dy = e.clientY - d.y;
          if (view.tool === "pan")
            setView({ pan: [d.pan[0] + dx, d.pan[1] + dy] });
          if (view.tool === "zoom")
            setView({
              zoom: Math.max(0.2, Math.min(8, d.zoom * Math.exp(-dy * 0.008))),
            });
          if (view.tool === "window")
            setView({
              width: Math.max(1, d.width + dx * 3),
              center: d.center + dy * 2,
            });
        }}
      >
        <canvas ref={canvas} data-testid="image-canvas" />
        <svg className="measurement-overlay" width={size.width} height={size.height}>
          {measurements.filter(m=>m.frame===frame.id).map(m=>{const coords=m.points.map(p=>[left+(p[0]+.5)*sx,top+(p[1]+.5)*sy]);const [a,b]=coords;return <g key={m.id} stroke="#80f0d0" fill="none" strokeWidth="1.5">{m.shape==='rectangle'?<rect x={Math.min(a[0],b[0])} y={Math.min(a[1],b[1])} width={Math.abs(a[0]-b[0])} height={Math.abs(a[1]-b[1])}/>:m.shape==='ellipse'?<ellipse cx={(a[0]+b[0])/2} cy={(a[1]+b[1])/2} rx={Math.abs(a[0]-b[0])/2} ry={Math.abs(a[1]-b[1])/2}/>:<polyline points={coords.map(p=>p.join(',')).join(' ')}/>}<text x={a[0]+5} y={a[1]-8} fill="#b5ffde" stroke="#071410" strokeWidth=".3" fontSize="12">{m.text.split(' · ')[0]}</text></g>;})}
          {points.map((p,i)=><circle key={i} cx={left+(p[0]+.5)*sx} cy={top+(p[1]+.5)*sy} r="3" fill="#ffee8a"/>)}
        </svg>
        <div className="overlay top-left">
          <strong>
            {demo
              ? "SYNTHETIC DEMO"
              : hidePatient
                ? "Patient details hidden"
                : frame.patientName}
          </strong>
          <span>{frame.seriesDescription}</span>
          <span>
            {frame.modality} · {frame.rows} × {frame.columns}
          </span>
        </div>
        <div className="overlay top-right">
          <span>{hidePatient ? "" : frame.studyDate}</span>
          <span>
            {frame.thickness
              ? `${frame.thickness} mm thickness`
              : "Thickness unavailable"}
          </span>
          <span>
            {frame.spacing.map((x) => x.toFixed(2)).join(" × ")} mm/px
          </span>
        </div>
        <b className="orientation north">
          {orientationLabel(col.map((x) => -x))}
        </b>
        <b className="orientation south">{orientationLabel(col)}</b>
        <b className="orientation west">
          {orientationLabel(row.map((x) => -x))}
        </b>
        <b className="orientation east">{orientationLabel(row)}</b>
        <div className="overlay bottom-left">
          <span data-testid="slice-label">
            Image {view.slice + 1} / {series.frames.length}
          </span>
          <span>
            Position {frame.position.map((x) => x.toFixed(1)).join(", ")} mm
          </span>
        </div>
        <div className="overlay bottom-right">
          <span data-testid="window-label">
            WL {Math.round(view.center)} / WW {Math.round(view.width)}
          </span>
          <span data-testid="zoom-label">
            Zoom {Math.round(view.zoom * 100)}%
          </span>
        </div>
        {decoded?.frame !== frame && !error && (
          <div className="viewport-message">
            <ScanLine size={22} /> Decoding locally…
          </div>
        )}
        {error && (
          <div className="viewport-message error" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="slice-control">
        <span>{String(view.slice + 1).padStart(3, "0")}</span>
        <input
          aria-label="Slice"
          type="range"
          min="0"
          max={series.frames.length - 1}
          value={view.slice}
          onChange={(e) => setView({ slice: Number(e.target.value) })}
        />
        <span>{series.frames.length}</span>
      </div>
      <div className="probe-readout" data-testid="probe">
        {probe}
      </div>
      <div className="cache-readout" data-testid="cache-status">Cached {ready} / {series.frames.length} · full-resolution pixels · background decoding</div>
      {!!measurements.length&&<div className="measurement-results">{measurements.filter(m=>m.frame===frame.id).map(m=><div key={m.id}>{m.shape}: {m.text}<button aria-label="Delete measurement" onClick={()=>setMeasurements(all=>all.filter(a=>a.id!==m.id))}>×</button></div>)}</div>}
    </section>
  );
}
