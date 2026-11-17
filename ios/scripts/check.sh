#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
scratch=$(mktemp -d "${TMPDIR:-/tmp}/training-habitat-check.XXXXXX")
trap 'rm -rf "$scratch"' EXIT HUP INT TERM

swiftc -swift-version 6 -module-cache-path "$scratch/modules" -o "$scratch/checks" \
  "$root"/TrainingCore/*.swift "$root"/TrainingHabitat/HabitatZoom.swift "$root"/Tests/TrainingStateTests.swift
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
routine_views = (root / 'TrainingHabitat/RoutineViews.swift').read_text()
today_header = routine_views.split('private var header: some View {', 1)[1].split('private func habitatGesture', 1)[0]
settings_button = today_header.split('Button { open(.settings) }', 1)[1]
assert 'Image(systemName: "gearshape")' in settings_button
assert '.accessibilityLabel("设置")' in settings_button
print('PASS  Today settings gear and accessibility label')
plan_summary = routine_views.split('private var summary: some View {', 1)[1].split('struct ReviewView', 1)[0]
assert 'Button { showPicker = true }' in plan_summary
assert '.multilineTextAlignment(.center)' in plan_summary
assert '.number.grouping(.never)' in plan_summary and 'chevron.down' not in plan_summary
assert '.background(isSelected ? Color.primary.opacity(0.08) : .clear' in plan_summary
assert '.underline(' not in plan_summary
print('PASS  Plan calendar title and selected date treatment')
plan_editor = (root / 'TrainingHabitat/Editors.swift').read_text().split('struct WorkoutEditor', 1)[0]
assert '_minutes = State(initialValue: plan?.minutes)' in plan_editor
assert 'HourMinuteWheel(hours: $hours, minutes: $minutes)' in plan_editor and 'plan?.minutes ??' not in plan_editor
assert '.disabled(hours == 0 && minutes == 0)' in plan_editor
assert routine_views.count('AddPlanButton { open(.addPlan(') == 2
print('PASS  Empty new plan duration, wheel confirmation and shared add plan button')
workout_editor = (root / 'TrainingHabitat/Editors.swift').read_text().split('struct WorkoutEditor', 1)[1].split('struct PlanDetails', 1)[0]
assert 'case start = "开始时间"' in workout_editor and 'case end = "结束时间"' in workout_editor
assert 'HourMinuteWheel(hours: $hours, minutes: $minutes)' in workout_editor and '.pickerStyle(.wheel)' in workout_editor
assert '实际时长（分钟）' not in workout_editor and 'timing.entry(' in workout_editor
print('PASS  Workout editor uses start and end wheel pickers')
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
