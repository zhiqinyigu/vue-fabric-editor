/**
 * RendererCore 渲染引擎：
 * - 复用 ServersPlugin.loadJSON 管线（缺省字段补回 / 二维码参数还原）
 * - 变量替换 + autoGrow 增高与编辑器预览一致
 */
import { fabric } from 'fabric';
import { renderObjects } from '../../src/core/variableEngine';
import { applySchemaDefaults } from '../../src/core/variableSchema';

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

  it('setBackgroundImage：服务端无 CORS 时回退无 crossOrigin 仍能显示', async () => {
    const mock = mockLoadImageByUrl({ bg: { w: 1366, h: 768 } });
    const OrigImage = global.Image;
    const calls = [];
    // 带 crossOrigin 的请求失败，去掉 crossOrigin 成功
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
        calls.push({ src: v, crossOrigin: this.crossOrigin });
        setTimeout(() => {
          if (this.crossOrigin) this.onerror && this.onerror();
          else this.onload && this.onload();
        }, 0);
      }
      get src() {
        return this._src;
      }
    };
    try {
      const { core } = createRenderer();
      const json = makeBgPoster('', 'cover');
      json.objects.splice(1, 1); // 无内置背景
      await core.loadJSON(json);
      const ok = await wsPlugin(core).setBackgroundImage('https://x/cors-bg.webp', 'cover');
      expect(ok).toBe(true);
      expect(wsPlugin(core).getBackgroundImageObj()).toBeTruthy();
      // 第一次 CORS 失败 → 第二次无 crossOrigin 成功
      expect(calls.map((c) => c.crossOrigin)).toEqual(['anonymous', null]);
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
      version: 1,
      delimiter: { start: '{{', end: '}}' },
      schema: [{ path: 'content', label: '正文', type: 'text' }],
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

describe('RendererCore 变量背景（替换后按真实尺寸渲染 / 失败语义）', () => {
  function makeVarBgPoster(bgSrc, data) {
    const json = {
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
          backgroundImageMode: 'cover',
          isVariableBackground: true,
          src: bgSrc,
        },
      ],
    };
    return renderObjects(json, data);
  }

  // 所有加载一律失败（空/失效 URL 均返回 naturalWidth=0 的坏元素）
  function mockLoadImageBroken() {
    return jest.spyOn(fabric.util, 'loadImage').mockImplementation((url, cb, thisArg) => {
      const el = document.createElement('img');
      Object.defineProperty(el, 'src', { value: url, writable: true, configurable: true });
      Object.defineProperty(el, 'naturalWidth', { value: 0, writable: true, configurable: true });
      Object.defineProperty(el, 'naturalHeight', { value: 0, writable: true, configurable: true });
      Object.defineProperty(el, 'complete', { value: true, writable: true, configurable: true });
      cb.call(thisArg, el, true);
    });
  }

  it('变量背景：替换为真实 URL 后按真实尺寸 cover 重排', async () => {
    const mock = mockLoadImageByUrl({ bg: { w: 1366, h: 768 } });
    const { core } = createRenderer();
    await core.loadJSON(makeVarBgPoster('{{bg}}', { bg: 'https://x/bg.webp' }));
    autoGrowPlugin(core).apply();
    wsPlugin(core).relayoutBackground();
    const bg = wsPlugin(core).getBackgroundImageObj();
    const scale = 1366 / 768; // cover 铺满高度
    expect(bg.get('scaleX')).toBeCloseTo(scale, 4);
    expect(bg.get('scaleY')).toBeCloseTo(scale, 4);
    expect(bg.get('left')).toBeCloseTo((768 - 1366 * scale) / 2, 4);
    mock.mockRestore();
  });

  it('变量为空：src 置空，fabric 丢弃背景（D2 渲染端无背景），不报错', async () => {
    const mock = mockLoadImageBroken();
    const { core } = createRenderer();
    const onError = jest.fn();
    core.on('renderer:error', onError);
    await core.loadJSON(makeVarBgPoster('{{bg}}', {}));
    autoGrowPlugin(core).apply();
    await wsPlugin(core).whenImagesLoaded();
    expect(wsPlugin(core).getBackgroundImageObj()).toBeFalsy();
    expect(onError).not.toHaveBeenCalled();
    mock.mockRestore();
  });

  it('变量值 URL 加载失败（非空 src）→ emit renderer:error', async () => {
    const mock = mockLoadImageBroken();
    const { core } = createRenderer();
    const onError = jest.fn();
    core.on('renderer:error', onError);
    await core.loadJSON(makeVarBgPoster('{{bg}}', { bg: 'https://x/dead.webp' }));
    autoGrowPlugin(core).apply();
    await wsPlugin(core).whenImagesLoaded();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'IMAGE_LOAD_FAILED', src: 'https://x/dead.webp' })
    );
    mock.mockRestore();
  });

  it('变量背景 tile 形态：替换后 Pattern source 生效（rect 保留、几何铺满）', async () => {
    const mock = mockLoadImageByUrl({ bg: { w: 1366, h: 768 } });
    const { core } = createRenderer();
    const json = {
      objects: [
        { type: 'rect', id: 'workspace', left: 0, top: 0, width: 360, height: 640, fill: '#fff' },
        {
          type: 'rect',
          id: 'backgroundImage',
          left: 0,
          top: 0,
          width: 360,
          height: 640,
          backgroundImageMode: 'tile',
          isVariableBackground: true,
          src: '{{bg}}',
          fill: { type: 'pattern', source: '{{bg}}', repeat: 'repeat' },
        },
      ],
    };
    await core.loadJSON(renderObjects(json, { bg: 'https://x/bg.webp' }));
    autoGrowPlugin(core).apply();
    await wsPlugin(core).whenImagesLoaded();
    wsPlugin(core).relayoutBackground();
    const bg = wsPlugin(core).getBackgroundImageObj();
    expect(bg).toBeTruthy();
    expect(bg.type).toBe('rect');
    expect(bg.fill).toBeTruthy();
    expect(bg.fill.source.src).toContain('x/bg.webp');
    expect(bg.get('width')).toBe(360);
    mock.mockRestore();
  });

  it('编辑器导出 JSON（宽高为占位图尺寸）→ 重排后 width/height 重置为真实尺寸（修复"左上角一小块"）', async () => {
    const mock = mockLoadImageByUrl({ bg: { w: 720, h: 1280 } });
    const { core } = createRenderer();
    // 模拟编辑器 setBackgroundVariableImage 导出的 JSON：width/height 是占位图 240x160，scale 按占位图 cover 算
    const json = {
      objects: [
        { type: 'rect', id: 'workspace', left: 0, top: 0, width: 360, height: 640, fill: '#fff' },
        {
          type: 'image',
          id: 'backgroundImage',
          left: -90,
          top: -200,
          width: 240,
          height: 160,
          scaleX: 1.5,
          scaleY: 1.5,
          backgroundImageMode: 'cover',
          isVariableBackground: true,
          src: '{{bg}}',
        },
      ],
    };
    await core.loadJSON(renderObjects(json, { bg: 'https://x/bg.webp' }));
    wsPlugin(core).relayoutBackground();
    const bg = wsPlugin(core).getBackgroundImageObj();
    // width/height 重置为真实自然尺寸，否则显示尺寸 = JSON宽(240) × scale
    expect(bg.get('width')).toBeCloseTo(720, 4);
    expect(bg.get('height')).toBeCloseTo(1280, 4);
    // cover：rectRatio(0.5625) === imgRatio(0.5625) → scale = rectH/imgH = 0.5
    expect(bg.get('scaleX')).toBeCloseTo(0.5, 4);
    expect(bg.get('scaleY')).toBeCloseTo(0.5, 4);
    // 显示尺寸 = 720 × 0.5 = 360（铺满），非 240 × 0.5 = 120
    expect(bg.get('width') * bg.get('scaleX')).toBeCloseTo(360, 4);
    mock.mockRestore();
  });

  it('pattern source 非 DOM 元素（字符串）时 whenImagesLoaded 不抛错（防御）', async () => {
    const mock = mockLoadImageByUrl({ bg: { w: 100, h: 100 } });
    const { core } = createRenderer();
    const json = {
      objects: [
        { type: 'rect', id: 'workspace', left: 0, top: 0, width: 300, height: 400, fill: '#fff' },
        {
          type: 'rect',
          id: 'backgroundImage',
          left: 0,
          top: 0,
          width: 300,
          height: 400,
          backgroundImageMode: 'tile',
          src: 'https://x/bg.webp',
          fill: { type: 'pattern', source: 'https://x/bg.webp', repeat: 'repeat' },
        },
      ],
    };
    await core.loadJSON(json);
    // 强行把 pattern source 置为字符串（模拟未 enliven 的异常态），不应抛错
    const bg = wsPlugin(core).getBackgroundImageObj();
    bg.fill.source = 'https://x/bg.webp';
    await expect(wsPlugin(core).whenImagesLoaded()).resolves.toBeUndefined();
    mock.mockRestore();
  });

  it('renderer-demo 示例 JSON 全流程：fill bg URL → 背景铺满 workspace（复现面板→渲染器）', async () => {
    const mock = mockLoadImageByUrl({ bg: { w: 720, h: 1280 } });
    const { core } = createRenderer();
    const json = {
      objects: [
        { type: 'rect', id: 'workspace', left: 0, top: 0, width: 360, height: 640, fill: '#fff' },
        {
          type: 'image',
          id: 'backgroundImage',
          left: 0,
          top: 0,
          width: 360,
          height: 640,
          src: '{{bg}}',
          crossOrigin: 'anonymous',
          isVariableBackground: true,
          backgroundImageMode: 'cover',
          backgroundPosition: { x: 0.5, y: 0.5 },
          selectable: false,
          evented: false,
        },
      ],
    };
    const substituted = renderObjects(json, { bg: 'https://x/bg.webp' });
    expect(substituted.objects[1].src).toBe('https://x/bg.webp');
    await core.loadJSON(substituted);
    wsPlugin(core).relayoutBackground();
    const bg = wsPlugin(core).getBackgroundImageObj();
    expect(bg).toBeTruthy();
    // 同比例 cover：scale=0.5，显示尺寸 = 720×0.5 = 360 铺满
    expect(bg.get('width')).toBeCloseTo(720, 4);
    expect(bg.get('scaleX')).toBeCloseTo(0.5, 4);
    expect(bg.get('width') * bg.get('scaleX')).toBeCloseTo(360, 4);
    expect(bg.get('height') * bg.get('scaleY')).toBeCloseTo(640, 4);
    mock.mockRestore();
  });
});

