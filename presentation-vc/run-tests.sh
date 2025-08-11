#!/usr/bin/env bash
set -euo pipefail

# quick script to install dependencies and run hardhat tests
echo "==> Installing dependencies (dev)..."
# install only dev deps from package.json
npm ci || npm install

echo "==> Compiling contracts..."
npx hardhat compile

echo "==> Running tests..."
npx hardhat test --show-stack-traces || {
  echo "Tests failed. See output above."
  exit 1
}

echo "==> Tests completed successfully."
