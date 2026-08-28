/**
 * 运行时单实例门面（src/core/runtime.js）测试
 *
 * 覆盖：
 * - 未注入时回退到构建解析到的实例
 * - 注入后所有 API 走注入实例，并在注入的 Vue 上幂等 use(compositionApi)
 * - onRuntimeReady 的「立即执行 / 排队等待注入」两种时序
 */
const mockFallbackRef = jest.fn((v) => ({ from: 'fallback', value: v }));
const mockFallbackComputed = jest.fn((fn) => ({ from: 'fallback', fn }));
const mockFallbackDefineComponent = jest.fn((o) => o);
const mockFallbackGetCurrentInstance = jest.fn(() => ({ from: 'fallback' }));

jest.mock(
  'vue',
  // CJS 形态（与 vue2 的 dist/vue.runtime.common.js 一致：module.exports = Vue）
  () => ({ tag: 'fallback-vue', use: jest.fn() }),
  { virtual: true }
);

jest.mock(
  '@vue/composition-api/dist/vue-composition-api.common.js',
  // CJS 具名导出形态（与该包 common 产物一致）
  () => ({
    ref: (v) => mockFallbackRef(v),
    computed: (fn) => mockFallbackComputed(fn),
    defineComponent: (o) => mockFallbackDefineComponent(o),
    getCurrentInstance: () => mockFallbackGetCurrentInstance(),
  }),
  { virtual: true }
);

describe('runtime facade（src/core/runtime.js）', () => {
  beforeEach(() => {
    jest.resetModules();
    mockFallbackRef.mockClear();
    mockFallbackComputed.mockClear();
    mockFallbackDefineComponent.mockClear();
    mockFallbackGetCurrentInstance.mockClear();
  });

  it('未注入时：API 回退到构建解析到的实例，isRuntimeInjected 为 false', () => {
    const rt = require('@/core/runtime');

    expect(rt.isRuntimeInjected()).toBe(false);
    expect(rt.getVue().tag).toBe('fallback-vue');

    const r = rt.ref('a');
    expect(mockFallbackRef).toHaveBeenCalledWith('a');
    expect(r).toEqual({ from: 'fallback', value: 'a' });

    rt.computed(() => 1);
    expect(mockFallbackComputed).toHaveBeenCalled();
  });

  it('注入后：所有 API 走注入实例，且幂等在注入的 Vue 上 use(compositionApi)', () => {
    const rt = require('@/core/runtime');

    const injectedRef = jest.fn((v) => ({ from: 'injected', value: v }));
    const injectedApi = {
      ref: injectedRef,
      computed: jest.fn((fn) => ({ from: 'injected', fn })),
      defineComponent: jest.fn((o) => o),
      getCurrentInstance: jest.fn(() => ({ from: 'injected' })),
    };
    const injectedVue = { tag: 'injected-vue', use: jest.fn() };

    // 注入前先触发一次 fallback，验证注入后立刻切换
    rt.ref('before');
    expect(mockFallbackRef).toHaveBeenCalledWith('before');

    const ok = rt.installRuntime({ vue: injectedVue, compositionApi: injectedApi });
    expect(ok).toBe(true);
    expect(rt.isRuntimeInjected()).toBe(true);
    expect(injectedVue.use).toHaveBeenCalledWith(injectedApi);
    expect(rt.getVue()).toBe(injectedVue);

    const r = rt.ref('after');
    expect(injectedRef).toHaveBeenCalledWith('after');
    expect(r).toEqual({ from: 'injected', value: 'after' });

    rt.defineComponent({ name: 'X' });
    rt.getCurrentInstance();
    expect(injectedApi.defineComponent).toHaveBeenCalled();
    expect(injectedApi.getCurrentInstance).toHaveBeenCalled();
    // 注入后不再走 fallback
    expect(mockFallbackRef).toHaveBeenCalledTimes(1);
  });

  it('重复注入幂等，可只注入其中一项', () => {
    const rt = require('@/core/runtime');
    const api1 = { ref: jest.fn(() => ({})) };
    const api2 = { ref: jest.fn(() => ({})) };

    expect(rt.installRuntime({ compositionApi: api1 })).toBe(true);
    expect(rt.isRuntimeInjected()).toBe(true);
    rt.installRuntime({ compositionApi: api2 }); // 覆盖为最新注入
    rt.ref('x');
    expect(api2.ref).toHaveBeenCalledWith('x');
    expect(rt.installRuntime({})).toBe(false); // 空注入不改变状态
  });

  it('互操作兜底：fallback 模块为 ESM 形态（{ default: ... }）时自动解包', () => {
    jest.resetModules();
    jest.doMock(
      'vue',
      () => ({ __esModule: true, default: { tag: 'esm-fallback-vue', use: jest.fn() } }),
      { virtual: true }
    );
    jest.doMock(
      '@vue/composition-api/dist/vue-composition-api.common.js',
      () => ({ __esModule: true, default: { ref: jest.fn((v) => ({ from: 'esm', value: v })) } }),
      { virtual: true }
    );

    const rt = require('@/core/runtime');
    expect(rt.getVue().tag).toBe('esm-fallback-vue');
    expect(typeof rt.getCompositionApi().ref).toBe('function');
  });

  it('onRuntimeReady：注入前排队、注入时执行；注入后立即执行', () => {
    const rt = require('@/core/runtime');

    const queued = jest.fn();
    rt.onRuntimeReady(queued);
    expect(queued).not.toHaveBeenCalled(); // 未注入 → 排队

    const injectedVue = { tag: 'injected-vue', use: jest.fn() };
    rt.installRuntime({ vue: injectedVue, compositionApi: { ref: jest.fn() } });
    expect(queued).toHaveBeenCalledWith(injectedVue); // 注入后补执行

    const immediate = jest.fn();
    rt.onRuntimeReady(immediate);
    expect(immediate).toHaveBeenCalledWith(injectedVue); // 已注入 → 立即执行
  });
});
