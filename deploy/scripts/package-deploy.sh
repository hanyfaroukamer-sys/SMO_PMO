#!/bin/bash
set -e

# Creates a self-contained deployment package for the client.
# This bundles the pre-built Docker image + all deployment files.
#
# Usage: ./scripts/package-deploy.sh [image-tag]
# Output: strategypmo-deploy-YYYYMMDD.tar.gz

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"

IMAGE_TAG="${1:-latest}"
DATE=$(date +%Y%m%d)
PACKAGE_NAME="strategypmo-deploy-${DATE}"
STAGING_DIR="/tmp/${PACKAGE_NAME}"

echo "==> Creating deployment package: ${PACKAGE_NAME}.tar.gz"

# Clean staging
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"

# Step 1: Build the Docker image
echo "==> Building Docker image..."
docker build -t "strategypmo:${IMAGE_TAG}" -f "$PROJECT_ROOT/Dockerfile" "$PROJECT_ROOT"

# Step 2: Export the image
echo "==> Saving Docker image (this may take a minute)..."
docker save "strategypmo:${IMAGE_TAG}" | gzip > "$STAGING_DIR/strategypmo-image.tar.gz"

# Step 3: Copy deployment files
echo "==> Copying deployment files..."
cp "$DEPLOY_DIR/docker-compose.yml" "$STAGING_DIR/"
cp "$DEPLOY_DIR/docker-compose.external-db.yml" "$STAGING_DIR/"
cp "$DEPLOY_DIR/README.md" "$STAGING_DIR/"
cp "$PROJECT_ROOT/.env.example" "$STAGING_DIR/"
cp -r "$DEPLOY_DIR/nginx" "$STAGING_DIR/"
mkdir -p "$STAGING_DIR/scripts"
cp "$DEPLOY_DIR/scripts/backup.sh" "$STAGING_DIR/scripts/"
cp "$DEPLOY_DIR/scripts/restore.sh" "$STAGING_DIR/scripts/"
chmod +x "$STAGING_DIR/scripts/"*.sh

# Step 4: Create install script
cat > "$STAGING_DIR/install.sh" << 'INSTALL_EOF'
#!/bin/bash
set -e

echo "======================================"
echo "  StrategyPMO Installation"
echo "======================================"
echo ""

# Check Docker
if ! command -v docker &>/dev/null; then
  echo "ERROR: Docker is not installed. Please install Docker 24.0+ first."
  exit 1
fi

if ! docker compose version &>/dev/null; then
  echo "ERROR: Docker Compose v2 is not available. Please install Docker Compose."
  exit 1
fi

echo "==> Loading Docker image..."
docker load < strategypmo-image.tar.gz

echo "==> Setting up environment..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "    Created .env from template. EDIT THIS FILE before starting."
  echo ""
  echo "    At minimum, change these values in .env:"
  echo "      DB_PASSWORD    — Set a strong database password"
  echo "      ALLOWED_ORIGINS — Set to your domain (e.g., https://pmo.example.gov.sa)"
  echo ""
  echo "    For authentication, configure:"
  echo "      ISSUER_URL     — Your OIDC provider URL"
  echo "      OIDC_CLIENT_ID — Your OIDC client ID"
  echo ""
else
  echo "    .env already exists — keeping existing configuration."
fi

# Set image name in env
if ! grep -q "APP_IMAGE" .env 2>/dev/null; then
  echo "" >> .env
  echo "# Docker image (loaded from package)" >> .env
  echo "APP_IMAGE=strategypmo:latest" >> .env
fi

echo ""
echo "==> Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your configuration"
echo "  2. Run: docker compose up -d"
echo "  3. Open: http://localhost/strategy-pmo/"
echo ""
INSTALL_EOF
chmod +x "$STAGING_DIR/install.sh"

# Step 5: Package everything
echo "==> Creating final archive..."
cd /tmp
tar -czf "${PACKAGE_NAME}.tar.gz" "$PACKAGE_NAME"
mv "${PACKAGE_NAME}.tar.gz" "$PROJECT_ROOT/deploy/"

# Clean staging
rm -rf "$STAGING_DIR"

FINAL_FILE="$PROJECT_ROOT/deploy/${PACKAGE_NAME}.tar.gz"
SIZE=$(du -h "$FINAL_FILE" | cut -f1)

echo ""
echo "======================================"
echo "  Deployment package ready!"
echo "======================================"
echo ""
echo "  File: deploy/${PACKAGE_NAME}.tar.gz"
echo "  Size: $SIZE"
echo ""
echo "  Transfer to client server, then run:"
echo "    tar -xzf ${PACKAGE_NAME}.tar.gz"
echo "    cd ${PACKAGE_NAME}"
echo "    ./install.sh"
echo "    # Edit .env"
echo "    docker compose up -d"
echo ""
