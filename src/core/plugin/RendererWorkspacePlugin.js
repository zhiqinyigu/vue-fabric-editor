/*
 * @Author: cyc
 * @Date: 2026-08-27 11:12:28
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-28 10:25:25
 * 渲染器精简版 WorkspacePlugin（对应编辑器 WorkspacePlugin，零编辑依赖）
 * - hookImportAfter：workspace 只读化 + 画布尺寸/视口/裁切 + 建立设计态基准（designMap/designHeight）
 * - 背景图：relayoutBackground / setBackgroundImage / removeBackgroundImage / getBackgroundImage
 * - resizeSilent：autoGrow 静默增高（对应编辑器 setSizeSilent）
 * - whenImagesLoaded：图片元素就绪
 * 几何计算全部复用 workspaceGeometry 纯函数，与编辑器 WorkspacePlugin 共用同一实现。
 */
import { fabric } from 'fabric';
import { appendCacheBustParam } from '../assetUrl';
import { loadImageResilient, normalizeCrossOrigin } from '../imageLoader';
import {
  computeBackgroundLayout,
  cloneWorkspaceAsClip,
  createBackgroundObject,
} from '../workspaceGeometry';

// 从画布 JSON 重建"设计态"几何快照（与 AutoGrowPlugin.designMap 语义一致：top 为对象顶边）
// 用于 follow 元素相对间距基准；基于 JSON 设计坐标构建（而非实时测量高度）。
function buildDesignMapFromJSON(objects) {
  const map = {};
  (objects || []).forEach((o) => {
    if (!o || o.id == null || o.objects) return;
    const height = (Number(o.height) || 0) * (Number(o.scaleY) || 1);
    const top = Number(o.top) || 0;
    const topEdge = o.originY === 'center' ? top - height / 2 : top;
    map[String(o.id)] = { top: topEdge, bottom: topEdge + height };
  });
  return map;
}

class RendererWorkspacePlugin {
  constructor(canvas, editor, options = {}) {
    this.canvas = canvas;
    this.editor = editor;
    this.options = options;
    this.designMap = {};
    this.designHeight = 0;
  }
  getWorkspace() {
    return this.canvas.getObjects().find((o) => o && o.id === 'workspace') || null;
  }
  getBackgroundImageObj() {
    return this.canvas.getObjects().find((o) => o && o.id === 'backgroundImage') || null;
  }

  /* ---------- 加载后：workspace 呈现 + 设计态基准 ---------- */
  // json 为 ServersPlugin.loadJSON 传入的（hookImportAfter 收到 stringified）画布 JSON
  hookImportAfter(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    const objects = (parsed && parsed.objects) || [];
    const wsJson = objects.find((o) => o && o.id === 'workspace');
    this.designHeight = wsJson ? Number(wsJson.height) || 0 : 0;
    this.designMap = buildDesignMapFromJSON(objects);
    const ws = this.getWorkspace();
    if (!ws) return;
    const w = ws.getScaledWidth();
    const h = ws.getScaledHeight();
    this.canvas.setWidth(w);
    this.canvas.setHeight(h);
    // 视口平移使 workspace 原点映射到画布 (0,0)，与编辑器导出一致
    this.canvas.setViewportTransform([1, 0, 0, 1, -(ws.get('left') || 0), -(ws.get('top') || 0)]);
    ws.set('selectable', false);
    ws.set('evented', false);
    ws.set('hasControls', false);
    cloneWorkspaceAsClip(ws, (cloned) => {
      this.canvas.clipPath = cloned;
      this.canvas.requestRenderAll();
    });
    // 背景图加载失败检测：fabric 会丢弃加载失败的 image 对象，
    // 通过"JSON 有背景、画布无背景"识别；空 src（变量空值）按 D2 静默不报错。
    const bgJson = objects.find((o) => o && o.id === 'backgroundImage');
    if (bgJson && !this.getBackgroundImageObj() && typeof bgJson.src === 'string' && bgJson.src) {
      this._emitBackgroundLoadError(bgJson.src);
    }
  }

