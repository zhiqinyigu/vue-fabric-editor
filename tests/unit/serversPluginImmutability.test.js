/**
 * ServersPlugin.loadJSON 入参不可变性回归
 *
 * 背景：loadJSON 管线会原地改写 JSON（feDomain 请求态参数 / crossOrigin / 缺省字段补回），
 * 曾因对象入参未克隆导致调用方数据被反向污染——预览渲染后业务数据的 src 携带 feDomain，
 * 再次保存即固化进存储（表现为「粘贴干净数据、应用后数据带 feDomain」）。
 */
import ServersPlugin from '@/core/ServersPlugin';

function makePlugin() {
  const canvas = {
    on: () => {},
    off: () => {},
    loadFromJSON: (json, cb) => cb(),
    renderAll: () => {},
  };
  const plugin = new ServersPlugin(canvas, null);
  plugin.editor = {
    destroyed: false,
    options: { cacheBust: { getValue: () => 'host-test' } },
    hooksEntity: {
      hookTransform: { callAsync: (item, cb) => cb() },
      hookImportBefore: { callAsync: (item, cb) => cb() },
      hookImportAfter: { callAsync: (item, cb) => cb() },
    },
    emit: () => {},
  };
  return plugin;
}

describe('loadJSON：对象入参不被原地修改', () => {
  it('加载后调用方对象的 src 保持干净（feDomain 仅存在于内部请求态）', async () => {
    const plugin = makePlugin();
    const input = {
      objects: [{ type: 'image', id: 'a', src: 'https://cdn.example.com/a.png' }],
    };
    await new Promise((resolve) => plugin.loadJSON(input, resolve));
    expect(input.objects[0].src).toBe('https://cdn.example.com/a.png');
  });

  it('调用方对象带旧域名 feDomain 时同样保持原样', async () => {
    const plugin = makePlugin();
    const input = {
      objects: [{ type: 'image', id: 'a', src: 'https://cdn.example.com/a.png?feDomain=host-old' }],
    };
    await new Promise((resolve) => plugin.loadJSON(input, resolve));
    expect(input.objects[0].src).toBe('https://cdn.example.com/a.png?feDomain=host-old');
  });
});
