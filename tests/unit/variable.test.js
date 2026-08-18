/**
 * 模板变量回归测试
 * 1) 扁平测试数据映射表（完整路径作顶层 key）取值：{{user.name}}
 * 2) 变量图片序列化输出变量 URL（而非占位图 base64），且加载/克隆不丢对象
 * 3) 变量图片预览：真实图缩放到占位框当前显示尺寸（改 scale），退出预览还原 transform
 */
import { fabric } from 'fabric';
import {
  render,
  getValueByPath,
  containsVariable,
  renderObjects,
  extractVariables,
  getVariableFieldOfObject,
} from '../../src/core/variableEngine';
import VariablePlugin from '../../src/core/plugin/VariablePlugin';

const VAR_URL = 'https://cdn.example.com/avatar/{{user.avatar}}';

function makeImageElement(src) {
  const el = document.createElement('img');
  Object.defineProperty(el, 'src', { value: src, writable: true, configurable: true });
  Object.defineProperty(el, 'width', { value: 240, writable: true, configurable: true });
  Object.defineProperty(el, 'height', { value: 160, writable: true, configurable: true });
  Object.defineProperty(el, 'naturalWidth', { value: 240, writable: true, configurable: true });
  Object.defineProperty(el, 'naturalHeight', { value: 160, writable: true, configurable: true });
  Object.defineProperty(el, 'complete', { value: true, writable: true, configurable: true });
  return el;
}

// mock loadImage：占位图 dataURL / 任意 URL 都返回成功元素（jsdom 无法解码图片）
function mockLoadImage() {
  return jest.spyOn(fabric.util, 'loadImage').mockImplementation((url, cb, thisArg) => {
    cb.call(thisArg, makeImageElement(url), false);
  });
}

function createPlugin() {
  const canvasMock = {
    on: () => {},
    off: () => {},
    getObjects: () => [],
    requestRenderAll: () => {},
  };
  const editorMock = {
    emit: () => {},
    getPlugin: () => null,
  };
  return new VariablePlugin(canvasMock, editorMock);
}

describe('getValueByPath：扁平测试数据映射表（issue: user.name 识别为空）', () => {
  it('完整路径作为顶层 key 时能取到值', () => {
    const data = { 'user.name': '张三', businessName: '小店', 'user.id': 'c0036d7d' };
    expect(getValueByPath(data, 'user.name')).toBe('张三');
    expect(getValueByPath(data, 'businessName')).toBe('小店');
    expect(getValueByPath(data, 'user.id')).toBe('c0036d7d');
  });

  it('嵌套对象仍按点路径取值', () => {
    const data = { user: { name: '李四' }, businessName: '大店' };
    expect(getValueByPath(data, 'user.name')).toBe('李四');
    expect(getValueByPath(data, 'businessName')).toBe('大店');
  });

  it('render 扁平映射表：昨日，{{user.name}}购买了{{businessName}}', () => {
    const text = '昨日，{{user.name}}购买了{{businessName}}';
    const data = { 'user.name': '张三', businessName: '小店' };
    expect(render(text, data)).toBe('昨日，张三购买了小店');
  });

  it('render 嵌套数据 + 缺失变量兜底空串', () => {
    expect(render('{{user.name}}-{{missing}}', { user: { name: '李四' } })).toBe('李四-');
  });

  it('renderObjects 同样支持扁平映射表', () => {
    const json = { objects: [{ type: 'textbox', text: '万事大吉{{user.name}}' }] };
    const out = renderObjects(json, { 'user.name': '222222222' });
    expect(out.objects[0].text).toBe('万事大吉222222222');
  });
});

describe('变量图片序列化：保存变量 URL 而非 base64', () => {
  let loadImageSpy;
  let plugin;

  beforeEach(() => {
    loadImageSpy = mockLoadImage();
    plugin = createPlugin();
  });
  afterEach(() => {
    loadImageSpy.mockRestore();
  });

  it('createVariableImage 后 toObject 输出变量 URL，而非占位图 dataURL', async () => {
    const img = await plugin.createVariableImage(VAR_URL);
    expect(img.get('isVariableImage')).toBe(true);
    expect(img.get('src')).toBe(VAR_URL);
    expect(containsVariable(img.toObject().src)).toBe(true);
    expect(img.toObject().src).toBe(VAR_URL);
    expect(img.toObject().src).not.toMatch(/^data:/);
  });

  it('fromObject 加载变量图片不丢对象，并还原 src 与 getSrc 补丁', (done) => {
    fabric.Image.fromObject(
      { type: 'image', src: VAR_URL, isVariableImage: true },
      (img, isError) => {
        expect(isError).toBe(false);
        expect(img).toBeTruthy();
        expect(img.get('src')).toBe(VAR_URL);
        expect(img.toObject().src).toBe(VAR_URL);
        expect(img.toObject().src).not.toMatch(/^data:/);
        done();
      }
    );
  });

  it('fromObject 加载普通图片走原逻辑（不受影响）', (done) => {
    const URL = 'https://cdn.example.com/normal.png';
    fabric.Image.fromObject({ type: 'image', src: URL }, (img, isError) => {
      expect(isError).toBe(false);
      expect(img.get('isVariableImage')).not.toBe(true);
      expect(img.toObject().src).toBe(URL);
      done();
    });
  });

  it('clone 变量图片不崩溃且保留变量链接', (done) => {
    plugin.createVariableImage(VAR_URL).then((img) => {
      img.clone(
        (cloned) => {
          expect(cloned).toBeTruthy();
          expect(cloned.get('isVariableImage')).toBe(true);
          expect(cloned.get('src')).toBe(VAR_URL);
          expect(cloned.toObject().src).toBe(VAR_URL);
          done();
        },
        ['isVariableImage']
      );
    });
  });
});

