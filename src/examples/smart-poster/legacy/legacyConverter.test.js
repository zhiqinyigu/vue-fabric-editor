/**
 * 旧版 posterConfig → 新 fabric JSON 转换器
 * - calculateRatio（旧昵称字号比例）边界
 * - convertLegacyPoster：workspace/backgroundImage/文本/图片/二维码/jsonList/变量
 * - convertLegacyPoster：头像两段式 avatarPosition（旧旧版——mode:'old' 或 无 mode 且无
 *   imgs/jsonList——缺框按 45*几倍图默认尺寸）与隐藏坐标丢弃
 * - convertLegacyPoster：img[] 已知变量无值 → 标准变量图（isVariableImage，版位拉伸）
 * - convertLegacyPoster：头像/图片变量纯 json 闭环（标准变量图 + 满框圆 clipPath，
 *   编辑器/渲染端原生机制消费，无渲染后布局钩子）
 * - convertLegacyPoster：旧 align 语义（splitByGrapheme=false 一律按 left，换行盒保留 textAlign）
 * - convertLegacyPoster：旧业务约定 x/y ≥ 8000 隐藏元素丢弃
 * - convertLegacyPoster：canvasTextBaseline 文本基线（旧旧版——mode:'old' 或 无 mode 且无
 *   imgs/jsonList——alphabetic 才补偿；旧版——mode:'new' 或 无 mode 但含 imgs/jsonList——
 *   canvasTextBaseline 一律视为 hanging 不补偿）
 * - convertLegacyPoster：真实旧数据 old_json.json（存量海报数据适配）
 * - 转换结果可被 RendererCore 直接加载（冒烟，含 clipPath/enliven 回归）
 */
import { fabric } from 'fabric';

// 二维码/条形码生成在 jsdom 不可用，mock 生成函数
jest.mock('../../../core/generators', () => ({
  generateQrCodeDataURL: jest.fn(() => Promise.resolve('data:image/png;base64,FAKEQR')),
  generateBarcodeDataURL: jest.fn(() => 'data:image/png;base64,FAKEBAR'),
  qrParamsToOption: (o) => o,
}));

// 桥接：转换器默认加载器走 loadImageResilient，桥回 fabric.util.loadImage（测试经该
// spy mock 图片加载），并保留其"失败去 crossOrigin 重试"的回退语义，其余导出原样透传
jest.mock('@/core/imageLoader', () => {
  const actual = jest.requireActual('@/core/imageLoader');
  const { fabric } = require('fabric');
  const loadImageTheFabricWay = (url, crossOrigin) =>
    new Promise((resolve, reject) => {
      fabric.util.loadImage(
        url,
        (img, isError) => {
          if (isError) reject(new Error('image load failed: ' + url));
          else resolve(img);
        },
        null,
        crossOrigin
      );
    });
  return {
    ...actual,
    loadImageResilient: (url, opts) => {
      const crossOrigin = (opts && opts.crossOrigin) || 'anonymous';
      return loadImageTheFabricWay(url, crossOrigin).catch(() => loadImageTheFabricWay(url, null));
    },
  };
});

import RendererCore from '../../../core/RendererCore';
import oldJson from './old_json.json';
import { convertLegacyPoster, calculateRatio } from './legacyConverter';

// 真实旧数据中的背景图文件名（mock 匹配 key）
const OLD_BG_KEY = '9e38800f2d094d77bbb7abfea765af5c.png';

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

// 带背景的完整配置（用于精确几何断言）
function makeFullConfig() {
  return {
    background: 'https://x/bg.png',
    backgroundColor: '#fafafa',
    avatarPosition: '100,200,80',
    nickNamePosition: '50,60,#ff0000',
    qrCodePosition: '500,1200,100',
    text: [
      { text: '{userName} 打卡', x: '10', y: '20', color: '#fff', size: '30', fontWeight: 'bold' },
      {
        text: '{unknownKey} {exerciseContent}',
        x: '10',
        y: '100',
        color: '#333',
        size: '24',
        lineHeight: '1.5',
        splitByGrapheme: true,
        width: '300',
        height: '200',
      },
    ],
    img: [{ x: '10', y: '400', width: '40', height: '50', src: 'https://x/a.png' }],
    jsonList: [
      {
        json: JSON.stringify({
          type: 'rect',
          left: 0,
          top: 0,
          width: 100,
          height: 200,
          fill: '#ffffff',
          rx: 20,
          ry: 20,
          strokeWidth: 0,
        }),
        moveTo: '0',
      },
    ],
  };
}

const FULL_DATA = {
  userName: '张三',
  exerciseContent: '内容',
  avatar: 'data:image/png;base64,AA',
  $posterQrcode: 'https://share/abc',
};

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('calculateRatio（旧昵称字号比例）', () => {
  it('边界：落入窗口直接返回 1', () => {
    expect(calculateRatio(150)).toBe(1);
    expect(calculateRatio(160)).toBe(1);
    expect(calculateRatio(375)).toBe(1);
  });
  it('大于等于窗口上限：继续分段（窗口为开区间 < maxW）', () => {
    expect(calculateRatio(380)).toBe(2); // 380/1=380 不 < 380 → 380/2=190 ∈ 窗口
  });
  it('大于窗口：除以最小整数段数', () => {
    expect(calculateRatio(540)).toBe(2); // 540/2=270
    expect(calculateRatio(750)).toBe(2); // 750/2=375
    expect(calculateRatio(1000)).toBe(3); // 1000/3≈333
    expect(calculateRatio(1080)).toBe(3); // 1080/3=360
  });
});

