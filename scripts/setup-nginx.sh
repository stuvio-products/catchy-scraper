#!/bin/bash
# Nginx setup script for api.jamjam.social

set -e

DOMAIN="api.catchy.social"

# Function to cleanup old nginx backups, keeping only the 2 most recent ones
cleanup_old_backups() {
    local backup_dir="/etc/nginx/sites-available"
    local base_config="${backup_dir}/${DOMAIN}"

    echo "🧹 Cleaning up old nginx backups..."

    # Find all backup files for this domain, sort by modification time (newest first), skip first 2, delete the rest
    local old_backups=$(ls -t "${base_config}.backup."* 2>/dev/null | tail -n +3)

    if [ -n "$old_backups" ]; then
        echo "🗑️  Removing $(echo "$old_backups" | wc -l) old backup(s)..."
        echo "$old_backups" | xargs rm -f
        echo "✅ Old backups cleaned up"
    else
        echo "✅ No old backups to clean up (keeping latest 2)"
    fi
}

NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"
APP_PORT=3000
SSL_CERT_PATH="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
SSL_KEY_PATH="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"

echo "=========================================="
echo "🔧 Setting up Nginx for ${DOMAIN}"
echo "=========================================="

# Check if SSL certificates exist
SSL_AVAILABLE=false
if [ -f "$SSL_CERT_PATH" ] && [ -f "$SSL_KEY_PATH" ]; then
    SSL_AVAILABLE=true
    echo "✅ SSL certificates found"
else
    echo "⚠️  SSL certificates not found at:"
    echo "   Certificate: $SSL_CERT_PATH"
    echo "   Key: $SSL_KEY_PATH"
    echo "   Will create HTTP-only configuration (SSL can be added later)"
fi

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "📦 Installing Nginx..."
    apt-get update
    apt-get install -y nginx
    echo "✅ Nginx installed"
else
    echo "✅ Nginx is already installed"
fi

# Check if configuration already exists and is correct
CONFIG_EXISTS=false
if [ -f "$NGINX_CONF" ]; then
    # Check if the config contains our domain and port
    if grep -q "server_name ${DOMAIN}" "$NGINX_CONF" && \
       grep -q "proxy_pass http://127.0.0.1:${APP_PORT}" "$NGINX_CONF"; then
        # If config uses SSL, verify certificates exist
        if grep -q "ssl_certificate" "$NGINX_CONF"; then
            if [ "$SSL_AVAILABLE" = true ]; then
                CONFIG_EXISTS=true
                echo "✅ Nginx configuration already exists and looks correct (with SSL)"
            else
                echo "⚠️  Nginx configuration uses SSL but certificates are missing"
                echo "📝 Backing up existing configuration and will create HTTP-only version..."
                cp "$NGINX_CONF" "${NGINX_CONF}.backup.$(date +%Y%m%d_%H%M%S)"
                cleanup_old_backups
            fi
        else
            # HTTP-only config, check if SSL is available and we should upgrade
            if [ "$SSL_AVAILABLE" = true ]; then
                echo "⚠️  SSL certificates are available but config is HTTP-only"
                echo "📝 Will update configuration to use SSL..."
                cp "$NGINX_CONF" "${NGINX_CONF}.backup.$(date +%Y%m%d_%H%M%S)"
                cleanup_old_backups
            else
                CONFIG_EXISTS=true
                echo "✅ Nginx configuration already exists and looks correct (HTTP-only)"
            fi
        fi
    else
        echo "⚠️  Nginx configuration exists but doesn't match our requirements"
        echo "📝 Backing up existing configuration..."
        cp "$NGINX_CONF" "${NGINX_CONF}.backup.$(date +%Y%m%d_%H%M%S)"
        cleanup_old_backups
    fi
fi

# Create nginx configuration if it doesn't exist or is incorrect
if [ "$CONFIG_EXISTS" = false ]; then
    echo "📝 Creating Nginx configuration..."
    
    if [ "$SSL_AVAILABLE" = true ]; then
        # Create configuration with SSL
        cat > "$NGINX_CONF" <<EOF
# Upstream configuration
upstream catchy_backend {
    server 127.0.0.1:${APP_PORT};
    keepalive 64;
}

# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN} www.${DOMAIN};

    # SSL certificates (managed by certbot)
    ssl_certificate ${SSL_CERT_PATH};
    ssl_certificate_key ${SSL_KEY_PATH};
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Logging
    access_log /var/log/nginx/${DOMAIN}-access.log;
    error_log /var/log/nginx/${DOMAIN}-error.log;

    # Client settings
    client_max_body_size 10M;
    client_body_timeout 60s;
    client_header_timeout 60s;

    # Proxy settings
    location / {
        proxy_pass http://catchy_backend;
        proxy_http_version 1.1;
        
        # Headers
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        
        # Connection settings
        proxy_set_header Connection "";
        proxy_redirect off;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffering
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;
    }

    # Health check endpoint (optional, for monitoring)
    location /health {
        proxy_pass http://catchy_backend/health;
        access_log off;
    }
}
EOF
        echo "✅ Nginx configuration created with SSL"
    else
        # Create HTTP-only configuration (SSL can be added later)
        cat > "$NGINX_CONF" <<EOF
# Upstream configuration
upstream catchy_backend {
    server 127.0.0.1:${APP_PORT};
    keepalive 64;
}

# HTTP server (SSL will be added when certificates are available)
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    # Let's Encrypt challenge (for future SSL setup)
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Logging
    access_log /var/log/nginx/${DOMAIN}-access.log;
    error_log /var/log/nginx/${DOMAIN}-error.log;

    # Client settings
    client_max_body_size 10M;
    client_body_timeout 60s;
    client_header_timeout 60s;

    # Proxy settings
    location / {
        proxy_pass http://catchy_backend;
        proxy_http_version 1.1;
        
        # Headers
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        
        # Connection settings
        proxy_set_header Connection "";
        proxy_redirect off;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffering
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;
    }

    # Health check endpoint (optional, for monitoring)
    location /health {
        proxy_pass http://catchy_backend/health;
        access_log off;
    }
}
EOF
        echo "✅ Nginx configuration created (HTTP only)"
        echo "⚠️  SSL certificates not found - using HTTP only"
        echo "   To enable SSL later, run:"
        echo "   certbot --nginx -d ${DOMAIN}"
        echo "   Then update the nginx config to include HTTPS server block"
    fi
fi

# Enable the site
if [ ! -L "$NGINX_ENABLED" ]; then
    echo "🔗 Enabling Nginx site..."
    ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
    echo "✅ Site enabled"
fi

# Test nginx configuration
echo "🧪 Testing Nginx configuration..."
if nginx -t 2>&1; then
    echo "✅ Nginx configuration is valid"
else
    NGINX_TEST_ERROR=$(nginx -t 2>&1 || true)
    echo "❌ Nginx configuration test failed!"
    echo "Error details:"
    echo "$NGINX_TEST_ERROR"
    
    # If error is about missing or invalid SSL certificates, recreate config without SSL
    if echo "$NGINX_TEST_ERROR" | grep -qE "cannot load certificate|SSL_CTX_use_PrivateKey_file|BIO_new_file|no such file"; then
        echo ""
        echo "⚠️  SSL certificate error detected - attempting to fallback to HTTP-only configuration..."
        
        # Force recreation without SSL regardless of SSL_AVAILABLE status
        cat > "$NGINX_CONF" <<EOF
# Upstream configuration
upstream catchy_backend {
    server 127.0.0.1:${APP_PORT};
    keepalive 64;
}

# HTTP server (SSL fallback)
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    # Let's Encrypt challenge (for future SSL setup)
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Logging
    access_log /var/log/nginx/${DOMAIN}-access.log;
    error_log /var/log/nginx/${DOMAIN}-error.log;

    # Client settings
    client_max_body_size 10M;
    client_body_timeout 60s;
    client_header_timeout 60s;

    # Proxy settings
    location / {
        proxy_pass http://catchy_backend;
        proxy_http_version 1.1;
        
        # Headers
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        
        # Connection settings
        proxy_set_header Connection "";
        proxy_redirect off;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffering
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://catchy_backend/health;
        access_log off;
    }
}
EOF
        echo "✅ Recreated HTTP-only configuration as fallback"
        
        # Test again
        if nginx -t 2>&1; then
            echo "✅ Nginx configuration is now valid (HTTP-only fallback)"
        else
            echo "❌ Nginx configuration still invalid after fix attempt"
            exit 1
        fi
    else
        # Not an SSL error, just fail
        exit 1
    fi
fi

# Reload nginx
echo "🔄 Reloading Nginx..."
if systemctl reload nginx; then
    echo "✅ Nginx reloaded successfully"
else
    echo "⚠️  Reload failed, trying restart..."
    systemctl restart nginx
    echo "✅ Nginx restarted"
fi

echo "=========================================="
echo "✅ Nginx setup completed successfully"
echo "=========================================="