describe('变量图片地址编辑（updateVariableImage）：属性面板"网络图片地址"入口', () => {
  let loadImageSpy;
  let plugin;

  beforeEach(() => {
    loadImageSpy = mockLoadImage();
    plugin = createPlugin();
  });
  afterEach(() => {
    loadImageSpy.mockRestore();
  });

  it('变量 URL -> 变量 URL：更新 src 并重建占位图，保持版位与变量标记', (done) => {
    plugin.createVariableImage(VAR_URL).then((img) => {
      img.set({ left: 10, top: 20 });
      const NEW = 'https://cdn.example.com/banner/{{banner.url}}';
      plugin.updateVariableImage(img, NEW).then((out) => {
        expect(out).toBe(img);
        expect(img.get('src')).toBe(NEW);
        expect(img.get('isVariableImage')).toBe(true);
        // 序列化仍输出变量 URL（而非占位图 dataURL）
        expect(img.toObject().src).toBe(NEW);
        expect(img.toObject().src).not.toMatch(/^data:/);
        // 版位不变：占位图按原尺寸展示
        expect(img.left).toBe(10);
        expect(img.top).toBe(20);
        expect(img.width).toBe(240);
        expect(img.height).toBe(160);
        done();
      });
    });
  });

  it('变量图片改为普通 URL：清除变量标记并按版位比例加载真实图', (done) => {
    plugin.createVariableImage(VAR_URL).then((img) => {
      img.set({ left: 10, top: 20, scaleX: 1, scaleY: 1 });
      const REAL = 'https://cdn.example.com/real.png';
      plugin.updateVariableImage(img, REAL).then((out) => {
        expect(out).toBeTruthy();
        expect(out.get('src')).toBe(REAL);
        expect(out.get('isVariableImage')).not.toBe(true);
        expect(out.toObject().src).toBe(REAL);
        expect(out.toObject().src).not.toMatch(/^data:/);
        // 真实图（240x160）按原版位比例缩放后显示尺寸不变
        expect(out.getScaledWidth()).toBeCloseTo(240);
        expect(out.getScaledHeight()).toBeCloseTo(160);
        done();
      });
    });
  });

  it('非图片对象调用 updateVariableImage 直接拒绝', async () => {
    const textbox = new fabric.Textbox('hello', {});
    await expect(plugin.updateVariableImage(textbox, VAR_URL)).rejects.toThrow('非图片对象');
  });
});