describe('convertLegacyPoster：完整配置', () => {
  it('workspace + 背景 + 各元素几何与顺序', async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1000, h: 1400 }, 'a.png': { w: 200, h: 100 } });
    const json = await convertLegacyPoster(makeFullConfig(), { data: FULL_DATA });

    expect(json.version).toBe('5.3.0');
    // workspace 置于最底
    expect(json.objects[0].id).toBe('workspace');
    expect(json.objects[0]).toMatchObject({
      left: 0,
      top: 0,
      width: 1000,
      height: 1400,
      fill: '#fafafa',
    });
    // 背景图
    expect(json.objects[1]).toMatchObject({
      id: 'backgroundImage',
      src: 'https://x/bg.png',
      backgroundImageMode: 'cover',
      width: 1000,
      height: 1400,
    });
    // jsonList moveTo '0' → 紧随 workspace/背景之后（白底圆角矩形在头像下）
    expect(json.objects[2]).toMatchObject({
      type: 'rect',
      fill: '#ffffff',
      rx: 20,
      ry: 20,
      roundValue: 20,
    });

    // 头像：标准变量图 + 满框圆 clipPath（编辑器序列化形态，纯 json 圆切）
    const avatar = json.objects.find((o) => o.id === 'legacy-avatar');
    expect(avatar).toMatchObject({
      src: '{{avatar}}',
      isVariableImage: true,
      left: 100,
      top: 200,
      width: 80,
      height: 80,
      clipPath: {
        type: 'ellipse',
        absolutePositioned: false,
        originX: 'center',
        originY: 'center',
        rx: 40,
        ry: 40,
      },
    });
    expect(avatar.legacyAvatar).toBeUndefined();

    // 昵称：字号 = 12 * calculateRatio(1000) = 36；config 含 jsonList（无 mode）→ 推断旧版 new，
    // canvasTextBaseline 一律视为 hanging，y 即盒顶不补偿
    const nick = json.objects.find((o) => o.id === 'legacy-nickname');
    expect(nick).toMatchObject({
      text: '{{nickname}}',
      left: 50,
      top: 60,
      fill: '#ff0000',
      fontSize: 36,
    });

    // 普通文本 → type 'i-text'（可编辑，编辑器属性面板匹配），仅已知变量转 {{key}}
    const t0 = json.objects.find((o) => o.id === 'legacy-text-0');
    expect(t0).toMatchObject({
      type: 'i-text',
      text: '{{userName}} 打卡',
      fontSize: 30,
      fontWeight: 'bold',
    });

    // splitByGrapheme + height → 尺寸锁 + 省略号；未知名变量保持字面量
    const t1 = json.objects.find((o) => o.id === 'legacy-text-1');
    expect(t1).toMatchObject({
      type: 'textbox',
      text: '{unknownKey} {{exerciseContent}}',
      lineHeight: 1.5,
      width: 300,
      clipEnabled: true,
      frameHeight: 200,
      ellipsisEnabled: true,
      splitByGrapheme: true,
    });

    // 图片：转换期加载取自然尺寸 → scaleX/scaleY
    const img = json.objects.find((o) => o.id === 'legacy-img-0');
    expect(img).toMatchObject({
      src: 'https://x/a.png',
      left: 10,
      top: 400,
      width: 200,
      height: 100,
      scaleX: 0.2,
      scaleY: 0.5,
    });

    // 二维码：extensionType + extension.data 变量 + 按 position 宽生成
    const qr = json.objects.find((o) => o.id === 'legacy-qrcode');
    expect(qr).toMatchObject({
      extensionType: 'qrcode',
      left: 500,
      top: 1200,
      extension: { data: '{{$posterShareUrl}}', width: 100 },
    });

    // variableMeta：{{}} 包裹符 + 收集到的变量
    expect(json.variableMeta.delimiter).toEqual({ start: '{{', end: '}}' });
    const names = json.variableMeta.schema.map((v) => v.path);
    ['userName', 'exerciseContent', 'avatar', '$posterShareUrl', 'nickname'].forEach((n) =>
      expect(names).toContain(n)
    );
  });

  it('avatar 未提供（data 为空）时仍生成变量占位头像（渲染期按 scope 解析）', async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1000, h: 1400 }, 'a.png': { w: 200, h: 100 } });
    const json = await convertLegacyPoster(makeFullConfig(), { data: { userName: '张三' } });
    // 与昵称同语义：转换期不依赖 data.avatar，src 保持 {{avatar}} 待渲染期解析；
    // 渲染用户无头像时元素不可见（等价旧引擎跳过头像）
    expect(json.objects.find((o) => o.id === 'legacy-avatar')).toMatchObject({
      src: '{{avatar}}',
    });
  });

  it('qrImage（旧 shareCode）优先：直接作为图片对象，不走动态生成', async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1000, h: 1400 }, 'a.png': { w: 200, h: 100 } });
    const json = await convertLegacyPoster(makeFullConfig(), {
      data: FULL_DATA,
      qrImage: 'data:image/png;base64,QRRR',
    });
    const qr = json.objects.find((o) => o.id === 'legacy-qrcode');
    expect(qr.extensionType).toBeUndefined();
    expect(qr.src).toBe('data:image/png;base64,QRRR');
    // fabric.Image 的 width/height 是源图裁剪区：自然尺寸 300 的码放入 100 框
    // 须输出自然尺寸 + scale，而非直接写 width/height = 100（会裁剪放大成框的一角）
    const qr300 = 'data:image/png;base64,QRRR300';
    mockLoadImageByUrl({
      'bg.png': { w: 1000, h: 1400 },
      'a.png': { w: 200, h: 100 },
      [qr300]: { w: 300, h: 300 },
    });
    const json300 = await convertLegacyPoster(makeFullConfig(), {
      data: FULL_DATA,
      qrImage: qr300,
    });
    const qrObj = json300.objects.find((o) => o.id === 'legacy-qrcode');
    expect(qrObj).toMatchObject({ width: 300, height: 300 });
    expect(qrObj.scaleX).toBeCloseTo(100 / 300, 5);
    expect(qrObj.scaleY).toBeCloseTo(100 / 300, 5);
  });

  it('jsonList image 字段 {表达式}：按图片自然尺寸求值（复刻旧渲染引擎）', async () => {
    mockLoadImageByUrl({
      'avatar.png': { w: 200, h: 400 },
      'qr.jpg': { w: 256, h: 256 },
    });
    const avatarJson = {
      type: 'image',
      version: '5.4.2',
      id: 'avatar',
      left: 72,
      top: 111,
      src: '{avatar}',
      crossOrigin: 'anonymous',
      width: '{naturalHeight < naturalWidth ? naturalHeight : naturalWidth}',
      height: '{naturalHeight < naturalWidth ? naturalHeight : naturalWidth}',
      scaleX: '{132/(naturalHeight < naturalWidth ? naturalHeight : naturalWidth)}',
      scaleY: '{132/(naturalHeight < naturalWidth ? naturalHeight : naturalWidth)}',
      clipPath: {
        type: 'circle',
        originX: 'center',
        originY: 'center',
        width: '{naturalHeight < naturalWidth ? naturalHeight : naturalWidth}',
        height: '{naturalHeight < naturalWidth ? naturalHeight : naturalWidth}',
        radius: '{(naturalHeight < naturalWidth ? naturalHeight : naturalWidth) / 2}',
      },
    };
    const qrcodeJson = {
      type: 'image',
      version: '5.4.2',
      id: 'qrcode',
      left: 888,
      top: 1185,
      src: '{$posterQrcode}',
      width: '{naturalWidth}',
      height: '{naturalHeight}',
      scaleX: '{150/naturalWidth}',
      scaleY: '{150/naturalHeight}',
    };
    const json = await convertLegacyPoster(
      {
        jsonList: [
          { json: JSON.stringify(avatarJson) },
          { json: JSON.stringify(qrcodeJson) },
          {
            // src 含未解析变量 → 表达式无法求值 → 整个对象丢弃
            json: JSON.stringify({
              type: 'image',
              id: 'broken',
              src: '{unknownVar}',
              width: '{naturalWidth}',
              height: '{naturalHeight}',
            }),
          },
        ],
      },
      {
        data: { avatar: 'https://x/avatar.png', $posterQrcode: 'https://x/qr.jpg' },
        cacheBust: false,
      }
    );

    // 竖图 200x400：size = min = 200
    const size = 200;
    const avatar = json.objects.find((o) => o.id === 'avatar');
    expect(avatar).toMatchObject({ width: size, height: size, src: 'https://x/avatar.png' });
    expect(avatar.scaleX).toBeCloseTo(132 / size, 5);
    expect(avatar.scaleY).toBeCloseTo(132 / size, 5);
    expect(avatar.clipPath.radius).toBe(size / 2);

    const qrcode = json.objects.find((o) => o.id === 'qrcode');
    expect(qrcode).toMatchObject({ width: 256, height: 256, src: 'https://x/qr.jpg' });
    expect(qrcode.scaleX).toBeCloseTo(150 / 256, 5);
    expect(qrcode.scaleY).toBeCloseTo(150 / 256, 5);

    expect(json.objects.find((o) => o.id === 'broken')).toBeUndefined();
  });

  it('无背景 + 无宽高：workspace 取元素包围盒', async () => {
    mockLoadImageByUrl({ 'a.png': { w: 200, h: 100 } });
    const json = await convertLegacyPoster(
      { img: [{ x: '10', y: '20', width: '40', height: '50', src: 'https://x/a.png' }] },
      {}
    );
    const ws = json.objects.find((o) => o.id === 'workspace');
    expect(ws.width).toBeCloseTo(10 + 40, 3); // 右边界
    expect(ws.height).toBeCloseTo(20 + 50, 3); // 下边界
    expect(json.objects.find((o) => o.id === 'backgroundImage')).toBeUndefined();
  });

  it('img[] src 已知变量且 data 无值 → 标准变量图（{{key}} 语义 + isVariableImage 版位拉伸）', async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1000, h: 1400 } });
    const json = await convertLegacyPoster(
      {
        background: 'https://x/bg.png',
        img: [
          // 已知变量无值 → 变量图
          { x: '10', y: '20', width: '40', height: '50', src: '{bookshelfImage}' },
          // 未知名变量（不在 scopeKeys/knownKeys）→ 静态路径跳过
          { x: '50', y: '60', width: '80', height: '90', src: '{unknownVar}' },
        ],
      },
      {
        data: {},
        scopeKeys: ['bookshelfImage'],
        cacheBust: false,
      }
    );
    const varImg = json.objects.find((o) => o.id === 'legacy-img-0');
    expect(varImg).toMatchObject({
      src: '{{bookshelfImage}}',
      isVariableImage: true,
      left: 10,
      top: 20,
      width: 40,
      height: 50,
    });
    // 标准变量图：编辑器变量预览与渲染端 variableImageFit 两端原生版位拉伸
    expect(varImg.legacyVariableImg).toBeUndefined();
    expect(json.objects.find((o) => o.id === 'legacy-img-1')).toBeUndefined();
  });

  it('img[] src 已知变量且 data 有值 → 静态固化路径（前台渲染场景行为不变）', async () => {
    mockLoadImageByUrl({ 'with.png': { w: 100, h: 100 } });
    const json = await convertLegacyPoster(
      { img: [{ x: '30', y: '40', width: '60', height: '70', src: '{knownWith}' }] },
      { data: { knownWith: 'https://x/with.png' }, cacheBust: false }
    );
    const fixed = json.objects.find((o) => o.id === 'legacy-img-0');
    expect(fixed).toMatchObject({ src: 'https://x/with.png', width: 100, height: 100 });
    expect(fixed.scaleX).toBeCloseTo(0.6, 5);
    expect(fixed.scaleY).toBeCloseTo(0.7, 5);
    expect(fixed.legacyVariableImg).toBeUndefined();
    expect(fixed.isVariableImage).toBeUndefined();
  });
});

