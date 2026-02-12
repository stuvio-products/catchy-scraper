#!/bin/bash
# =============================================================================
# Nginx setup script for api.catchy.fashion
# Configures reverse proxy with SSL, upstream, and security headers
# =============================================================================

set -e

DOMAIN="api.catchy.fashion"

# ─── Cleanup old backups (keep latest 2) ─────────────────────────────────────
cleanup_old_backups() {
    local backup_dir="/etc/nginx/sites-available"
    local base_config="${backup_dir}/${DOMAIN}"

    echo "🧹 Cleaning up old nginx backups..."
    local old_backups=$(ls -t "${base_config}.backup."* 2>/dev/null | tail -n +3)
    if [ -n "$old_backups" ]; then
        echo "🗑️  Removing $(echo "$old_backups" | wc -l) old backup(s)..."
        echo "$old_backups" | xargs rm -f
        echo "✅ Old backups cleaned up"
    else
        echo "✅ No old backups to clean up"
    fi
}

NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"
UPSTREAM_CONF="/etc/nginx/conf.d/catchy-upstream.conf"
SSL_CERT_PATH="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
SSL_KEY_PATH="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"

echo "=========================================="
echo "🔧 Setting up Nginx for ${DOMAIN}"
echo "=========================================="

# ─── Check SSL certificates ─────────────────────────────────────────────────
SSL_AVAILABLE=false
if [ -f "$SSL_CERT_PATH" ] && [ -f "$SSL_KEY_PATH" ]; then
    SSL_AVAILABLE=true
    echo "✅ SSL certificates found"
else
    echo "⚠️  SSL certificates not found at:"
    echo "   Certificate: $SSL_CERT_PATH"
    echo "   Key: $SSL_KEY_PATH"
    echo "   Will create HTTP-only configuration (SSL can be added later with certbot)"
fi

# ─── Install Nginx if needed ────────────────────────────────────────────────
if ! command -v nginx &> /dev/null; then
    echo "📦 Installing Nginx..."
    apt-get update
    apt-get install -y nginx
    echo "✅ Nginx installed"
else
    echo "✅ Nginx is already installed"
fi

# ─── Create upstream config (managed by deploy.sh for blue-green) ────────────
# The upstream is managed separately so deploy.sh can switch ports atomically
# Ports: blue=3002, green=3003 (avoids conflicts with jamjam on 3001)
if [ ! -f "$UPSTREAM_CONF" ]; then
    echo "📝 Creating default upstream configuration..."
    cat > "$UPSTREAM_CONF" <<EOF
# Auto-managed by deploy.sh for zero-downtime blue-green deployment
# Do NOT edit manually — deploy.sh will overwrite this file
# Port allocation: blue=3002, green=3003
upstream catchy_backend {
    server 127.0.0.1:3002;
    keepalive 64;
}
EOF
    echo "✅ Default upstream created (port 3002)"
fi

# ─── Check if config needs updating ─────────────────────────────────────────
CONFIG_EXISTS=false
if [ -f "$NGINX_CONF" ]; then
    if grep -q "server_name ${DOMAIN}" "$NGINX_CONF" && \
       grep -q "proxy_pass http://catchy_backend" "$NGINX_CONF"; then
        # Check SSL status matches
        if grep -q "ssl_certificate" "$NGINX_CONF"; then
            if [ "$SSL_AVAILABLE" = true ]; then
                CONFIG_EXISTS=true
                echo "✅ Nginx configuration is up-to-date (with SSL)"
            else
                echo "⚠️  Config uses SSL but certificates are missing — recreating..."
                cp "$NGINX_CONF" "${NGINX_CONF}.backup.$(date +%Y%m%d_%H%M%S)"
                cleanup_old_backups
            fi
        else
            if [ "$SSL_AVAILABLE" = true ]; then
                echo "⚠️  SSL certificates available but config is HTTP-only — upgrading..."
                cp "$NGINX_CONF" "${NGINX_CONF}.backup.$(date +%Y%m%d_%H%M%S)"
                cleanup_old_backups
            else
                CONFIG_EXISTS=true
                echo "✅ Nginx configuration is up-to-date (HTTP-only)"
            fi
        fi
    else
        echo "⚠️  Nginx config doesn't match — recreating..."
        cp "$NGINX_CONF" "${NGINX_CONF}.backup.$(date +%Y%m%d_%H%M%S)"
        cleanup_old_backups
    fi