describe('变量图片预览：真实图缩放到占位框显示尺寸（改 scale）', () => {
  let loadImageSpy;
  let plugin;

  // 让 mock 返回 768x1366 竖图（模拟 bing 每日壁纸）；占位图（dataURL）仍返回 240x160
  function mockPortraitImage() {
    loadImageSpy.mockImplementation((url, cb, thisArg) => {
      const isPlaceholder = typeof url === 'string' && url.startsWith('data:');
      const el = makeImageElement(url);
      if (!isPlaceholder) {
        Object.defineProperty(el, 'width', { value: 768, writable: true, configurable: true });
        Object.defineProperty(el, 'height', { value: 1366, writable: true, configurable: true });
        Object.defineProperty(el, 'naturalWidth', { value: 768, writable: true, configurable: true });
        Object.defineProperty(el, 'naturalHeight', { value: 1366, writable: true, configurable: true });
      }
      cb.call(thisArg, el, false);
    });
  }

  beforeEach(() => {
    loadImageSpy = mockLoadImage();
    plugin = createPlugin();
  });
  afterEach(() => {
    loadImageSpy.mockRestore();
  });

  it('预览真实竖图时缩放到占位框尺寸（240x160），left/top 不变', (done) => {
    mockPortraitImage();
    plugin.createVariableImage(VAR_URL).then((img) => {
      const original = {
        left: img.left,
        top: img.top,
        scaleX: img.scaleX,
        scaleY: img.scaleY,
        width: img.width,
        height: img.height,
      };
      // 原占位图 240x160（横框），真实图为 768x1366（竖图）
      expect(original.width).toBe(240);
      expect(original.height).toBe(160);

      plugin._reloadImageSrc(img, 'https://cdn.example.com/real.png', original);

      // setElement 后 width/height 变为真实图 natural 尺寸，scale 缩放到版位尺寸
      expect(img.width).toBe(768);
      expect(img.height).toBe(1366);
      expect(img.scaleX).toBeCloseTo(240 / 768);
      expect(img.scaleY).toBeCloseTo(160 / 1366);
      // 显示尺寸 = 占位框 240x160（真实图按模板版位缩放）
      expect(img.getScaledWidth()).toBeCloseTo(240);
      expect(img.getScaledHeight()).toBeCloseTo(160);
      // left/top 不变：版位左上角不动
      expect(img.left).toBe(original.left);
      expect(img.top).toBe(original.top);
      done();
    });
  });

  it('退出预览后还原原始 transform，不污染模板尺寸', (done) => {
    mockPortraitImage();
    plugin.createVariableImage(VAR_URL).then((img) => {
      const original = {
        left: img.left,
        top: img.top,
        scaleX: img.scaleX,
        scaleY: img.scaleY,
        width: img.width,
        height: img.height,
      };
      // 预览：缩放到版位尺寸（240x160）
      plugin._reloadImageSrc(img, 'https://cdn.example.com/real.png', original);
      expect(img.getScaledWidth()).toBeCloseTo(240);
      expect(img.getScaledHeight()).toBeCloseTo(160);

      // 模拟 _applySnapshot(false)：先恢复原始 transform
      img.set(original);
      expect(img.left).toBe(original.left);
      expect(img.top).toBe(original.top);
      expect(img.width).toBe(240);
      expect(img.height).toBe(160);
      expect(img.scaleX).toBe(1);
      expect(img.scaleY).toBe(1);
      done();
    });
  });

  it('占位图（含变量的 src）仍按原尺寸展示，不走等比缩放', (done) => {
    plugin.createVariableImage(VAR_URL).then((img) => {
      const original = {
        left: img.left,
        top: img.top,
        scaleX: img.scaleX,
        scaleY: img.scaleY,
        width: img.width,
        height: img.height,
      };
      // 传入的 src 仍含变量 -> 加载占位图 -> 保持 240x160
      plugin._reloadImageSrc(img, VAR_URL, original);
      expect(img.width).toBe(240);
      expect(img.height).toBe(160);
      expect(img.scaleX).toBe(1);
      expect(img.scaleY).toBe(1);
      expect(img.left).toBe(original.left);
      expect(img.top).toBe(original.top);
      done();
    });
  });

  it('预览真实图时阴影反缩放补偿（与占位图阴影一致），退出预览还原', (done) => {
    mockPortraitImage();
    plugin.createVariableImage(VAR_URL).then((img) => {
      const original = {
        left: img.left,
        top: img.top,
        scaleX: img.scaleX,
        scaleY: img.scaleY,
        width: img.width,
        height: img.height,
      };
      // 占位图（scale=1）设置阴影：blur=20, offset=(10,10)
      img.set('shadow', new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: 20, offsetX: 10, offsetY: 10 }));
      const shadow = img.shadow;
      // fabric _setShadow：shadowBlur ∝ (scaleX+scaleY)/4、offset ∝ scale。
      // 真实图 scale 缩至 (240/768, 160/1366)，补偿因子使渲染后阴影 = 占位图编辑态阴影。
      const blurFactor = (1 + 1) / (240 / 768 + 160 / 1366);
      const expectedBlur = 20 * blurFactor;
      const expectedOffsetX = 10 / (240 / 768);
      const expectedOffsetY = 10 / (160 / 1366);

      // 预览真实图：shadow 被反缩放补偿（放大）
      plugin._reloadImageSrc(img, 'https://cdn.example.com/real.png', original);
      expect(img.scaleX).toBeCloseTo(240 / 768);
      expect(img.scaleY).toBeCloseTo(160 / 1366);
      expect(shadow.blur).toBeCloseTo(expectedBlur, 5);
      expect(shadow.offsetX).toBeCloseTo(expectedOffsetX, 5);
      expect(shadow.offsetY).toBeCloseTo(expectedOffsetY, 5);

      // 再次预览刷新：基于原始值重算，不累积放大
      plugin._reloadImageSrc(img, 'https://cdn.example.com/real2.png', original);
      expect(shadow.blur).toBeCloseTo(expectedBlur, 5);
      expect(shadow.offsetX).toBeCloseTo(expectedOffsetX, 5);
      expect(shadow.offsetY).toBeCloseTo(expectedOffsetY, 5);

      // 退出预览（恢复占位图）：还原原始 shadow 配置，不污染模板
      plugin._reloadImageSrc(img, VAR_URL, original);
      expect(shadow.blur).toBe(20);
      expect(shadow.offsetX).toBe(10);
      expect(shadow.offsetY).toBe(10);
      expect(img._previewShadow).toBeNull();
      done();
    });
  });

  it('预览真实图时 clipPath 裁切框按新 scale 换算（位置/大小与占位图一致），退出预览还原', (done) => {
    mockPortraitImage();
    plugin.createVariableImage(VAR_URL).then((img) => {
      const original = {
        left: img.left,
        top: img.top,
        scaleX: img.scaleX,
        scaleY: img.scaleY,
        width: img.width,
        height: img.height,
      };
      // 模拟 SimpleClipImagePlugin.correctPosition 输出：占位图 scale=1 时
      // clip 以"对象局部坐标 + 1/scale 补偿"定义（absolutePositioned:false）
      const clip = new fabric.Rect({
        absolutePositioned: false,
        width: 120,
        height: 80,
        left: 60,
        top: 40,
        scaleX: 1,
        scaleY: 1,
        originX: 'center',
        originY: 'center',
      });
      img.set('clipPath', clip);
      // 组合矩阵 = 对象变换 × clip 变换（fabric 渲染 clip 的坐标系）
      const comboOf = () =>
        fabric.util.multiplyTransformMatrices(img.calcTransformMatrix(), clip.calcTransformMatrix());
      // 占位图基线（scale=1）
      const baseCombo = comboOf();
      const baseObjCx = img.left + img.width / 2;
      const baseObjCy = img.top + img.height / 2;
      const baseOffsetX = baseCombo[4] - baseObjCx;
      const baseOffsetY = baseCombo[5] - baseObjCy;
      const baseW = clip.width * baseCombo[0];
      const baseH = clip.height * baseCombo[3];

      // 预览真实图：对象 scale 从 1 -> (240/768, 160/1366)，clip 反缩放换算
      plugin._reloadImageSrc(img, 'https://cdn.example.com/real.png', original);
      const kx = 1 / (240 / 768);
      const ky = 1 / (160 / 1366);
      expect(img.scaleX).toBeCloseTo(240 / 768);
      expect(img.scaleY).toBeCloseTo(160 / 1366);
      expect(clip.left).toBeCloseTo(60 * kx);
      expect(clip.top).toBeCloseTo(40 * ky);
      expect(clip.scaleX).toBeCloseTo(kx);
      expect(clip.scaleY).toBeCloseTo(ky);
      // 组合矩阵验证：裁切框中心相对对象中心偏移、显示尺寸与占位图一致
      const curCombo = comboOf();
      const curObjCx = img.left + (img.width * img.scaleX) / 2;
      const curObjCy = img.top + (img.height * img.scaleY) / 2;
      expect(curCombo[4] - curObjCx).toBeCloseTo(baseOffsetX);
      expect(curCombo[5] - curObjCy).toBeCloseTo(baseOffsetY);
      expect(clip.width * curCombo[0]).toBeCloseTo(baseW);
      expect(clip.height * curCombo[3]).toBeCloseTo(baseH);

      // 再次预览刷新：基于原始值重算，不累积
      plugin._reloadImageSrc(img, 'https://cdn.example.com/real2.png', original);
      expect(clip.left).toBeCloseTo(60 * kx);
      expect(clip.top).toBeCloseTo(40 * ky);
      expect(clip.scaleX).toBeCloseTo(kx);
      expect(clip.scaleY).toBeCloseTo(ky);

      // 模拟真实渲染时序：预览画面已渲染，dirty 被消费、对象缓存为"预览态画面"
      // （带 clipPath 的对象 needsItsOwnCache 恒为 true，走自身 _cacheCanvas）
      img.dirty = false;
      img._cacheCanvas = { width: 10, height: 10 };
      // 退出预览（恢复占位图）：还原 clipPath 原始配置，不污染模板
      plugin._reloadImageSrc(img, VAR_URL, original);
      expect(clip.left).toBe(60);
      expect(clip.top).toBe(40);
      expect(clip.scaleX).toBe(1);
      expect(clip.scaleY).toBe(1);
      expect(img._previewClip).toBeNull();
      // 关键回归：setElement 不清对象 _cacheCanvas，若此处未强制 dirty，
      // 画布会直接绘制预览期旧缓存（仍显示测试图、裁切错位）——必须为 true
      expect(img.dirty).toBe(true);
      done();
    });
  });

  it('占位图 element 缓存就绪时退出预览同步恢复，不闪测试图（跳过异步加载）', (done) => {
    plugin.createVariableImage(VAR_URL).then((img) => {
      const original = {
        left: img.left,
        top: img.top,
        scaleX: img.scaleX,
        scaleY: img.scaleY,
        width: img.width,
        height: img.height,
      };
      // 预览：真实图替换占位图（mock loadImage 同步回调），按版位缩放
      plugin._reloadImageSrc(img, 'https://cdn.example.com/real.png', original);
      expect(img._element.src).toContain('real.png');
      expect(img.getScaledWidth()).toBeCloseTo(240);
      expect(img.getScaledHeight()).toBeCloseTo(160);

      // 模拟真实渲染时序：预览画面已渲染，dirty 被消费、对象缓存为"预览态画面"
      img.dirty = false;
      img._cacheCanvas = { width: 10, height: 10 };
      // 占位图 element 缓存已就绪（enterPreview 预热完成）
      const cachedEl = makeImageElement(plugin._makePlaceholder());
      plugin._placeholderEl = cachedEl;
      const loadCallsBefore = loadImageSpy.mock.calls.length;
      const setElementSpy = jest.spyOn(img, 'setElement');

      // 退出预览：走同步恢复分支，不再发起异步 loadImage
      plugin._reloadImageSrc(img, VAR_URL, original);

      // element 立刻换成缓存占位图（而非先渲染测试图再等异步替换）
      expect(setElementSpy).toHaveBeenCalledWith(cachedEl);
      expect(img._element).toBe(cachedEl);
      // 未发起新的异步加载：退出瞬间不会出现"测试图 × 占位图 transform"中间帧
      expect(loadImageSpy.mock.calls.length).toBe(loadCallsBefore);
      // 关键回归：setElement 不清对象 _cacheCanvas，必须强制 dirty 重建缓存
      expect(img.dirty).toBe(true);
      // transform 恢复：不污染模板
      expect(img.width).toBe(original.width);
      expect(img.height).toBe(original.height);
      expect(img.scaleX).toBe(1);
      expect(img.scaleY).toBe(1);
      expect(img.left).toBe(original.left);
      expect(img.top).toBe(original.top);
      // 占位叠加层重新打开、变量名重算
      expect(img.get('showPlaceholderText')).toBe(true);
      expect(img.get('variableLabel')).toBe('user.avatar');
      done();
    });
  });

  it('加载未完成时退出预览：在飞的预览图回调被丢弃，不覆盖编辑态占位图', (done) => {
    // VAR_URL 以 {{user.avatar}} 结尾：测试数据填文件名，渲染后为完整真实图 URL
    const REAL_IMG = 'https://cdn.example.com/avatar/real.png';
    plugin.createVariableImage(VAR_URL).then((img) => {
      const original = {
        left: img.left,
        top: img.top,
        scaleX: img.scaleX,
        scaleY: img.scaleY,
        width: img.width,
        height: img.height,
      };
      // 手动接管 loadImage：模拟真实浏览器"图片异步加载中"的状态
      const pending = [];
      loadImageSpy.mockImplementation((url, cb, thisArg) => {
        pending.push(() => cb.call(thisArg, makeImageElement(url), false));
      });
      plugin.canvas.getObjects = () => [img];
      plugin.canvas.discardActiveObject = () => {};
      plugin.setTestData({ 'user.avatar': 'real.png' });

      // 进入预览：预热占位图 + 加载预览真实图（均未回调）
      plugin.enterPreview();
      expect(pending.length).toBe(2);
      expect(img.get('src')).toBe(REAL_IMG);

      // 图片尚未加载完成就退出预览：src/transform 同步还原，占位图仍需异步加载
      plugin.exitPreview();
      expect(img.get('src')).toBe(VAR_URL);
      expect(pending.length).toBe(3);

      // 加载陆续完成：先占位图缓存预热（无令牌），再预览真实图（旧令牌 -> 过期）
      pending[0]();
      pending[1]();
      // 关键回归：过期回调不得把测试图写回已退出预览的对象
      expect(img._element.src).not.toContain('real.png');
      expect(img._element.src).toMatch(/^data:/);
      // 退出预览的还原结果保持：变量 URL + 原始 transform
      expect(img.get('src')).toBe(VAR_URL);
      expect(img.scaleX).toBe(original.scaleX);
      expect(img.scaleY).toBe(original.scaleY);
      expect(img.getScaledWidth()).toBeCloseTo(240);
      expect(img.getScaledHeight()).toBeCloseTo(160);

      // 退出预览时发起的占位图加载（当前令牌）正常生效
      pending[2]();
      expect(img._element.src).toMatch(/^data:/);
      expect(img.get('showPlaceholderText')).toBe(true);
      expect(img.get('variableLabel')).toBe('user.avatar');
      done();
    });
  });
});

