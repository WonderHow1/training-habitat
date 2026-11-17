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
assert set(targets) == {'TrainingHabitat', 'HealthCheck', 'TimerActivity'}
for name, (key, target) in targets.items():
    configs = objects[target['buildConfigurationList']]['buildConfigurations']
    for config in configs:
        settings = objects[config]['buildSettings']
        assert settings['CODE_SIGN_STYLE'] == 'Automatic'
        assert 'DEVELOPMENT_TEAM' not in settings
        assert (settings.get('CODE_SIGN_ENTITLEMENTS') == 'HealthCheck/HealthCheck.entitlements') == (name == 'HealthCheck')
        assert ('INFOPLIST_KEY_NSHealthShareUsageDescription' in settings) == (name == 'HealthCheck')
        assert (settings.get('INFOPLIST_KEY_NSSupportsLiveActivities') == 'YES') == (name == 'TrainingHabitat')
    entries = {}
    for phase in target['buildPhases']:
        build_phase = objects[phase]
        entries[build_phase['isa']] = {objects[objects[key]['fileRef']]['path'] for key in build_phase['files']}
    expected_sources = list((root / name).glob('*.swift'))
    if name == 'TrainingHabitat':
        expected_sources += list((root / 'TrainingCore').glob('*.swift'))
        expected_sources.append(root / 'TimerActivity/TimerActivity.swift')
        assert entries['PBXResourcesBuildPhase'] == {'PixelArtwork.json', 'Assets.xcassets'}
        assert entries['PBXCopyFilesBuildPhase'] == {'TimerActivity.appex'}
        assert len(target['dependencies']) == 1
        assert objects[target['dependencies'][0]]['target'] == targets['TimerActivity'][0]
    assert entries['PBXSourcesBuildPhase'] == {source.name for source in expected_sources}
    if name != 'TimerActivity':
        scheme = ET.parse(root / 'TrainingHabitat.xcodeproj/xcshareddata/xcschemes' / f'{name}.xcscheme')
        assert all(buildable.get('BlueprintIdentifier') == key for buildable in scheme.iter('BuildableReference'))
widget_info = plistlib.loads((root / 'TimerActivity/Info.plist').read_bytes())
assert widget_info['NSExtension']['NSExtensionPointIdentifier'] == 'com.apple.widgetkit-extension'
timer_widget = (root / 'TimerActivity/TimerWidget.swift').read_text()
assert 'DynamicIslandExpandedRegion(.bottom)' in timer_widget
assert '累计满 1 分钟才能记录' not in timer_widget
editor_source = (root / 'TrainingHabitat/Editors.swift').read_text()
assert '累计满 1 分钟才能记录' in editor_source and '.disabled(elapsed < 60)' in editor_source
entitlements = plistlib.loads((root / 'HealthCheck/HealthCheck.entitlements').read_bytes())
assert entitlements == {'com.apple.developer.healthkit': True}
routine_views = (root / 'TrainingHabitat/RoutineViews.swift').read_text()
habitat_zoom = routine_views.split('private struct TodayHabitatZoom', 1)[1].split('struct PlanLabel', 1)[0]
assert 'view.cornerConfiguration = .corners(radius: .containerConcentric())' in routine_views
assert routine_views.count('effectiveRadius(corner:') == 4
assert 'HabitatDisplayCorners { screenCorners = $0 }' in routine_views
assert '.clipShape(cornerShape(at: fraction))' in habitat_zoom
for corner in ('topLeading', 'topTrailing', 'bottomLeading', 'bottomTrailing'):
    assert f'geometry.cornerRadius(toward: screenCorners.{corner}, at: fraction)' in habitat_zoom
print('PASS  Today habitat zoom interpolates each card corner to the display corner')
today_header = routine_views.split('private var header: some View {', 1)[1].split('private func habitatGesture', 1)[0]
settings_button = today_header.split('Button { openFromToday(.settings) }', 1)[1]
assert 'Image(systemName: "gearshape")' in settings_button
assert '.accessibilityLabel("设置")' in settings_button
print('PASS  Today settings gear and accessibility label')
plan_summary = routine_views.split('private var summary: some View {', 1)[1].split('struct ReviewView', 1)[0]
assert 'Button { showPicker = true }' in plan_summary
assert '.multilineTextAlignment(.center)' in plan_summary
assert '.number.grouping(.never)' in plan_summary and 'chevron.down' not in plan_summary
assert '.background(isSelected ? Color.primary.opacity(0.08) : .clear' in plan_summary
assert 'let isSelected = !showWeek && TrainingCalendar.day(selected) == day' in plan_summary
assert '.underline(' not in plan_summary
print('PASS  Plan calendar title and selected date treatment')
title_view = routine_views.split('private struct TrainingPageTitle:', 1)[1].split('struct PlansView:', 1)[0]
assert 'PetPortrait(species: pet.species, stage: model.stage(of: pet)' in title_view
assert 'if let pet = model.state.displayedPet' in title_view and 'interactive: true' in title_view
assert '.frame(maxWidth: .infinity, alignment: .leading)' in title_view
assert '@ScaledMetric(relativeTo: .largeTitle)' in title_view and 'size: petHeight' in title_view
assert 'walksHorizontally: true' in title_view
portrait_view = (root / 'TrainingHabitat/PixelArtwork.swift').read_text()
assert 'rightAlignedStart = lane.size.width - slot - distance' in portrait_view
assert '.position(x: rightAlignedStart + slot / 2 + sample.fraction * distance, y: size / 2)' in portrait_view
assert 'Double.random(in: 0.8...2.7, using:' in portrait_view
assert 'stroll.stop(at: .now)' in portrait_view and 'playback = .reaction(UUID())' in portrait_view
assert 'TitlePetTapTarget(label:' in portrait_view and 'tap.cancelsTouchesInView = false' in portrait_view
assert 'visibleBounds(for: resting, image: image)' in portrait_view
assert '.frame(width: canvas.width * pixelSize, height: canvas.height * pixelSize)' in portrait_view
for title in ('训练计划', '训练回顾'):
    toolbar = routine_views.split(f'.navigationTitle("{title}")', 1)[1].split('.primaryAction', 1)[0]
    assert 'ToolbarItem(placement: .largeTitle)' in toolbar
    assert f'TrainingPageTitle(title: "{title}", model: model)' in toolbar
