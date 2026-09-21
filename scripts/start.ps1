$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$taskPnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
$taskNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($taskPnpm) { $taskRunner = $taskPnpm.Source }
elseif ($taskNpm) { $taskRunner = $taskNpm.Source }
else {
  $taskRuntime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
  $taskRunner = Join-Path $taskRuntime 'bin\fallback\pnpm.cmd'
  if (-not (Test-Path -LiteralPath $taskRunner)) { throw 'Install Node.js 22 LTS or newer (including npm), then run Start-Uro3D.cmd again.' }
  $env:PATH = (Join-Path $taskRuntime 'node\bin') + ';' + $env:PATH
}
if (-not (Test-Path -LiteralPath 'node_modules')) {
  & $taskRunner install
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check the messages above and your internet connection.' }
}
Write-Host 'Uro3D runs locally. Open the localhost address printed below in Edge or Chrome.'
Write-Host 'Use Ctrl+C to stop the server. Patient images are processed in your browser.'
& $taskRunner run dev