describe('VariableImage 矢量叠加层：type 保持 image，任意缩放文字不变形（反缩放补偿）', () => {
  let loadImageSpy;
  let plugin;

  beforeEach(() => {
    loadImageSpy = mockLoadImage();
    plugin = createPlugin();
  });
  afterEach(() => {
    loadImageSpy.mockRestore();
  });

  // mock 渲染 ctx：记录 scale/font/fillText 等调用，验证反缩放补偿
  function makeMockCtx() {
    return {
      save: jest.fn(),
      restore: jest.fn(),
      scale: jest.fn(),
      transform: jest.fn(),
      translate: jest.fn(),
      rotate: jest.fn(),
      beginPath: jest.fn(),
      closePath: jest.fn(),
      clip: jest.fn(),
      setTransform: jest.fn(),
      setLineDash: jest.fn(),
      drawImage: jest.fn(),
      strokeRect: jest.fn(),
      fillRect: jest.fn(),
      fillText: jest.fn(),
      font: '',
      textAlign: '',
      textBaseline: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
    };
  }

  it('createVariableImage 返回 VariableImage 实例，type 保持 image', async () => {
    const img = await plugin.createVariableImage(VAR_URL);
    expect(img instanceof fabric.VariableImage).toBe(true);
    expect(img.type).toBe('image');
    expect(img.get('isVariableImage')).toBe(true);
    expect(img.get('showPlaceholderText')).toBe(true);
    expect(img.toObject().type).toBe('image');
    // 序列化 src 仍为变量 URL
    expect(img.toObject().src).toBe(VAR_URL);
  });

  it('等比缩放（2x）：反缩放 scale(1/2, 1/2)，字号按 85% 宽度动态计算，图标已移除', async () => {
    const img = await plugin.createVariableImage(VAR_URL);
    img.set({ scaleX: 2, scaleY: 2 });
    const ctx = makeMockCtx();
    img._render(ctx);
    expect(ctx.scale).toHaveBeenCalledWith(1 / 2, 1 / 2);
    // 动态字号：一行文字占显示宽度 85%。
    // mock 无 measureText，按 ASCII 0.55 估算：'user.avatar'=11 字符，基准宽度 16*0.55*11=96.8
    // 目标宽度 = 480*0.85 = 408 → 字号 = 16*408/96.8 ≈ 67.44（未触发高度上限 320*0.6=192）
    expect(parseFloat(ctx.font)).toBeCloseTo(67.44, 1);
    // 叠加层以对象中心为基准：边框贴显示边缘（-dw/2+2k, -dh/2+2k, dw-4k, dh-4k）
    expect(ctx.strokeRect).toHaveBeenCalledWith(-240 + 4, -160 + 4, 480 - 8, 320 - 8);
    // 图片 icon 已删除：叠加层不再绘制任何矩形填充
    expect(ctx.fillRect).not.toHaveBeenCalled();
    // 变量名水平垂直居中于对象中心
    const labelCall = ctx.fillText.mock.calls.find((args) => args[0] === 'user.avatar');
    expect(labelCall).toBeTruthy();
    expect(labelCall[1]).toBeCloseTo(0);
    expect(labelCall[2]).toBeCloseTo(0);
  });

  it('非等比缩放（scaleX=2, scaleY=0.5）：字号受高度上限 60% 约束，字形不被拉伸', async () => {
    const img = await plugin.createVariableImage(VAR_URL);
    img.set({ scaleX: 2, scaleY: 0.5 });
    const ctx = makeMockCtx();
    img._render(ctx);
    // 反缩放补偿：抵消对象缩放，文字在屏幕坐标系中绘制
    expect(ctx.scale).toHaveBeenCalledWith(1 / 2, 1 / 0.5);
    // 目标字号 67.44，但高度上限 dh*0.6 = 80*0.6 = 48 → 48px
    expect(parseFloat(ctx.font)).toBeCloseTo(48, 1);
    // 边框贴显示边缘：以对象中心为原点，不偏移到右下角
    expect(ctx.strokeRect).toHaveBeenCalledWith(-240 + 1, -40 + 1, 480 - 2, 80 - 2);
    // 图片 icon 已删除
    expect(ctx.fillRect).not.toHaveBeenCalled();
    // 变量名文本：水平垂直居中于对象中心
    const labelCall = ctx.fillText.mock.calls.find((args) => args[0] === 'user.avatar');
    expect(labelCall).toBeTruthy();
    expect(labelCall[1]).toBeCloseTo(0); // 水平居中（对象中心 x=0）
    expect(labelCall[2]).toBeCloseTo(0); // 垂直居中（对象中心 y=0）
  });

  it('普通图片改为变量 URL：就地挂载叠加层渲染（type 保持 image，不换对象）', (done) => {
    const plain = new fabric.Image(makeImageElement('https://cdn.example.com/normal.png'), {});
    plain.set({ left: 10, top: 20, width: 240, height: 160 });
    plugin.updateVariableImage(plain, VAR_URL).then((out) => {
      expect(out).toBe(plain);
      expect(plain.type).toBe('image');
      expect(plain._variableOverlayAttached).toBe(true);
      expect(plain.get('isVariableImage')).toBe(true);
      expect(plain.get('showPlaceholderText')).toBe(true);
      expect(plain.get('variableLabel')).toBe('user.avatar');
      expect(plain.toObject().src).toBe(VAR_URL);
      done();
    });
  });

  it('变量图改回普通 URL：关闭叠加层（showPlaceholderText=false）', (done) => {
    plugin.createVariableImage(VAR_URL).then((img) => {
      const REAL = 'https://cdn.example.com/real.png';
      plugin.updateVariableImage(img, REAL).then((out) => {
        expect(out.get('showPlaceholderText')).toBe(false);
        expect(out.get('isVariableImage')).not.toBe(true);
        expect(out.toObject().src).toBe(REAL);
        done();
      });
    });
  });

  it('预览加载真实图关闭叠加层，退出预览恢复占位图重新打开', (done) => {
    plugin.createVariableImage(VAR_URL).then((img) => {
      const original = { left: 10, top: 20, scaleX: 1, scaleY: 1, width: img.width, height: img.height };
      // 预览：加载真实图 → 关闭叠加层
      plugin._reloadImageSrc(img, 'https://cdn.example.com/real.png', original);
      expect(img.get('showPlaceholderText')).toBe(false);
      // 退出预览：加载占位图 → 重新打开叠加层
      plugin._reloadImageSrc(img, VAR_URL, original);
      expect(img.get('showPlaceholderText')).toBe(true);
      done();
    });
  });
});