describe('变量表 schema 渲染容错（FabricRenderer 渲染前置管线）', () => {
  // 与 FabricRenderer.render 的前置步骤一致：默认值补齐 → 变量替换
  const schema = [
    {
      path: 'course.name',
      label: '课程名称',
      type: 'text',
      defaultValue: '默认课程',
    },
    {
      path: 'lecturer.avatar',
      label: '讲师头像',
      type: 'image',
      defaultValue: 'https://cdn.example.com/default.png',
    },
    { path: 'business.name', label: '店铺名称', type: 'text' },
  ];

  function renderPipeline(json, data, defs) {
    const filled = applySchemaDefaults(data, defs);
    return { filled, substituted: renderObjects(json, filled) };
  }

  it('未传 schema：数据原样渲染（零开销，行为与旧版一致）', () => {
    const json = { objects: [{ type: 'textbox', text: '{{course.name}}' }] };
    const out = renderObjects(json, { 'course.name': '真实课程' });
    expect(out.objects[0].text).toBe('真实课程');
  });

  it('默认值回退：缺失 key 用 defaultValue 渲染，已有值不覆盖', () => {
    const json = {
      objects: [
        { type: 'textbox', text: '{{course.name}}/{{business.name}}' },
        { type: 'image', src: '{{lecturer.avatar}}' },
      ],
    };
    // business.name 无默认值且无数据 → 渲染为空串（不依赖任何校验标记）
    const { filled, substituted } = renderPipeline(json, {}, schema);
    // applySchemaDefaults 按嵌套路径写入；renderObjects 取值兼容嵌套/扁平两种形态
    expect(filled.course.name).toBe('默认课程');
    expect(filled.lecturer.avatar).toBe('https://cdn.example.com/default.png');
    expect(substituted.objects[0].text).toBe('默认课程/');
    expect(substituted.objects[1].src).toBe('https://cdn.example.com/default.png');
  });

  it('已有真实数据：默认值不生效', () => {
    const json = { objects: [{ type: 'textbox', text: '{{course.name}}' }] };
    const { filled, substituted } = renderPipeline(
      json,
      { 'course.name': '真实课程', 'business.name': '真实店铺' },
      schema
    );
    // 扁平 key 已提供值：不触发补齐，也不覆盖
    expect(filled['course.name']).toBe('真实课程');
    expect(substituted.objects[0].text).toBe('真实课程');
  });
});

