import type { ImportIssue } from "../types/imaging";
export function ImportProblems({ issues }: { issues: ImportIssue[] }) {
  const groups = new Map<string, number>();
  for (const issue of issues)
    groups.set(issue.message, (groups.get(issue.message) ?? 0) + 1);
  return (
    <section className="import-problems" aria-label="Import failure details">
      <h2>Не удалось открыть изображения</h2>
      <p>
        Причины пропуска файлов ({issues.length}). Данные остаются на
        компьютере.
      </p>
      <div>
        {[...groups]
          .sort((a, b) => b[1] - a[1])
          .map(([message, count]) => (
            <p key={message}>
              <b>{count} файлов</b>
              <br />
              {message}
            </p>
          ))}
      </div>
      <small>
        JPEG Lossless (.57 / .70) поддерживается. Для других неподдерживаемых
        форматов экспортируйте исследование как несжатый single-frame DICOM и
        выберите папку с изображениями.
      </small>
    </section>
  );
}