// 项目 6 存量数据（单行变量文本 align center）：验证 splitByGrapheme=false 时 align 按 left 处理
function makeProject6Config() {
  return {
    background: 'https://x/p6-bg.png',
    canvasTextBaseline: 'hanging',
    avatarPosition: '9999,0,',
    nickNamePosition: '9999999,0,#000000',
    qrCodePosition: '99999,0,130',
    text: [
      {
        text: '{nickname}',
        x: 1325,
        y: 886,
        color: '#897c70',
        size: '80',
        align: 'center',
        lineHeight: '',
        fontWeight: 'bold',
        splitByGrapheme: false,
        width: '',
        height: '',
      },
      {
        text: '{dateNum}',
        x: 1354,
        y: 1542,
        color: '#897c70',
        size: '40',
        align: 'center',
        lineHeight: '',
        fontWeight: 'bold',
        splitByGrapheme: false,
        width: '',
        height: '',
      },
      {
        text: '静态左对齐',
        x: 100,
        y: 100,
        color: '#333333',
        size: '30',
        align: '',
        splitByGrapheme: false,
        width: '',
        height: '',
      },
      {
        text: '右对齐文本',
        x: 800,
        y: 200,
        color: '#333333',
        size: '30',
        align: 'right',
        splitByGrapheme: false,
        width: '',
        height: '',
      },
      {
        text: '{text}',
        x: 72,
        y: 266,
        color: '#333333',
        size: '44',
        align: 'center',
        lineHeight: '1.9',
        splitByGrapheme: true,
        width: '936',
        height: '336',
      },
    ],
    img: [],
    jsonList: [],
    mode: 'old',
  };
}

