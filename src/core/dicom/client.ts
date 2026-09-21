import type { Frame, ImportIssue } from "../../types/imaging";
let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<
  number,
  { resolve: (p: Float32Array) => void; reject: (e: Error) => void }
>();
const cache = new Map<string, Float32Array>();
const inFlight = new Map<string, Promise<Float32Array>>();
export const CACHE_BYTES = 512 * 1024 * 1024;
export const FULL_PRELOAD_MAX_BYTES = 2 * 1024 * 1024 * 1024;
let cacheBytes = 0;
let warmingGeneration = 0;
export const cachedPixels = (frame: Frame) => cache.get(frame.id);
let importReject: ((e: Error) => void) | undefined;
export function releaseStudy() {
  worker?.terminate();
  worker = undefined;
  cache.clear();
  cacheBytes = 0;
  inFlight.clear();
  warmingGeneration++;
  const error = new Error("Import cancelled.");
  importReject?.(error);
  importReject = undefined;
  for (const p of pending.values()) p.reject(error);
  pending.clear();
}
export function importFiles(
  files: File[],
  demo: boolean,
  onProgress: (done: number, total: number) => void,
): Promise<{ frames: Frame[]; issues: ImportIssue[] }> {
  releaseStudy();
  worker = new Worker(
    new URL("../../workers/dicom.worker.ts", import.meta.url),
    { type: "module" },
  );
  return new Promise((resolve, reject) => {
    importReject = reject;
    worker!.onerror = () => {
      const error = new Error(
        "The local DICOM worker stopped. Try a smaller study or reload the application.",
      );
      importReject?.(error);
      importReject = undefined;
      for (const p of pending.values()) p.reject(error);
      pending.clear();
    };
    worker!.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") onProgress(m.done, m.total);
      if (m.type === "imported") {
        importReject = undefined;
        resolve(m);
      }
      if (m.type === "decoded" || m.type === "decodeError") {
        const p = pending.get(m.request);
        pending.delete(m.request);
        if (m.type === "decoded") p?.resolve(m.pixels);
        else p?.reject(new Error(m.message));
      }
    };
    worker!.postMessage({ type: "import", files, demo });
  });
}
export function loadPixels(frame: Frame):Promise<Float32Array> {
  const found = cache.get(frame.id);
  if (found) {
    cache.delete(frame.id);
    cache.set(frame.id, found);
    return Promise.resolve(found);
  }
  const existing = inFlight.get(frame.id);
  if(existing) return existing;
  const promise = decodeFrame(frame, true);
  inFlight.set(frame.id,promise);
  void promise.finally(()=>{if(inFlight.get(frame.id)===promise)inFlight.delete(frame.id);}).catch(()=>{});
  return promise;
}
async function decodeFrame(frame:Frame, evict=true) {
  if (!worker) throw new Error("Import a study before opening images.");
  const activeWorker = worker;
  const pixels = await new Promise<Float32Array>((resolve, reject) => {
    const request = ++sequence;
    pending.set(request, { resolve, reject });
    worker!.postMessage({ type: "decode", request, frame });
  });
  if (worker !== activeWorker) throw new Error("Study changed.");
  cache.set(frame.id, pixels);
  cacheBytes += pixels.byteLength;
  while (evict && cacheBytes > CACHE_BYTES && cache.size > 1) {
    const key = cache.keys().next().value!;
    cacheBytes -= cache.get(key)!.byteLength;
    cache.delete(key);
  }
  return pixels;
}
/** Decode every frame before the viewer is shown. This is intentionally sequential to keep the worker responsive. */
export async function preloadAll(frames:Frame[],onProgress:(ready:number,total:number)=>void) {
  const estimated=frames.reduce((n,f)=>n+f.rows*f.columns*4,0);
  if(estimated>FULL_PRELOAD_MAX_BYTES) throw new Error(`This series needs approximately ${(estimated/1024/1024/1024).toFixed(1)} GB for instant scrolling, which exceeds the configured browser memory limit. The study can still be opened with background decoding.`);
  for(let i=0;i<frames.length;i++) {
    if(!cache.has(frames[i].id) || cache.get(frames[i].id)!.byteLength===0) await decodeFrame(frames[i],false);
    onProgress(i+1,frames.length);
    await new Promise(resolve=>setTimeout(resolve,0));
  }
}
export function warmSeries(frames:Frame[],current:()=>number,onProgress:(ready:number,total:number)=>void) {
  const generation=++warmingGeneration;
  const whole=frames.reduce((n,f)=>n+f.rows*f.columns*4,0)<=CACHE_BYTES*.9;
  const visited=new Set<string>();
  let stopped=false;
  onProgress(frames.filter(f=>cache.has(f.id)).length,frames.length);
  void (async()=>{
    while(!stopped && generation===warmingGeneration) {
      const center=current();
      const candidates=frames.map((f,i)=>({f,d:Math.abs(i-center)})).filter(x=>!cache.has(x.f.id)&&!visited.has(x.f.id)&&(whole||x.d<=24)).sort((a,b)=>a.d-b.d);
      if(!candidates.length)break;
      const f=candidates[0].f;visited.add(f.id);
      try {await loadPixels(f);}catch { /* Foreground decoding shows errors for the selected image. */ }
      if(stopped || generation!==warmingGeneration)break;
      onProgress(frames.filter(f=>cache.has(f.id)).length,frames.length);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  })();
  return ()=>{stopped=true;};
}
export async function droppedFiles(transfer: DataTransfer): Promise<File[]> {
  async function walk(entry: FileSystemEntry): Promise<File[]> {
    if (entry.isFile)
      return new Promise((resolve, reject) =>
        (entry as FileSystemFileEntry).file((f) => resolve([f]), reject),
      );
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const files: File[] = [];
    while (true) {
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (!entries.length) break;
      for (const e of entries) files.push(...(await walk(e)));
    }
    return files;
  }
  const entries = [...transfer.items]
    .filter((i) => i.kind === "file")
    .map((i) => i.webkitGetAsEntry?.());
  if (entries.some(Boolean)) {
    const files: File[] = [];
    for (const entry of entries) if (entry) files.push(...(await walk(entry)));
    return files;
  }
  return [...transfer.files];
}