describe('变量预览：进入预览锁定元素编辑，退出预览恢复交互', () => {
  it('enterPreview 锁定（不可选中/编辑/拖拽/缩放），exitPreview 恢复原交互属性', () => {
    const textbox = new fabric.Textbox('hello {{user.name}}', {
      left: 10,
      top: 20,
      selectable: true,
      evented: true,
      hasControls: true,
      editable: true,
    });
    const canvasMock = {
      on: jest.fn(),
      off: jest.fn(),
      getObjects: () => [textbox],
      requestRenderAll: () => {},
      discardActiveObject: () => {},
      selection: true,
      skipTargetFind: false,
      defaultCursor: 'default',
    };
    const contextMenuMock = { setEnabled: jest.fn(), hideAll: jest.fn() };
    const editorMock = { emit: () => {}, getPlugin: () => null, contextMenu: contextMenuMock };
    const p = new VariablePlugin(canvasMock, editorMock);

    p.enterPreview();
    expect(p.isPreviewing()).toBe(true);
    // 文本被渲染（锁定与渲染不冲突）
    expect(textbox.text).toBe('hello ');
    // 元素锁定：不可选中、不可交互、不可编辑、不可拖拽/旋转/缩放
    expect(textbox.selectable).toBe(false);
    expect(textbox.evented).toBe(false);
    expect(textbox.hasControls).toBe(false);
    expect(textbox.editable).toBe(false);
    expect(textbox.lockMovementX).toBe(true);
    expect(textbox.lockMovementY).toBe(true);
    expect(textbox.lockRotation).toBe(true);
    expect(textbox.lockScalingX).toBe(true);
    expect(textbox.lockScalingY).toBe(true);
    // 画布级：禁止框选与目标 hover，取消鼠标拖拽/框选交互
    expect(canvasMock.selection).toBe(false);
    expect(canvasMock.skipTargetFind).toBe(true);
    expect(canvasMock.defaultCursor).toBe('default');
    // 右键菜单被禁用并关闭
    expect(contextMenuMock.setEnabled).toHaveBeenCalledWith(false);
    expect(contextMenuMock.hideAll).toHaveBeenCalled();
    // 绑定了 mouse:up 自愈处理器：Dring 平移结束把 selection 置回 true 后，强制锁回
    const mouseUpCalls = canvasMock.on.mock.calls.filter(([name]) => name === 'mouse:up');
    expect(mouseUpCalls.length).toBe(1);
    const keepLock = mouseUpCalls[0][1];
    canvasMock.selection = true; // 模拟 DringPlugin mouse:up 恢复
    canvasMock.skipTargetFind = false;
    keepLock();
    expect(canvasMock.selection).toBe(false);
    expect(canvasMock.skipTargetFind).toBe(true);

    p.exitPreview();
    expect(p.isPreviewing()).toBe(false);
    // 文本恢复模板原值
    expect(textbox.text).toBe('hello {{user.name}}');
    // 交互属性恢复原值
    expect(textbox.selectable).toBe(true);
    expect(textbox.evented).toBe(true);
    expect(textbox.hasControls).toBe(true);
    expect(textbox.editable).toBe(true);
    expect(textbox.lockMovementX).toBe(false);
    expect(textbox.lockMovementY).toBe(false);
    expect(textbox.lockRotation).toBe(false);
    expect(textbox.lockScalingX).toBe(false);
    expect(textbox.lockScalingY).toBe(false);
    // 画布级交互恢复
    expect(canvasMock.selection).toBe(true);
    expect(canvasMock.skipTargetFind).toBe(false);
    expect(canvasMock.defaultCursor).toBe('default');
    // 右键菜单恢复启用，mouse:up 自愈处理器解绑
    expect(contextMenuMock.setEnabled).toHaveBeenCalledWith(true);
    const mouseUpOff = canvasMock.off.mock.calls.filter(([name]) => name === 'mouse:up');
    expect(mouseUpOff.length).toBe(1);
    expect(mouseUpOff[0][1]).toBe(keepLock);
  });
});


