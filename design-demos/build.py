"""Build the offline iOS prototype and its direction drafts."""
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
DIRECTIONS = [
    ("garden", "训练栖地", "打开首页，先看团团，再看今天练什么。", "像素栖息地"),
    ("track", "夜跑手账", "先处理今天的训练，团团的状态始终在旁。", "夜色与训练"),
    ("diary", "团团日记", "把每次训练和团团的成长放进同一本日记。", "像素明信片"),
]
CANDIDATES = [
    (DIRECTIONS[0][0], DIRECTIONS[0][1], "宠物栖息地领衔", "#e8eee3", "#285a46", "01", "dir-1.html"),
    ("studio", "训练时段", "日程拆成可挪动的时段", "#f7e6d2", "#974a2a", "02", ""),
    (DIRECTIONS[1][0], DIRECTIONS[1][1], "今日训练优先", "#242a3e", "#e5ed9f", "03", "dir-2.html"),
    ("clay", "跑后小窝", "把成长写进当日任务", "#f0ddd4", "#8c3d43", "04", ""),
    ("signal", "校园排班", "一周横排，显示训练与空档", "#e0eee9", "#255f64", "05", ""),
    (DIRECTIONS[2][0], DIRECTIONS[2][1], "像素明信片与补记提示", "#eee9f7", "#574689", "06", "dir-3.html"),
]
PIXELS = (SRC / "pixels.js").read_text()
STYLE = (SRC / "style.css").read_text()
JS = "\n".join((SRC / name).read_text() for name in ("training.js", "pixels.js", "frame.js", "app.js"))

MARK = '<svg viewBox="0 0 24 22" aria-hidden="true"><path fill="currentColor" d="M4 2h3v4h10V2h3v7h2v8h-2v3H4v-3H2V9h2z"/><path fill="var(--accent)" d="M6 10h3v3H6zm9 0h3v3h-3zm-5 5h4v2h-4z"/></svg>'


def chrome(title, css):
    return f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}</title><style>{css}</style></head>"""


def build_direction(index, direction, *, glass=False):
    theme, name, lead, view_name = direction
    links = "".join(
        f'<span aria-current="page">{label}</span>' if number == index else f'<a href="dir-{number}.html">{label}</a>'
        for number, (_, label, _, _) in enumerate(DIRECTIONS, 1)
    )
    if glass:
        links = '<span aria-current="page">Liquid Glass</span><a href="dir-1.html">A 版方向稿</a>'
        lead = "滚动手机界面、切换标签，或点「记录训练」体验玻璃控件。"
    elif index == 1:
        links = '<a href="ios-prototype.html">试用 Liquid Glass</a>' + links
    css = STYLE + ((SRC / "glass.css").read_text() if glass else "")
    variant = " data-glass" if glass else ""
    caption = "iOS 原型" if glass else "iOS 方向稿"
    footer = "" if glass else f"{view_name}是这一版的视觉重点。"
    devices = (("home", "今天"), ("week", "一周计划"), ("log", "训练记录"), ("pet", "宠物与成长"))
    phones = "".join(
        f'<section class="device" id="view-{tab}" data-phone="{tab}"><h2>{label}</h2></section>'
        for tab, label in devices
    )
    return chrome(f"{name}｜像素宠物健身", css) + f"""
<body data-theme="{theme}"{variant}>
<header class="board-header">
  <div class="board-identity"><div class="board-mark">{MARK}</div><div><p>像素宠物健身 · {caption}</p><h1>{name}</h1></div></div>
  <nav class="board-nav" aria-label="设计方向">{links}{'' if glass else '<a href="thumbs.html">六稿总览</a>'}</nav>
</header>
<div class="board-tools">
  <div><p>{lead}</p><p id="demo-feedback" role="status"></p></div>
  <div class="board-controls">
    <label>场景<select id="demo-scene" aria-label="场景">
      <option value="standard">日常训练</option><option value="onboarding">首次领养</option>
      <option value="death">宠物离世</option><option value="no-plan">无计划日</option>
    </select></label>
    <label>北京时间<input id="demo-time" type="datetime-local" value="2026-11-16T20:00" min="2026-11-16T20:00"></label>
    <button type="button" id="advance">推进时间</button><button type="button" id="reset">重置</button>
  </div>