// 变量占位兜底（templateMode 自助注册，兼容旧名 variablePlaceholder；默认不启用）：
// 触发判据仅"src 仍是变量字面量"，故数据模式（替换后 token 消失）天然不受影响；
// 本组首个用例断言默认不注册的基线，之后用例会全局安装补丁（模块级幂等），
// 组内用例顺序需保持（默认基线在前）
describe('变量占位兜底（options.templateMode 注册）', () => {
  function createRendererWithOptions(options) {
    const el = document.createElement('canvas');
    el.width = 300;
    el.height = 400;
    document.body.appendChild(el);
    const canvas = new fabric.Canvas(el, { selection: false, skipTargetFind: true });
    const core = new RendererCore(canvas, options);
    return { canvas, core };
  }

  it('默认不注册：未解析变量 src 按原始行为加载失败丢对象（C 端基线不变）', async () => {
    const { canvas, core } = createRenderer();
    // 未填值变量 src 模拟真实环境（fabric.util.loadImage 对非法 URL 回调 isError）
    const spy = jest.spyOn(fabric.util, 'loadImage').mockImplementation((url, cb, thisArg) => {
      cb.call(thisArg, null, true);
    });
    await core.loadJSON(makeVariablePoster());
    expect(canvas.getObjects().find((o) => o.id === 'legacy-avatar')).toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });

  function makeVariablePoster(withTiles = false) {
    const objects = [
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
        // legacy 头像形态：变量 src + 版位标记（解合约等价 isVariableImage 分支）
        type: 'image',
        id: 'legacy-avatar',
        src: '{{avatar}}',
        left: 10,
        top: 10,
        width: 80,
        height: 80,
        legacyAvatar: { box: 80 },
        selectable: false,
        hasControls: false,
      },
    ];
    if (withTiles) {
      objects.push({
        type: 'rect',
        id: 'bg-tile',
        left: 0,
        top: 0,
        width: 300,
        height: 400,
        fill: { type: 'pattern', source: '{{tileSrc}}', repeat: 'repeat' },
        src: '{{tileSrc}}',
      });
    }
    return { objects };
  }

  it('注册 + 无数据：变量图/legacy 头像显示占位（src 保留变量字面量，叠加层标注）', async () => {
    const { canvas, core } = createRendererWithOptions({ variablePlaceholder: true });
    mockLoadImage();
    await core.loadJSON(makeVariablePoster());
    const avatar = canvas.getObjects().find((o) => o.id === 'legacy-avatar');
    expect(avatar).toBeTruthy();
    // 变量字面量保留在 src（不写入占位图 dataURL，防序列化污染）
    expect(avatar.get('src')).toBe('{{avatar}}');
    expect(avatar.get('isVariableImage')).toBe(true);
    expect(avatar.get('variableLabel')).toBe('avatar');
    expect(avatar.get('showPlaceholderText')).toBe(true);
  });

  it('注册 + 变量背景 tile：rect 保留、pattern 源为占位图、src 标记变量 URL', async () => {
    const { canvas, core } = createRendererWithOptions({ variablePlaceholder: true });
    mockLoadImage();
    await core.loadJSON(makeVariablePoster(true));
    const bg = canvas.getObjects().find((o) => o.id === 'bg-tile');
    expect(bg).toBeTruthy();
    expect(bg.get('src')).toBe('{{tileSrc}}');
    expect(bg.get('variableLabel')).toBe('tileSrc');
    expect(bg.get('showPlaceholderText')).toBe(true);
    // pattern 载入了合法占位图 element（非字符串残留）
    expect(bg.fill && bg.fill.source).toBeTruthy();
    expect(typeof bg.fill.source).not.toBe('string');
  });

  it('注册 + 有数据：变量被真实 URL 替换，按原始路径加载（正常回归）', async () => {
    const { canvas, core } = createRendererWithOptions({ variablePlaceholder: true });
    mockLoadImage();
    const json = renderObjects(makeVariablePoster(), {
      avatar: 'https://x/a.png',
      tileSrc: 'https://x/t.png',
    });
    await core.loadJSON(json);
    const avatar = canvas.getObjects().find((o) => o.id === 'legacy-avatar');
    expect(avatar.get('src')).toBe('https://x/a.png');
    expect(avatar.get('isVariableImage')).toBeUndefined();
  });
});

