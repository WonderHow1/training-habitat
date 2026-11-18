"""Validate the handoff's local links and reproducible offline prototypes."""

import importlib.util
from pathlib import Path
import re
import unittest
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]


class DeliveryTests(unittest.TestCase):
    def test_homepage_embeds_a_video_attachment_and_keeps_the_download(self):
        readme = (ROOT / "README.md").read_text()
        self.assertRegex(readme, r"(?m)^https://github\.com/user-attachments/assets/[0-9a-f-]{36}$")
        self.assertIn('<a id="product-video"></a>', readme)
        self.assertIn("[在线播放](#product-video)", readme)
        self.assertIn("[下载成片](design-demos/product-film/vertical/训练栖地-竖屏短片.mp4)", readme)

    def test_delivery_links_resolve_inside_repository(self):
        for relative in ("README.md", "docs/delivery-requirements.md"):
            document = ROOT / relative
            links = re.findall(r"\[[^\]]*\]\(([^)]+)\)", document.read_text())
            self.assertTrue(links, f"No handoff links in {relative}")
            for link in links:
                parsed = urlsplit(link)
                if parsed.scheme or parsed.netloc or not parsed.path:
                    continue
                target = (document.parent / unquote(parsed.path)).resolve()
                with self.subTest(document=relative, link=link):
                    self.assertTrue(target.is_relative_to(ROOT), "Link leaves repository")
                    self.assertTrue(target.is_file(), f"Missing delivery: {target}")
                    self.assertGreater(target.stat().st_size, 0, "Empty delivery")
                    if parsed.fragment:
                        anchors = re.findall(r'\bid=["\']([^"\']+)["\']', target.read_text())
                        self.assertIn(unquote(parsed.fragment), anchors, "Missing delivery section anchor")

    def test_delivery_tables_have_consistent_columns(self):
        for relative in ("README.md", "docs/delivery-requirements.md"):
            table = []
            for line in (ROOT / relative).read_text().splitlines() + [""]:
                if line.startswith("|"):
                    table.append(line)
                elif table:
                    with self.subTest(document=relative, table=table[0]):
                        self.assertGreaterEqual(len(table), 3)
                        self.assertEqual(len({row.count("|") for row in table}), 1)
                        self.assertRegex(table[1], r'^\|(?:\s*:?-+:?\s*\|)+$')
                    table = []

    def test_offline_prototypes_match_their_sources(self):
        spec = importlib.util.spec_from_file_location("prototype_build", ROOT / "design-demos/build.py")
        build = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(build)
        for name, new_user in (("ios-prototype.html", False), ("new-user.html", True)):
            with self.subTest(prototype=name):
                actual = (ROOT / "design-demos" / name).read_text()
                self.assertEqual(actual, build.build_prototype(new_user=new_user))
                self.assertNotRegex(actual, r'<(?:script|link)\b[^>]*(?:src|href)=["\']https?://')


if __name__ == "__main__":
    unittest.main()
