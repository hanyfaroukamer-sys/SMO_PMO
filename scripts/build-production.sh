#!/bin/bash
set -e

pnpm run typecheck:libs
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/strategy-pmo run build
