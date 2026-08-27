/**
 * ServersPlugin 资源清单去重：重复图片提升为顶层 assets，assetId 引用；loadJSON 前展开还原
 */
import ServersPlugin from '../../src/core/ServersPlugin';

function makePlugin({ useAssetManifest = true } = {}) {
  const plugin = Object.create(ServersPlugin.prototype);
  plugin.editor = {
    getPlugin: () => null,
    options: { useAssetManifest },
  };
  return plugin;
}

describe('ServersPlugin 资源清单（asset manifest）', () => {
  it('重复 src 提升为 assets，唯一 src 保持内联', () => {
    const json = {
      objects: [
        { type: 'image', left: 0, top: 0, width: 10, height: 10, src: 'https://x.com/dup.png', id: 'a' },
        { type: 'image', left: 20, top: 0, width: 10, height: 10, src: 'https://x.com/dup.png', id: 'b' },
        { type: 'image', left: 40, top: 0, width: 10, height: 10, src: 'https://x.com/unique.png', id: 'c' },
        {
          type: 'group',
          objects: [
            { type: 'image', left: 0, top: 0, width: 5, height: 5, src: 'https://x.com/dup.png', id: 'd' },
          ],
        },
      ],
    };
    const plugin = makePlugin();
    plugin._applyAssetManifest(json);

    expect(json.assets).toEqual([{ id: 'asset_0', url: 'https://x.com/dup.png' }]);
    expect(json.objects[0].src).toBeUndefined();
    expect(json.objects[0].assetId).toBe('asset_0');
    expect(json.objects[1].assetId).toBe('asset_0');
    expect(json.objects[2].src).toBe('https://x.com/unique.png');
    expect(json.objects[2].assetId).toBeUndefined();
    // group 内嵌子对象同样引用
    expect(json.objects[3].objects[0].assetId).toBe('asset_0');
    expect(json.objects[3].objects[0].src).toBeUndefined();
  });

  it('无重复 src 时不生成 assets', () => {
    const json = {
      objects: [
        { type: 'image', left: 0, top: 0, width: 10, height: 10, src: 'https://x.com/a.png', id: 'a' },
      ],
    };
    makePlugin()._applyAssetManifest(json);
    expect(json.assets).toBeUndefined();
    expect(json.objects[0].src).toBe('https://x.com/a.png');
  });

  it('展开还原：assetId -> src（含 group 内嵌）', () => {
    const json = {
      assets: [{ id: 'asset_0', url: 'https://x.com/dup.png' }],
      objects: [
        { type: 'image', assetId: 'asset_0', id: 'a' },
        {
          type: 'group',
          objects: [{ type: 'image', assetId: 'asset_0', id: 'b' }],
        },
      ],
    };
    const plugin = makePlugin();
    plugin._expandAssetManifest(json);
    expect(json.objects[0].src).toBe('https://x.com/dup.png');
    expect(json.objects[0].assetId).toBeUndefined();
    expect(json.objects[1].objects[0].src).toBe('https://x.com/dup.png');
    expect(json.objects[1].objects[0].assetId).toBeUndefined();
  });

  it('应用 + 展开为恒等变换（round-trip）', () => {
    const json = {
      objects: [
        { type: 'image', src: 'https://x.com/dup.png', id: 'a', width: 10, height: 10 },
        { type: 'image', src: 'https://x.com/dup.png', id: 'b', width: 10, height: 10 },
        { type: 'image', src: 'https://x.com/uniq.png', id: 'c', width: 10, height: 10 },
      ],
    };
    const plugin = makePlugin();
    const saved = JSON.parse(JSON.stringify(json));
    plugin._applyAssetManifest(saved);
    plugin._expandAssetManifest(saved);
    expect(saved.objects).toEqual(json.objects);
  });

  it('useAssetManifest 关闭时不生成清单', () => {
    const plugin = makePlugin({ useAssetManifest: false });
    expect(plugin._useAssetManifest()).toBe(false);
  });
});