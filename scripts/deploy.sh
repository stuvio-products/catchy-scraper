#!/bin/bash
# Deployment script for jamjam-backend
# This script handles Docker installation, application deployment, and logging

set -euo pipefail  # Exit on error, undefined vars, and pipe failures

DOMAIN="api.catchy.social"
APP_DIR="/var/www/catchy-backend"
# Use SSH URL for private repositories (requires SSH key setup on server)
REPO_URL="git@github.com:atharvastuvio/catchy-backend.git"
# Fallback to HTTPS if SSH fails (will require token)
REPO_URL_HTTPS="https://github.com/atharvastuvio/catchy-backend.git"
BRANCH="${DEPLOY_BRANCH:-main}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

log_info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $1"
}

# Function to check if Docker is installed
check_docker() {
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version)
        log "Docker is installed: $DOCKER_VERSION"
        return 0
    else
        log_warn "Docker is not installed"
        return 1
    fi
}

# Function to install Docker
install_docker() {
    log "Installing Docker..."
    
    # Update package index
    apt-get update -qq
    
    # Install prerequisites
    apt-get install -y -qq \
        ca-certificates \
        curl \
        gnupg \
        lsb-release
    
    # Add Docker's official GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    
    # Set up the repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker Engine
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Start and enable Docker
    systemctl start docker
    systemctl enable docker
    
    # Verify installation
    if docker --version &> /dev/null; then
        log "✅ Docker installed successfully: $(docker --version)"
        return 0
    else
        log_error "Docker installation failed"
        return 1
    fi
}

# Function to check if Docker Compose is available
check_docker_compose() {
    if docker compose version &> /dev/null; then
        log "Docker Compose is available: $(docker compose version)"
        return 0
    elif command -v docker-compose &> /dev/null; then
        log "Docker Compose is available: $(docker-compose --version)"
        return 0
    else
        log_error "Docker Compose is not available"
        return 1
    fi
}

# Function to setup application directory
setup_app_directory() {
    log "Setting up application directory: $APP_DIR"
    
    # Create directory and parent directories if they don't exist
    if [ ! -d "$APP_DIR" ]; then
        log "Directory does not exist, creating: $APP_DIR"
        mkdir -p "$APP_DIR" || {
            log_error "Failed to create directory: $APP_DIR"
            return 1
        }
        log "✅ Created directory: $APP_DIR"
    else
        log "Directory already exists: $APP_DIR"
    fi
    
    # Ensure we can access the directory
    if [ ! -w "$APP_DIR" ]; then
        log_warn "Directory is not writable, attempting to fix permissions..."
        chmod 755 "$APP_DIR" || {
            log_error "Failed to set permissions on directory: $APP_DIR"
            return 1
        }
    fi
    
    # Change to directory
    cd "$APP_DIR" || {
        log_error "Failed to change to directory: $APP_DIR"
        return 1
    }
    
    log "✅ Directory setup complete"
    return 0
}

