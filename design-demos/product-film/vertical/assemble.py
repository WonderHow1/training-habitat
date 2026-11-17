"""Frame native screen recordings, add touch cues, and assemble a voice-free portrait MP4."""

import argparse
import json
import math
from pathlib import Path
import subprocess
import wave

import numpy as np
from PIL import ImageDraw

import title_cards as titles
from onboarding_cards import CUES as ONBOARDING_CUES, DURATION as ONBOARDING_DURATION
W, H, FPS = titles.WIDTH, titles.HEIGHT, titles.FPS
SCREEN_WIDTH, SCREEN_HEIGHT = 672, 1462
SCREEN_X, SCREEN_Y = (W - SCREEN_WIDTH) // 2, 295
SR = 48000


def run(ffmpeg, *options, **kwargs):
    subprocess.run([ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", *map(str, options)],
                   check=True, **kwargs)


def timestamp(seconds):
    hundredths = round(seconds * 100)
    return f"{hundredths // 360000}:{hundredths // 6000 % 60:02}:{hundredths // 100 % 60:02}.{hundredths % 100:02}"


def touches(file, shot):
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Touch,Helvetica,30,&H0000D3FF,&H0000D3FF,&H00473C23,&H00000000,0,0,0,0,100,100,0,0,1,2,0,5,0,0,0,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
"""
    # The reversed inner path keeps the control under the touch visible.
    ring = ("m 0 11 l 7 11 7 4 34 4 34 11 41 11 41 34 34 34 34 41 7 41 7 34 0 34 "
            "m 7 17 l 7 28 14 28 14 34 27 34 27 28 34 28 34 17 27 17 27 11 14 11 14 17 7 17")
    events = []

    def point(x, y):
        assert 0 <= x <= 1 and 0 <= y <= 1
        return f"{int(SCREEN_X + SCREEN_WIDTH * x)},{int(SCREEN_Y + SCREEN_HEIGHT * y)}"

    def add(time, hold, tags):
        assert 0 <= time < shot["duration"] and hold > 0
        end = min(shot["duration"], time + hold)
        timing = f"0,{timestamp(time)},{timestamp(end)},Touch,,0,0,0,,"
        events.append(f"Dialogue: {timing}{tags}{ring}")

    for time, x, y, hold in shot.get("touches", []):
        add(time, hold, rf"{{\an5\pos({point(x, y)})\fad(16,140)\fscx82\fscy82\t(0,160,\fscx112\fscy112)\p1}}")
    for time, start_x, start_y, end_x, end_y, hold in shot.get("swipes", []):
        path = f"{point(start_x, start_y)},{point(end_x, end_y)},0,{round(hold * 1000)}"
        add(time, hold + .10, rf"{{\an5\move({path})\fad(16,110)\p1}}")
    file.write_text(header + "\n".join(events) + "\n")


def board(shot, t, chapter_start):
    image = titles.gradient("#fafcf8", shot["color"]).copy()
    draw = ImageDraw.Draw(image)
    chapter = titles.ramp((t + .08) / .45) if chapter_start else 1
    caption = titles.ramp((t + .06) / .26)
    titles.appear(image, shot["title"], 76, 97, 73, chapter, bold=True, travel=23)
    titles.appear(image, shot["caption"], 79, 209, 38, caption, color=titles.SECONDARY, travel=15)
    for index, (x, y, size) in enumerate(((939, 116, 31), (975, 153, 18),
                                            (126, 1412, 29), (89, 1447, 18),
                                            (929, 526, 24), (959, 497, 16),
                                            (927, 1606, 32), (961, 1640, 17))):
        pulse = titles.ramp((chapter * .7 - (index % 4) * .083) / .41)
        if pulse > 0:
            y += round((1 - pulse) * 45)
            draw.rectangle((x, y, x + size, y + size), fill="#c4d5c8")
    x, y = SCREEN_X - 9, SCREEN_Y - 9
    titles.pixel_panel(draw, x, y, SCREEN_WIDTH + 17, SCREEN_HEIGHT + 17, "#17231d", 10)
    return image


def render_board(ffmpeg, path, shot, chapter_start):
    duration = .54 if chapter_start else .31
    command = [ffmpeg, "-nostdin", "-v", "error", "-y", "-f", "rawvideo", "-pixel_format", "rgb24",
               "-video_size", f"{W}x{H}", "-framerate", str(FPS), "-i", "-", "-an",
               "-c:v", "libx264", "-preset", "ultrafast", "-crf", "14", "-pix_fmt", "yuv420p", str(path)]
    with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
        for frame in range(math.ceil(duration * FPS)):
            encoder.stdin.write(board(shot, frame / FPS, chapter_start).tobytes())
        encoder.stdin.close()
        if encoder.wait():
            raise subprocess.CalledProcessError(encoder.returncode, command)


def score(file, duration, cues):
    time = np.arange(round(duration * SR)) / SR
    mix = np.zeros((len(time), 2), dtype=np.float64)
    bpm = 110
    beat = 60 / bpm
    chords = [(48, 55, 60, 64, 67), (45, 52, 60, 64, 67),
              (41, 48, 57, 60, 64), (43, 50, 55, 59, 62)]

    def add(when, length, gain, pan, synthesis):
        start = round(when * SR)
        size = min(round(length * SR), len(mix) - start)
        if size <= 0:
            return
        interval = np.arange(size) / SR
        signal = gain * synthesis(interval)
        mix[start:start + size] += signal[:, None] * np.array([1 - pan, pan]) ** .5

    def tone(note, decay):
        frequency = 440 * 2 ** ((note - 69) / 12)

        def synth(t):
            phase = 2 * math.pi * frequency * t
            harmonic = np.sin(phase) + .25 * np.sin(2 * phase) + .10 * np.sin(3 * phase)
            return harmonic * np.minimum(t / .012, 1) * np.exp(-t * decay)
        return synth

    for bar in range(math.ceil(duration / (beat * 4))):
        start = bar * beat * 4
        chord = chords[bar % len(chords)]
        add(start, 2.05, .093, .51, tone(chord[0], 1.8))
        for i, index in enumerate((2, 4, 3, 1, 3, 4)):
            add(start + beat * (i * .5 + .17), 1.25, .069, .25 if i % 2 else .68, tone(chord[index] + 12, 4.6))
        add(start + beat * 2, 1.35, .045, .48, tone(chord[1], 2.2))

    for cue in cues:
        def click(t):
            return (np.sin(2 * np.pi * 1160 * t) + .30 * np.sin(2 * np.pi * 1860 * t)) * np.exp(-80 * t)
        add(cue, .082, .105, .5, click)

    gain = np.minimum(time / .35, 1) * np.clip((duration - time) / 1.15, 0, 1)
    audio = np.clip(mix * gain[:, None] * 2.25, -.97, .97)
    with wave.open(str(file), "wb") as output:
        output.setparams((2, 2, SR, 0, "NONE", "not compressed"))
        output.writeframes((audio * 32767).astype("<i2").tobytes())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("timeline", type=Path)
    parser.add_argument("directory", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    args = parser.parse_args()
    folder = args.directory.resolve()
    output = args.output.resolve()
    manifest = json.loads(args.timeline.read_text())
    shots = manifest["shots"]
    cut = [(folder / "opening.mp4", titles.OPENING), (folder / "pain.mp4", titles.PAIN)]
    audio_cues = [1.47, 4.37, 8.37]
    elapsed = titles.OPENING + titles.PAIN
    onboarding = manifest.get("onboarding_seconds", 0)
    if onboarding:
        assert math.isclose(onboarding, ONBOARDING_DURATION)
        cut.append((folder / "onboarding.mp4", onboarding))
        audio_cues.extend(elapsed + cue for cue in ONBOARDING_CUES)
        elapsed += onboarding
    encode = ["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p"]
    for index, shot in enumerate(shots):
        assert math.isclose(round(shot["duration"] * FPS), shot["duration"] * FPS)
        stem = f"shot-{index:02}"
        stage = folder / (stem + "-stage.mp4")
        first = index == 0 or shot["flow"] != shots[index - 1]["flow"]
        render_board(args.ffmpeg, stage, shot, first)
        touches(folder / (stem + ".ass"), shot)
        destination = folder / (stem + ".mp4")
        # Normalize before trimming so a pause in the capture's variable-rate
        # frames does not shift the screen action relative to its touch cue.
        seek = max(0, shot["start"] - 3)
        offset = shot["start"] - seek
        src = (f"[1:v]fps={FPS}:start_time=0,trim=start={offset:.6f},"
               f"setpts=(PTS-STARTPTS)/{shot.get('speed', 1)},fps={FPS}:start_time=0,")
        crop = shot.get("crop")
        if crop:
            src += "crop=" + ":".join(map(str, crop)) + ","
        src += f"scale={SCREEN_WIDTH}:{SCREEN_HEIGHT}:flags=lanczos,setsar=1[screen];"
        video_filter = (src + f"[0:v]tpad=stop_mode=clone:stop_duration={shot['duration']}[stage];"
                        f"[stage][screen]overlay={SCREEN_X}:{SCREEN_Y}:shortest=1,ass={stem}.ass")
        run(args.ffmpeg, "-i", stage,
            "-ss", seek, "-i", shot["file"], "-filter_complex", video_filter,
            "-t", shot["duration"], *encode, destination, cwd=folder)
        cut.append((destination, shot["duration"]))
        audio_cues.extend(elapsed + touch[0] for touch in shot.get("touches", []))
        elapsed += shot["duration"]
    cut.append((folder / "outro.mp4", titles.OUTRO))
    duration = elapsed + titles.OUTRO
    audio_cues.append(elapsed + .96)
    score(folder / "soundtrack.wav", duration, audio_cues)
    sources = [arg for path, _ in cut for arg in ("-i", path)]
    video_filter = "".join(f"[{index}:v]setsar=1[v{index}];" for index in range(len(cut)))
    video_filter += "".join(f"[v{index}]" for index in range(len(cut)))
    video_filter += f"concat=n={len(cut)}:v=1:a=0[out]"
    run(args.ffmpeg, *sources, "-i", folder / "soundtrack.wav", "-filter_complex", video_filter,
        "-map", "[out]", "-map", f"{len(cut)}:a", "-c:v", "libx264", "-preset", "fast",
        "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", "-t", duration, output)
    print(f"{output} ({duration:g}s, {len(shots)} native screen segments)")


if __name__ == "__main__":
    main()