fi

# ─── Create Nginx server configuration ──────────────────────────────────────
if [ "$CONFIG_EXISTS" = false ]; then
    echo "📝 Creating Nginx server configuration..."

    if [ "$SSL_AVAILABLE" = true ]; then
        cat > "$NGINX_CONF" <<EOF
# ─── HTTP → HTTPS redirect ──────────────────────────────────────────────────
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# ─── HTTPS server ───────────────────────────────────────────────────────────
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN} www.${DOMAIN};

    # SSL
    ssl_certificate ${SSL_CERT_PATH};
    ssl_certificate_key ${SSL_KEY_PATH};
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

    # Client limits
    client_max_body_size 10M;
    client_body_timeout 60s;
    client_header_timeout 60s;

    # Proxy to upstream (managed in /etc/nginx/conf.d/catchy-upstream.conf)
    location / {
        proxy_pass http://catchy_backend;
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header Connection "";
        proxy_redirect off;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;

        # Retry on upstream errors for zero-downtime during deploys
        proxy_next_upstream error timeout http_502 http_503;
        proxy_next_upstream_tries 2;
        proxy_next_upstream_timeout 10s;
    }

    location /health {
        proxy_pass http://catchy_backend/health;
        access_log off;
    }
}
EOF
        echo "✅ Nginx configuration created with SSL"
    else
        cat > "$NGINX_CONF" <<EOF
# ─── HTTP server (SSL can be added later with certbot) ──────────────────────
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Logging
    access_log /var/log/nginx/${DOMAIN}-access.log;
    error_log /var/log/nginx/${DOMAIN}-error.log;

    # Client limits
    client_max_body_size 10M;
    client_body_timeout 60s;
    client_header_timeout 60s;

    # Proxy to upstream (managed in /etc/nginx/conf.d/catchy-upstream.conf)
    location / {
        proxy_pass http://catchy_backend;
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header Connection "";
        proxy_redirect off;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;

        proxy_next_upstream error timeout http_502 http_503;
        proxy_next_upstream_tries 2;
        proxy_next_upstream_timeout 10s;
    }

    location /health {
        proxy_pass http://catchy_backend/health;
        access_log off;
    }
}
EOF
        echo "✅ Nginx configuration created (HTTP only)"
        echo "   To enable SSL: certbot --nginx -d ${DOMAIN}"
    fi
fi

# ─── Enable site ─────────────────────────────────────────────────────────────
if [ ! -L "$NGINX_ENABLED" ]; then
    echo "🔗 Enabling Nginx site..."
    ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
    echo "✅ Site enabled"
fi

# ─── Test and reload ─────────────────────────────────────────────────────────
echo "🧪 Testing Nginx configuration..."
if nginx -t 2>&1; then
    echo "✅ Nginx configuration is valid"
else
    NGINX_TEST_ERROR=$(nginx -t 2>&1 || true)
    echo "❌ Nginx configuration test failed!"
    echo "$NGINX_TEST_ERROR"

    # If SSL error, fallback to HTTP-only
    if echo "$NGINX_TEST_ERROR" | grep -qE "cannot load certificate|SSL_CTX_use_PrivateKey_file|BIO_new_file|no such file"; then
        echo ""
        echo "⚠️  SSL certificate error — falling back to HTTP-only..."

        cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    access_log /var/log/nginx/${DOMAIN}-access.log;
    error_log /var/log/nginx/${DOMAIN}-error.log;

    client_max_body_size 10M;

    location / {
        proxy_pass http://catchy_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_redirect off;
        proxy_next_upstream error timeout http_502 http_503;
        proxy_next_upstream_tries 2;
    }

    location /health {
        proxy_pass http://catchy_backend/health;
        access_log off;
    }
}
EOF
        echo "✅ HTTP-only fallback created"
        if ! nginx -t 2>&1; then
            echo "❌ Nginx still invalid after fallback"
            exit 1
        fi
    else
        exit 1
    fi
fi

echo "🔄 Reloading Nginx..."
if systemctl reload nginx; then
    echo "✅ Nginx reloaded"
else
    echo "⚠️  Reload failed, restarting..."
    systemctl restart nginx
    echo "✅ Nginx restarted"
fi

echo "=========================================="
echo "✅ Nginx setup completed for ${DOMAIN}"
echo "=========================================="
