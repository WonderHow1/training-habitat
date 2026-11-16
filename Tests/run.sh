#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
scratch=$(mktemp -d "${TMPDIR:-/tmp}/grove-tests.XXXXXXXX")
trap 'rm -rf "$scratch"' EXIT HUP INT TERM

swiftc -module-cache-path "$scratch/cache" "$root/GroveFit/Training.swift" \
    "$root/Tests/TrainingRules.swift" -o "$scratch/training-rules"
"$scratch/training-rules"
