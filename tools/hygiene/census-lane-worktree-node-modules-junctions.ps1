# census-dangling-node-modules-junctions.ps1 -- the junction census the
# fold-12 destruction left behind, re-runnable.
#
# WHY. Every decko-ts lane worktree gets node_modules as a JUNCTION to some
# other worktree's copy rather than a real install. A junction names its
# TARGET BY PATH, so when the hygiene remediation destroyed a worktree, every
# junction pointing at it did not become "stale" -- it became unresolvable.
# `test -e <worktree>/node_modules/vitest` fails, vitest cannot start, and the
# affected lane cannot run a single one of its own gates. Nothing warns: the
# worktree looks populated, git is clean, and the only symptom is that the
# test command is missing a module.
#
# This script is read-only: it enumerates, resolves, and prints. It changes
# nothing, and it never creates, repairs, or removes a junction -- repairs
# belong to the lane that owns the worktree.
#
# Usage: powershell -NoProfile -File census-dangling-node-modules-junctions.ps1

$ErrorActionPreference = 'Stop'
$root = 'C:\localProjects'

$rows = foreach ($d in Get-ChildItem $root -Directory) {
    $nm = Join-Path $d.FullName 'node_modules'
    if (-not (Test-Path $nm)) { continue }
    $i = Get-Item $nm -Force
    if ($i.LinkType -ne 'Junction') { continue }
    $target = ($i.Target -join ',')
    [PSCustomObject]@{
        Worktree    = $d.Name
        Target      = $target
        TargetAlive = Test-Path $target
        VitestResolves = Test-Path (Join-Path $nm 'vitest')
        InFlight    = if ($d.Name -eq 'decko-ts-lane-page42-2026-10-04') { 'IN-FL dwfrun-b0ae0fbb-parity-glm' }
                      elseif ($d.Name -eq 'decko-ts-lane-view187-2026-10-04') { 'IN-FL dwfrun-view187' }
                      else { '' }
    }
}

$dangling = $rows | Where-Object { -not $_.TargetAlive }

Write-Output "node_modules junctions under ${root}: $($rows.Count)"
Write-Output "  resolving:  $(($rows | Where-Object TargetAlive).Count)"
Write-Output "  DANGLING:   $($dangling.Count)"
Write-Output ''
Write-Output 'DANGLING junctions (target worktree destroyed -- every lane below cannot run vitest):'
$dangling | Sort-Object Worktree | Format-Table -AutoSize -Wrap
Write-Output ''
Write-Output 'REPAIR TARGET (surviving copy used by the most worktrees):'
$rows | Where-Object TargetAlive | Group-Object Target |
    Sort-Object Count -Descending | Select-Object -First 5 Count, Name | Format-Table -AutoSize -Wrap