print('PASS  Plan and Review large titles show the current pet and growth stage')
plan_editor = (root / 'TrainingHabitat/Editors.swift').read_text().split('struct WorkoutEditor', 1)[0]
assert '_minutes = State(initialValue: plan?.minutes)' in plan_editor
assert 'HourMinuteWheel(hours: $hours, minutes: $minutes)' in plan_editor and 'plan?.minutes ??' not in plan_editor
assert '.disabled(hours == 0 && minutes == 0)' in plan_editor
assert 'AddPlanButton { openFromToday(.addPlan(model.today)) }' in routine_views
assert 'AddPlanButton { open(.addPlan(' in routine_views
print('PASS  Empty new plan duration, wheel confirmation and shared add plan button')
row_actions = routine_views.split('func trainingRowActions(', 1)[1].split('private struct AddPlanButton', 1)[0]
assert 'swipeActions(' in row_actions and '.contextMenu {' in row_actions
assert row_actions.count('action: edit') == row_actions.count('action: delete') == 2
assert routine_views.count('.planRowActions(') == 3
assert '.trainingRowActions(edit: { open(.manual(nil, workout)) })' in routine_views
print('PASS  Today, Plan and Review share long-press and swipe actions')
today_row = routine_views.split('private func todayRow(', 1)[1].split('private func recordControl(', 1)[0]
assert today_row.index('.contentShape(.contextMenuPreview,') < today_row.index('.planRowActions(')
assert 'previewWidth: trainingRowWidth' in today_row
preview_actions = routine_views.split('func planRowActions(', 1)[1].split('func trainingRowActions(', 1)[0]
assert '} preview: {' in preview_actions and 'PlanRowSummary(plan: plan, status:' in preview_actions
plan_rows = routine_views.split('struct PlansView:', 1)[1].split('struct ReviewView:', 1)[0]
assert 'PlanRowSummary(plan: plan, status:' in plan_rows
record_control = routine_views.split('private func recordControl(', 1)[1].split('private func setExpanded(', 1)[0]
assert record_control.count('.transition(transition)') == 2
assert 'setRecordOptions(plan.id)' in record_control and 'withAnimation(reduceMotion ? nil' in record_control
assert 'self.recordOptions == recordOptions, !recordOptionsFrame.contains(tap.location)' in routine_views
assert 'openFromToday(.manual(plan, nil))' in record_control
print('PASS  Today and Plan share the same preview summary, and record choices animate')
workout_editor = (root / 'TrainingHabitat/Editors.swift').read_text().split('struct WorkoutEditor', 1)[1].split('struct PlanDetails', 1)[0]
assert 'case start = "开始时间"' in workout_editor and 'case end = "结束时间"' in workout_editor
assert 'HourMinuteWheel(hours: $hours, minutes: $minutes)' in workout_editor and '.pickerStyle(.wheel)' in workout_editor
assert '实际时长（分钟）' not in workout_editor and 'timing.entry(' in workout_editor
print('PASS  Workout editor uses start and end wheel pickers')
onboarding = (root / 'TrainingHabitat/Onboarding.swift').read_text()
assert 'SpeciesPicker(selection: $species, isOnboarding: true)' in onboarding
assert '.offset(y: -portraitLift)' in onboarding and 'portraitLift: 0' in onboarding
assert '.padding(.bottom, 10)\n                SpeciesPicker(' in onboarding
picker = onboarding.split('struct SpeciesPicker:', 1)[1]
assert 'image.cropping(to: artwork.visibleBounds(for: sprite, image: image))' in picker
assert '.frame(width: 38, height: 38)' in picker and 'isOnboarding ? Font.subheadline : .caption2' in picker
assert '.underline(!isOnboarding && isSelected)' in picker
assert '.background(isOnboarding && isSelected ? Color.black.opacity(0.13) : .clear,' in picker
assert picker.index('.background(isOnboarding && isSelected') < picker.index('.frame(maxWidth: .infinity, minHeight: 49)')
assert '.accessibilityAddTraits(isSelected ? .isSelected : [])' in picker
print('PASS  Onboarding uses larger pet choices and a filled selected tile')
habitat_step = onboarding.split('private func habitatStep(', 1)[1].split('private var title:', 1)[0]
assert 'VStack(spacing: 6) {\n                Text("栖息地背景")' in habitat_step
assert 'Picker("栖息地背景", selection: $habitat)' in habitat_step
assert '.frame(maxWidth: .infinity, alignment: .center)\n            .padding(.bottom, 32)\n            controls' in habitat_step
print('PASS  Onboarding habitat selector is centered above the footer controls')
assert 'onInteraction: dismissPetHint' in onboarding and 'onInteraction?()' in portrait_view
assert 'Text("点我试试！")' in onboarding and 'guard step == .pet, !didInteractWithPet else' in onboarding
assert 'didInteractWithPet = true' in onboarding and 'showsPetHint = false' in onboarding
assert 'guard !reduceMotion else { return .identity }' in onboarding
assert '.offset(x: goingBack ? -56 : 56, y: 10)' in onboarding and '.transition(pageTransition)' in onboarding
assert 'habitatBackground\n                        .transition(.opacity)' in onboarding
assert '.snappy(duration: 0.44, extraBounce: 0.12)' in onboarding
print('PASS  Onboarding pet tap hint, directional spring transition and reduced motion')
assert 'case goal, pet, growth, hearts, habitat' in onboarding
growth_demo = onboarding.split('private struct OnboardingGrowthDemo:', 1)[1].split('private struct OnboardingHeartsDemo:', 1)[0]
assert 'PetPortrait(species: species, stage: PetExperience.stage(for: level)' in growth_demo
assert 'ProgressView(value: Double(points), total: Double(PetExperience.pointsPerLevel))' in growth_demo
assert 'speciesIndex = (speciesIndex + 1) % examples.count' in growth_demo
assert growth_demo.index('ProgressView(') < growth_demo.index('每记录满 1 分钟训练')
hearts_demo = onboarding.split('private struct OnboardingHeartsDemo:', 1)[1].split('struct SpeciesPicker:', 1)[0]
assert '当天训练时长没达到每日目标，就会失去一颗心' in hearts_demo
assert 'stride(from: Pet.maximumHearts - 1, through: 0, by: -1)' in hearts_demo
assert '示例 · 未达标第' in hearts_demo and '宠物已离世' in hearts_demo
assert hearts_demo.index('PetPortrait(') < hearts_demo.index('PetHeartRow(') < hearts_demo.index('宠物领养时有')
for demo in (growth_demo, hearts_demo):
    assert 'guard !reduceMotion, scenePhase == .active else' in demo