describe('二维码/条形码变量：extension 子字段收集与渲染（引擎侧）', () => {
  it('getVariableFieldOfObject 识别 qrcode/barcode 扩展字段', () => {
    expect(getVariableFieldOfObject({ type: 'image', extensionType: 'qrcode' })).toEqual(['extension.data']);
    expect(getVariableFieldOfObject({ type: 'image', extensionType: 'barcode' })).toEqual(['extension.value']);
    // 普通图片仍按 src 处理（回归）
    expect(getVariableFieldOfObject({ type: 'image' })).toEqual(['src']);
    expect(getVariableFieldOfObject({ type: 'textbox' })).toEqual(['text']);
  });

  it('extractVariables 从 qrcode extension.data / barcode extension.value 收集变量', () => {
    const json = {
      objects: [
        { type: 'image', extensionType: 'qrcode', extension: { data: 'https://x.com/{{user.id}}' } },
        { type: 'image', extensionType: 'barcode', extension: { value: '{{order.code}}' } },
        { type: 'image', src: '{{logo.url}}' },
      ],
    };
    const vars = extractVariables(json);
    expect(vars).toEqual(expect.arrayContaining(['user.id', 'order.code', 'logo.url']));
  });

  it('renderObjects 渲染 qrcode/barcode 的 extension 内容', () => {
    const json = {
      objects: [
        { type: 'image', extensionType: 'qrcode', extension: { data: 'https://x.com/{{user.id}}' } },
        { type: 'image', extensionType: 'barcode', extension: { value: '{{order.code}}' } },
      ],
    };
    const out = renderObjects(json, { 'user.id': '123', 'order.code': 'ABC' });
    expect(out.objects[0].extension.data).toBe('https://x.com/123');
    expect(out.objects[1].extension.value).toBe('ABC');
  });

  it('renderObjects 嵌套对象（group.objects）同样渲染扩展字段', () => {
    const json = {
      objects: [
        {
          type: 'group',
          objects: [
            { type: 'image', extensionType: 'qrcode', extension: { data: '{{user.id}}' } },
          ],
        },
      ],
    };
    const out = renderObjects(json, { 'user.id': '777' });
    expect(out.objects[0].objects[0].extension.data).toBe('777');
  });
});

