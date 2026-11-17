"""Check the exported video and its audible, synchronized stereo track."""
import argparse
import json
import os
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("mp4", type=Path)
parser.add_argument("--portrait-timeline", type=Path)
args = parser.parse_args()
ffprobe = os.environ.get("FFPROBE", "ffprobe")
ffmpeg = os.environ.get("FFMPEG", "ffmpeg")

report = json.loads(subprocess.check_output([
    ffprobe, "-v", "error", "-show_streams", "-show_format", "-of", "json", args.mp4,
]))
video, = (stream for stream in report["streams"] if stream["codec_type"] == "video")
audio, = (stream for stream in report["streams"] if stream["codec_type"] == "audio")
width, height, duration, fps = 1920, 1080, 74, 30
if args.portrait_timeline:
    width, height = 1080, 1920
    timeline = json.loads(args.portrait_timeline.read_text())
    fps = timeline.get("fps", 30)
    assert fps in (30, 60)
    shots = timeline["shots"]
    duration = timeline.get("graphics_seconds", 18) + sum(shot["duration"] for shot in shots)
    assert {shot["flow"] for shot in shots} == {"reschedule", "timer", "manual", "review"}
    assert all(any(shot["touches"] for shot in shots if shot["flow"] == flow)
               for flow in ("reschedule", "timer", "manual"))
    assert 35 <= duration <= 75
frames = round(duration * fps)
assert (video["codec_name"], video["width"], video["height"]) == ("h264", width, height)
assert video["avg_frame_rate"] == f"{fps}/1" and int(video["nb_frames"]) == frames
assert video["pix_fmt"] == "yuv420p"
assert (audio["codec_name"], audio["sample_rate"], audio["channels"]) == ("aac", "48000", 2)
assert abs(float(video["duration"]) - duration) < .04
assert abs(float(audio["duration"]) - float(video["duration"])) < .08
assert abs(float(audio["start_time"]) - float(video["start_time"])) < .04

decoded = subprocess.run([
    ffmpeg, "-hide_banner", "-nostats", "-v", "info", "-xerror", "-i", args.mp4,
    "-vf", "blackdetect=d=0.1:pix_th=0.075", "-af", "volumedetect",
    "-f", "null", "-",
], check=True, capture_output=True, text=True).stderr
assert "black_start:" not in decoded, "Unexpected black frame sequence"
peak = next(line.split("max_volume:")[1].split()[0] for line in decoded.splitlines()
            if "max_volume:" in line)
assert -18 < float(peak) <= -.2, f"Audio peak: {peak} dBFS"
print(f"Verified {frames} decodable frames, {duration:g}s at {width}×{height}/{fps}fps, stereo AAC, peak {peak} dBFS.")
