/**
 * RendererCore 渲染引擎：
 * - 复用 ServersPlugin.loadJSON 管线（缺省字段补回 / 二维码参数还原）
 * - 变量替换 + autoGrow 增高与编辑器预览一致
 */
import { fabric } from 'fabric';
import { renderObjects } from '../../src/core/variableEngine';

// 二维码/条形码生成在 jsdom 不可用，mock 生成函数
jest.mock('../../src/core/generators', () => ({
  generateQrCodeDataURL: jest.fn(() => Promise.resolve('data:image/png;base64,FAKEQR')),
  generateBarcodeDataURL: jest.fn(() => 'data:image/png;base64,FAKEBAR'),
  qrParamsToOption: (o) => o,
}));

import RendererCore from '../../src/core/RendererCore';

function makeImageElement(src) {
  const el = document.createElement('img');
  Object.defineProperty(el, 'src', { value: src, writable: true, configurable: true });
  Object.defineProperty(el, 'width', { value: 100, writable: true, configurable: true });
  Object.defineProperty(el, 'height', { value: 100, writable: true, configurable: true });
  Object.defineProperty(el, 'naturalWidth', { value: 100, writable: true, configurable: true });
  Object.defineProperty(el, 'naturalHeight', { value: 100, writable: true, configurable: true });
  Object.defineProperty(el, 'complete', { value: true, writable: true, configurable: true });
  return el;
}

function mockLoadImage() {
  return jest.spyOn(fabric.util, 'loadImage').mockImplementation((url, cb, thisArg) => {
    cb.call(thisArg, makeImageElement(url), false);
  });
}

