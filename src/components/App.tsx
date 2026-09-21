import { lazy,Suspense,useRef, useState } from "react";
import {
  Activity,
  FolderOpen,
  Files,
  ShieldCheck,
  SlidersHorizontal,
  Hand,
  ZoomIn,
  Crosshair,
  RotateCcw,
  X,
  ChevronRight,
  ArrowUpRight,
  ScanLine,
  LockKeyhole,
  Trash2,
} from "lucide-react";
import { importFiles, droppedFiles, preloadAll, releaseStudy } from "../core/dicom/client";
import { buildSeries } from "../core/geometry";
import { useWorkstation } from "../stores/workstation";
import { StudyBrowser } from "./StudyBrowser";
import { Properties } from "./Properties";
import { ImportProblems } from "./ImportProblems";
import { StackViewport } from "../viewer/StackViewport";
import type { Tool } from "../types/imaging";
const VolumeViewport=lazy(()=>import('../viewer/VolumeViewport'));
const MPRViewport=lazy(()=>import('../viewer/MPRViewport'));
export function App() {
  const state = useWorkstation(),
    folder = useRef<HTMLInputElement>(null),
    files = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState({ done: 0, total: 0 }),
    [error, setError] = useState(""),
    [privacy, setPrivacy] = useState(false),
    [dragging, setDragging] = useState(false),
    [loadPhase,setLoadPhase]=useState<'metadata'|'pixels'>('metadata');
  const generation = useRef(0),
    dragDepth = useRef(0);
  const series = state.series.find((s) => s.id === state.active);
  const [mode,setMode]=useState<'2d'|'3d'|'mpr'|'pcnl'>('2d');
  const [orientation,setOrientation]=useState<'axial'|'coronal'|'sagittal'>('axial');
  const load = async (selected: File[], demo = false) => {
    if (busy) return;
    if (!selected.length && !demo) {
      setError("No readable files were found in this folder.");
      return;
    }
    const id = ++generation.current;
    setBusy(true);
    setLoadPhase('metadata');
    setError("");
    setOrientation('axial');
    setProgress({ done: 0, total: demo ? 344 : selected.length });
    state.clear();
    try {
      const result = await importFiles(selected, demo, (done, total) =>
        setProgress({ done, total }),
      );
      if (id !== generation.current) return;
      const series = buildSeries(result.frames);
      setLoadPhase('pixels');
      const preloadSeries=series.filter(s=>s.frames.length>0);
      const totalPixels=preloadSeries.reduce((n,s)=>n+s.frames.length,0);
      let decoded=0;
      try { for(const s of preloadSeries) await preloadAll(s.frames,(ready,total)=>{decoded+=1;setProgress({done:decoded,total:totalPixels});}); }
      catch(e) { result.issues.push({file:'(series)',message:e instanceof Error?e.message:'Full preloading was not possible; background decoding will be used.'}); }
      state.setStudy(series, result.issues, demo);
      if (!series.length)
        setError(
          "No supported images could be opened. Review the import notices for details.",
        );
    } catch (e) {
      if (id === generation.current)
        setError(
          e instanceof Error
            ? e.message
            : "Import failed. Try selecting the files again.",
        );
    } finally {
      if (id === generation.current) setBusy(false);
    }
  };
  const cancel = () => {
    generation.current++;
    releaseStudy();
    setBusy(false);
    state.clear();
    setError("Import cancelled. No images retained.");
  };
  const tools: [Tool, string, typeof Hand][] = [
    ["window", "Window / level", SlidersHorizontal],
    ["pan", "Pan", Hand],
    ["zoom", "Zoom", ZoomIn],
    ["probe", "Inspect intensity", Crosshair],
  ];
  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes("Files")) {
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragLeave={() => {
        dragDepth.current--;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={async (e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (busy) return;
        try {
          await load(await droppedFiles(e.dataTransfer));
        } catch {
          setError(
            "Unable to read the dropped folder. Use Open folder instead.",
          );
        }
      }}
    >
      <input
        hidden
        ref={folder}
        data-testid="folder-input"
        type="file"
        multiple
        {...{ webkitdirectory: "" }}
        onChange={(e) => {
          void load([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={files}
        data-testid="file-input"
        type="file"
        multiple
        onChange={(e) => {
          void load([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <header>
        <a className="brand" href="#">
          <div>
            <Activity size={23} />
          </div>
          Uro<span>3D</span>
          <small>WORKSTATION</small>
        </a>
        <div className="workspace-name">
          Imaging workspace <ChevronRight size={13} />{" "}
          <strong>CT / MR Viewer</strong>
        </div>
        <button className="local-badge" onClick={() => setPrivacy(true)}>
          <i /> LOCAL PROCESSING <ShieldCheck size={14} />
        </button>
      </header>
      <nav className="main-nav">
        <button onClick={()=>setMode('2d')} className={mode==='2d'?'tool-active':''}>2D Viewer</button>
        <button disabled={!series} onClick={()=>setMode('3d')} className={mode==='3d'?'tool-active':''}>3D Volume</button>
        <button disabled={!series} onClick={()=>setMode('pcnl')} className={mode==='pcnl'?'tool-active':''}>PCNL Planner</button>
        <button disabled={!series} onClick={()=>setMode('mpr')} className={mode==='mpr'?'tool-active':''}>MPR · Axial / Coronal / Sagittal</button>
        <div className="workspace-tab">
          <ScanLine size={16} /> DICOM Viewer <span>01</span>
        </div>
        <span className="roadmap-label">
          MPR, 3D & planning · future milestones
        </span>
        <span className="version">
          MILESTONE 1 <b>v0.1</b>
        </span>
      </nav>
      <div className="toolbar">
        <button
          className="primary small"
          disabled={busy}
          onClick={() => folder.current?.click()}
        >
          <FolderOpen size={16} /> Open folder
        </button>
        <button disabled={busy} onClick={() => files.current?.click()}>
          <Files size={16} /> Open files
        </button>
        <label className="orientation-picker">Orientation
          <select aria-label="2D viewer orientation" disabled={!series || busy} value={orientation} onChange={e=>setOrientation(e.target.value as 'axial'|'coronal'|'sagittal')}>
            <option value="axial">Axial</option>
            <option value="coronal">Coronal</option>
            <option value="sagittal">Sagittal</option>
          </select>
        </label>
        <div className="divider" />
        {tools.map(([tool, label, Icon]) => (
          <button
            key={tool}
            disabled={!series}
            className={state.view.tool === tool ? "tool-active" : ""}
            onClick={() => state.setView({ tool })}
            title={label}
            aria-label={label}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
        <div className="divider" />
        <button disabled={!series} onClick={state.reset}>
          <RotateCcw size={15} /> Reset
        </button>
        <button
          className="clear-button"
          disabled={!series || busy}
          onClick={() => {
            releaseStudy();
            state.clear();
            setError("");
          }}
          title="Remove all loaded images from memory"
          aria-label="Clear study"
        >
          <Trash2 size={15} />
        </button>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      <main>
        <StudyBrowser onImport={() => folder.current?.click()} />
        <div className="workspace">
          <div className="workspace-caption">
            <span>
              {series ? "SERIES REVIEW" : "YOUR LOCAL IMAGING WORKSPACE"}
            </span>
            <span>
              {state.demo ? (
                <b className="demo-badge">SYNTHETIC DEMO · NO PATIENT DATA</b>
              ) : series ? (
                "Original acquired images"
              ) : (
                "READY TO IMPORT"
              )}
            </span>
          </div>
          {busy ? (
            <div className="empty-state">
              <div className="import-symbol spinning">
                <ScanLine size={32} />
              </div>
              <h1>Reading your study</h1>
              <p>{loadPhase==='metadata'?'Reading DICOM metadata locally…':'Decoding all slices locally before opening the viewer…'}</p>
              <progress value={progress.done} max={progress.total || 1} />
              <span>
                {progress.done} / {progress.total} files
              </span>
              <button onClick={cancel}>Cancel import</button>
            </div>
          ) : series ? (
            <><div className="viewer-mode" style={{display:mode==='2d'?'flex':'none'}}>{orientation==='axial'?<StackViewport key={series.id} series={series}/>:<Suspense fallback={<p>Preparing {orientation} MPR…</p>}><MPRViewport key={`${series.id}-${orientation}`} series={series} initialPlane={orientation==='coronal'?'Coronal':'Sagittal'}/></Suspense>}</div>{(mode==='3d'||mode==='pcnl')&&<Suspense fallback={<p>Loading local 3D renderer…</p>}><VolumeViewport key={series.id} series={series} planner={mode==='pcnl'}/></Suspense>}{mode==='mpr'&&<Suspense fallback={<p>Loading MPR…</p>}><MPRViewport key={series.id} series={series}/></Suspense>}</>
          ) : state.issues.length ? (
            <ImportProblems issues={state.issues} />
          ) : (
            <div className="empty-state">
              <div className="import-symbol">
                <ScanLine size={36} />
              </div>
              <div className="eyebrow">ANATOMY STARTS HERE</div>
              <h1>
                A clearer view.
                <br />
                <span>Entirely on your device.</span>
              </h1>
              <p>
                Open a CT or MRI study to explore your images.
                <br />
                Your DICOM files never leave this computer.
              </p>
              <div className="drop-zone">
                <FolderOpen size={25} />
                <strong>Drop a DICOM folder here</strong>
                <span>Folders, multiple files, or individual DICOM images</span>
                <button
                  className="primary"
                  onClick={() => folder.current?.click()}
                >
                  Browse local folder <ArrowUpRight size={16} />
                </button>
                <button
                  className="text-button"
                  onClick={() => files.current?.click()}
                >
                  or select files
                </button>
              </div>
              <div className="demo-entry">
                <span>No study at hand?</span>
                <button
                  className="text-button"
                  onClick={() => void load([], true)}
                >
                  Explore synthetic demo <ChevronRight size={14} />
                </button>
              </div>
              <div className="format-note">
                <LockKeyhole size={13} /> Local only <i /> CT / MR · JPEG
                Lossless <i /> Single-frame DICOM
              </div>
            </div>
          )}
          <div className="interaction-hint">
            <span>
              <b>SCROLL</b> Change slice
            </span>
            <span>
              <b>DRAG</b> Selected tool
            </span>
            <span>
              <b>CTRL + SCROLL</b> Zoom
            </span>
          </div>
        </div>
        <Properties />
      </main>
      <footer>
        <span className="research-label">RESEARCH USE</span>
        <span>
          Research / educational / planning use only. Not a substitute for
          diagnostic radiology software or intraoperative navigation.
        </span>
        <span className="footer-local">
          <i /> Offline capable
        </span>
      </footer>
      {dragging && (
        <div className="drop-overlay">
          <FolderOpen size={45} />
          <h2>Drop to open locally</h2>
          <p>The current study will be replaced.</p>
        </div>
      )}
      {privacy && (
        <div className="modal-backdrop" onClick={() => setPrivacy(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Privacy and local processing"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPrivacy(false);
              if (e.key !== "Tab") return;
              const items =
                e.currentTarget.querySelectorAll<HTMLElement>("button, input");
              const first = items[0],
                last = items[items.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
              }
              if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }}
          >
            <button
              autoFocus
              className="modal-close"
              aria-label="Close privacy"
              onClick={() => setPrivacy(false)}
            >
              <X size={19} />
            </button>
            <ShieldCheck size={32} className="teal" />
            <h2>Local means local.</h2>
            <p>
              DICOM files and decoded pixels are held in browser memory. Nothing
              is uploaded. There are no analytics, external fonts, cloud
              storage, or AI services.
            </p>
            <dl>
              <dt>Image processing</dt>
              <dd>On this computer</dd>
              <dt>Patient-data network requests</dt>
              <dd>None</dd>
              <dt>Persistent study storage</dt>
              <dd>None</dd>
            </dl>
            <p>
              The app’s code is served by your local server. Development mode
              uses a local connection for live code updates. Close the tab or
              clear the study to release image references.
            </p>
            <label className="check-label">
              <input
                type="checkbox"
                checked={state.hidePatient}
                onChange={(e) => state.setHidePatient(e.target.checked)}
              />{" "}
              Hide patient identifiers in the interface
            </label>
            <p className="subtle">
              Hiding identifiers does not anonymize DICOM files. Series
              descriptions may contain identifiers. Dataset anonymization and
              exports are not part of this milestone.
            </p>
            <button className="primary" onClick={() => setPrivacy(false)}>
              Back to workspace
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