# Function to clone or update repository
update_repository() {
    log "Updating repository..."
    
    # Check if git is installed
    if ! command -v git &> /dev/null; then
        log "Git is not installed, installing..."
        apt-get update -qq
        apt-get install -y -qq git || {
            log_error "Failed to install git"
            return 1
        }
        log "✅ Git installed"
    fi
    
    # Configure git to not prompt for credentials
    export GIT_TERMINAL_PROMPT=0
    git config --global credential.helper store || true
    git config --global user.name "Deployment Bot" || true
    git config --global user.email "deploy@catchy.social" || true
    
    # Ensure directory exists before cloning
    if [ ! -d "$APP_DIR" ]; then
        log "App directory does not exist, creating it..."
        mkdir -p "$APP_DIR" || {
            log_error "Failed to create app directory: $APP_DIR"
            return 1
        }
    fi
    
    if [ -d "$APP_DIR/.git" ]; then
        log "Repository exists, pulling latest changes..."
        cd "$APP_DIR" || {
            log_error "Failed to change to app directory"
            return 1
        }
        
        # Check current remote URL
        CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
        
        # Update remote URL if needed to use authentication
        if [ -n "${GITHUB_TOKEN:-}" ]; then
            # Check if remote URL needs authentication
            if echo "$CURRENT_REMOTE" | grep -q "^https://github.com" && ! echo "$CURRENT_REMOTE" | grep -q "@github.com"; then
                log "Updating remote URL to use authentication..."
                if ! git remote set-url origin "https://${GITHUB_TOKEN}@github.com/atharvastuvio/catchy-backend.git" 2>/dev/null; then
                    log_warn "Failed to update remote URL with token as username, trying alternative..."
                    git remote set-url origin "https://x:${GITHUB_TOKEN}@github.com/atharvastuvio/catchy-backend.git" 2>/dev/null || true
                fi
            fi
        fi
        
        # Configure git to not prompt
        export GIT_TERMINAL_PROMPT=0
        
        # Always update remote URL if token is present to ensure we use the fresh token
        if [ -n "${GITHUB_TOKEN:-}" ]; then
            log "Updating remote URL with provided token..."
            # Try format: https://x:TOKEN@github.com/...
            git remote set-url origin "https://x:${GITHUB_TOKEN}@github.com/atharvastuvio/catchy-backend.git" 2>/dev/null || true
        fi
        
        # Fetch with authentication
        log "Fetching latest changes..."
        FETCH_SUCCESS=false
        
        if git fetch origin "$BRANCH" < /dev/null 2>&1; then
            FETCH_SUCCESS=true
            log "✅ Fetched latest changes"
            
            git reset --hard "origin/$BRANCH" || {
                log_error "Failed to reset to branch: $BRANCH"
                return 1
            }
            git clean -fd
            log "✅ Repository updated"
        else
            log_warn "Fetch failed with invalid credentials or network issue."
            FETCH_SUCCESS=false
        fi
        
        if [ "$FETCH_SUCCESS" = false ]; then
            # If fetch fails, remove and re-clone
            log_warn "Fetch failed, removing directory to force re-clone..."
            cd "$(dirname "$APP_DIR")" || return 1
            rm -rf "$APP_DIR"
            # Fall through to clone logic below
        fi
    fi
    
    # Clone repository if .git doesn't exist or fetch failed
    if [ ! -d "$APP_DIR/.git" ]; then
        log "Cloning repository (no .git directory found)..."
        log "Current directory contents before clone:"
        ls -la "$APP_DIR" || true
        
        # If directory has content but no .git, we need to clean it first
        # Move to parent directory temporarily
        cd "$(dirname "$APP_DIR")" || {
            log_error "Failed to change to parent directory"
            return 1
        }
        
        # Remove the app directory completely if it exists and has no .git
        if [ -d "$APP_DIR" ] && [ ! -d "$APP_DIR/.git" ]; then
            log "Removing existing directory without .git..."
            rm -rf "$APP_DIR" || {
                log_error "Failed to remove existing directory"
                return 1
            }
        fi
        
        # Clone the repository
        log "Cloning repository from $REPO_URL (branch: $BRANCH)..."
        
        # Try SSH first (for private repos with SSH keys)
        log "Attempting SSH clone..."
        if ssh -T git@github.com &>/dev/null || ssh -o StrictHostKeyChecking=no -T git@github.com &>/dev/null; then
            log "GitHub SSH access is configured, using SSH..."
            if git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"; then
                log "✅ Repository cloned via SSH"
            else
                log_warn "SSH clone failed, trying HTTPS with token..."
                CLONE_FAILED=true
            fi
        else
            log_warn "GitHub SSH not configured, trying HTTPS..."
            CLONE_FAILED=true
        fi
        
        # If SSH failed, try HTTPS with token
        if [ "${CLONE_FAILED:-false}" = "true" ]; then
            if [ -n "${GITHUB_TOKEN:-}" ]; then
                log "Using GitHub token for HTTPS authentication..."
                
                # Configure git to not prompt for credentials
                export GIT_TERMINAL_PROMPT=0
                unset GIT_ASKPASS
                
                # For GitHub, use token as username (GitHub accepts token as username with empty password)
                # Format: https://TOKEN@github.com/owner/repo.git
                # Alternative: https://x:TOKEN@github.com/owner/repo.git
                
                # Try format 1: token as username
                REPO_URL_WITH_TOKEN="https://${GITHUB_TOKEN}@github.com/atharvastuvio/catchy-backend.git"
                log "Attempting clone with token as username..."
                
                if git clone -b "$BRANCH" "$REPO_URL_WITH_TOKEN" "$APP_DIR" < /dev/null 2>&1; then
                    log "✅ Repository cloned via HTTPS with token"
                else
                    # Try format 2: token as password with 'x' as username
                    log "Trying alternative format (token as password)..."
                    REPO_URL_WITH_TOKEN="https://x:${GITHUB_TOKEN}@github.com/atharvastuvio/catchy-backend.git"
                    
                    if git clone -b "$BRANCH" "$REPO_URL_WITH_TOKEN" "$APP_DIR" < /dev/null 2>&1; then
                        log "✅ Repository cloned via HTTPS with token (alternative format)"
                    else
                        # Try format 3: using git credential helper
                        log "Trying with git credential helper..."
                        git config --global --unset credential.helper 2>/dev/null || true
                        
                        # Create a credential helper script file
                        # Use EOF without quotes to allow variable expansion
                        cat > /tmp/git-cred-helper.sh << EOF
#!/bin/bash
echo "username=x"
echo "password=${GITHUB_TOKEN}"
EOF
                        chmod +x /tmp/git-cred-helper.sh
                        git config --global credential.helper "/tmp/git-cred-helper.sh"
                        
                        if git clone -b "$BRANCH" "https://github.com/atharvastuvio/catchy-backend.git" "$APP_DIR" < /dev/null 2>&1; then
                            log "✅ Repository cloned via HTTPS with credential helper"
                        else
                            log_error "Failed to clone repository with token after all attempts"
                            log "Debug info:"
                            log "  Token is set: yes"
                            log "  Token length: ${#GITHUB_TOKEN} characters"
                            log "  Token prefix: ${GITHUB_TOKEN:0:4}..."
                            log "  Repository: atharvastuvio/catchy-backend"
                            log "  Branch: $BRANCH"
                            log ""
                            log "Possible issues:"
                            log "  1. Token may not have 'repo' scope"
                            log "  2. Token may be expired or invalid"
                            log "  3. Repository may not be accessible with this token"
                            return 1
                        fi
                    fi
                fi
            else
                log_error "Failed to clone repository - authentication required"
                log "Repository URL: $REPO_URL"
                log "Branch: $BRANCH"
                log ""
                log "Troubleshooting options:"
                log "1. Set up SSH keys for GitHub on the server:"
                log "   ssh-keygen -t ed25519 -C 'deploy@server'"
                log "   cat ~/.ssh/id_ed25519.pub"
                log "   Add the public key to GitHub: Settings → SSH and GPG keys"
                log ""
                log "2. Or set GITHUB_TOKEN environment variable with a Personal Access Token"
                log "   Create token at: https://github.com/settings/tokens"
                log "   Required scope: repo (for private repos)"
                log ""
                log "3. Or make the repository public (not recommended for production)"
                return 1
            fi
        fi
        
        cd "$APP_DIR" || {
            log_error "Failed to change to cloned directory"
            return 1
        }
        log "✅ Repository cloned successfully"
    fi
    
    # Verify essential files exist
    if [ ! -f "docker-compose.prod.yml" ]; then
        log_error "docker-compose.prod.yml not found after repository update"
        log "Current directory: $(pwd)"
        log "Branch: $BRANCH"
        log "Repository URL: $REPO_URL"
        log "Directory contents:"
        ls -la || true
        return 1
    fi
    
    log "✅ Repository files verified"
    return 0
}