  /* ---------- autoGrow 静默增高（与编辑器 setSizeSilent 对齐） ---------- */
  resizeSilent(height) {
    const ws = this.getWorkspace();
    if (!ws || !(height > 0) || height === ws.get('height')) return;
    ws.set('height', height);
    // 背景图按新尺寸重新布局（cover/contain/tile）
    this.relayoutBackground();
    this.canvas.setHeight(height * (ws.get('scaleY') || 1));
    cloneWorkspaceAsClip(ws, (cloned) => {
      this.canvas.clipPath = cloned;
      this.canvas.requestRenderAll();
    });
  }

  /* ---------- 背景图 ---------- */
  // 按图片原始尺寸 + workspace 几何重排背景（与 WorkspacePlugin 同一共享纯函数）。
  // 编辑器保存 JSON 时背景图 scaleX/scaleY 可能被"缺省字段精简"剔除（等于 1），
  // 渲染器须在图片元素就绪后重排一次，否则背景会按 JSON 宽高被拉伸/显示错误。
  relayoutBackground() {
    const bg = this.getBackgroundImageObj();
    if (!bg || !bg.backgroundImageMode) return;
    const ws = this.getWorkspace();
    if (!ws) return;
    const mode = bg.backgroundImageMode;
    // tile 形态不需要真实尺寸（Rect 铺满 workspace）；cover/contain 必须等图片就绪
    let imgSize = null;
    if (mode !== 'tile') {
      const el = bg._element || (bg.fill && bg.fill.source);
      imgSize = el
        ? { w: el.naturalWidth || el.width || 0, h: el.naturalHeight || el.height || 0 }
        : null;
      if (!imgSize || !(imgSize.w > 0) || !(imgSize.h > 0)) return;
    }
    const layout = computeBackgroundLayout({
      workspace: ws,
      imageSize: imgSize,
      mode,
      position: bg.backgroundPosition || { x: 0.5, y: 0.5 },
    });
    if (!layout) return;
    const next = { ...layout };
    // 图片形态：width/height 必须重置为真实自然尺寸——
    // 编辑器导出的背景宽高可能是占位图尺寸（如 240x160），若只改 scale，
    // 显示尺寸 = JSON 宽 × scale（错误，表现为"左上角一小块"）
    if (mode !== 'tile' && imgSize) {
      next.width = imgSize.w;
      next.height = imgSize.h;
    }
    bg.set(next);
    if (bg.setCoords) bg.setCoords();
    this.canvas.requestRenderAll();
  }
  // 设置背景图层（与编辑器 WorkspacePlugin.setBackgroundImage 语义一致）
  setBackgroundImage(src, mode = 'cover', position, cb) {
    return new Promise((resolve) => {
      const ws = this.getWorkspace();
      if (!src || !ws) {
        resolve(false);
        cb && cb(false);
        return;
      }
      this.removeBackgroundImage();
      const position2 = position || { x: 0.5, y: 0.5 };
      // 请求 URL 追加「按接入域名分片缓存」参数（幂等；与编辑器 setBackgroundImage 同语义）
      const requestUrl = appendCacheBustParam(
        src,
        this.editor && this.editor.options && this.editor.options.cacheBust
      );
      // CORS 回退加载：服务器无 Access-Control-* 时去掉 crossOrigin 重试（保显示，代价是画布被污染）
      const crossOrigin = normalizeCrossOrigin(
        this.editor && this.editor.options ? this.editor.options.crossOrigin : undefined
      );
      loadImageResilient(requestUrl, { crossOrigin })
        .then((img) => {
          const imgSize = {
            w: img.naturalWidth || img.width || 0,
            h: img.naturalHeight || img.height || 0,
          };
          const layout = computeBackgroundLayout({
            workspace: ws,
            imageSize: imgSize,
            mode,
            position: position2,
          });
          if (!layout) {
            resolve(false);
            cb && cb(false);
            return;
          }
          const bgObj = createBackgroundObject({ img, layout, mode, position: position2 });
          const wsIndex = this.canvas.getObjects().indexOf(ws);
          this.canvas.insertAt(bgObj, wsIndex + 1);
          this.canvas.requestRenderAll();
          resolve(true);
          cb && cb(true);
        })
        .catch(() => {
          resolve(false);
          cb && cb(false);
        });
    });
  }
  removeBackgroundImage() {
    const bg = this.getBackgroundImageObj();
    if (bg) {
      this.canvas.remove(bg);
      this.canvas.requestRenderAll();
    }
  }
  getBackgroundImage() {
    const bg = this.getBackgroundImageObj();
    if (!bg) return null;
    let src = '';
    let mode = bg.backgroundImageMode || 'cover';
    if (bg.type === 'image') {
      src = bg.getSrc();
    } else if (bg.type === 'rect' && bg.fill && bg.fill.source) {
      src = bg.fill.source.src;
      mode = 'tile';
    }
    return {
      src,
      mode,
      position: bg.backgroundPosition || { x: 0.5, y: 0.5 },
      opacity: bg.opacity,
    };
  }

