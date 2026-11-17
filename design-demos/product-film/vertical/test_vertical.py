import json
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

import numpy as np

import assemble
import onboarding_cards as onboarding
import title_cards
from title_cards import FPS, HEIGHT, OUTRO, WIDTH, Titles


class VerticalFilmTests(unittest.TestCase):
    def test_portrait_titles_and_visible_pixel_growth(self):
        titles = Titles()
        for scene, times in ((titles.opener, (0, 1.49, 3.95)),
                             (titles.pain, (0, 3.9, 4, 7.9)),
                             (titles.outro, (0, .45, 1.6, 5.9))):
            frames = [scene(time) for time in times]
            self.assertTrue(all(frame.size == (WIDTH, HEIGHT) for frame in frames))
            self.assertNotEqual(frames[0].tobytes(), frames[-1].tobytes())
        bounds = [stage.getbbox() for stage in titles.stages]
        self.assertEqual(sorted(bounds, key=lambda box: box[2] - box[0]), bounds)
        self.assertGreater(bounds[-1][2] - bounds[-1][0], bounds[0][2] - bounds[0][0])
        self.assertGreater(len(titles.growth), 1)

    def test_pixel_wipe_matches_prior_frame_and_ending_has_no_launch_plan(self):
        titles = Titles()
        self.assertEqual(titles.pain(4).tobytes(), titles.pain_frame(4 - 1 / FPS).tobytes())
        self.assertNotEqual(titles.pain(4.18).tobytes(), titles.pain(4).tobytes())
        with patch("title_cards.appear", wraps=title_cards.appear) as appear:
            titles.outro(OUTRO - 1 / FPS)
        text = [call.args[1] for call in appear.call_args_list]
        self.assertIn("训练栖地", text)
        self.assertFalse(any("首测" in line or "两周" in line for line in text))

    def test_chapter_headers_animate_around_a_fixed_screen(self):
        shot = {"title": "练完就记。", "caption": "点一下开始计时。", "color": "#e1eef7"}
        first = assemble.board(shot, 0, True)
        last = assemble.board(shot, .6, True)
        screen = (assemble.SCREEN_X, assemble.SCREEN_Y,
                  assemble.SCREEN_X + assemble.SCREEN_WIDTH, assemble.SCREEN_Y + assemble.SCREEN_HEIGHT)
        self.assertNotEqual(first.tobytes(), last.tobytes())
        self.assertEqual(first.crop(screen).tobytes(), last.crop(screen).tobytes())

    def test_onboarding_uses_all_app_choices_and_transitions(self):
        assets = json.loads(title_cards.ART.read_text())
        self.assertEqual(set(onboarding.SPECIES), set(assets["pets"]))
        self.assertEqual(set(onboarding.HABITATS), set(assets["habitats"]))
        cards = onboarding.OnboardingCards()
        self.assertEqual(len({image.tobytes() for image in cards.thumbnails}), 5)
        for scene, length in zip(onboarding.SCENES, onboarding.DURATIONS, strict=True):
            frame = getattr(cards, scene)
            first, last = frame(0), frame(length - 1 / FPS)
            self.assertEqual(last.size, (WIDTH, HEIGHT))
            self.assertNotEqual(first.tobytes(), last.tobytes())
        first_cut = onboarding.DURATIONS[0]
        self.assertEqual(cards.frame(first_cut).tobytes(),
                         cards.goal(first_cut - 1 / FPS).tobytes())

    def test_onboarding_explains_growth_and_daily_heart_settlement(self):
        cards = onboarding.OnboardingCards()
        with (patch("onboarding_cards.label", wraps=title_cards.label) as labels,
              patch("onboarding_cards.appear", wraps=title_cards.appear) as captions):
            cards.growth(3.8)
            cards.hearts(5)
        lines = [call.args[1] for call in labels.call_args_list + captions.call_args_list]
        for fact in ("1 XP", "100 XP", "Lv.3 起", "3 颗心", "少 1 颗心", "首个完整日", "北京时间", "离世"):
            self.assertTrue(any(fact in line for line in lines), fact)

    def test_habitat_demo_has_time_for_entry_pet_reaction_guided_walk_and_return(self):
        timeline = json.loads(Path(__file__).with_name("timeline.json").read_text())
        habitat, *other_shots = timeline["shots"]
        self.assertEqual(habitat["flow"], "habitat")
        self.assertEqual(other_shots[0]["flow"], "reschedule")
        for instruction in ("「今天」", "全屏栖息地", "点猫", "点草地", "上滑返回"):
            self.assertIn(instruction, habitat["caption"])
        self.assertLess(title_cards.font(38, bold=False).getlength(habitat["caption"]), WIDTH - 2 * 79)
        entry, pet, destination = habitat["touches"]
        (returning,) = habitat["swipes"]
        self.assertGreater(entry[0], .4)
        self.assertTrue(.15 < entry[1] < .85 and .17 < entry[2] < .45)
        self.assertGreater(pet[0] - entry[0], 1)
        self.assertGreater(destination[0] - pet[0], 1)
        self.assertGreater(abs(destination[1] - pet[1]), .15)
        self.assertGreater(returning[0] - destination[0], 1.5)
        self.assertGreater(returning[2] - returning[4], .2)
        self.assertGreater(habitat["duration"] - returning[0] - returning[5], .6)

    def test_touches_track_the_screen_and_end_at_cut(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "touches.ass"
            assemble.touches(path, {"duration": 2, "touches": [[1.85, .5, .25, .5]]})
            script = path.read_text()
            x = assemble.SCREEN_X + assemble.SCREEN_WIDTH // 2
            y = assemble.SCREEN_Y + assemble.SCREEN_HEIGHT // 4
            self.assertIn(r"\pos" + f"({x},{y})", script)
            self.assertIn("0:00:01.85,0:00:02.00", script)
            self.assertEqual(script.count("Dialogue:"), 1)

    def test_swipe_cue_moves_up_the_screen(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "swipe.ass"
            assemble.touches(path, {"duration": 2, "swipes": [[1, .5, .75, .5, .25, .45]]})
            script = path.read_text()
            x = assemble.SCREEN_X + assemble.SCREEN_WIDTH // 2
            start_y = assemble.SCREEN_Y + int(assemble.SCREEN_HEIGHT * .75)
            end_y = assemble.SCREEN_Y + assemble.SCREEN_HEIGHT // 4
            self.assertIn(r"\move" + f"({x},{start_y},{x},{end_y},0,450)", script)
            self.assertIn("0:00:01.00,0:00:01.55", script)

    def test_score_has_stereo_music_and_separate_clicks(self):
        def read(path):
            with wave.open(str(path)) as track:
                self.assertEqual((track.getnchannels(), track.getframerate()), (2, 48000))
                return np.frombuffer(track.readframes(track.getnframes()), dtype="<i2").reshape(-1, 2)

        with tempfile.TemporaryDirectory() as directory:
            dry = Path(directory) / "dry.wav"
            mixed = Path(directory) / "mixed.wav"
            assemble.score(dry, 4, [])
            assemble.score(mixed, 4, [2])
            without, with_click = read(dry), read(mixed)
            self.assertEqual(with_click.shape, (192000, 2))
            self.assertGreater(np.abs(without).max(), 3000)
            self.assertNotEqual(with_click[96010:96800].tobytes(), without[96010:96800].tobytes())
            self.assertEqual(with_click[:96000].tobytes(), without[:96000].tobytes())
            self.assertEqual(with_click[100000:].tobytes(), without[100000:].tobytes())


if __name__ == "__main__":
    unittest.main()