# Function to check Docker daemon
check_docker_daemon() {
    log "Checking Docker daemon..."
    max_retries=3
    retry=0
    
    while [ $retry -lt $max_retries ]; do
        if docker info &> /dev/null; then
            log "✅ Docker daemon is running"
            return 0
        else
            retry=$((retry + 1))
            log_warn "Docker daemon is not running (attempt $retry/$max_retries)"
            
            if [ $retry -lt $max_retries ]; then
                log "Starting Docker daemon..."
                systemctl start docker
                sleep 5
            fi
        fi
    done
    
    log_error "Failed to start Docker daemon after $max_retries attempts"
    return 1
}

# Function to deploy application
deploy_application() {
    log "Deploying application..."
    
    # Ensure directory exists
    if [ ! -d "$APP_DIR" ]; then
        log "App directory does not exist, creating it..."
        mkdir -p "$APP_DIR" || {
            log_error "Failed to create app directory: $APP_DIR"
            return 1
        }
    fi
    
    # Change to directory
    cd "$APP_DIR" || {
        log_error "Failed to change to app directory: $APP_DIR"
        return 1
    }
    
    # Verify docker-compose.prod.yml exists
    if [ ! -f "docker-compose.prod.yml" ]; then
        log_error "docker-compose.prod.yml not found in $APP_DIR"
        log "Current directory: $(pwd)"
        log "Directory contents:"
        ls -la "$APP_DIR" || true
        return 1
    fi
    
    # Create logs directory
    log "Creating logs directory..."
    mkdir -p "$APP_DIR/logs" || {
        log_error "Failed to create logs directory: $APP_DIR/logs"
        return 1
    }
    chmod 755 "$APP_DIR/logs" || {
        log_warn "Failed to set permissions on logs directory, continuing..."
    }
    log "✅ Logs directory ready"
    
    # Check if containers exist
    CONTAINERS_EXIST=false
    if docker compose -f docker-compose.prod.yml ps -q &> /dev/null; then
        RUNNING_CONTAINERS=$(docker compose -f docker-compose.prod.yml ps -q | wc -l)
        if [ "$RUNNING_CONTAINERS" -gt 0 ]; then
            CONTAINERS_EXIST=true
            log "Existing containers found, will reload them..."
        fi
    fi
    
    # Aggressively clean up potential conflicting containers
    if docker ps -a --format '{{.Names}}' | grep -q "^catchy-backend$"; then
        log "⚠️  Found existing 'catchy-backend' container. Removing it to prevent conflicts..."
        docker rm -f catchy-backend || true
    fi

    # Check and free port 3000 if needed (e.g. if a stray node process is running)
    if command -v lsof &> /dev/null; then
        if lsof -i :3000 -t >/dev/null; then
            log_warn "Port 3000 is occupied by a process. Killing it..."
            kill -9 $(lsof -i :3000 -t) || true
        fi
    elif command -v fuser &> /dev/null; then
        if fuser 3000/tcp &> /dev/null; then
            log_warn "Port 3000 is occupied. Killing process..."
            fuser -k -9 3000/tcp || true
        fi
    fi

    if [ "$CONTAINERS_EXIST" = true ]; then
        # Reload existing containers
        log "Existing containers detected - performing reload..."
        
        # Build application image (always rebuild for latest code)
        log "Building application image with latest code..."
        if ! docker compose -f docker-compose.prod.yml build app; then
            log_error "Failed to build application image"
            return 1
        fi
        
        # Keep database containers running (no need to recreate them)
        log "Database containers remain running (not recreated)"
        
        # Ensure database services are up
        docker compose -f docker-compose.prod.yml up -d db-pg-catchy db-pg-catchy-replica || log_warn "Some database services failed to start"
    else
        # Create new containers
        log "No existing containers found, creating new ones..."
        
        # Pull latest images for databases
        log "Pulling latest database images..."
        docker compose -f docker-compose.prod.yml pull db-pg-catchy db-pg-catchy-replica || log_warn "Failed to pull some database images, will try to use local ones"
        
        # Build application image
        log "Building application image..."
        if ! docker compose -f docker-compose.prod.yml build app; then
            log_error "Failed to build application image"
            return 1
        fi
        
        # Start database services only (not app yet)
        log "Starting database services..."
        if ! docker compose -f docker-compose.prod.yml up -d db-pg-catchy db-pg-catchy-replica; then
            log_error "Failed to start database services"
            return 1
        fi
        
        # Check for Postgres incompatibility (PG 17 -> 16 downgrade issue)
        log "Checking for database version compatibility..."
        sleep 10
        if docker compose -f docker-compose.prod.yml logs db-pg-catchy 2>&1 | grep -q "database files are incompatible with server"; then
            log_error "🚨 Postgres version mismatch detected (Downgrade from 17 to 16)"
            log "⚠️  The existing database data is from PG 17 and cannot be opened by PG 16."
            log "⚠️  RESETTING DATABASE volumes to allow fresh start..."
            
            docker compose -f docker-compose.prod.yml down -v
            docker compose -f docker-compose.prod.yml up -d db-pg-catchy db-pg-catchy-replica
            log "✅ Database reset and restarted with fresh volume"
        fi
    fi
    
    # Wait for database services to be healthy
    log "Waiting for database services to be healthy..."
    
    # Wait for primary postgres
    log "Waiting for primary PostgreSQL to be healthy..."
    max_wait=120
    wait_count=0
    while ! docker compose -f docker-compose.prod.yml ps db-pg-catchy | grep -q "healthy"; do
        if [ $wait_count -ge $max_wait ]; then
            log_error "Primary PostgreSQL did not become healthy within ${max_wait} seconds"
            docker compose -f docker-compose.prod.yml logs db-pg-catchy
            return 1
        fi
        sleep 2
        wait_count=$((wait_count + 2))
    done
    log "✅ Primary PostgreSQL is healthy"
    
    # Wait for replica postgres (may take longer due to pg_basebackup)
    log "Waiting for replica PostgreSQL to be healthy (this may take up to 2 minutes)..."
    max_wait=180
    wait_count=0
    while ! docker compose -f docker-compose.prod.yml ps db-pg-catchy-replica | grep -q "healthy"; do
        if [ $wait_count -ge $max_wait ]; then
            log_warn "Replica PostgreSQL did not become healthy within ${max_wait} seconds"
            log "Checking replica logs..."
            docker compose -f docker-compose.prod.yml logs --tail=50 db-pg-catchy-replica
            log_warn "Continuing anyway - replica may still be initializing..."
            break
        fi
        sleep 3
        wait_count=$((wait_count + 3))
        if [ $((wait_count % 15)) -eq 0 ]; then
            log "Still waiting for replica... (${wait_count}/${max_wait}s)"
        fi
    done
    
    if docker compose -f docker-compose.prod.yml ps db-pg-catchy-replica | grep -q "healthy"; then
        log "✅ Replica PostgreSQL is healthy"
    else
        log_warn "⚠️  Replica PostgreSQL is not healthy, but continuing with deployment"
    fi
    
    # Check database service status
    log "Checking database service status..."
    docker compose -f docker-compose.prod.yml ps db-pg-catchy db-pg-catchy-replica
    
    # Run database migrations before starting the app
    log "Running database migrations..."
    if docker compose -f docker-compose.prod.yml run --rm app npx prisma migrate deploy 2>&1; then
        log "✅ Database migrations applied successfully"
    else
        log_error "Failed to apply database migrations"
        return 1
    fi
    
    # Now start the application container
    log "Starting application container..."
    if [ "$CONTAINERS_EXIST" = true ]; then
        # Restart application container with new image
        if ! docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps app; then
            log_error "Failed to start application container"
            return 1
        fi
    else
        # Start application container for the first time
        if ! docker compose -f docker-compose.prod.yml up -d app; then
            log_error "Failed to start application container"
            return 1
        fi
    fi
    
    # Check service status
    log "Checking all service status..."
    docker compose -f docker-compose.prod.yml ps
    
    # Wait for application to be ready
    log "Waiting for application to be ready..."
    max_attempts=30
    attempt=0
    
    # Check if curl or wget is available
    if command -v curl &> /dev/null; then
        HEALTH_CMD="curl -f"
    elif command -v wget &> /dev/null; then
        HEALTH_CMD="wget --spider --quiet"
    else
        log_warn "curl/wget not available, skipping health check"
        return 0
    fi
    
    while [ $attempt -lt $max_attempts ]; do
        if $HEALTH_CMD http://localhost:3000/health &> /dev/null || \
           $HEALTH_CMD http://localhost:3000 &> /dev/null; then
            log "✅ Application is ready"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 2
    done
    
    log_warn "Application health check timeout, but continuing..."
    return 0
}

