import { ChevronDown, Layers, FolderOpen, ShieldCheck } from "lucide-react";
import { useWorkstation } from "../stores/workstation";
export function StudyBrowser({ onImport }: { onImport: () => void }) {
  const { series, active, select, hidePatient, demo } = useWorkstation();
  const grouped = new Map<string, typeof series>();
  for (const s of series) {
    const id = s.frames[0].studyUID;
    grouped.set(id, [...(grouped.get(id) ?? []), s]);
  }
  return (
    <aside className="left-panel">
      <div className="panel-heading">
        STUDY BROWSER <span>{grouped.size.toString().padStart(2, "0")}</span>
      </div>
      {!series.length ? (
        <div className="sidebar-empty">
          <FolderOpen size={26} />
          <p>
            Your studies stay
            <br />
            on this computer.
          </p>
          <button onClick={onImport}>Open DICOM folder</button>
        </div>
      ) : (
        [...grouped].map(([uid, items]) => (
          <div className="study" key={uid}>
            <div className="study-heading">
              <ChevronDown size={14} />
              <div>
                <strong>
                  {demo
                    ? "Synthetic abdomen"
                    : hidePatient
                      ? "Local study"
                      : items[0].frames[0].patientName}
                </strong>
                <small>{items[0].frames[0].studyDescription}</small>
                <span>
                  {items.length} series ·{" "}
                  {items.reduce((n, s) => n + s.frames.length, 0)} images
                </span>
              </div>
            </div>
            {items.map((s) => (
              <button
                className={`series-card ${active === s.id ? "selected" : ""}`}
                key={s.id}
                onClick={() => select(s.id)}
              >
                <div className="series-icon">
                  <Layers size={21} />
                </div>
                <div>
                  <strong>{s.frames[0].seriesDescription}</strong>
                  <span>
                    {s.frames[0].modality} · {s.frames.length} images
                  </span>
                  <small>
                    {s.frames[0].kernel || s.plane} ·{" "}
                    {s.sliceSpacing?.toFixed(2) ?? "—"} mm
                  </small>
                </div>
                {active === s.id && <i />}
              </button>
            ))}
          </div>
        ))
      )}
      <div className="sidebar-bottom">
        <ShieldCheck size={17} />
        <div>
          <strong>Private by design</strong>
          <span>No cloud. No patient uploads.</span>
        </div>
      </div>
    </aside>
  );
}