// 按 URL 片段返回不同原始尺寸的图片元素（模拟背景图与普通图尺寸不同）
function mockLoadImageByUrl(sizeMap) {
  return jest.spyOn(fabric.util, 'loadImage').mockImplementation((url, cb, thisArg) => {
    const key = Object.keys(sizeMap).find((k) => url.indexOf(k) !== -1);
    const size = (key && sizeMap[key]) || { w: 100, h: 100 };
    const el = document.createElement('img');
    Object.defineProperty(el, 'src', { value: url, writable: true, configurable: true });
    Object.defineProperty(el, 'width', { value: size.w, writable: true, configurable: true });
    Object.defineProperty(el, 'height', { value: size.h, writable: true, configurable: true });
    Object.defineProperty(el, 'naturalWidth', {
      value: size.w,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(el, 'naturalHeight', {
      value: size.h,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(el, 'complete', { value: true, writable: true, configurable: true });
    cb.call(thisArg, el, false);
  });
}

function createRenderer() {
  const el = document.createElement('canvas');
  el.width = 300;
  el.height = 400;
  document.body.appendChild(el);
  const canvas = new fabric.Canvas(el, { selection: false, skipTargetFind: true });
  const core = new RendererCore(canvas, {});
  return { canvas, core };
}

// 渲染器 workspace 插件快捷访问
function wsPlugin(core) {
  return core.getPlugin('RendererWorkspacePlugin');
}
function autoGrowPlugin(core) {
  return core.getPlugin('RendererAutoGrowPlugin');
}

// 基础海报 JSON：workspace + 文本 + 矩形
function makePoster({ longText = false } = {}) {
  return {
    objects: [
      {
        type: 'rect',
        id: 'workspace',
        left: 0,
        top: 0,
        width: 300,
        height: 400,
        fill: '#ffffff',
        selectable: false,
        hasControls: false,
      },
      {
        type: 'textbox',
        id: 't1',
        left: 20,
        top: 20,
        width: 200,
        height: 20,
        text: longText ? '{{name}}' : 'hello',
        fontSize: 24,
        fontFamily: 'arial',
        fill: '#000000',
        autoGrow: true,
      },
      {
        type: 'rect',
        id: 'r1',
        left: 20,
        top: 80,
        width: 100,
        height: 30,
        fill: '#ff0000',
        follow: 't1',
      },
    ],
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('loadJSON 进行中引擎被销毁（弹窗视图切换卸载场景）', () => {
  it('静默放弃剩余加载：不抛 callAsync undefined，回调照常收口', async () => {
    const { core } = createRenderer();
    mockLoadImage();
    const servers = core.getPlugin('ServersPlugin');
    const abortCb = jest.fn();
    // 启动加载（异步 hookTransform 管线），在其 _transform 遍历中途销毁引擎
    //（等价于弹窗确认应用 → pending 预览卸载 / json watch 竞态重建）：
    // hooksEntity 已在 destroy 时清空，各异步边界据此静默放弃剩余加载
    const loadPromise = servers.loadJSON(makePoster(), abortCb);
    core.destroy();
    expect(core.destroyed).toBe(true);
    await expect(loadPromise).resolves.toBeUndefined();
    // callback 照常收口（调用方 Promise 正常 resolve）
    expect(abortCb).toHaveBeenCalledTimes(1);
  });

  it('loadJSON 启动前引擎已销毁：同样静默放弃', async () => {
    const { core } = createRenderer();
    mockLoadImage();
    const servers = core.getPlugin('ServersPlugin');
    const abortCb = jest.fn();
    core.destroy();
    await expect(servers.loadJSON(makePoster(), abortCb)).resolves.toBeUndefined();
    expect(abortCb).toHaveBeenCalledTimes(1);
  });
});

describe('RendererCore 基础加载', () => {
  it('loadJSON 还原对象与几何（manifest/缺省字段补回兼容）', async () => {
    const { core } = createRenderer();
    const json = makePoster();
    await core.loadJSON(json);
    const ws = wsPlugin(core).getWorkspace();
    expect(ws).toBeTruthy();
    expect(ws.get('width')).toBe(300);
    expect(ws.get('height')).toBe(400);
    const t1 = core.canvas.getObjects().find((o) => o.id === 't1');
    expect(t1).toBeTruthy();
    expect(t1.get('text')).toBe('hello');
    expect(t1.get('autoGrow')).toBe(true);
    const r1 = core.canvas.getObjects().find((o) => o.id === 'r1');
    expect(r1.get('top')).toBe(80);
  });

  it('变量替换：text 按 data 渲染', async () => {
    const { core } = createRenderer();
    const json = makePoster({ longText: true });
    const substituted = renderObjects(json, { name: '张三' });
    expect(substituted.objects[1].text).toBe('张三');
    await core.loadJSON(substituted);
    const t1 = core.canvas.getObjects().find((o) => o.id === 't1');
    expect(t1.get('text')).toBe('张三');
  });

  it('二维码对象无 src 时按 extension 参数还原（hookTransform）', async () => {
    const loadImageSpy = mockLoadImage();
    const { core } = createRenderer();
    const json = makePoster();
    json.objects.push({
      type: 'image',
      id: 'qr1',
      left: 50,
      top: 200,
      width: 100,
      height: 100,
      extensionType: 'qrcode',
      extension: { data: 'https://example.com', width: 300, margin: 10 },
    });
    await core.loadJSON(json);
    const qr = core.canvas.getObjects().find((o) => o.id === 'qr1');
    expect(qr).toBeTruthy();
    // hookTransform 生成 base64 后 loadFromJSON 创建出 image
    expect(loadImageSpy).toHaveBeenCalled();
    expect(core.canvas.getObjects().find((o) => o.id === 'qr1').type).toBe('image');
  });
});

describe('RendererCore 背景图（cover/contain 按原图尺寸重排，与编辑器 WorkspacePlugin 一致）', () => {
  // 海报 JSON：背景图仅有 width/height，无 scaleX/scaleY（被缺省字段精简剔除）
  function makeBgPoster(bgSrc, bgMode = 'cover') {
    return {
      objects: [
        {
          type: 'rect',
          id: 'workspace',
          left: 0,
          top: 0,
          width: 768,
          height: 1366,
          fill: '#ffffff',
          selectable: false,
          hasControls: false,
        },
        {
          type: 'image',
          id: 'backgroundImage',
          left: 0,
          top: 0,
          width: 768,
          height: 1366,
          backgroundImageMode: bgMode,
          src: bgSrc,
        },
      ],
    };
  }

  it('原图与 workspace 同尺寸（768x1366）时 cover scale 保持 1，铺满', async () => {
    const mock = mockLoadImageByUrl({ bg: { w: 768, h: 1366 } });
    const { core } = createRenderer();
    const json = makeBgPoster('https://x/bg.webp');
    await core.loadJSON(json);
    autoGrowPlugin(core).apply();
    wsPlugin(core).relayoutBackground();
    const bg = wsPlugin(core).getBackgroundImageObj();
    expect(bg.get('scaleX')).toBeCloseTo(1, 4);
    expect(bg.get('scaleY')).toBeCloseTo(1, 4);
    expect(bg.get('left')).toBeCloseTo(0, 4);
    expect(bg.get('top')).toBeCloseTo(0, 4);
    mock.mockRestore();
  });

  it('原图横图（1366x768）时按 cover 重排：铺满高度、侧边裁剪居中', async () => {
    const mock = mockLoadImageByUrl({ bg: { w: 1366, h: 768 } });
    const { core } = createRenderer();
    const json = makeBgPoster('https://x/bg.webp');
    await core.loadJSON(json);
    autoGrowPlugin(core).apply();
    wsPlugin(core).relayoutBackground();
    const bg = wsPlugin(core).getBackgroundImageObj();
    const scale = 1366 / 768; // cover: rectRatio(0.562) < imgRatio(1.779) -> scale = rectH/imgH（铺满高度）
    expect(bg.get('scaleX')).toBeCloseTo(scale, 4);
    expect(bg.get('scaleY')).toBeCloseTo(scale, 4);
    expect(bg.get('left')).toBeCloseTo((768 - 1366 * scale) / 2, 4); // 侧边裁剪居中
    expect(bg.get('top')).toBeCloseTo(0, 4);
    mock.mockRestore();
  });

  it('不调用 relayoutBackground 时背景保持 JSON 几何（scale 1）——旧行为即变形根因', async () => {
    const mock = mockLoadImageByUrl({ bg: { w: 1366, h: 768 } });
    const { core } = createRenderer();
    const json = makeBgPoster('https://x/bg.webp');
    await core.loadJSON(json);
    autoGrowPlugin(core).apply();
    // 不调用 relayoutBackground
    const bg = wsPlugin(core).getBackgroundImageObj();
    expect(bg.get('scaleX')).toBe(1);
    expect(bg.get('scaleY')).toBe(1);
    expect(bg.get('top')).toBe(0);
    mock.mockRestore();
  });

  it('RendererWorkspacePlugin.setBackgroundImage：按原图尺寸 cover 铺满', async () => {
    const mock = mockLoadImageByUrl({ bg: { w: 1366, h: 768 } });
    // jsdom 不触发原生 Image 加载，用同步 onload 的 Mock 替代
    const OrigImage = global.Image;
    global.Image = class {
      constructor() {
        this.crossOrigin = null;
        this.naturalWidth = 1366;
        this.naturalHeight = 768;
        this.width = 1366;
        this.height = 768;
      }
      set src(v) {
        this._src = v;
        setTimeout(() => this.onload && this.onload(), 0);
      }
      get src() {
        return this._src;
      }
    };
    try {
      const { core } = createRenderer();
      const json = makeBgPoster('', 'cover');
      json.objects.splice(1, 1); // 无内置背景，模拟前台调用设置背景
      await core.loadJSON(json);
      const plugin = wsPlugin(core);
      expect(typeof plugin.setBackgroundImage).toBe('function');
      const ok = await plugin.setBackgroundImage('https://x/bg.webp', 'cover');
      expect(ok).toBe(true);
      const bg = plugin.getBackgroundImageObj();
      expect(bg).toBeTruthy();
      expect(bg.get('backgroundImageMode')).toBe('cover');
      const scale = 1366 / 768; // cover 铺满高度
      expect(bg.get('scaleX')).toBeCloseTo(scale, 4);
      expect(bg.get('scaleY')).toBeCloseTo(scale, 4);
      // 空 src 安全失败
      expect(await plugin.setBackgroundImage('')).toBe(false);
    } finally {
      global.Image = OrigImage;
      mock.mockRestore();
    }
  });

  it('contain + backgroundPosition（JSON 持久化）→ 重排贴合指定边', async () => {
    const mock = mockLoadImageByUrl({ bg: { w: 1366, h: 768 } });
    const { core } = createRenderer();
    const json = makeBgPoster('https://x/bg.webp', 'contain');
    json.objects[1].backgroundPosition = { x: 0.5, y: 1 };
    await core.loadJSON(json);
    autoGrowPlugin(core).apply();
    wsPlugin(core).relayoutBackground();
    const bg = wsPlugin(core).getBackgroundImageObj();
    const scale = 768 / 1366; // contain 贴宽，上下留白
    expect(bg.get('scaleX')).toBeCloseTo(scale, 4);
    expect(bg.get('left')).toBeCloseTo(0, 4);
    // 贴底：top = (1366 - 768*scale) * 1
    expect(bg.get('top')).toBeCloseTo(1366 - 768 * scale, 4);
    expect(bg.get('backgroundPosition')).toEqual({ x: 0.5, y: 1 });
    mock.mockRestore();
  });
});

describe('RendererCore 远程图片 crossOrigin（避免 Tainted canvas 导出失败）', () => {
  function makeJson() {
    return {
      objects: [
        {
          type: 'rect',
          id: 'workspace',
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          fill: '#ffffff',
        },
        {
          type: 'image',
          id: 'remote',
          left: 0,
          top: 0,
          width: 50,
          height: 50,
          src: 'https://x/a.png',
        },
        {
          type: 'image',
          id: 'local',
          left: 10,
          top: 10,
          width: 10,
          height: 10,
          src: 'data:image/png;base64,abc',
        },
        {
          type: 'image',
          id: 'cors',
          left: 20,
          top: 20,
          width: 10,
          height: 10,
          src: 'https://x/b.png',
          crossOrigin: 'anonymous',
        },
      ],
    };
  }

  it('默认给远程图片补 crossOrigin=anonymous（data: 与已显式设置的保持不变）', async () => {
    const mock = mockLoadImage();
    const { core } = createRenderer();
    const json = makeJson();
    await core.loadJSON(json);
    const remote = core.canvas.getObjects().find((o) => o.id === 'remote');
    const local = core.canvas.getObjects().find((o) => o.id === 'local');
    const cors = core.canvas.getObjects().find((o) => o.id === 'cors');
    // fabric 以对象 crossOrigin 属性作为 loadImage 的 crossOrigin 参数（决定是否以 CORS 加载，避免画布污染）
    expect(remote.crossOrigin).toBe('anonymous');
    expect(local.crossOrigin).toBeNull();
    expect(cors.crossOrigin).toBe('anonymous');
    mock.mockRestore();
  });

  it('options.crossOrigin = null 时不补，保持原样', async () => {
    const mock = mockLoadImage();
    const el = document.createElement('canvas');
    el.width = 100;
    el.height = 100;
    document.body.appendChild(el);
    const canvas = new fabric.Canvas(el, {});
    const core = new RendererCore(canvas, { crossOrigin: null });
    await core.loadJSON(makeJson());
    const remote = core.canvas.getObjects().find((o) => o.id === 'remote');
    expect(remote.crossOrigin).toBeNull();
    core.destroy();
    mock.mockRestore();
  });

  it('exportPNG 由 ServersPlugin.preview(multiplier) 提供（与编辑器导出对称）', async () => {
    const mock = mockLoadImage();
    const { core } = createRenderer();
    const json = makeJson();
    await core.loadJSON(json);
    const servers = core.getPlugin('ServersPlugin');
    expect(servers).toBeTruthy();
    expect(typeof servers.preview).toBe('function');
    const url = await servers.preview(1);
    expect(typeof url).toBe('string');
    expect(url).toMatch(/^data:image\/png/);
    mock.mockRestore();
  });
});

describe('RendererCore 真实海报 JSON（clipPath + 二维码 + 多图 + 变量文本）', () => {
  const USER_JSON = {
    version: '5.3.0',
    objects: [
      {
        type: 'rect',
        version: '5.3.0',
        left: 0,
        top: 0,
        width: 768,
        height: 1366,
        fill: 'rgba(255,255,255,1)',
        strokeWidth: 0,
        id: 'workspace',
        selectable: false,
        hasControls: false,
      },
      {
        type: 'image',
        version: '5.3.0',
        left: 0,
        top: 0,
        width: 768,
        height: 1366,
        opacity: 100,
        id: 'backgroundImage',
        selectable: false,
        hasControls: false,
        backgroundImageMode: 'cover',
        src: 'https://x/bg.webp',
      },
      {
        type: 'image',
        version: '5.3.0',
        left: 78.7955,
        top: 680.1272,
        width: 768,
        height: 1366,
        scaleX: 0.4378,
        scaleY: 0.4378,
        id: 'aurora',
        src: 'https://x/aurora.webp',
        crossOrigin: 'anonymous',
      },
      {
        type: 'image',
        version: '5.3.0',
        left: 358.0684,
        top: 875.6107,
        width: 300,
        height: 300,
        scaleX: 1.28,
        scaleY: 1.28,
        extensionType: 'qrcode',
        extension: {
          data: 'https://example.com',
          width: 300,
          margin: 10,
          errorCorrectionLevel: 'M',
          dotsColor: '#000000',
          dotsType: 'rounded',
          cornersSquareColor: '#000000',
          cornersSquareType: 'square',
          cornersDotColor: '#000000',
          cornersDotType: 'square',
          background: '#ffffff',
        },
      },
      {
        type: 'textbox',
        version: '5.3.0',
        left: 165.4491,
        top: 312.2769,
        width: 400,
        height: 90.4,
        fill: '#000000FF',
        shadow: '',
        fontFamily: 'arial',
        fontSize: 80,
        text: '新建文本',
        splitByGrapheme: true,
        id: 'static-text',
      },
      {
        type: 'textbox',
        version: '5.3.0',
        left: 78.7955,
        top: 79.3436,
        width: 400,
        height: 90.4,
        fill: '#000000FF',
        shadow: '',
        fontFamily: 'arial',
        fontSize: 80,
        text: '{{content}}',
        splitByGrapheme: true,
        id: 'var-text',
      },
    ],
    clipPath: {
      type: 'rect',
      version: '5.3.0',
      left: 0,
      top: 0,
      width: 768,
      height: 1366,
      fill: 'rgba(255,255,255,1)',
      scaleX: 1,
      scaleY: 1,
    },
    variableMeta: {
      delimiter: { start: '{{', end: '}}' },
      variables: [{ path: 'content', name: 'content', example: '', required: false }],
    },
  };

  it('按变量数据渲染，workspace 与画布尺寸正确，背景按原图重排', async () => {
    const mock = mockLoadImageByUrl({ bg: { w: 768, h: 1366 } });
    const { core, canvas } = createRenderer();
    const substituted = renderObjects(USER_JSON, { content: '2026 春季大促' });
    await core.loadJSON(substituted);
    autoGrowPlugin(core).apply();
    wsPlugin(core).relayoutBackground();

    const ws = wsPlugin(core).getWorkspace();
    expect(ws.get('width')).toBe(768);
    expect(ws.get('height')).toBe(1366);
    expect(canvas.getWidth()).toBe(768);
    expect(canvas.getHeight()).toBe(1366);

    const varText = core.canvas.getObjects().find((o) => o.id === 'var-text');
    expect(varText.get('text')).toBe('2026 春季大促');

    const qr = core.canvas.getObjects().find((o) => o.extensionType === 'qrcode');
    expect(qr).toBeTruthy();

    const bg = wsPlugin(core).getBackgroundImageObj();
    expect(bg.get('scaleX')).toBeCloseTo(1, 4); // 同尺寸 cover 铺满
    expect(bg.get('top')).toBeCloseTo(0, 4);
    mock.mockRestore();
  });
});

describe('RendererCore autoGrow 增高（与编辑器预览一致）', () => {
  it('长文本 -> 海报增高，follow 元素保距下移', async () => {
    const { core } = createRenderer();
    const json = makePoster({ longText: true });
    // jsdom 测量环境下需足够长的文本才会超过设计高 400
    const longName = '这是非常长的文本内容'.repeat(20);
    const substituted = renderObjects(json, { name: longName });
    await core.loadJSON(substituted);
    autoGrowPlugin(core).apply();

    const ws = wsPlugin(core).getWorkspace();
    const t1 = core.canvas.getObjects().find((o) => o.id === 't1');
    const r1 = core.canvas.getObjects().find((o) => o.id === 'r1');

    // 长文本触发增高（设计高 400）
    expect(ws.get('height')).toBeGreaterThan(400);
    // follow 元素保持与锚点底部"编辑时间距"（designMap: r1.top 80 - t1.bottom 40 = 40）
    const t1Bottom = t1.get('top') + t1.get('height') * (t1.get('scaleY') || 1);
    expect(r1.get('top')).toBeCloseTo(t1Bottom + 40, 0);
  });

  it('短文本不增高（高度保持设计高）', async () => {
    const { core } = createRenderer();
    const json = makePoster({ longText: false });
    await core.loadJSON(json);
    autoGrowPlugin(core).apply();
    const ws = wsPlugin(core).getWorkspace();
    expect(ws.get('height')).toBe(400);
  });
});
