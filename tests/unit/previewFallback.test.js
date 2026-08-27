/**
 * img→canvas 导出失败回退（previewFallback.js）回归
 *
 * 场景：CDN 未放行 CORS（如 OSS 域名白名单不含当前页面域）→ resilient 加载回退
 * 无 crossOrigin 保显示 → 画布被污染 → ServersPlugin.preview 的 toDataURL 抛
 * SecurityError 兜底 resolve(null)。img 模式若不回退，posterSrc 恒空、spinner 永转。
 * 另有真实时序：renderer-error（TAINTED，无尺寸）先于 preview resolve 到达，
 * 随后 preview_null 携真实尺寸须补齐 fit 态（canvasRatio/canvasReady），否则 spinner 卡住。
 *
 * 组件（LegacyFabricRenderer.vue，SFC）在 jest 中不可挂载，此处直接回归
 * 组件消费的纯语义内核：状态迁移 + 事件序列。
 */
import {
  enterPreviewFallback,
  isTaintedError,
} from '../../src/examples/smart-poster/legacy/previewFallback';

const FRESH = () => ({ exportFailed: false, canvasRatio: null, canvasReady: false });

describe('previewFallback：img 导出失败 → canvas 直显', () => {
  it('首次 preview 返回 null（preview_null）：置回退态 + 记录比例 + preview-fail/render 事件', () => {
    const { state, emits } = enterPreviewFallback(FRESH(), {
      w: 1080,
      h: 1440,
      core: {},
      reason: 'preview_null',
    });

    expect(state).toEqual({
      exportFailed: true,
      canvasRatio: '1080 / 1440',
      canvasReady: true,
    });
    expect(emits).toHaveLength(2);
    expect(emits[0].name).toBe('preview-fail');
    expect(emits[0].args).toEqual([{ core: {}, code: 'CANVAS_TAINTED', reason: 'preview_null' }]);
    expect(emits[1]).toEqual({ name: 'render', args: [null, { width: 1080, height: 1440 }] });
  });

  it('异常路径无尺寸（renderer_error，渲染完成前即污染）：置回退态但不写 aspectRatio', () => {
    const { state, emits } = enterPreviewFallback(FRESH(), { reason: 'renderer_error' });
    expect(state).toEqual({ exportFailed: true });
    expect(state.canvasReady).toBeUndefined();
    expect(emits[0].args[0].code).toBe('CANVAS_TAINTED');
    expect(emits[1].args).toEqual([null, { width: 0, height: 0 }]);
  });

  it('已处于回退态：仅再发 render 通知，不重复 preview-fail（fit 值不变）', () => {
    const prev = { exportFailed: true, canvasRatio: '750 / 1334', canvasReady: true };
    const { state, emits } = enterPreviewFallback(prev, {
      w: 750,
      h: 1334,
      reason: 'preview_null',
    });
    expect(state).toEqual({ canvasRatio: '750 / 1334', canvasReady: true });
    expect(emits).toHaveLength(1);
    expect(emits[0].name).toBe('render');
  });

  it('时序：renderer_error 先入回退（无尺寸），随后 preview_null 携真实尺寸须补齐 fit 态（否则 spinner 卡住）', () => {
    // 1) preview 调用瞬间 renderer-error 到达：置回退态，无比例/ready
    const r1 = enterPreviewFallback(FRESH(), { reason: 'renderer_error' });
    expect(r1.state).toEqual({ exportFailed: true });
    expect(r1.state.canvasReady).toBeUndefined();
    // 2) preview resolve null 再入回退（这次知道画布尺寸）：补齐 ratio/ready，不重复通知
    const prev = { ...FRESH(), ...r1.state };
    const r2 = enterPreviewFallback(prev, { w: 1080, h: 1440, reason: 'preview_null' });
    expect(r2.state).toEqual({ canvasRatio: '1080 / 1440', canvasReady: true });
    expect(r2.emits).toHaveLength(1);
    expect(r2.emits[0].name).toBe('render');
  });

  it('isTaintedError：仅识别 CANVAS_TAINTED', () => {
    expect(isTaintedError('CANVAS_TAINTED')).toBe(true);
    expect(isTaintedError(undefined)).toBe(false);
    expect(isTaintedError('OTHER')).toBe(false);
  });
});