</div>
<main id="board">{phones}</main>
<footer class="board-footer"><p>每台手机可独立操作。设备训练与提醒使用演示状态。{footer}</p></footer>
<script>{JS}</script></body></html>
"""


THUMB_CSS = """
* { box-sizing: border-box; }
body { margin: 0; background: #f4f3ef; color: #272b28; font-family: Inter, -apple-system, "PingFang SC", sans-serif; }
main { width: min(1220px, calc(100% - 48px)); margin: 40px auto; }
header { margin-bottom: 24px; border-bottom: 1px solid #bdc3bd; padding-bottom: 18px; }
h1 { font-size: clamp(28px, 4vw, 47px); margin: 0 0 7px; letter-spacing: -.055em; }
p { margin: 0; font-size: 14px; line-height: 1.5; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 15px; }
.card { border-radius: 16px; padding: 16px; background: var(--bg); color: var(--ink); min-height: 270px; }
.card header { border: 0; padding: 0; margin: 0 0 13px; }
.card h2 { font-size: 21px; margin: 0 0 4px; letter-spacing: -.045em; }
.mock { display: grid; gap: 8px; }
.mock canvas { display: block; border-radius: 9px; width: 100%; aspect-ratio: 2.2; object-fit: cover; image-rendering: pixelated; }
.workout { display: flex; gap: 8px; align-items: center; justify-content: space-between; border-top: 1px solid currentColor; padding-top: 8px; font-size: 13px; }
.workout strong { font-size: 16px; letter-spacing: -.025em; }
.card[data-theme=studio] .mock, .card[data-theme=track] .mock { grid-template-columns: 1.2fr 1fr; align-items: center; }
.card[data-theme=studio] .workout, .card[data-theme=track] .workout { order: -1; flex-direction: column; align-items: start; padding: 10px 8px; border: 0; background: var(--ink); color: var(--bg); border-radius: 8px; }
.card[data-theme=studio] canvas, .card[data-theme=track] canvas { aspect-ratio: 1.15; }
.card[data-theme=clay] .mock { display: flex; flex-direction: column-reverse; }
.card[data-theme=signal] .mock { display: grid; grid-template-rows: auto auto; }
.card[data-theme=signal] .workout { order: -1; border-top: 0; border-bottom: 1px solid; padding-bottom: 8px; }
.card[data-theme=diary] .mock { padding: 8px; border-radius: 12px; background: #fff; }
.card[data-theme=diary] h2 { font-family: "Songti SC", serif; }
.mini-detail { display: grid; gap: 6px; padding: 7px 0 0; font-size: 13px; }
.mini-detail .mini-week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
.mini-week span { text-align: center; border: 1px solid currentColor; border-radius: 4px; padding: 4px 0; }
.mini-week strong { display: block; font-size: 14px; }
.card[data-theme=signal] .mock canvas { aspect-ratio: 3.3; }
.card[data-theme=studio] .mini-detail { grid-column: 1 / -1; border-top: 1px solid currentColor; }
.card[data-theme=clay] .mini-detail { order: -1; padding: 2px 0 0; }
.card footer { margin-top: 14px; font-size: 13px; }
.card a { color: inherit; text-underline-offset: 4px; font-weight: 650; }
@media (max-width: 800px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 500px) { .grid { grid-template-columns: 1fr; } main { margin-top: 22px; } }
"""


def build_thumbs():
    week = "".join(f'<span>{day}<strong>{date}</strong></span>' for day, date in zip("一二三四五六日", range(16, 23)))
    extras = {
        "studio": '<div class="mini-detail"><strong>下一个时段</strong><span>周四 · 下肢力量 · 30 分钟</span></div>',
        "clay": '<div class="mini-detail"><strong>成长 +1</strong><span>11月10日 · 核心训练已完成</span></div>',
        "signal": f'<div class="mini-detail"><div class="mini-week">{week}</div></div>',
    }
    cards = []
    for theme, title, lead, bg, ink, number, target in CANDIDATES:
        action = f'<a href="{target}">打开可点击方向稿</a>' if target else '备选'
        cards.append(f"""<article class="card" data-thumb="{int(number)}" data-theme="{theme}" style="--bg:{bg};--ink:{ink}">
          <header><h2>{title}</h2><p>{lead}</p></header>
          <div class="mock"><canvas width="144" height="83" data-palette="{theme}" role="img" aria-label="像素宠物团团"></canvas>
          <div class="workout"><strong>校园夜跑</strong><span>今天 · 20 分钟</span></div>{extras.get(theme, "")}</div>
          <footer>{action}</footer></article>""")
    cards_html = "".join(cards)
    return chrome("六稿总览｜像素宠物健身", THUMB_CSS) + f"""
<body><main><header><h1>像素宠物健身</h1><p>六张首页探索，三张可点击方向稿</p></header><div class="grid">{cards_html}</div></main>
<script>{PIXELS}
document.querySelectorAll('canvas').forEach(drawScene);</script></body></html>
"""


if __name__ == "__main__":
    (ROOT / "ios-prototype.html").write_text(build_direction(1, DIRECTIONS[0], glass=True))
    for index, direction in enumerate(DIRECTIONS, 1):
        (ROOT / f"dir-{index}.html").write_text(build_direction(index, direction))
    (ROOT / "thumbs.html").write_text(build_thumbs())
