#!/bin/sh
set -e
here=$(cd "$(dirname "$0")" && pwd)
root=$(git -C "$here" rev-parse --show-toplevel)
cd "$root"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p .nwave/des ".nwave/restore-backup/$stamp"
if [ -f .nwave/des/handover.json ]; then
  cp .nwave/des/handover.json ".nwave/restore-backup/$stamp/handover.json"
fi
git for-each-ref --format='%(objectname) %(refname)' refs/nwave | while read -r sha ref; do
  git update-ref "refs/nwave-backup/$stamp/${ref#refs/nwave/}" "$sha"
  git update-ref -d "$ref"
done
rm -rf .nwave/des/candidates
rm -f .nwave/des/handover.json
if [ -f "$here/handover.json" ]; then
  cp "$here/handover.json" .nwave/des/handover.json
fi
if [ -d "$here/des" ]; then
  cp -R "$here/des/." .nwave/des/
fi
if [ -f "$here/refs.txt" ]; then
  git unpack-objects -q < "$here/turns.pack"
  while read -r sha ref; do
    git update-ref "$ref" "$sha"
  done < "$here/refs.txt"
fi
echo "nWave state restored for this snapshot. Your earlier DES records are parked under refs/nwave-backup/$stamp and .nwave/restore-backup/$stamp."
echo "Next: des state --repo-root \"\$(pwd -P)\""
