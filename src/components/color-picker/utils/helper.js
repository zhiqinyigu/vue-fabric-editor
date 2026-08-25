/*
 * @Author: ShawnPhang
 * @Date: 2023-04-26 11:30:10
 * @Description:
 * @LastEditors: ShawnPhang <https://m.palxp.cn>
 * @LastEditTime: 2023-11-28 11:03:14
 */
export const parseBackgroundValue = (value) => {
  if (value.startsWith('#')) return '纯色';
  if (value.startsWith('linear-gradient')) return '渐变';
  return '图案';
};

export const toGradientString = (angle, stops) => {
  const s = [];
  stops.forEach((stop) => {
    s.push(`${stop.color} ${stop.offset * 100}%`);
  });
  return `linear-gradient(${angle}deg, ${s.join(',')})`;
};

/**
 * 显示全局提示
 * @param content
 * @param tooltipVisible
 * @returns
 */
export function toolTip(content) {
  const tooltip = drawTooltip(content);
  document.body.appendChild(tooltip);
  setTimeout(() => (tooltip.parentNode ? tooltip.parentNode.removeChild(tooltip) : null), 2000);
}

function drawTooltip(content, tooltipVisible = true) {
  const tooltip = document.createElement('div');
  tooltip.id = 'color-pipette-tooltip-container';
  tooltip.innerHTML = content;
  tooltip.style = `
    position: fixed;
    left: 50%;
    top: 9%;
    z-index: 10002;
    display: ${tooltipVisible ? 'flex' : 'none'};
    align-items: center;
    background-color: rgba(0,0,0,0.4);
    padding: 6px 12px;
    border-radius: 4px;
    color: #fff;
    font-size: 18px;
    pointer-events: none;
  `;
  return tooltip;
}