  /* ---------- 图片就绪 ---------- */
  whenImagesLoaded() {
    const pending = [];
    // 归一为可监听的 DOM 元素；无法监听（字符串/普通对象/已就绪）直接 resolve，
    // 避免 el.addEventListener is not a function 或监听不到 load 而永久挂起
    const waitEl = (input) =>
      new Promise((resolve) => {
        let el = input;
        if (!el) return resolve();
        // Pattern source 可能是 fabric.Image（其 getElement() 才是原生元素）
        if (
          typeof el.addEventListener !== 'function' &&
          el.getElement &&
          typeof el.getElement === 'function'
        ) {
          el = el.getElement();
        }
        if (!el || typeof el.addEventListener !== 'function') return resolve();
        if (el.complete || el.naturalWidth > 0) return resolve();
        const done = () => resolve();
        el.addEventListener('load', done);
        el.addEventListener('error', done);
      });
    const images = this.canvas
      .getObjects()
      .filter((o) => o instanceof fabric.Image && o.getElement && o.getElement());
    images.forEach((img) => pending.push(waitEl(img.getElement())));
    // 背景 rect（tile 形态）：Pattern source 是普通 HTMLImageElement，非 fabric.Image，需单独等待
    const bg = this.getBackgroundImageObj();
    if (bg && bg.type === 'rect' && bg.fill && bg.fill.source) {
      pending.push(waitEl(bg.fill.source));
    }
    return Promise.all(pending).then(() => {
      // 背景 rect（tile 形态）pattern source 加载失败：对象保留但填充无效
      const bg = this.getBackgroundImageObj();
      if (bg && bg.type === 'rect' && bg.fill && bg.fill.source) {
        const el = bg.fill.source;
        if (typeof el.naturalWidth === 'number' && el.naturalWidth === 0) {
          this._emitBackgroundLoadError(bg.get('src') || bg.fill.source.src || '');
        }
      }
    });
  }
  // 背景加载失败（CORS 拒绝 / 真实 URL 失效）→ emit 错误供宿主提示；空 src 静默。
  _emitBackgroundLoadError(src) {
    if (src && this.editor && typeof this.editor.emit === 'function') {
      this.editor.emit('renderer:error', { code: 'IMAGE_LOAD_FAILED', src });
    }
  }
  destroy() {
    console.log('rendererWorkspaceDestroy');
  }
}
RendererWorkspacePlugin.pluginName = 'RendererWorkspacePlugin';
RendererWorkspacePlugin.events = ['sizeChange'];

export default RendererWorkspacePlugin;
export { buildDesignMapFromJSON };