describe('convertLegacyPoster：旧 align 语义（项目6 数据）', () => {
  it('splitByGrapheme=false 时 align 一律按 left（不映射 originX/textAlign），换行盒保留 textAlign', async () => {
    mockLoadImageByUrl({ 'p6-bg.png': { w: 2160, h: 2880 } });
    const json = await convertLegacyPoster(makeProject6Config(), {
      scopeKeys: ['nickname', 'dateNum', 'text'],
    });

    // center + splitByGrapheme=false：旧引擎仍以左边缘为锚点（align 视为 left）→ 不平移
    const t0 = json.objects.find((o) => o.id === 'legacy-text-0');
    expect(t0).toMatchObject({
      type: 'i-text',
      text: '{{nickname}}',
      left: 1325,
      top: 886,
      fontSize: 80,
      fontWeight: 'bold',
    });
    expect(t0.originX).toBeUndefined();
    expect(t0.textAlign).toBeUndefined();
    const t1 = json.objects.find((o) => o.id === 'legacy-text-1');
    expect(t1).toMatchObject({
      text: '{{dateNum}}',
      left: 1354,
      fontSize: 40,
    });
    expect(t1.originX).toBeUndefined();
    expect(t1.textAlign).toBeUndefined();

    // left/空：维持默认左锚点，不产生 originX
    const t2 = json.objects.find((o) => o.id === 'legacy-text-2');
    expect(t2).toMatchObject({ type: 'i-text', text: '静态左对齐', left: 100 });
    expect(t2.originX).toBeUndefined();

    // right + splitByGrapheme=false：同样按 left 处理，x 仍为文本左边缘
    const t3 = json.objects.find((o) => o.id === 'legacy-text-3');
    expect(t3).toMatchObject({ left: 800 });
    expect(t3.originX).toBeUndefined();
    expect(t3.textAlign).toBeUndefined();

    // 换行固定宽度盒（splitByGrapheme）：align 生效为盒内 textAlign（盒左边缘贴 x），不映射 originX
    const t4 = json.objects.find((o) => o.id === 'legacy-text-4');
    expect(t4).toMatchObject({
      type: 'textbox',
      text: '{{text}}',
      left: 72,
      width: 936,
      splitByGrapheme: true,
      textAlign: 'center',
    });
    expect(t4.originX).toBeUndefined();

    // 变量声明：scopeKeys 中的 nickname/dateNum 均进入 variableMeta
    const names = json.variableMeta.schema.map((v) => v.path);
    expect(names).toEqual(expect.arrayContaining(['nickname', 'dateNum']));

    // 旧业务约定：昵称/二维码坐标任一 ≥ 8000 表示移出可视区域 → 直接丢弃
    expect(json.objects.find((o) => o.id === 'legacy-nickname')).toBeUndefined();
    expect(json.objects.find((o) => o.id === 'legacy-qrcode')).toBeUndefined();
  });

  it('变量文本安全：无 data 值时保留 {{key}} 模板，左锚点关系不依赖值长度', async () => {
    mockLoadImageByUrl({ 'p6-bg.png': { w: 2160, h: 2880 } });
    const json = await convertLegacyPoster(makeProject6Config(), {
      scopeKeys: ['nickname', 'dateNum'],
    });
    const t0 = json.objects.find((o) => o.id === 'legacy-text-0');
    // 转换期零知识：不注入示例值，模板与左锚点原样保留，渲染期由 renderObjects 替换后重定位
    expect(t0.text).toBe('{{nickname}}');
    expect(t0.originX).toBeUndefined();
    expect(t0.left).toBe(1325);
    expect(t0.width).toBeUndefined();
  });
});

