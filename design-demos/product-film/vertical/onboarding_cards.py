"""Explain the first-run experience using the app's original pixel artwork."""

import argparse
from bisect import bisect_right
from itertools import accumulate
import json
import math
from pathlib import Path
import subprocess

from PIL import ImageDraw, ImageOps

from title_cards import (ART, FPS, HEIGHT, INK, SECONDARY, WIDTH, appear, art,
                         gradient, label, pixel, pixel_panel, ramp, tile_wipe)

SPECIES = ("cat", "dog", "rabbit", "hamster", "guineaPig",
           "chinchilla", "parrot", "turtle", "hedgehog", "goldfish")
SPECIES_NAMES = ("猫", "狗", "兔子", "仓鼠", "荷兰猪", "龙猫", "鹦鹉", "乌龟", "刺猬", "金鱼")
HABITATS = ("garden", "gym", "running-track", "living", "bedroom")
HABITAT_NAMES = ("草地", "健身房", "操场跑道", "客厅", "卧室")
SCENES = ("goal", "adopt", "growth", "hearts", "habitats")
DURATIONS = (3.5, 4.3, 4.2, 5.5, 4.9)
END_TIMES = tuple(accumulate(DURATIONS))
DURATION = END_TIMES[-1]
CUES = (0.46, 3.75, 5.37, 8.20, 9.78, 12.62, 14.18, 17.77, 20.32)


def heart(draw, x, y, size, color):
    for row in range(10):
        if row == 0:
            columns = (1, 2, 3, 7, 8, 9)
        else:
            inset = max(0, row - 4)
            columns = range(inset, 11 - inset)
        for col in columns:
            left, top = x + col * size, y + row * size
            draw.rectangle((left, top, left + size - 1, top + size - 1), fill=color)


def center_sprite(canvas, sprite, x, y):
    canvas.paste(sprite, (round(x - sprite.width / 2), round(y - sprite.height)), sprite)


