#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

package_dir=$(mktemp -d)
trap 'rm -rf "$package_dir"' EXIT

install -m 755 build/bootstrap "$package_dir/bootstrap"
cp -R src/web/dist "$package_dir/web"
archive="$PWD/build/lambda.zip"
(cd "$package_dir" && zip -qr "$package_dir/lambda.zip" bootstrap web)
mv "$package_dir/lambda.zip" "$archive"
