const HEATMAP_WEEKS = 12;

function sampleTrainingHistory() {
  const anchor = DEMO_AT.split('T')[0];
  const sampleTitles = ['校园夜跑', '核心训练', '下肢力量', '舒展拉伸'];
  const sampleDays = [
    [-74, 1], [-72, 1], [-69, 2], [-64, 1], [-60, 2], [-56, 1], [-51, 3],
    [-45, 1], [-42, 2], [-39, 1], [-35, 1], [-32, 2], [-29, 1], [-26, 1],
    [-23, 1], [-21, 2], [-19, 1], [-18, 3], [-16, 1], [-13, 2], [-10, 1], [-8, 1]
  ];
  return sampleDays.flatMap(([offset, count], index) => Array.from({ length: count }, (_, session) => ({
    id: 'history-' + index + '-' + session,
    date: dayPlus(anchor, offset),
    start: ['17:50', '19:15', '21:00'][session],
    minutes: [20, 25, 15][(index + session) % 3],
    title: sampleTitles[(index + session) % sampleTitles.length],
    source: (index + session) % 3 === 0 ? 'device' : 'manual'
  })));
}

function heatmapStart(today) {
  return dayPlus(monday(today), (1 - HEATMAP_WEEKS) * 7);
}

function trainingHeatmap(records, today, selection, id) {
  const start = heatmapStart(today);
  const counts = new Map();
  let total = 0;
  for (const { date } of records) {
    if (date < start || date > today) continue;
    counts.set(date, (counts.get(date) ?? 0) + 1);
    total++;
  }

  const weeks = Array.from({ length: HEATMAP_WEEKS }, (_, week) => {
    const weekStart = dayPlus(start, week * 7);
    const month = dayPlus(weekStart, 3).slice(5, 7);
    const showMonth = week === 0 || month !== dayPlus(weekStart, -4).slice(5, 7);
    const cells = Array.from({ length: 7 }, (_, weekday) => {
      const date = dayPlus(weekStart, weekday);
      if (date > today) return '<span class="heat-cell heat-future" aria-hidden="true"></span>';
      const count = counts.get(date) ?? 0;
      const label = dateLabel(date) + ' · ' + count + ' 次训练';
      if (!count) return `<span class="heat-cell heat-0" title="${label}" aria-hidden="true"></span>`;
      return `<button type="button" class="heat-cell heat-${Math.min(3, count)}" data-action="log-day" data-value="${date}"
        title="${label}" aria-label="${label}" aria-pressed="${selection === date}"></button>`;
    }).join('');
    return `<div class="heat-week"><span class="heat-month">${showMonth ? Number(month) + '月' : ''}</span>${cells}</div>`;
  }).join('');

  const titleId = id + '-heatmap-title';
  return `<section class="heatmap" aria-labelledby="${titleId}">
    <header class="heatmap-head"><h3 id="${titleId}">训练热力图</h3><p>近 ${HEATMAP_WEEKS} 周 <span>·</span> <strong>${total}</strong> 次</p></header>
    <div class="heat-calendar">
      <div class="heat-week heat-weekdays" aria-hidden="true"><span></span><span>一</span><span></span><span>三</span><span></span><span>五</span><span></span><span></span></div>
      ${weeks}
    </div>
    <footer class="heatmap-footer">
      <p>${selection ? dateLabel(selection) + ' · ' + counts.get(selection) + ' 次' : '点击有训练的日期'}</p>
      ${selection ? button('查看全部日期', 'log-day', 'text-button') :
        '<div class="heat-legend" aria-label="颜色由浅到深表示训练次数由少到多"><span>少</span><i class="heat-0"></i><i class="heat-1"></i><i class="heat-2"></i><i class="heat-3"></i><span>多</span></div>'}
    </footer>
  </section>`;
}