describe('convertLegacyPoster：旧业务约定 x/y ≥ 8000 隐藏元素丢弃', () => {
  const baseConfig = {
    background: 'https://x/bg.png',
    text: [],
    img: [],
    jsonList: [],
  };

  it('头像/昵称/二维码任一坐标 ≥ 8000（x 或 y）直接丢弃', async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1000, h: 1000 } });
    const json = await convertLegacyPoster(
      {
        ...baseConfig,
        avatarPosition: '88888,8,80',
        nickNamePosition: '0,88888,#000000',
        qrCodePosition: '99999,0,130',
      },
      { data: { avatar: 'data:image/png;base64,AA' } }
    );
    expect(json.objects.find((o) => o.id === 'legacy-avatar')).toBeUndefined();
    expect(json.objects.find((o) => o.id === 'legacy-nickname')).toBeUndefined();
    expect(json.objects.find((o) => o.id === 'legacy-qrcode')).toBeUndefined();
  });

  it('avatarPosition 两段式 "x,y"：无 mode 且无 imgs/jsonList（旧旧版）按 45*几倍图默认尺寸展示', async () => {
    // 用户实测存量数据形态（无 mode 字段 + 两段 avatarPosition，无 imgs/jsonList）
    mockLoadImageByUrl({
      '1ec8.png': { w: 1080, h: 1440 },
    });
    const json = await convertLegacyPoster(
      {
        background: 'https://x/1ec8.png',
        avatarPosition: '58,58',
        nickNamePosition: '225,112,#ffffff',
        qrCodePosition: '834,1040,230',
        text: [],
      },
      // 完整复刻用户实测：无 data 注入（头像变量占位语义，渲染期解析 scope.avatar）
      { data: {} }
    );
    // posterWidth=1080 → calculateRatio=3 → 默认框 45*3=135
    const avatar = json.objects.find((o) => o.id === 'legacy-avatar');
    expect(avatar).toMatchObject({
      type: 'image',
      src: '{{avatar}}',
      left: 58,
      top: 58,
      width: 135,
      height: 135,
      isVariableImage: true,
      clipPath: { type: 'ellipse', rx: 67.5, ry: 67.5 },
    });
    expect(avatar.legacyAvatar).toBeUndefined();
    // 昵称照常生成（变量占位，不依赖 data 值）
    expect(json.objects.find((o) => o.id === 'legacy-nickname')).toMatchObject({
      left: 225,
      fill: '#ffffff',
    });
  });

  it('avatarPosition 两段式 "x,y"：mode:old（旧旧版）同样按 45*几倍图默认尺寸展示', async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1080, h: 1440 } });
    const json = await convertLegacyPoster(
      { ...baseConfig, avatarPosition: '58,58', mode: 'old' },
      { data: { avatar: 'data:image/png;base64,AA' } }
    );
    // posterWidth=1080 → calculateRatio=3 → 默认框 45*3=135
    const avatar = json.objects.find((o) => o.id === 'legacy-avatar');
    expect(avatar).toMatchObject({
      type: 'image',
      src: '{{avatar}}',
      left: 58,
      top: 58,
      width: 135,
      height: 135,
      isVariableImage: true,
      clipPath: { type: 'ellipse', rx: 67.5, ry: 67.5 },
    });
  });

  it("avatarPosition 两段式：mode:'new' / 无 mode 但含 jsonList（旧版）不启用默认框", async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1080, h: 1440 } });
    // mode:'new'：缺第三段不展示
    const jsonNew = await convertLegacyPoster(
      { ...baseConfig, avatarPosition: '58,58', mode: 'new' },
      { data: { avatar: 'data:image/png;base64,AA' } }
    );
    expect(jsonNew.objects.find((o) => o.id === 'legacy-avatar')).toBeUndefined();

    // 无 mode 但 baseConfig 含 jsonList：推断为旧版 new，同样不启用默认框
    const jsonInfer = await convertLegacyPoster(
      { ...baseConfig, avatarPosition: '58,58' },
      { data: { avatar: 'data:image/png;base64,AA' } }
    );
    expect(jsonInfer.objects.find((o) => o.id === 'legacy-avatar')).toBeUndefined();
  });

  it('avatarPosition 第三段显式 0 仍视为不展示；缺省框仅在真缺段时启用', async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1080, h: 1440 } });
    const json = await convertLegacyPoster(
      { ...baseConfig, avatarPosition: '58,58,0' },
      { data: { avatar: 'data:image/png;base64,AA' } }
    );
    // 显式 0 = 旧约定"不显示"，不用默认框
    expect(json.objects.find((o) => o.id === 'legacy-avatar')).toBeUndefined();

    // trailing 空（"58,58,"）Number('')=0 同显式 0
    const json2 = await convertLegacyPoster(
      { ...baseConfig, avatarPosition: '58,58,' },
      { data: { avatar: 'data:image/png;base64,AA' } }
    );
    expect(json2.objects.find((o) => o.id === 'legacy-avatar')).toBeUndefined();

    // 空 avatarPosition + data.avatar：不生成（无配置即无元素）
    const json3 = await convertLegacyPoster(
      { ...baseConfig, avatarPosition: '' },
      { data: { avatar: 'data:image/png;base64,AA' } }
    );
    expect(json3.objects.find((o) => o.id === 'legacy-avatar')).toBeUndefined();
  });

  it('恰好 7999 属边界内正常输出（≥ 8000 才丢弃）', async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1000, h: 1000 } });
    const json = await convertLegacyPoster({
      ...baseConfig,
      nickNamePosition: '7999,0,#000000',
      qrCodePosition: '0,7999,130',
    });
    expect(json.objects.find((o) => o.id === 'legacy-nickname')).toBeTruthy();
    expect(json.objects.find((o) => o.id === 'legacy-qrcode')).toBeTruthy();
  });
});

