#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

package_dir=$(mktemp -d)
trap 'rm -rf "$package_dir"' EXIT

install -m 755 build/api "$package_dir/bootstrap"
cp -R src/web/dist "$package_dir/web"
archive="$PWD/build/api.zip"
(cd "$package_dir" && zip -qr "$package_dir/api.zip" bootstrap web)
mv "$package_dir/api.zip" "$archive"

mkdir "$package_dir/worker"
install -m 755 build/worker "$package_dir/worker/bootstrap"
(cd "$package_dir/worker" && zip -q "$package_dir/worker.zip" bootstrap)
mv "$package_dir/worker.zip" build/worker.zip