class OnboardingCards:
    def __init__(self):
        assets = json.loads(ART.read_text())
        cats = assets["pets"]["cat"]
        self.pets = [self.visible(assets["pets"][key]["resting"][0], 5) for key in SPECIES]
        self.cat = self.visible(cats["resting"][0], 17)
        self.stages = [self.visible(encoded, 11) for encoded in cats["resting"]]
        self.resting_in_scene = pixel(art(cats["resting"][0]), 8)
        self.walk = [ImageOps.mirror(pixel(art(encoded), 8)) for encoded in cats["walk"][0]]
        self.reactions = [(pixel(art(frame["png"]), 8), frame["duration"] / 1000)
                          for frame in cats["reactions"][0]]
        self.landscapes = []
        self.thumbnails = []
        for key in HABITATS:
            scene = art(assets["habitats"][key])
            self.landscapes.append(pixel(scene.crop((0, 39, 88, 100)), 10).convert("RGB"))
            self.thumbnails.append(pixel(scene.crop((0, 39, 88, 151)), 2).convert("RGB"))

    @staticmethod
    def visible(encoded, scale):
        frame = art(encoded)
        return pixel(frame.crop(frame.getbbox()), scale)

    @staticmethod
    def base(title, detail, time, tint):
        canvas = gradient("#fbfcf8", tint).copy()
        appear(canvas, title, 76, 262, 94, ramp((time + .08) / .53), bold=True)
        for index, line in enumerate(detail):
            appear(canvas, line, 81, 445 + index * 66, 43,
                   ramp((time - .18 - index * .12) / .48), color=SECONDARY)
        return canvas

    def goal(self, time):
        canvas = self.base("先定个目标。", ("设定每天想练多久，", "训练时长会累计到当天。"), time, "#dfeeff")
        draw = ImageDraw.Draw(canvas)
        offset = round(64 * (1 - ramp(time / .62)))
        top = 750 + offset
        pixel_panel(draw, 89, top, 902, 622, "#ffffff", 24)
        label(draw, "每日训练目标", 540, top + 92, 42, bold=True, anchor="mt")
        # Thirty minutes is the default in the app's first-run goal picker.
        appear(canvas, "30", 518, top + 194, 246, ramp((time - .30) / .64),
               bold=True, anchor="mt", travel=58)
        appear(canvas, "分钟", 752, top + 347, 48, ramp((time - .53) / .46), bold=True)
        for index in range(20):
            x = 178 + index * 37
            color = "#4672a3" if index < round(20 * ramp((time - .53) / 1.1)) else "#dce8f4"
            draw.rectangle((x, top + 489, x + 27, top + 509), fill=color)
        label(draw, "示例目标", 540, top + 549, 33, color=SECONDARY, anchor="mt")
        return canvas

    def adopt(self, time):
        canvas = self.base("挑个训练搭档。", ("10 种宠物供领养。选一只，再给它起名。",), time, "#e5efdd")
        draw = ImageDraw.Draw(canvas)
        for index, (sprite, name) in enumerate(zip(self.pets, SPECIES_NAMES, strict=True)):
            x = 78 + (index % 5) * 188
            y = 615 + (index // 5) * 241
            selected = index == 0 and time >= .67
            pixel_panel(draw, x, y, 173, 216, "#cfe7c3" if selected else "#ffffff", 13)
            enter = ramp((time + .12 - index * .042) / .43)
            if enter > 0:
                center_sprite(canvas, sprite, x + 86, y + 133 + 19 * (1 - enter))
                label(draw, name, x + 86, y + 166, 33, bold=selected, anchor="mt")
        p = ramp((time - 1.04) / .72)
        if p > 0:
            ground = 1461 - round(49 * math.sin(p * math.pi))
            center_sprite(canvas, self.cat, 346, ground)
            appear(canvas, "团团", 550, 1263, 118, ramp((time - 1.32) / .52), bold=True)
            appear(canvas, "今天一起练。", 552, 1423, 41, ramp((time - 1.57) / .53), color=SECONDARY)
        return canvas

    def growth(self, time):
        canvas = self.base("每一次训练，", ("都能让宠物长大。",), time, "#e8effa")
        draw = ImageDraw.Draw(canvas)
        pixel_panel(draw, 80, 635, 920, 346, "#ffffff", 18)
        label(draw, "每记录满 1 分钟，获得 1 XP。", 124, 700, 46, bold=True)
        label(draw, "每积满 100 XP，升一级。", 124, 788, 41, color=SECONDARY)
        p = ramp((time - .45) / 1.55)
        for step in range(22):
            x = 124 + step * 38
            draw.rectangle((x, 891, x + 27, 911), fill="#456c92" if step < round(p * 22) else "#dbe6f0")
        for index, (name, level, sprite) in enumerate(zip(
                ("幼年", "青年", "成年"), ("Lv.1", "Lv.2", "Lv.3 起"), self.stages, strict=True)):
            x = 235 + index * 305
            entered = ramp((time - .63 - .3 * index) / .62)
            if entered > 0:
                ground = 1391 + 55 * (1 - entered)
                center_sprite(canvas, sprite, x, ground)
                appear(canvas, name, x, 1466, 54, entered, bold=True, anchor="mt")
                appear(canvas, level, x, 1549, 38, entered, color=SECONDARY, anchor="mt")
        return canvas

    def hearts(self, time):
        canvas = self.base("照顾它的爱心。", ("刚领养时，宠物有 3 颗心。",), time, "#f7e8e0")
        draw = ImageDraw.Draw(canvas)
        lost = ramp((time - 1.18) / .56)
        for index in range(3):
            fill = "#b03959"
            if index == 2 and lost > .5:
                fill = "#c3b2b2"
            offset = round(45 * math.sin(lost * math.pi)) if index == 2 else 0
            heart(draw, 165 + index * 280, 731 - offset, 17, fill)
        appear(canvas, "当天没达标，少 1 颗心。", 96, 1080, 54,
               ramp((time - .69) / .51), bold=True)
        appear(canvas, "从领养后的首个完整日开始结算。", 96, 1208, 41,
               ramp((time - 1.42) / .48), color=SECONDARY)
        appear(canvas, "每日按北京时间结算。", 96, 1282, 41,
               ramp((time - 1.60) / .48), color=SECONDARY)
        appear(canvas, "爱心归零时，宠物会离世。", 96, 1471, 43,
               ramp((time - 2.28) / .56), color="#803746")
        return canvas

    def habitats(self, time):
        canvas = self.base("给它选个栖息地。", ("5 种背景，之后也能更换。",), time, "#e4efdb")
        draw = ImageDraw.Draw(canvas)
        # Tour the places once, then stay in the garden for the interaction.
        order = (1, 2, 3, 4, 0)
        active = order[min(4, int(time / .40))]
        canvas.paste(self.landscapes[active], (100, 612))
        for index, (name, thumb) in enumerate(zip(HABITAT_NAMES, self.thumbnails, strict=True)):
            x = 80 + index * 188
            if index == active:
                pixel_panel(draw, x - 7, 1279, 190, 312, "#c8dfb9", 12)
            canvas.paste(thumb, (x, 1286))
            label(draw, name, x + 88, 1532, 34, bold=index == active, anchor="mt")
        if active == 0:
            self.visit(canvas, time)
        appear(canvas, "点场景，让它走过去。", 91, 1662, 41,
               ramp((time - 1.45) / .53), bold=True)
        appear(canvas, "点团团，看它的专属反应。", 91, 1734, 41,
               ramp((time - 2.10) / .55), color=SECONDARY)
        return canvas

    def visit(self, canvas, time):
        progress = ramp((time - 1.91) / .86)
        x = 323 + 218 * progress
        sprite = self.resting_in_scene
        if 0 < progress < 1:
            sprite = self.walk[int(time / .12) % len(self.walk)]
        elif time >= 3.15:
            remaining = time - 3.15
            for frame, duration in self.reactions:
                if remaining < duration:
                    sprite = frame
                    break
                remaining -= duration
        # Use the atlas baseline, including during the reaction.
        canvas.paste(sprite, (round(x - sprite.width / 2), 1138 - 35 * 8), sprite)
        if 1.79 <= time < 2.65:
            draw = ImageDraw.Draw(canvas)
            for dx, dy in ((-16, 0), (16, 0), (0, -16), (0, 16)):
                cx, cy = 541 + dx, 1130 + dy
                draw.rectangle((cx - 5, cy - 5, cx + 5, cy + 5), fill="#f2f6be")

    def frame(self, time):
        index = min(bisect_right(END_TIMES, time), len(SCENES) - 1)
        local = time - (END_TIMES[index - 1] if index else 0)
        current = getattr(self, SCENES[index])(local)
        if index and local < .24:
            prev = getattr(self, SCENES[index - 1])(DURATIONS[index - 1] - 1 / FPS)
            return tile_wipe(current, prev, ramp(local / .24))
        return current


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    cards = OnboardingCards()
    command = [args.ffmpeg, "-y", "-v", "error", "-f", "rawvideo", "-pixel_format", "rgb24",
               "-video_size", f"{WIDTH}x{HEIGHT}", "-framerate", str(FPS), "-i", "-",
               "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p",
               str(args.directory / "onboarding.mp4")]
    with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
        for index in range(round(DURATION * FPS)):
            encoder.stdin.write(cards.frame(index / FPS).tobytes())
        encoder.stdin.close()
        if encoder.wait():
            raise subprocess.CalledProcessError(encoder.returncode, command)


if __name__ == "__main__":
    main()
