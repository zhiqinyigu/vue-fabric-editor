/**
 * 画布素材运行时解析（src/core/canvasAsset.js）测试
 *
 * 覆盖两条接入路径的互斥语义：
 * - 未配置基址（webpack + VfeAssetsPlugin 路径）：返回 file-loader 产出的 fallback
 * - 已配置基址（非 webpack 打包器路径）：用基址拼装稳定命名的素材路径
 */
describe('src/core/canvasAsset', () => {
  let canvasAsset;

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    canvasAsset = require('@/core/canvasAsset');
    canvasAsset.setCanvasAssetsBaseUrl(null);
  });

  it('未配置基址：返回 fallback（webpack 插件路径）', () => {
    expect(canvasAsset.isCanvasAssetsBaseConfigured()).toBe(false);
    expect(canvasAsset.resolveCanvasAsset('middlecontrol.svg', '/static/js/abc123.svg')).toBe(
      '/static/js/abc123.svg'
    );
  });

  it('配置字符串基址：自动补 / 并拼装素材路径', () => {
    canvasAsset.setCanvasAssetsBaseUrl('/static/vfe-assets');
    expect(canvasAsset.isCanvasAssetsBaseConfigured()).toBe(true);
    expect(canvasAsset.resolveCanvasAsset('middlecontrol.svg', 'ignored')).toBe(
      '/static/vfe-assets/middlecontrol.svg'
    );

    canvasAsset.setCanvasAssetsBaseUrl('/static/vfe-assets/');
    expect(canvasAsset.resolveCanvasAsset('img/BlackWhite.png', 'ignored')).toBe(
      '/static/vfe-assets/img/BlackWhite.png'
    );
  });

  it('支持 CDN 风格绝对基址', () => {
    canvasAsset.setCanvasAssetsBaseUrl(
      'https://cdn.example.com/@chenyican/vue-fabric-editor@1.0.3/dist/vue-fabric-editor'
    );
    expect(canvasAsset.resolveCanvasAsset('lock.svg', 'ignored')).toBe(
      'https://cdn.example.com/@chenyican/vue-fabric-editor@1.0.3/dist/vue-fabric-editor/lock.svg'
    );
  });

  it('支持函数基址（消费方自行决定 URL 生成策略）', () => {
    canvasAsset.setCanvasAssetsBaseUrl((rel) => `/assets/${rel}?v=2`);
    expect(canvasAsset.resolveCanvasAsset('img/Sepia.png', 'ignored')).toBe(
      '/assets/img/Sepia.png?v=2'
    );
  });

  it('清除基址后回到 fallback 行为', () => {
    canvasAsset.setCanvasAssetsBaseUrl('/x/');
    canvasAsset.setCanvasAssetsBaseUrl(null);
    expect(canvasAsset.getCanvasAssetsBaseUrl()).toBe(null);
    expect(canvasAsset.resolveCanvasAsset('lock.svg', 'fb')).toBe('fb');
  });

  it('失败上报：给出两条接入方式与文档指引，且同一素材只报一次', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    canvasAsset.reportCanvasAssetFailure('lock.svg', '/static/js/lock.svg');
    canvasAsset.reportCanvasAssetFailure('lock.svg', '/static/js/lock.svg');

    expect(spy).toHaveBeenCalledTimes(1);
    const msg = spy.mock.calls[0][0];
    expect(msg).toContain('lock.svg');
    expect(msg).toContain('VfeAssetsPlugin');
    expect(msg).toContain('assetsBaseUrl');
    expect(msg).toContain('PACKAGING.md');
  });

  it('installRuntime 可只传 assetsBaseUrl（不需要 vue/compositionApi）', () => {
    const rt = require('@/core/runtime');
    expect(rt.installRuntime({ assetsBaseUrl: '/static/vfe/' })).toBe(true);
    expect(canvasAsset.getCanvasAssetsBaseUrl()).toBe('/static/vfe/');
    expect(rt.isRuntimeInjected()).toBe(false); // 素材基址不属于实例注入
  });
});
