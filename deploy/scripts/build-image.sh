#!/bin/bash
set -e

# Build the Docker image from the project root
# Run this from the deploy/ directory or project root

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
IMAGE_NAME="${1:-strategypmo}"
IMAGE_TAG="${2:-latest}"

echo "==> Building Docker image: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "    Project root: $PROJECT_ROOT"

docker build \
  -t "${IMAGE_NAME}:${IMAGE_TAG}" \
  -f "$PROJECT_ROOT/Dockerfile" \
  "$PROJECT_ROOT"

echo ""
echo "==> Build complete!"
echo "    Image: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "    Size:  $(docker image inspect ${IMAGE_NAME}:${IMAGE_TAG} --format='{{.Size}}' | numfmt --to=iec 2>/dev/null || docker image inspect ${IMAGE_NAME}:${IMAGE_TAG} --format='{{.Size}}')"
echo ""
echo "==> To save as portable file:"
echo "    docker save ${IMAGE_NAME}:${IMAGE_TAG} | gzip > strategypmo-${IMAGE_TAG}.tar.gz"
echo ""
echo "==> To load on target server:"
echo "    docker load < strategypmo-${IMAGE_TAG}.tar.gz"
