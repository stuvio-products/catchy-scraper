# Stop the backend WITHOUT removing containers or data
# PowerShell equivalent of stop.sh

Write-Host "🛑 Stopping backend services..." -ForegroundColor Yellow

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptPath
Set-Location $projectRoot

# Stop containers (preserves data and container state)
docker-compose stop

Write-Host ""
Write-Host "✅ Services stopped. Data and containers preserved." -ForegroundColor Green
Write-Host "💡 To restart: .\scripts\start.ps1" -ForegroundColor Cyan
Write-Host "💡 To fully remove (including containers): docker-compose down" -ForegroundColor Cyan
Write-Host "💡 To remove everything (including volumes): docker-compose down -v" -ForegroundColor Cyan





