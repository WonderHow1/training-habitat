"""Build the two offline iOS prototype entry points."""
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
PIXELS = "\n".join((SRC / name).read_text() for name in ("pet-art.js", "pet-growth.js", "pet-reactions.js", "pixels.js"))
STYLE = (SRC / "style.css").read_text()
JS = "\n".join([(SRC / "training.js").read_text(), PIXELS] + [
    (SRC / name).read_text() for name in ("pet-motion.js", "pet-guide.js", "frame.js", "habitat.js", "workout-swipe.js", "app.js")
])

MARK = '<svg viewBox="0 0 24 22" aria-hidden="true"><path fill="currentColor" d="M4 2h3v4h10V2h3v7h2v8h-2v3H4v-3H2V9h2z"/><path fill="var(--accent)" d="M6 10h3v3H6zm9 0h3v3h-3zm-5 5h4v2h-4z"/></svg>'


def chrome(title, css):
    return f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}</title><style>{css}</style></head>"""


def build_prototype(*, new_user=False):
    if new_user:
        name = "新用户引导"
        links = '<a href="ios-prototype.html">日常使用原型</a><span aria-current="page">新用户引导</span>'
        devices = (("home", "今天"),)
    else:
        name = "训练栖地"
        links = '<span aria-current="page">Liquid Glass</span><a href="new-user.html">新用户引导原型</a>'
        devices = (("home", "今天"), ("week", "一周计划"), ("log", "训练回顾"), ("pet", "宠物与成长"))
    css = STYLE + (SRC / "glass.css").read_text()
    variant = ' data-glass data-new-user' if new_user else ' data-glass'
    phones = "".join(
        f'<section class="device" id="view-{tab}" data-phone="{tab}"><h2>{label}</h2></section>'
        for tab, label in devices
    )
    controls = '<div class="board-tools"><button type="button" id="reset">重置新用户演示</button></div>' if new_user else f"""
<div class="board-tools">
  <div><p>上滑进入今天的训练，滚到顶部后下滑回到栖息地。</p><p id="demo-feedback" role="status"></p></div>
  <div class="board-controls">
    <label>场景<select id="demo-scene" aria-label="场景">
      <option value="standard">日常训练</option>
      <option value="death">宠物离世</option><option value="no-plan">无计划日</option>
    </select></label>
    <label>北京时间<input id="demo-time" type="datetime-local" value="2026-11-16T20:00" min="2026-11-16T20:00"></label>
    <button type="button" id="advance">推进时间</button><button type="button" id="reset">重置</button>
  </div>
</div>"""
    feature_scripts = (SRC / "heatmap.js").read_text()
    if new_user:
        feature_scripts += "\n" + (SRC / "onboarding.js").read_text()
    return chrome(f"{name}｜像素宠物健身", css) + f"""
<body data-theme="garden"{variant}>
<header class="board-header">
  <div class="board-identity"><div class="board-mark">{MARK}</div><div><p>像素宠物健身 · iOS 原型</p><h1>{name}</h1></div></div>
  <nav class="board-nav" aria-label="原型入口">{links}</nav>
</header>
{controls}
<main id="board">{phones}</main>
{'' if new_user else f'<footer class="board-footer"><p>每台手机可独立操作。设备训练与提醒使用演示状态。</p></footer>'}
<script>{feature_scripts}
{JS}</script></body></html>
"""


if __name__ == "__main__":
    (ROOT / "ios-prototype.html").write_text(build_prototype())
    (ROOT / "new-user.html").write_text(build_prototype(new_user=True))