# Function to show logs
show_logs() {
    log "Showing recent container logs..."
    
    # Ensure directory exists
    if [ ! -d "$APP_DIR" ]; then
        log_warn "App directory does not exist: $APP_DIR"
        return 0
    fi
    
    # Ensure we're in the app directory
    cd "$APP_DIR" || {
        log_warn "Cannot access app directory: $APP_DIR"
        return 0
    }
    
    # Check if docker-compose.prod.yml exists
    if [ ! -f "docker-compose.prod.yml" ]; then
        log_warn "docker-compose.prod.yml not found, skipping log display"
        return 0
    fi
    
    echo ""
    echo "=========================================="
    echo "📋 Container Status"
    echo "=========================================="
    docker compose -f docker-compose.prod.yml ps || true
    echo ""
    echo "=========================================="
    echo "📋 Application Logs (last 50 lines)"
    echo "=========================================="
    docker compose -f docker-compose.prod.yml logs --tail=50 app || true
    echo ""
    echo "=========================================="
    echo "📋 Database Logs (last 20 lines)"
    echo "=========================================="
    docker compose -f docker-compose.prod.yml logs --tail=20 db-pg-catchy || true
}

# Function to setup nginx
setup_nginx() {
    log "Setting up Nginx..."
    if [ -f "$APP_DIR/scripts/setup-nginx.sh" ]; then
        chmod +x "$APP_DIR/scripts/setup-nginx.sh"
        if bash "$APP_DIR/scripts/setup-nginx.sh"; then
            log "✅ Nginx setup completed"
            return 0
        else
            log_error "Nginx setup failed"
            return 1
        fi
    else
        log_warn "Nginx setup script not found, skipping..."
        return 0
    fi
}