describe('VariablePlugin 二维码/条形码预览', () => {
  function makeExtImage(data, extensionType) {
    const field = extensionType === 'qrcode' ? 'data' : 'value';
    const img = new fabric.Image(makeImageElement('https://cdn.example.com/placeholder.png'), {});
    img.set('extensionType', extensionType);
    img.set('extension', { [field]: data });
    img.set({ left: 10, top: 20, width: 300, height: 300, scaleX: 1, scaleY: 1 });
    return img;
  }
  function makeCanvas(objs) {
    return {
      on: () => {},
      off: () => {},
      getObjects: () => objs,
      requestRenderAll: () => {},
      discardActiveObject: () => {},
      selection: true,
      skipTargetFind: false,
      defaultCursor: 'default',
    };
  }

  it('进入预览渲染 extension.data，退出恢复原值（插件缺失降级不崩溃）', () => {
    const img = makeExtImage('https://x.com/{{user.id}}', 'qrcode');
    const p = new VariablePlugin(makeCanvas([img]), { emit: () => {}, getPlugin: () => null });
    p.setTestData({ 'user.id': '123' });

    p.enterPreview();
    expect(p.isPreviewing()).toBe(true);
    expect(img.get('extension').data).toBe('https://x.com/123');

    p.exitPreview();
    expect(p.isPreviewing()).toBe(false);
    expect(img.get('extension').data).toBe('https://x.com/{{user.id}}');
    // 退出预览还原版位，不污染模板
    expect(img.left).toBe(10);
    expect(img.top).toBe(20);
    expect(img.scaleX).toBe(1);
    expect(img.scaleY).toBe(1);
  });

  it('barcode 预览/退出同样生效', () => {
    const img = makeExtImage('{{order.code}}', 'barcode');
    const p = new VariablePlugin(makeCanvas([img]), { emit: () => {}, getPlugin: () => null });
    p.setTestData({ 'order.code': 'ABC' });

    p.enterPreview();
    expect(img.get('extension').value).toBe('ABC');

    p.exitPreview();
    expect(img.get('extension').value).toBe('{{order.code}}');
  });

  it('无变量内容的二维码不进入快照（跳过）', () => {
    const img = makeExtImage('https://x.com/plain', 'qrcode');
    const p = new VariablePlugin(makeCanvas([img]), { emit: () => {}, getPlugin: () => null });
    p.enterPreview();
    expect(p.isPreviewing()).toBe(false);
  });

  it('存在 QrCodePlugin 时预览重绘图像（按原版位缩放），退出恢复内容与版位', async () => {
    const loadImageSpy = mockLoadImage();
    try {
      const img = makeExtImage('https://x.com/{{user.id}}', 'qrcode');
      const qrPluginMock = {
        _paramsToOption: (o) => o,
        _getBase64Str: () => Promise.resolve('data:image/png;base64,preview-qr'),
      };
      const editorMock = { emit: () => {}, getPlugin: (name) => (name === 'QrCodePlugin' ? qrPluginMock : null) };
      const p = new VariablePlugin(makeCanvas([img]), editorMock);
      p.setTestData({ 'user.id': '123' });

      p.enterPreview();
      expect(img.get('extension').data).toBe('https://x.com/123');

      // 等待异步 base64 生成与 setSrc 完成
      await new Promise((r) => setTimeout(r, 0));
      expect(img._element.src).toContain('preview-qr');
      // 保持版位显示尺寸：mock 图 240x160 → scaleX = 300/240
      expect(img.getScaledWidth()).toBeCloseTo(300);
      expect(img.getScaledHeight()).toBeCloseTo(300);

      p.exitPreview();
      await new Promise((r) => setTimeout(r, 0));
      expect(img.get('extension').data).toBe('https://x.com/{{user.id}}');
      // 退出恢复原始 transform，不污染模板
      expect(img.left).toBe(10);
      expect(img.top).toBe(20);
      expect(img.width).toBe(300);
      expect(img.height).toBe(300);
      expect(img.scaleX).toBe(1);
      expect(img.scaleY).toBe(1);
    } finally {
      loadImageSpy.mockRestore();
    }
  });
});