describe('convertLegacyPoster：canvasTextBaseline 文本基线语义', () => {
  // 旧旧版（old）形态：无 mode、无 imgs/jsonList（只含旧字段 text/img）
  const baseConfig = {
    background: 'https://x/bg.png',
    text: [
      { text: '自动宽度', x: 100, y: 200, size: '40', splitByGrapheme: false },
      {
        text: '固定盒',
        x: 100,
        y: 300,
        size: '30',
        splitByGrapheme: true,
        width: '400',
        height: '100',
      },
    ],
    img: [],
  };

  it('旧旧版（无 mode/无 imgs/jsonList）alphabetic：自动单行文本与昵称上移 fontSize*0.94，split 盒维持盒顶', async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1000, h: 1000 } });
    const json = await convertLegacyPoster(
      { ...baseConfig, canvasTextBaseline: 'alphabetic', nickNamePosition: '10,50,#333' },
      { scopeKeys: ['nickname'] }
    );
    const t0 = json.objects.find((o) => o.id === 'legacy-text-0');
    const t1 = json.objects.find((o) => o.id === 'legacy-text-1');
    const nick = json.objects.find((o) => o.id === 'legacy-nickname');
    expect(t0).toMatchObject({ top: 200 - 40 * 0.94, fontSize: 40 });
    expect(t1).toMatchObject({ type: 'textbox', top: 300, fontSize: 30 });
    // posterWidth=1000 → ratio=3 → 昵称字号 36
    expect(nick).toMatchObject({ top: 50 - 36 * 0.94, fontSize: 36 });
  });

  it("mode:'old' + hanging / 缺省：y 即盒顶，不做修正", async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1000, h: 1000 } });
    const json = await convertLegacyPoster(
      {
        ...baseConfig,
        mode: 'old',
        canvasTextBaseline: 'hanging',
        nickNamePosition: '10,50,#333',
      },
      { scopeKeys: ['nickname'] }
    );
    const t0 = json.objects.find((o) => o.id === 'legacy-text-0');
    const nick = json.objects.find((o) => o.id === 'legacy-nickname');
    expect(t0).toMatchObject({ top: 200 });
    expect(nick).toMatchObject({ top: 50 });
  });

  it('旧旧版：仅显式 hanging 不补偿；canvasTextBaseline 缺省视为 alphabetic → 补偿', async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1000, h: 1000 } });
    const hanging = await convertLegacyPoster(
      {
        ...baseConfig,
        canvasTextBaseline: 'hanging',
        nickNamePosition: '10,50,#333',
      },
      { scopeKeys: ['nickname'] }
    );
    expect(hanging.objects.find((o) => o.id === 'legacy-text-0')).toMatchObject({
      top: 200,
    });
    expect(hanging.objects.find((o) => o.id === 'legacy-nickname')).toMatchObject({
      top: 50,
    });

    // canvasTextBaseline 缺省：旧旧版视为 alphabetic（数据 y 以基线为锚）→ 补偿
    const missing = await convertLegacyPoster(
      { ...baseConfig, nickNamePosition: '10,50,#333' },
      { scopeKeys: ['nickname'] }
    );
    expect(missing.objects.find((o) => o.id === 'legacy-text-0')).toMatchObject({
      top: 200 - 40 * 0.94,
    });
    expect(missing.objects.find((o) => o.id === 'legacy-nickname')).toMatchObject({
      top: 50 - 36 * 0.94,
    });
  });

  it("mode:'old' 且 canvasTextBaseline 缺省：同样视为 alphabetic → 补偿", async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1000, h: 1000 } });
    const json = await convertLegacyPoster(
      {
        ...baseConfig,
        mode: 'old',
        nickNamePosition: '10,50,#333',
      },
      { scopeKeys: ['nickname'] }
    );
    const t0 = json.objects.find((o) => o.id === 'legacy-text-0');
    const nick = json.objects.find((o) => o.id === 'legacy-nickname');
    expect(t0).toMatchObject({ top: 200 - 40 * 0.94 });
    expect(nick).toMatchObject({ top: 50 - 36 * 0.94 });
  });

  it("mode:'new' 即便标 alphabetic 也不补偿（y 即盒顶）", async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1000, h: 1000 } });
    const json = await convertLegacyPoster(
      {
        ...baseConfig,
        mode: 'new',
        canvasTextBaseline: 'alphabetic',
        nickNamePosition: '10,50,#333',
      },
      { scopeKeys: ['nickname'] }
    );
    const t0 = json.objects.find((o) => o.id === 'legacy-text-0');
    const nick = json.objects.find((o) => o.id === 'legacy-nickname');
    expect(t0).toMatchObject({ top: 200 });
    expect(nick).toMatchObject({ top: 50 });
  });

  it('无 mode 但含 jsonList（推断为旧版 new）：canvasTextBaseline 一律视为 hanging，即便标 alphabetic 不补偿', async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1000, h: 1000 } });
    const json = await convertLegacyPoster(
      {
        ...baseConfig,
        jsonList: [],
        canvasTextBaseline: 'alphabetic',
        nickNamePosition: '10,50,#333',
      },
      { scopeKeys: ['nickname'] }
    );
    const t0 = json.objects.find((o) => o.id === 'legacy-text-0');
    const nick = json.objects.find((o) => o.id === 'legacy-nickname');
    expect(t0).toMatchObject({ top: 200 });
    expect(nick).toMatchObject({ top: 50 });
  });
});