print('PASS  Onboarding explains live XP thresholds and animates example growth and heart loss')
pet_views = (root / 'TrainingHabitat/PetViews.swift').read_text()
assert 'PetHeartRow(remaining: hp)' in pet_views
assert pet_views.count('PixelHeart(isFilled: false)') == 2
assert 'systemName: "heart' not in pet_views and 'systemImage: "heart' not in pet_views
assert 'PetHeartRow(remaining: hearts, width: 22' in hearts_demo
assert 'PixelHeartShape()' in portrait_view and 'FillStyle(antialiased: false)' in portrait_view
pet_hint = onboarding.split('private var petHint:', 1)[1].split('private func dismissPetHint', 1)[0]
assert 'PixelSpeechBubble()' in pet_hint and 'FillStyle(antialiased: false)' in pet_hint
assert '.allowsHitTesting(false)' in pet_hint
print('PASS  Onboarding and pet screens share pixel hearts, and the hint uses a pixel bubble')
art = json.loads((root / 'TrainingHabitat/PixelArtwork.json').read_text())
assert art['source'] == 'prototype-v1.2'
assert set(art['habitats']) == {'garden', 'gym', 'living', 'bedroom', 'running-track'}
assert len(art['pets']) == 10
for pet in art['pets'].values():
    assert len(pet['resting']) == len(pet['reactions']) == len(pet['walk']) == 3
    assert len(pet['growth']) == 2 and all(len(frames) == 8 for frames in pet['growth'])
    assert len(set(pet['resting'])) == 3
    frames = pet['resting'] + [image for sequence in pet['walk'] + pet['growth'] for image in sequence]
    frames += [frame['png'] for sequence in pet['reactions'] for frame in sequence]
    pngs = [base64.b64decode(frame) for frame in frames]
    assert all(png.startswith(b'\x89PNG\r\n\x1a\n') for png in pngs)
    assert len({png[16:24] for png in pngs}) == 1
print('PASS  project target membership, isolated HealthKit signing and prototype artwork')
PY
