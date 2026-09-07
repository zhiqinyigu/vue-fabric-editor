/**
 * stylesCompat 补丁回归
 * 复现部署环境的 stylesToArray 崩溃：
 * 精简 JSON 剔除 styles: [] 后，fabric IText.fromObject 会把 styles 透传为 undefined，
 * 后续 toObject（ctrl+v 克隆 / 保存 / 导出）在 stylesToArray(undefined) 处抛
 * "Cannot read properties of undefined (reading '0')"。
 * stylesCompat 在 fabric.util 层把 styles null/undefined 兜底为 {} / []。
 */
import { fabric } from 'fabric';
import '../../src/core/objects/stylesCompat';
// _historyNext 由 fabric-history 挂到 Canvas 原型，这里需要完整链路验证序列化兜底
import '../../src/core/utils/fabric-history';

// 无需真实 canvas，仅测序列化链路
describe('stylesCompat 兜底', () => {
  it('stylesFromArray(null/undefined) -> {}', () => {
    expect(fabric.util.stylesFromArray(null, 'abc')).toEqual({});
    expect(fabric.util.stylesFromArray(undefined, 'abc')).toEqual({});
  });

  it('stylesToArray(null/undefined) -> []', () => {
    expect(fabric.util.stylesToArray(null, 'abc')).toEqual([]);
    expect(fabric.util.stylesToArray(undefined, 'abc')).toEqual([]);
  });

  it('补丁在位标记可被运行时/诊断日志探测', () => {
    expect(fabric.util[Symbol.for('vfe.stylesCompatInstalled')]).toBe(true);
  });

  it('历史快照链路：画布含 styles undefined 的文本对象时 _historyNext 不崩（诊断 try/catch 透传原语义）', (done) => {
    // 构造一个 styles 被外力置为 undefined 的 i-text（模拟"精简 JSON 加载后未走兜底"的最坏场景）
    fabric.IText.fromObject(
      { type: 'i-text', version: '5.3.0', text: 't', left: 0, top: 0, width: 10 },
      (instance) => {
        delete instance.styles;
        const canvas = new fabric.Canvas(document.createElement('canvas'), {
          selection: false,
          skipTargetFind: true,
        });
        canvas.add(instance);
        let json;
        expect(() => {
          json = canvas._historyNext();
        }).not.toThrow();
        expect(JSON.parse(json).objects[0].styles).toEqual([]);
        canvas.dispose();
        done();
      }
    );
  });

  it('正常 styles 仍走原逻辑（非空对象按范围序列化）', () => {
    const styles = { 0: { 0: { fontSize: 30 } } };
    const arr = fabric.util.stylesToArray(styles, 'ab');
    expect(Array.isArray(arr)).toBe(true);
    expect(arr).toHaveLength(1);
    expect(arr[0]).toMatchObject({ start: 0, end: 1, style: { fontSize: 30 } });
  });

  it('IText.fromObject（无 styles 字段）：实例 styles 为对象而非 undefined，toObject 不抛错', (done) => {
    const serialized = {
      type: 'i-text',
      version: '5.3.0',
      text: 'hello',
      left: 0,
      top: 0,
      width: 100,
    };
    fabric.IText.fromObject(serialized, (instance) => {
      expect(instance.styles).toEqual({});
      expect(() => instance.toObject()).not.toThrow();
      done();
    });
  });

  it('IText.fromObject（styles: null 存量数据）：同样兜底，toObject 不抛错', (done) => {
    const serialized = {
      type: 'i-text',
      version: '5.3.0',
      text: 'hi',
      left: 0,
      top: 0,
      width: 100,
      styles: null,
    };
    fabric.IText.fromObject(serialized, (instance) => {
      expect(instance.styles).toEqual({});
      expect(() => instance.toObject()).not.toThrow();
      done();
    });
  });
});