# Main deployment function
main() {
    log "=========================================="
    log "🚀 Starting deployment process"
    log "=========================================="
    
    # Check and install Docker
    if ! check_docker; then
        install_docker || {
            log_error "Failed to install Docker"
            exit 1
        }
    fi
    
    # Check Docker daemon
    check_docker_daemon || {
        log_error "Docker daemon is not available"
        exit 1
    }
    
    # Check Docker Compose
    if ! check_docker_compose; then
        log_error "Docker Compose is required but not available"
        exit 1
    fi
    
    # Setup application directory (create if doesn't exist)
    setup_app_directory || {
        log_error "Failed to setup application directory"
        exit 1
    }
    
    # Update repository
    update_repository || {
        log_error "Failed to update repository"
        exit 1
    }
    
    # Setup nginx
    setup_nginx || {
        log_warn "Nginx setup had issues, but continuing with deployment..."
    }
    
    # Reconnect check - verify Docker is still accessible
    log "Verifying Docker connection before deployment..."
    check_docker_daemon || {
        log_error "Docker daemon is not accessible, aborting deployment"
        exit 1
    }
    
    # Deploy application - CRITICAL: must succeed
    if ! deploy_application; then
        log_error "❌ Failed to deploy application - deployment aborted"
        exit 1
    fi
    
    # Show logs and status (non-critical, continue even if fails)
    show_logs || log_warn "Could not show logs, but deployment may have succeeded"
    
    log "=========================================="
    log "✅ Deployment completed successfully"
    log "=========================================="
    log "Application URL: https://${DOMAIN}"
    log "Health Check: https://${DOMAIN}/health"
}

# Run main function
main "$@"

