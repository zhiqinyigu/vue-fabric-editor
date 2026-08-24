// 替代 Vue3 版本中的 unplugin-icons（~icons/...）
// 内部使用内联 SVG 的轻量组件，样式跟随 currentColor
function makeIcon(attrs, buildChildren) {
  return {
    name: 'VcpIcon',
    inheritAttrs: false,
    render(h) {
      return h(
        'svg',
        {
          attrs: Object.assign(
            {
              xmlns: 'http://www.w3.org/2000/svg',
              viewBox: '0 0 24 24',
              width: '16',
              height: '16',
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': '2',
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
            },
            attrs
          ),
        },
        buildChildren(h)
      );
    },
  };
}

const path = (h, d) => h('path', { attrs: { d } });

export const Icon = {
  // lucide/chevron-down
  ChevronDown: makeIcon({}, (h) => [path(h, 'm6 9 6 6 6-6')]),
  // lucide/plus
  Plus: makeIcon({}, (h) => [path(h, 'M5 12h14'), path(h, 'M12 5v14')]),
  // lucide/trash-2
  Trash: makeIcon({}, (h) => [
    path(h, 'M3 6h18'),
    path(h, 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'),
    path(h, 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'),
    path(h, 'M10 11v6'),
    path(h, 'M14 11v6'),
  ]),
  // lucide/color-picker
  ColorPicker: makeIcon({}, (h) => [
    path(h, 'm11 7l6 6M4 16L15.7 4.3a1 1 0 0 1 1.4 0l2.6 2.6a1 1 0 0 1 0 1.4L8 20H4z'),
  ]),
};