describe('convertLegacyPoster：真实旧数据 old_json.json', () => {
  it('存量海报：背景定尺寸 + jsonList 保序 + 头像/昵称/文本/图片/二维码', async () => {
    mockLoadImageByUrl({
      [OLD_BG_KEY]: { w: 1080, h: 1440 },
      'book.png': { w: 141, h: 200 },
    });
    const json = await convertLegacyPoster(oldJson, {
      data: {
        avatar: 'https://x/avatar.png',
        posterAction: '查看详情',
        textAuthor: '张老师',
        text: '正文内容',
        courseName: '课程名',
        periodName: '第一期',
        bookshelfImage: 'https://x/book.png',
        nickname: '王小明',
      },
      cacheBust: false,
    });

    expect(json.version).toBe('5.3.0');
    // 背景决定 workspace 尺寸（1080x1440），workspace 最底、背景紧随
    expect(json.objects[0]).toMatchObject({ id: 'workspace', width: 1080, height: 1440 });
    expect(json.objects[1]).toMatchObject({
      id: 'backgroundImage',
      src: oldJson.background,
      width: 1080,
      height: 1440,
      backgroundImageMode: 'cover',
    });

    // jsonList 6 项均 moveTo '0' → 逆序插入背景之后（后解析的在前）
    expect(json.objects[2]).toMatchObject({ type: 'triangle', left: 666 });
    expect(json.objects[3]).toMatchObject({ type: 'triangle', left: 639 });
    expect(json.objects[4]).toMatchObject({ type: 'triangle', left: 612 });
    expect(json.objects[5]).toMatchObject({ type: 'triangle', left: 179 });
    expect(json.objects[6]).toMatchObject({
      type: 'rect',
      rx: 16,
      ry: 16,
      roundValue: 16,
      left: 828,
      top: 1066,
    });
    expect(json.objects[7]).toMatchObject({
      type: 'rect',
      rx: 16,
      ry: 16,
      roundValue: 16,
      left: 72,
      top: 748,
    });

    // 头像：avatar '72,90,126' + data.avatar → 标准变量图 + 满框圆 clipPath
    const avatar = json.objects.find((o) => o.id === 'legacy-avatar');
    expect(avatar).toMatchObject({
      src: '{{avatar}}',
      isVariableImage: true,
      left: 72,
      top: 90,
      width: 126,
      height: 126,
      clipPath: { type: 'ellipse', rx: 63, ry: 63 },
    });
    expect(avatar.legacyAvatar).toBeUndefined();

    // 昵称：nickname '2000,2000,#333'，posterWidth=1080 → ratio=3 → fontSize 36
    // fixture mode:"new" → 基线补偿关闭，y 即盒顶
    const nick = json.objects.find((o) => o.id === 'legacy-nickname');
    expect(nick).toMatchObject({
      text: '{{nickname}}',
      left: 2000,
      top: 2000,
      fill: '#333',
      fontSize: 36,
    });

    // 7 个文本：已知变量转 {{}}，splitByGrapheme+height 的转为省略号 textbox
    const t0 = json.objects.find((o) => o.id === 'legacy-text-0');
    expect(t0).toMatchObject({
      type: 'i-text',
      text: '{{nickname}}',
      left: 228,
      // mode:"new" 关闭基线补偿，top 保持原 y
      top: 104,
      fontSize: 40,
      fontWeight: 'bold',
    });
    // splitByGrapheme=false：旧 align:'right' 一律按 left 处理，不平移、不写 textAlign
    expect(t0.originX).toBeUndefined();
    expect(t0.textAlign).toBeUndefined();
    const t2 = json.objects.find((o) => o.id === 'legacy-text-2');
    expect(t2).toMatchObject({
      type: 'i-text',
      text: '{{textAuthor}}：',
      fontSize: 44,
      top: 266,
    });
    const t3 = json.objects.find((o) => o.id === 'legacy-text-3');
    expect(t3).toMatchObject({
      type: 'textbox',
      text: '{{text}}',
      width: 936,
      // split 固定尺寸盒：y 即盒顶，不做基线补偿
      top: 350,
      clipEnabled: true,
      frameHeight: 336,
      ellipsisEnabled: true,
    });
    const t4 = json.objects.find((o) => o.id === 'legacy-text-4');
    expect(t4).toMatchObject({ type: 'i-text', text: '《{{courseName}}》', top: 825 });
    const t6 = json.objects.find((o) => o.id === 'legacy-text-6');
    expect(t6).toMatchObject({
      type: 'i-text',
      text: '长按识别二维码，查看完整内容',
      top: 1138,
    });

    // 图片：src 变量 {bookshelfImage} 由 data 解析 → 加载取自然尺寸 141x200 → scale 1
    const img = json.objects.find((o) => o.id === 'legacy-img-0');
    expect(img).toMatchObject({
      src: 'https://x/book.png',
      left: 104,
      top: 780,
      width: 141,
      height: 200,
      scaleX: 1,
      scaleY: 1,
    });

    // 二维码：qrcode '842,1080,152' → extension 占位变量
    const qr = json.objects.find((o) => o.id === 'legacy-qrcode');
    expect(qr).toMatchObject({
      extensionType: 'qrcode',
      left: 842,
      top: 1080,
      extension: { data: '{{$posterShareUrl}}', width: 152 },
    });

    // variableMeta：实际出现的变量（nickname 固化、$posterShareUrl 二维码内容占位）
    const names = json.variableMeta.schema.map((v) => v.path);
    [
      'nickname',
      'posterAction',
      'textAuthor',
      'text',
      'courseName',
      'periodName',
      'avatar',
      '$posterShareUrl',
    ].forEach((n) => expect(names).toContain(n));
  });
});

describe('冒烟：转换结果可被 RendererCore 加载', () => {
  it('loadJSON 全管线还原', async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1000, h: 1400 }, 'a.png': { w: 200, h: 100 } });
    const json = await convertLegacyPoster(makeFullConfig(), { data: FULL_DATA });
    const { core } = createRenderer();
    await core.loadJSON(json);
    const ws = core.canvas.getObjects().find((o) => o.id === 'workspace');
    expect(ws).toBeTruthy();
    expect(ws.get('width')).toBe(1000);
    expect(
      core.canvas
        .getObjects()
        .find((o) => o.id === 'legacy-text-1')
        .get('clipEnabled')
    ).toBe(true);
    expect(
      core.canvas
        .getObjects()
        .find((o) => o.id === 'legacy-qrcode')
        .get('extensionType')
    ).toBe('qrcode');
    // 纯 json 圆切：头像 clipPath 以编辑器序列化形态存进产物，
    // 无 opt-in/无渲染后钩子的标准加载路径即出圆形
    const avatar = core.canvas.getObjects().find((o) => o.id === 'legacy-avatar');
    expect(avatar).toBeTruthy();
    const clip = avatar.get('clipPath');
    expect(clip).toBeTruthy();
    expect(clip.get('type')).toBe('ellipse');
    expect(clip.get('rx')).toBe(80 / 2);
    // 标准变量图：渲染期按版位拉伸（isVariableImage + json width/height=box）
    expect(avatar.get('isVariableImage')).toBe(true);
    expect(avatar.get('width')).toBe(80);
    expect(avatar.get('legacyAvatar')).toBeUndefined();
  });
});

