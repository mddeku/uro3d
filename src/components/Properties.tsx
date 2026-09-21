import { useWorkstation } from "../stores/workstation";
import { cross } from "../core/geometry";
export const ctPresets: Record<string, [number, number]> = {
  "Soft tissue": [40, 400],
  "Kidney / abdomen": [50, 350],
  Bone: [400, 1800],
  Lung: [-600, 1500],
  Stone: [500, 2000],
};
export function Properties() {
  const { series, active, view, setView, issues, hidePatient } =
    useWorkstation();
  const s = series.find((s) => s.id === active),
    f = s?.frames[view.slice];
  const [x, y] = f
    ? [f.orientation.slice(0, 3), f.orientation.slice(3)]
    : [[], []];
  return (
    <aside className="right-panel">
      <div className="panel-heading">IMAGE PROPERTIES</div>
      <section className="property-section">
        <h3>Window & level</h3>
        <p>Control image contrast and brightness.</p>
        <div className="number-fields">
          <label>
            LEVEL
            <input
              aria-label="Window level"
              type="number"
              value={Math.round(view.center)}
              disabled={!f}
              onChange={(e) => {
                if (e.target.value) setView({ center: Number(e.target.value) });
              }}
            />
          </label>
          <label>
            WIDTH
            <input
              aria-label="Window width"
              type="number"
              min="1"
              value={Math.round(view.width)}
              disabled={!f}
              onChange={(e) => {
                if (e.target.value)
                  setView({ width: Math.max(1, Number(e.target.value)) });
              }}
            />
          </label>
        </div>
        <div className="presets">
          {f?.modality === "MR" ? (
            <button
              onClick={() => setView({ center: f.center, width: f.width })}
            >
              DICOM intensity window
            </button>
          ) : (
            Object.entries(ctPresets).map(([name, [center, width]]) => (
              <button
                key={name}
                disabled={!f}
                className={
                  view.center === center && view.width === width ? "active" : ""
                }
                onClick={() => setView({ center, width })}
              >
                {name}
              </button>
            ))
          )}
        </div>
        <div className="calibration">
          {f
            ? f.calibratedHU
              ? "HU calibration available"
              : f.modality === "MR"
                ? "MR intensity · not HU"
                : "Uncalibrated intensity"
            : "No image selected"}
        </div>
      </section>
      <section className="property-section">
        <h3>Acquisition</h3>
        <dl>
          {!hidePatient && f && (
            <>
              <dt>Patient</dt>
              <dd>{f.patientName}</dd>
              <dt>Patient ID</dt>
              <dd>{f.patientID || "Not supplied"}</dd>
              <dt>Study date</dt>
              <dd>{f.studyDate || "Not supplied"}</dd>
            </>
          )}
          <dt>Modality</dt>
          <dd>{f?.modality ?? "—"}</dd>
          <dt>Matrix</dt>
          <dd>{f ? `${f.rows} × ${f.columns}` : "—"}</dd>
          <dt>Pixel spacing</dt>
          <dd>
            {f ? f.spacing.map((x) => x.toFixed(3)).join(" × ") + " mm" : "—"}
          </dd>
          <dt>Slice thickness</dt>
          <dd>{f?.thickness ? `${f.thickness} mm` : "—"}</dd>
          <dt>Kernel</dt>
          <dd>{f?.kernel || "—"}</dd>
          <dt>Photometric</dt>
          <dd>{f?.photo ?? "—"}</dd>
          <dt>Stored bits</dt>
          <dd>
            {f
              ? `${f.bitsStored} / ${f.bitsAllocated} · ${f.signed ? "signed" : "unsigned"}`
              : "—"}
          </dd>
          <dt>Rescale</dt>
          <dd>
            {f
              ? `${f.slope} × pixel ${f.intercept < 0 ? "−" : "+"} ${Math.abs(f.intercept)}`
              : "—"}
          </dd>
        </dl>
      </section>
      <details className="property-section" open>
        <summary>
          Geometry validation{" "}
          <span className={s?.warnings.length ? "amber" : "teal"}>●</span>
        </summary>
        <dl>
          <dt>Images</dt>
          <dd>{s?.frames.length ?? "—"}</dd>
          <dt>Calculated spacing</dt>
          <dd>
            {s?.sliceSpacing
              ? `${s.sliceSpacing.toFixed(3)} mm`
              : "Not available"}
          </dd>
          <dt>Acquisition plane</dt>
          <dd>{s?.plane ?? "—"}</dd>
          <dt>Field of view</dt>
          <dd>
            {f
              ? `${(f.columns * f.spacing[1]).toFixed(1)} × ${(f.rows * f.spacing[0]).toFixed(1)} mm`
              : "—"}
          </dd>
          <dt>Slice-center span</dt>
          <dd>
            {s && s.frames.length > 1
              ? Math.abs(
                  s.frames
                    .at(-1)!
                    .position.reduce(
                      (n, v, i) =>
                        n + (v - s.frames[0].position[i]) * cross(x, y)[i],
                      0,
                    ),
                ).toFixed(1) + " mm"
              : "—"}
          </dd>
        </dl>
        {f && (
          <>
            <small className="matrix-label">DIRECTION COSINES · LPS</small>
            <pre>
              {[x, y, cross(x, y)]
                .map((row) =>
                  row.map((n) => n.toFixed(3).padStart(7)).join(" "),
                )
                .join("\n")}
            </pre>
            <p className="subtle">
              Acquired 2D stack. No reconstructed volume in Milestone 1.
            </p>
          </>
        )}
        {s?.warnings.length
          ? s.warnings.map((w) => (
              <p className="warning" key={w}>
                {w}
              </p>
            ))
          : s && (
              <p className="validation-ok">
                Consistent sampled slice geometry.
                <br />
                Missing slices cannot always be inferred.
              </p>
            )}
      </details>
      {!!issues.length && (
        <details className="property-section import-issues" open={!s}>
          <summary>Skipped files ({issues.length})</summary>
          {s&&<p>Основная серия загружена. Ниже — отдельные файлы, не включённые в просмотр. Файлы без пространственной геометрии нельзя включать в MPR/3D.</p>}
          {issues.slice(0, 50).map((issue, i) => (
            <p className="warning" key={i}>
              <strong>{hidePatient?`File ${i+1}`:issue.file}</strong>
              <br />
              {issue.message}
            </p>
          ))}
          {issues.length > 50 && <p>{issues.length - 50} further notices.</p>}
        </details>
      )}
    </aside>
  );
}