describe('模板模式 / 数据模式：占位能力按实例隔离（无全局泄漏）', () => {
  function posterWith(objs) {
    return {
      objects: [
        { type: 'rect', id: 'workspace', left: 0, top: 0, width: 300, height: 400, fill: '#fff' },
        ...objs,
      ],
    };
  }
  function makeRenderer(options) {
    const el = document.createElement('canvas');
    el.width = 300;
    el.height = 400;
    document.body.appendChild(el);
    const canvas = new fabric.Canvas(el, { selection: false, skipTargetFind: true });
    return { canvas, core: new RendererCore(canvas, options) };
  }
  const avatarObj = (extra = {}) => ({
    type: 'image',
    id: 'avatar',
    src: '{{avatar}}',
    left: 10,
    top: 10,
    width: 80,
    height: 80,
    ...extra,
  });

  it('模板模式：未替换 token → 变量图占位（src 保留字面量 + 叠加层标记）', async () => {
    const spy = mockLoadImage();
    try {
      const { canvas, core } = makeRenderer({ templateMode: true });
      await core.loadJSON(posterWith([avatarObj()]));
      const img = canvas.getObjects().find((o) => o.id === 'avatar');
      expect(img.get('src')).toBe('{{avatar}}');
      expect(img.get('isVariableImage')).toBe(true);
      expect(img.get('variableLabel')).toBe('avatar');
      expect(img.get('showPlaceholderText')).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('模板模式：group 内变量图同样占位（不依赖回显数据构造）', async () => {
    const spy = mockLoadImage();
    try {
      const { canvas, core } = makeRenderer({ templateMode: true });
      await core.loadJSON(
        posterWith([{ type: 'group', objects: [avatarObj({ id: 'g-avatar' })] }])
      );
      const grp = canvas.getObjects().find((o) => o.type === 'group');
      const img = grp.getObjects().find((o) => o.id === 'g-avatar');
      expect(img.get('isVariableImage')).toBe(true);
      expect(img.get('src')).toBe('{{avatar}}');
    } finally {
      spy.mockRestore();
    }
  });

  it('模板模式：tile 变量背景 → 占位 pattern + src 标记', async () => {
    const spy = mockLoadImage();
    try {
      const { canvas, core } = makeRenderer({ templateMode: true });
      await core.loadJSON(
        posterWith([
          {
            type: 'rect',
            id: 'backgroundImage',
            left: 0,
            top: 0,
            width: 300,
            height: 400,
            backgroundImageMode: 'tile',
            isVariableBackground: true,
            src: '{{bg}}',
            fill: { type: 'pattern', source: '{{bg}}', repeat: 'repeat' },
          },
        ])
      );
      const bg = canvas.getObjects().find((o) => o.id === 'backgroundImage');
      expect(bg.get('src')).toBe('{{bg}}');
      expect(bg.get('variableLabel')).toBe('bg');
      expect(bg.get('showPlaceholderText')).toBe(true);
      expect(typeof bg.fill.source).not.toBe('string');
    } finally {
      spy.mockRestore();
    }
  });

  it('数据模式：已解析真 URL + isVariableImage 标记 → 真图不被劫持（补丁已安装也不影响）', async () => {
    const spy = mockLoadImage();
    try {
      // 先渲染一次模板模式（安装全局占位补丁）
      const a = makeRenderer({ templateMode: true });
      await a.core.loadJSON(posterWith([avatarObj()]));
      // 数据模式：真实 URL + 残留标记
      const { canvas, core } = makeRenderer({});
      await core.loadJSON(
        posterWith([avatarObj({ src: 'https://x/real.png', isVariableImage: true })])
      );
      const img = canvas.getObjects().find((o) => o.id === 'avatar');
      expect(img.get('src')).toBe('https://x/real.png');
      expect(img._element.src).toBe('https://x/real.png');
      expect(img.get('showPlaceholderText')).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  it('数据模式：标记 + 空 src → 元素丢弃（严格渲染器语义，补丁已安装也不占位）', async () => {
    const spy = jest.spyOn(fabric.util, 'loadImage').mockImplementation((url, cb, thisArg) => {
      const el = document.createElement('img');
      cb.call(thisArg, el, true);
    });
    try {
      const a = makeRenderer({ templateMode: true });
      await a.core.loadJSON(posterWith([avatarObj()]));
      const { canvas, core } = makeRenderer({});
      await core.loadJSON(posterWith([avatarObj({ src: '', isVariableImage: true })]));
      expect(canvas.getObjects().find((o) => o.id === 'avatar')).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
});
