# Start the dual-database backend
# PowerShell equivalent of start.sh

# Cleanup function to stop Docker containers and server
function Cleanup {
    Write-Host ""
    Write-Host "🛑 Stopping services..." -ForegroundColor Yellow

    # Kill all child processes from this script (including npm)
    try {
        $childProcesses = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Parent.Id -eq $PID }
        $childProcesses | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
    } catch {
        # Ignore errors
    }

    # Stop Docker containers (don't remove them)
    if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        docker-compose stop
    } elseif (Get-Command docker -ErrorAction SilentlyContinue) {
        docker compose stop
    }

    Write-Host "✅ Cleanup complete" -ForegroundColor Green
    # Force exit to ensure we return to terminal immediately
    [Environment]::Exit(0)
}

# Register cleanup on exit
Register-EngineEvent PowerShell.Exiting -Action { Cleanup } | Out-Null

# Handle Ctrl+C
[Console]::TreatControlCAsInput = $false
$null = Register-ObjectEvent ([Console]) CancelKeyPress -Action {
    Cleanup
}

Write-Host "🚀 Starting Catchy Backend..." -ForegroundColor Green

# Check if Docker is installed
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Error: Docker is not installed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Docker from: https://docs.docker.com/get-docker/" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Installation links:" -ForegroundColor Yellow
    Write-Host "  - Windows: https://docs.docker.com/desktop/install/windows-install/" -ForegroundColor Yellow
    Write-Host "  - macOS: https://docs.docker.com/desktop/install/mac-install/" -ForegroundColor Yellow
    Write-Host "  - Linux: https://docs.docker.com/engine/install/" -ForegroundColor Yellow
    exit 1
}

# Check if Docker daemon is running
try {
    docker info | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker daemon not running"
    }
} catch {
    Write-Host "🐳 Docker is not running. Attempting to start Docker Desktop..." -ForegroundColor Yellow
    
    # Try to start Docker Desktop on Windows
    $dockerDesktopPath = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerDesktopPath) {
        Start-Process $dockerDesktopPath
        Write-Host "⏳ Waiting for Docker to start..." -ForegroundColor Yellow
        
        $timeout = 30
        $dockerReady = $false
        while ($timeout -gt 0 -and -not $dockerReady) {
            Start-Sleep -Seconds 1
            $timeout--
            try {
                docker info | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    $dockerReady = $true
                }
            } catch {
                # Continue waiting
            }
        }
        
        if (-not $dockerReady) {
            Write-Host "❌ Error: Docker failed to start. Please start Docker Desktop manually." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "❌ Error: Docker daemon is not running. Please start Docker Desktop manually." -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ Docker is running" -ForegroundColor Green

# Navigate to backend directory (parent of scripts/)
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptPath
Set-Location $projectRoot

# Start database services only
if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    docker-compose up -d
} else {
    docker compose up -d
}

Write-Host ""
Write-Host "⏳ Waiting for databases to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Show status
if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    docker-compose ps
} else {
    docker compose ps
}

Write-Host ""
Write-Host "✅ Databases started!" -ForegroundColor Green
Write-Host "🚀 Starting NestJS API locally in watch mode..." -ForegroundColor Green
Write-Host "-----------------------------------------------------"
Write-Host "👉 Press Ctrl+C to stop the server and Docker containers"
Write-Host "-----------------------------------------------------"

# Start API locally
npm run start:dev