describe('convertLegacyPoster：分片缓存参数（按接入域名）', () => {
  // 捕获 loadImage 请求 URL（同时提供自然尺寸使转换成功）
  function spyCapture() {
    const captured = [];
    jest.spyOn(fabric.util, 'loadImage').mockImplementation((url, cb, thisArg) => {
      captured.push(url);
      const el = document.createElement('img');
      Object.defineProperty(el, 'src', { value: url, writable: true, configurable: true });
      Object.defineProperty(el, 'width', { value: 100, writable: true, configurable: true });
      Object.defineProperty(el, 'height', { value: 100, writable: true, configurable: true });
      Object.defineProperty(el, 'naturalWidth', { value: 100, writable: true, configurable: true });
      Object.defineProperty(el, 'naturalHeight', {
        value: 100,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(el, 'complete', { value: true, writable: true, configurable: true });
      cb.call(thisArg, el, false);
    });
    return captured;
  }

  it('背景/img[]/qrImage 的测量加载 URL 追加 feDomain；JSON src 保持干净', async () => {
    const captured = spyCapture();
    const json = await convertLegacyPoster(
      {
        background: 'https://cdn.example.com/bg.png',
        img: [{ src: 'https://cdn.example.com/a.png', x: 0, y: 0 }],
        qrCodePosition: '10,10,100',
      },
      {
        data: {},
        cacheBust: { getValue: () => 'host-a' },
        qrImage: 'https://cdn.example.com/qr.jpg',
      }
    );
    // 转换期测量加载（真实请求）携带 feDomain（该 CDN 按 feDomain 返回 CORS 头）
    expect(captured).toEqual([
      'https://cdn.example.com/bg.png?feDomain=host-a',
      'https://cdn.example.com/a.png?feDomain=host-a',
      'https://cdn.example.com/qr.jpg?feDomain=host-a',
    ]);
    // JSON src 保持干净（渲染期由 loadJSON 幂等重追加）
    expect(json.objects.find((o) => o.id === 'backgroundImage').src).toBe(
      'https://cdn.example.com/bg.png'
    );
    expect(json.objects.find((o) => o.id === 'legacy-img-0').src).toBe(
      'https://cdn.example.com/a.png'
    );
    expect(json.objects.find((o) => o.id === 'legacy-qrcode').src).toBe(
      'https://cdn.example.com/qr.jpg'
    );
  });

  it('cacheBust=false 关闭：测量加载与 JSON src 均保持原 URL', async () => {
    const captured = spyCapture();
    const json = await convertLegacyPoster(
      { background: 'https://cdn.example.com/bg.png' },
      { data: {}, cacheBust: false }
    );
    expect(captured).toEqual(['https://cdn.example.com/bg.png']);
    expect(json.objects.find((o) => o.id === 'backgroundImage').src).toBe(
      'https://cdn.example.com/bg.png'
    );
  });

  it('已含 feDomain 的 URL 幂等（不重复追加）', async () => {
    const captured = spyCapture();
    await convertLegacyPoster(
      { background: 'https://cdn.example.com/bg.png?feDomain=host-a' },
      { data: {}, cacheBust: { getValue: () => 'host-b' } }
    );
    expect(captured).toEqual(['https://cdn.example.com/bg.png?feDomain=host-a']);
  });
});

describe('convertLegacyPoster：默认加载器 CORS 回退（loadImageResilient 语义）', () => {
  // 模拟无 Access-Control 头的 CDN：带 crossOrigin 请求必然 onerror（CORS 判死），
  // 去掉 crossOrigin 重试成功——覆盖"转换早于回退包装安装"的真实场景
  function mockCorsFailThenFallback() {
    return jest
      .spyOn(fabric.util, 'loadImage')
      .mockImplementation((url, cb, thisArg, crossOrigin) => {
        if (crossOrigin) {
          cb.call(thisArg, null, true);
          return;
        }
        const el = document.createElement('img');
        Object.defineProperty(el, 'src', { value: url, writable: true, configurable: true });
        Object.defineProperty(el, 'width', { value: 1080, writable: true, configurable: true });
        Object.defineProperty(el, 'height', { value: 1440, writable: true, configurable: true });
        Object.defineProperty(el, 'naturalWidth', {
          value: 1080,
          writable: true,
          configurable: true,
        });
        Object.defineProperty(el, 'naturalHeight', {
          value: 1440,
          writable: true,
          configurable: true,
        });
        Object.defineProperty(el, 'complete', { value: true, writable: true, configurable: true });
        cb.call(thisArg, el, false);
      });
  }

  it('测量加载带 crossOrigin 失败 → 去 crossOrigin 重试成功：不告警且背景图生成', async () => {
    const spy = mockCorsFailThenFallback();
    const onWarn = jest.fn();
    const json = await convertLegacyPoster(
      { background: 'https://cdn.example.com/bg.png' },
      { data: {}, onWarn }
    );
    // 同一 URL 请求两次：第一次带 crossOrigin（CORS 失败）、第二次干净重试
    const urls = spy.mock.calls.map((c) => c[0]);
    const crosses = spy.mock.calls.map((c) => c[3]);
    expect(urls.filter((u) => u.indexOf('bg.png') !== -1)).toHaveLength(2);
    expect(crosses).toEqual(['anonymous', null]);
    expect(onWarn).not.toHaveBeenCalled();
    const bg = json.objects.find((o) => o.id === 'backgroundImage');
    expect(bg).toBeTruthy();
    expect(bg.width).toBe(1080);
    expect(bg.height).toBe(1440);
  });
});
