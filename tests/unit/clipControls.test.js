/**
 * 尺寸锁开关与 mt/mb 可见性：mt/mb 的 getVisibility 始终由 clipEnabled 派生
 */
import { fabric } from 'fabric';
import '../../src/core/objects/CustomTextbox';

describe('尺寸锁与 mt/mb 可见性', () => {
  it('clip 关闭时 mt/mb 始终隐藏（无需 selection 事件）', () => {
    const tb = new fabric.Textbox('hello', { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: false });
    tb.syncFrame();
    // 直接读 Control.getVisibility（渲染路径即用此）
    expect(tb.controls.mt.getVisibility(tb)).toBe(false);
    expect(tb.controls.mb.getVisibility(tb)).toBe(false);
    // fabric 的 isControlVisible 也走 getVisibility
    expect(tb.isControlVisible('mt')).toBe(false);
    expect(tb.isControlVisible('mb')).toBe(false);
  });

  it('clip 开启时 mt/mb 显示', () => {
    const tb = new fabric.Textbox('hello', { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: true });
    tb.syncFrame();
    expect(tb.controls.mt.getVisibility(tb)).toBe(true);
    expect(tb.controls.mb.getVisibility(tb)).toBe(true);
    expect(tb.isControlVisible('mt')).toBe(true);
    expect(tb.isControlVisible('mb')).toBe(true);
  });

  it('开关切换即时生效（不依赖重新选中）', () => {
    const tb = new fabric.Textbox('hello', { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: true });
    tb.syncFrame();
    expect(tb.controls.mt.getVisibility(tb)).toBe(true);
    // 模拟面板关锁
    tb.set({ clipEnabled: false });
    tb.syncFrame();
    expect(tb.controls.mt.getVisibility(tb)).toBe(false);
    expect(tb.controls.mb.getVisibility(tb)).toBe(false);
  });

  it('其它手柄（角点/左右/旋转）不受影响', () => {
    const tb = new fabric.Textbox('hello', { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: false });
    expect(tb.controls.tl.getVisibility(tb)).toBe(true);
    expect(tb.controls.br.getVisibility(tb)).toBe(true);
    expect(tb.controls.ml.getVisibility(tb)).toBe(true);
    expect(tb.controls.mtr.getVisibility(tb)).toBe(true);
  });
});
