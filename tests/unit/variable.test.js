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
