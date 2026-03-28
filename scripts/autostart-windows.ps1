# ============================================================
# TurionZ — Windows Auto-Start (Task Scheduler)
# Created by BollaNetwork
#
# Usage:
#   .\autostart-windows.ps1 -Action Install   — Create scheduled task
#   .\autostart-windows.ps1 -Action Uninstall — Remove scheduled task
#   .\autostart-windows.ps1 -Action Status    — Check task status
# ============================================================

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("Install", "Uninstall", "Status")]
    [string]$Action
)

$TaskName = "TurionZ"
$TaskDescription = "TurionZ (Thor) - AI Personal Agent by BollaNetwork"
$InstallDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$NodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
$EntryPoint = Join-Path $InstallDir "dist\index.js"

if (-not $NodePath) {
    Write-Host "[TurionZ] Error: Node.js not found in PATH." -ForegroundColor Red
    exit 1
}

function Install-TurionZTask {
    Write-Host "[TurionZ] Installing Windows Task Scheduler task..."

    # Remove existing task if present
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "[TurionZ] Removed existing task."
    }

    # Create action: run node with the entry point
    $action = New-ScheduledTaskAction `
        -Execute $NodePath `
        -Argument "`"$EntryPoint`"" `
        -WorkingDirectory $InstallDir

    # Trigger: at user logon
    $trigger = New-ScheduledTaskTrigger -AtLogOn

    # Settings: restart on failure (max 3 times, every 5 minutes)
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 5) `
        -ExecutionTimeLimit (New-TimeSpan -Days 365)

    # Principal: run as current user
    $principal = New-ScheduledTaskPrincipal `
        -UserId $env:USERNAME `
        -LogonType Interactive `
        -RunLevel Limited

    # Register the task
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Description $TaskDescription `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal

    Write-Host "[TurionZ] Task installed successfully." -ForegroundColor Green
    Write-Host "  TurionZ will start automatically on user login."
    Write-Host "  To start now: schtasks /run /tn `"$TaskName`""
    Write-Host "  To check:     schtasks /query /tn `"$TaskName`""
}

function Uninstall-TurionZTask {
    Write-Host "[TurionZ] Removing Task Scheduler task..."

    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        # Stop the task if running
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "[TurionZ] Task removed." -ForegroundColor Green
    } else {
        Write-Host "[TurionZ] Task not found. Nothing to remove."
    }
}

function Show-TurionZStatus {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        $info = Get-ScheduledTaskInfo -TaskName $TaskName
        Write-Host "[TurionZ] Task Status:" -ForegroundColor Cyan
        Write-Host "  State:        $($task.State)"
        Write-Host "  Last Run:     $($info.LastRunTime)"
        Write-Host "  Last Result:  $($info.LastTaskResult)"
        Write-Host "  Next Run:     $($info.NextRunTime)"
    } else {
        Write-Host "[TurionZ] Task is not installed."
    }
}

switch ($Action) {
    "Install"   { Install-TurionZTask }
    "Uninstall" { Uninstall-TurionZTask }
    "Status"    { Show-TurionZStatus }
}
