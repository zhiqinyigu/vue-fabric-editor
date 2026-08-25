import HistoryPlugin from '@/core/plugin/HistoryPlugin';

describe('HistoryPlugin allowClose', () => {
  const addSpy = jest.spyOn(window, 'addEventListener');
  const removeSpy = jest.spyOn(window, 'removeEventListener');

  const createPlugin = () =>
    new HistoryPlugin({ on: jest.fn() }, { getJson: () => '{}', emit: jest.fn() });

  beforeEach(() => {
    addSpy.mockClear();
    removeSpy.mockClear();
  });

  it('init 时注册 beforeunload 防丢守卫', () => {
    createPlugin();
    const call = addSpy.mock.calls.find(([type]) => type === 'beforeunload');
    expect(call).toBeTruthy();
    expect(typeof call[1]).toBe('function');
  });

  it('allowClose 移除守卫且重复调用安全', () => {
    const plugin = createPlugin();
    const handler = addSpy.mock.calls.find(([type]) => type === 'beforeunload')[1];

    plugin.allowClose();
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', handler);

    // 重复调用不应再触发 removeEventListener（句柄已清空）
    removeSpy.mockClear();
    plugin.allowClose();
    expect(removeSpy).not.toHaveBeenCalled();
  });
});
