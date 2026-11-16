#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
scratch=$(mktemp -d "${TMPDIR:-/tmp}/training-habitat-check.XXXXXX")
trap 'rm -rf "$scratch"' EXIT HUP INT TERM

swiftc -swift-version 6 -module-cache-path "$scratch/modules" -o "$scratch/checks" \
  "$root"/TrainingCore/*.swift "$root"/Tests/TrainingStateTests.swift
"$scratch/checks"

plutil -convert xml1 -o "$scratch/project.xml" "$root/TrainingHabitat.xcodeproj/project.pbxproj"
python3 - "$root" "$scratch/project.xml" <<'PY'
from pathlib import Path
import base64
import json
import plistlib
import sys
import xml.etree.ElementTree as ET

root, project = map(Path, sys.argv[1:])
project = plistlib.loads(project.read_bytes())
objects = project['objects']
targets = {objects[key]['name']: (key, objects[key]) for key in objects[project['rootObject']]['targets']}
assert set(targets) == {'TrainingHabitat', 'HealthCheck'}
for name, (key, target) in targets.items():
    configs = objects[target['buildConfigurationList']]['buildConfigurations']
    for config in configs:
        settings = objects[config]['buildSettings']
        assert settings['CODE_SIGN_STYLE'] == 'Automatic'
        assert 'DEVELOPMENT_TEAM' not in settings
        assert (settings.get('CODE_SIGN_ENTITLEMENTS') == 'HealthCheck/HealthCheck.entitlements') == (name == 'HealthCheck')
        assert ('INFOPLIST_KEY_NSHealthShareUsageDescription' in settings) == (name == 'HealthCheck')
    entries = {}
    for phase in target['buildPhases']:
        build_phase = objects[phase]
        entries[build_phase['isa']] = {objects[objects[key]['fileRef']]['path'] for key in build_phase['files']}
    expected_sources = list((root / name).glob('*.swift'))
    if name == 'TrainingHabitat':
        expected_sources += list((root / 'TrainingCore').glob('*.swift'))
        assert entries['PBXResourcesBuildPhase'] == {'PixelArtwork.json', 'Assets.xcassets'}
    assert entries['PBXSourcesBuildPhase'] == {source.name for source in expected_sources}
    scheme = ET.parse(root / 'TrainingHabitat.xcodeproj/xcshareddata/xcschemes' / f'{name}.xcscheme')
    assert all(buildable.get('BlueprintIdentifier') == key for buildable in scheme.iter('BuildableReference'))
entitlements = plistlib.loads((root / 'HealthCheck/HealthCheck.entitlements').read_bytes())
assert entitlements == {'com.apple.developer.healthkit': True}
art = json.loads((root / 'TrainingHabitat/PixelArtwork.json').read_text())
assert art['source'] == 'prototype-v1.2'
assert set(art['habitats']) == {'garden', 'gym', 'living', 'bedroom', 'running-track'}
assert len(art['pets']) == 10
for pet in art['pets'].values():
    assert len(pet['resting']) == len(pet['reactions']) == len(pet['walk']) == 3
    assert len(pet['growth']) == 2 and all(len(frames) == 8 for frames in pet['growth'])
    assert len(set(pet['resting'])) == 3
    for image in pet['resting']:
        assert base64.b64decode(image).startswith(b'\x89PNG\r\n\x1a\n')
print('PASS  project target membership, isolated HealthKit signing and prototype artwork')
PY
