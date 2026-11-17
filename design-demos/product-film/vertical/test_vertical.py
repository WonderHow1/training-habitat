import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np

import assemble
from title_cards import Titles, WIDTH, HEIGHT


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
