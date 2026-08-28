/**
 * 全局注册点走 runtime 门面的冒烟测试
 *
 * 覆盖两个「模块加载期在 Vue 上做全局注册」的位置：
 * - src/lib/i18n.js      → Vue.use(VueI18n)
 * - src/language/index.js → Vue.use(VueI18n)
 *
 * 断言：
 * 1. 未注入时注册到 fallback Vue（历史行为不变）；
 * 2. installRuntime 晚于模块加载时，会通过 onRuntimeReady 在注入的 Vue 上「补注册」。
 */
// 注：view-design 的语言包在模块加载期会访问 Vue.prototype.$isServer，mock 需具备 prototype
const mockFallbackVue = { tag: 'fallback-vue', use: jest.fn(), prototype: {} };
// 最小 vue-i18n stub：可 new（实例有 t），且带 install 供 Vue.use 使用
const mockVueI18n = function VueI18nStub(options) {
  this.options = options || {};
};
mockVueI18n.prototype.t = function (key) {
  return String(key);
};
mockVueI18n.install = jest.fn();

jest.mock('vue', () => mockFallbackVue, { virtual: true });
jest.mock('vue-i18n', () => ({ __esModule: true, default: mockVueI18n }), { virtual: true });
jest.mock(
  '@vue/composition-api/dist/vue-composition-api.common.js',
  () => ({ ref: jest.fn((v) => v) }),
  { virtual: true }
);

describe('全局注册点：VueI18n 走 runtime 门面', () => {
  beforeAll(() => {
    // language/index.js 通过 @/utils/local 读写 localStorage（node 环境下补上）
    global.localStorage = {
      _data: {},
      getItem(k) {
        return this._data[k] === undefined ? null : this._data[k];
      },
      setItem(k, v) {
        this._data[k] = String(v);
      },
      removeItem(k) {
        delete this._data[k];
      },
      clear() {
        this._data = {};
      },
    };
  });

  beforeEach(() => {
    jest.resetModules();
    mockFallbackVue.use.mockClear();
  });

  it('src/lib/i18n.js：未注入时注册到 fallback Vue', () => {
    const mod = require('@/lib/i18n');
    expect(typeof mod.createI18n).toBe('function');
    expect(typeof mod.messages).toBe('object');
    // Vue.use(VueI18n) 已执行（fallback Vue 的 use 被调用）
    expect(mockFallbackVue.use).toHaveBeenCalled();
  });

  it('src/language/index.js：未注入时注册到 fallback Vue，且导出可用 i18n 实例', () => {
    const mod = require('@/language');
    expect(mockFallbackVue.use).toHaveBeenCalled();
    expect(typeof mod.t).toBe('function');
    expect(typeof mod.t('save.submit')).toBe('string');
  });

  it('注入晚于模块加载：通过 onRuntimeReady 在注入的 Vue 上补注册', () => {
    // 先加载模块（此时尚未注入 → 注册到 fallback）
    require('@/lib/i18n');
    const fallbackUseCalls = mockFallbackVue.use.mock.calls.length;
    expect(fallbackUseCalls).toBeGreaterThan(0);

    // 再注入（模拟消费方 main.js 调用 installRuntime）
    const rt = require('@/core/runtime');
    const injectedVue = { tag: 'injected-vue', use: jest.fn(), prototype: {} };
    rt.installRuntime({ vue: injectedVue, compositionApi: { ref: jest.fn() } });

    // 补注册发生在注入的 Vue 上
    expect(injectedVue.use).toHaveBeenCalled();
  });
});
