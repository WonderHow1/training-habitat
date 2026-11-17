"""Validate the handoff's local links and reproducible offline prototypes."""

import importlib.util
from pathlib import Path
import re
import unittest
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]


class DeliveryTests(unittest.TestCase):
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
