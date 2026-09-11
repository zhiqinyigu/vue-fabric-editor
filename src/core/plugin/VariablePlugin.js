/*
 * @Author: cyc
 * @Date: 2026-08-27 11:05:58
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-10 16:04:07
 * @Description: 模板变量插件：管理包裹符、测试数据映射表、变量预览切换
 */
import { v4 as uuid } from 'uuid';
import { fabric } from 'fabric';
import VariableImage, { attachVariableOverlay } from '../objects/VariableImage';
import {
  DEFAULT_DELIMITER,
  containsVariable,
  render,
  extractVariablesFromString,
  getVariableFieldOfObject,
  getByPath,
  setByPath,
} from '../variableEngine';
import { computeBackgroundLayout, replaceTilePatternSource } from '../workspaceGeometry';

class VariablePlugin {
  constructor(canvas, editor) {
    this.canvas = canvas;
    this.editor = editor;
    this.delimiter = { ...DEFAULT_DELIMITER };
    // 测试数据映射表：path -> value（仅存内存，不入库）
    this.testData = {};
    // 是否处于变量预览模式
    this.previewing = false;
    // 预览期快照：{ obj, field, oldValue }[]，用于退出时恢复
    this._snapshot = [];
    // 资源替换令牌：图片/条码的展示资源替换是【异步加载】的，
    // 每次应用快照（进入预览 / 退出预览 / 预览期刷新测试数据）都会递增该令牌，
    // 异步回调执行时若令牌已变化即视为"过期结果"并丢弃。
    // 典型场景：进入预览后测试图尚未加载完就退出预览，若在飞回调不做校验，
    // 加载完成时会把测试图 element 写回已恢复编辑态的对象，占位图被测试图覆盖。
    this._previewToken = 0;
    // 预览期对象交互锁定快照：{ obj, selectable, evented, hasControls, editable, lock* }
    this._lockSnapshot = [];
    // 预览期画布级交互快照：{ selection, skipTargetFind, defaultCursor }
    this._lockCanvasState = null;
    // 预览期 mouse:up 自愈：DringPlugin 平移结束时会把 canvas.selection 强制恢复为 true，
    // 这里在每次鼠标抬起后把框选/目标检测锁回，确保预览态拖选多选始终失效
    // （VariablePlugin 最后注册，其 mouse:up 监听在 DringPlugin 之后执行）
    this._onMouseUpKeepLock = () => {
      if (this._lockCanvasState) {
        this.canvas.selection = false;
        this.canvas.skipTargetFind = true;
      }
    };
    this._initListeners();
    // 覆盖 fabric.Image.fromObject：保证所有加载路径（loadFromJSON / clone / fromObject）都能还原变量图片
    this._patchImageFromObject();
  }

  _initListeners() {
    this._onObjectModified = () => {
      // 预览态下用户编辑对象时自动退出预览，避免污染模板数据
      if (this.previewing) this.exitPreview();
    };
    this.canvas.on('object:modified', this._onObjectModified);
  }

  /* ---------- API: 包裹符 ---------- */
  getDelimiter() {
    return { ...this.delimiter };
  }
  setDelimiter(delimiter) {
    const next = {
      start: (delimiter && delimiter.start) || DEFAULT_DELIMITER.start,
      end: (delimiter && delimiter.end) || DEFAULT_DELIMITER.end,
    };
    this.delimiter = next;
    // 包裹符变更，若在预览态则退出并广播
    if (this.previewing) this.exitPreview();
    this.editor.emit('variable:delimiterChange', { ...next });
    return { ...next };
  }

  /* ---------- API: 测试数据 ---------- */
  getTestData() {
    return { ...this.testData };
  }
  setTestData(testData) {
    this.testData = { ...(testData || {}) };
    this.editor.emit('variable:testDataChange', { ...this.testData });
    return this.testData;
  }
  // 仅更新某个变量，预览态下实时刷新
  updateTestData(path, value) {
    this.testData[path] = value;
    if (this.previewing) this.refreshPreview();
    return this.testData;
  }

  /* ---------- API: 变量收集 ---------- */
  getVariables() {
    // 直接遍历画布对象收集变量，避免与 getJson（附加 variableMeta）形成递归
    const set = new Set();
    const collect = (objs) => {
      objs.forEach((obj) => {
        if (obj.objects && Array.isArray(obj.objects)) {
          collect(obj.objects);
          return;
        }
        getVariableFieldOfObject(obj).forEach((field) => {
          const value = getByPath(obj, field);
          if (typeof value === 'string') {
            extractVariablesFromString(value, this.delimiter).forEach((p) => set.add(p));
          }
        });
      });
    };
    collect(this.canvas.getObjects());
    return Array.from(set);
  }
  // 判断字符串是否含变量（供网络图片 URL 输入框使用）
  containsVariable(text) {
    return containsVariable(text, this.delimiter);
  }

  /* ---------- 图片变量占位图 ---------- */
  // URL 含变量时创建占位 image：真实 src 保留变量 URL，画布上显示 VariableImage（纯色底 + 矢量叠加层）
  createVariableImage(src) {
    return new Promise((resolve, reject) => {
      const placeholder = this._makePlaceholder(src);
      fabric.util.loadImage(
        placeholder,
        (imgEl, isError) => {
          if (isError || !imgEl) {
            reject(new Error('图片变量占位图生成失败'));
            return;
          }
          const instance = new VariableImage(imgEl, {
            src,
            isVariableImage: true,
            id: uuid(),
            variableLabel: this._extractVariableLabel(src),
            showPlaceholderText: true,
          });
          // 保留真实变量 URL 到 src（存储态），占位图仅用于编辑期展示
          this._patchGetSrc(instance);
          resolve(instance);
        },
        this,
        'anonymous'
      );
    });
  }
  // 从变量 URL 提取叠加层显示的变量名（如 "user.id"），多个变量用 ", " 连接
  _extractVariableLabel(src) {
    const vars = extractVariablesFromString(src, this.delimiter);
    return vars.join(', ') || 'variable';
  }
  // 就地更新变量图片的 src（属性面板"网络图片地址"编辑入口）：
  // - 新地址仍含变量：重建占位图展示，保持当前版位（left/top/scale/宽高）不变
  // - 新地址为普通 URL：加载真实图并按版位比例缩放，清除变量标记
  updateVariableImage(img, src) {
    if (!img || img.type !== 'image') {
      return Promise.reject(new Error('非图片对象，无法更新变量图片'));
    }
    const next = typeof src === 'string' ? src : '';
    const isVar = containsVariable(next, this.delimiter);
    // 同步更新存储态 src，并保证序列化输出变量 URL（而非占位图 dataURL）
    img.set('src', next);
    img.set('isVariableImage', isVar);
    this._patchGetSrc(img);
    if (isVar) {
      // 普通图升级为变量图片：挂载矢量叠加层（type 保持 image，就地升级不换对象）
      if (!(img instanceof VariableImage)) {
        this._attachVariableOverlay(img);
      }
      img.set('variableLabel', this._extractVariableLabel(next));
      img.set('showPlaceholderText', true);
      const placeholder = this._makePlaceholder(next);
      return new Promise((resolve, reject) => {
        fabric.util.loadImage(
          placeholder,
          (imgEl, isError) => {
            if (isError || !imgEl) {
              reject(new Error('图片变量占位图生成失败'));
              return;
            }
            const t = {
              left: img.left,
              top: img.top,
              scaleX: img.scaleX,
              scaleY: img.scaleY,
              width: img.width,
              height: img.height,
            };
            img.setElement(imgEl);
            // 同上：setElement 不清对象缓存，强制刷新避免画面停留在旧图缓存
            img.dirty = true;
            img.set(t);
            img.setCoords();
            img.initDimensions && img.initDimensions();
            this.canvas.requestRenderAll();
            // 流式尺寸联动：占位图重建后尺寸可能变化
            this.editor.emit('variable:previewRefresh');
            resolve(img);
          },
          this,
          'anonymous'
        );
      });
    }
    // 普通 URL：以 anonymous 加载真实图，按版位比例缩放（与属性面板 setSrc 逻辑一致）
    // 变量图改回普通图：关闭占位叠加层，仅显示真实图片
    if (img instanceof VariableImage || img._variableOverlayAttached) {
      img.set('showPlaceholderText', false);
    }
    return new Promise((resolve, reject) => {
      const width = img.get('width');
      const height = img.get('height');
      const scaleX = img.get('scaleX');
      const scaleY = img.get('scaleY');
      img.setSrc(
        src,
        (newImg, isError) => {
          if (isError || !newImg) {
            reject(new Error('图片加载失败'));
            return;
          }
          newImg.set('scaleX', (width * scaleX) / newImg.width);
          newImg.set('scaleY', (height * scaleY) / newImg.height);
          newImg.setCoords();
          newImg.initDimensions && newImg.initDimensions();
          this.canvas.requestRenderAll();
          // 流式尺寸联动：真实图加载后尺寸可能变化
          this.editor.emit('variable:previewRefresh');
          resolve(newImg);
        },
        { crossOrigin: 'anonymous' }
      );
    });
  }
  // 普通 fabric.Image 就地升级为"变量图片渲染"：挂载叠加层 _render，type 保持 image，
  // 避免重建对象丢失画布引用与选中态（属性面板"网络图片地址"编辑后原地生效）
  _attachVariableOverlay(img) {
    return attachVariableOverlay(img);
  }
  // 生成"动态变量占位图"：纯色底（240x160）
  // 边框与变量名由 VariableImage 矢量叠加层实时绘制（字号按占位符 85% 宽度动态计算），
  // 反缩放补偿保证任意缩放文字不变形、不模糊（位图内嵌文字会随位图拉伸变形）
  _makePlaceholder() {
    const width = 240;
    const height = 160;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F1F3F5';
    ctx.fillRect(0, 0, width, height);
    return canvas.toDataURL('image/png');
  }
  // 预热并缓存占位图 element（HTMLImageElement）：
  // 进入预览时触发异步加载，退出预览时用缓存的 element 同步替换展示资源，
  // 消除"占位图异步加载期间画布先渲染出测试图"的退出闪变。
  _warmPlaceholderCache() {
    if (this._placeholderEl || this._placeholderElLoading) return;
    this._placeholderElLoading = true;
    try {
      fabric.util.loadImage(
        this._makePlaceholder(),
        (imgEl, isError) => {
          this._placeholderEl = !isError && imgEl ? imgEl : null;
          this._placeholderElLoading = false;
        },
        this,
        'anonymous'
      );
    } catch (e) {
      // 缓存预热是纯优化，加载失败（如无 DOM 图像解码环境）必须静默降级：
      // _placeholderEl 保持 null，退出预览走原异步加载路径，预览功能不受影响
      this._placeholderElLoading = false;
    }
  }
  // 退出预览同步恢复占位图：与 _reloadImageSrc 异步回调中 isVariableSrc 分支的
  // 逻辑完全一致（setElement + 还原 shadow/clipPath 补偿 + 恢复原始 transform），
  // 但同步执行，保证 exitPreview 随后的 requestRenderAll 渲染的就是占位图画面，
  // 不出现"测试图 × 占位图 transform"的中间帧。
  _restorePlaceholderSync(img, placeholderEl, src, oldTransform) {
    // 优先使用快照中的原始 transform；缺失时退化用当前值（占位图场景）
    const t = oldTransform || {
      left: img.left,
      top: img.top,
      scaleX: img.scaleX,
      scaleY: img.scaleY,
      width: img.width,
      height: img.height,
    };
    img.setElement(placeholderEl);
    // setElement 只移除 WebGL 纹理缓存，不会清空对象 _cacheCanvas；
    // 强制 dirty，让下一次渲染用新 element + 当前 clipPath 重建缓存。
    img.dirty = true;
    // 退出预览（恢复占位图）：打开占位叠加层，并重算变量名
    img.set('showPlaceholderText', true);
    img.set('variableLabel', this._extractVariableLabel(src));
    // 还原预览期阴影/clipPath 补偿，避免污染模板配置
    this._restorePreviewShadow(img);
    this._restorePreviewClipPath(img);
    // 占位图：按原尺寸展示（渲染由 exitPreview 统一 requestRenderAll）
    img.set(t);
    img.setCoords && img.setCoords();
    img.initDimensions && img.initDimensions();
    // 流式尺寸联动：占位图恢复为原始尺寸后，画布可能变化
    this.editor.emit('variable:previewRefresh');
  }
  // 序列化（toObject/toJSON）时，变量图片应输出存储的变量 URL，而非占位图 dataURL
  // fabric.Image.getSrc 默认取 DOM 元素 src（即占位图 base64），这里按 isVariableImage 兜底返回 this.src
  _patchGetSrc(imgEl) {
    imgEl.getSrc = function (filtered) {
      if (
        (this.get('isVariableImage') === true || this.get('isVariableBackground') === true) &&
        typeof this.get('src') === 'string'
      ) {
        return this.get('src');
      }
      return fabric.Image.prototype.getSrc.call(this, filtered);
    };
    return imgEl;
  }
  // 变量图片的 src 是 "{{var}}" 时，fabric.Image.fromObject 加载失败会直接丢弃对象。
  // 包装 fromObject：加载时改用占位图，对象创建后还原变量 URL 并补上 getSrc 补丁。
  _patchImageFromObject() {
    if (this._imageFromObjectPatched) return;
    this._imageFromObjectPatched = true;
    const self = this;
    const originalFromObject = fabric.Image.fromObject;
    fabric.Image.fromObject = function (_object, callback) {
      const isVariableImage =
        !!_object &&
        _object.type === 'image' &&
        (_object.isVariableImage === true ||
          (typeof _object.src === 'string' && containsVariable(_object.src, self.delimiter)));
      if (!isVariableImage) {
        return originalFromObject.call(this, _object, callback);
      }
      const variableSrc = typeof _object.src === 'string' ? _object.src : '';
      const placeholder = self._makePlaceholder(variableSrc);
      originalFromObject.call(this, { ..._object, src: placeholder }, (instance, isError) => {
        if (!isError && instance) {
          instance.set('src', variableSrc);
          instance.set('isVariableImage', true);
          instance.set('variableLabel', self._extractVariableLabel(variableSrc));
          // 恢复变量图片的矢量叠加层渲染（type 保持 image）
          self._attachVariableOverlay(instance);
          self._patchGetSrc(instance);
        }
        callback && callback(instance, isError);
      });
      return undefined;
    };
  }
  // 导入 JSON 前：读取 variableMeta 中的包裹符并应用
  hookImportBefore(jsonFile) {
    try {
      const json = typeof jsonFile === 'string' ? JSON.parse(jsonFile) : jsonFile;
      if (!json || !json.variableMeta) return Promise.resolve();
      if (json.variableMeta.delimiter) {
        this.delimiter = { ...DEFAULT_DELIMITER, ...json.variableMeta.delimiter };
      }
      // 回填模板保存的测试数据（variableMeta.variables[].example），
      // 使"变量配置"弹窗打开时能回显该变量上次的测试值；
      // 仅当内存中还没有该变量值时回填，不覆盖当前会话已填写的值
      const vars = Array.isArray(json.variableMeta.variables) ? json.variableMeta.variables : [];
      vars.forEach((v) => {
        if (
          v &&
          typeof v.path === 'string' &&
          v.example !== undefined &&
          this.testData[v.path] === undefined
        ) {
          this.testData[v.path] = v.example;
        }
      });
    } catch (e) {
      // 解析失败则忽略，保留当前包裹符
    }
    return Promise.resolve();
  }
  // 导入 JSON 后，把 src 含变量的图片恢复为占位图展示（保留变量 URL）
  hookImportAfter() {
    this._restoreVariableImages(this.canvas.getObjects());
    return Promise.resolve();
  }
  _restoreVariableImages(objects) {
    objects.forEach((obj) => {
      if (obj.objects && Array.isArray(obj.objects)) {
        this._restoreVariableImages(obj.objects);
        return;
      }
      if (obj.type !== 'image') return;
      const src = obj.get('src');
      const isVariableImage = obj.get('isVariableImage') === true;
      const isVariableSrc = typeof src === 'string' && containsVariable(src, this.delimiter);
      // 既不是变量图片、src 也不含变量：普通图片，跳过
      if (!isVariableImage && !isVariableSrc) return;
      // 保证序列化输出变量 URL（旧文件 src 已丢失变量链接时，仍按原值输出）
      this._patchGetSrc(obj);
      if (!isVariableSrc) return;
      const placeholder = this._makePlaceholder(src);
      // 注意：setElement 需要原生 HTMLImageElement，不能用 fabric.Image.fromURL
      // （fromURL 的回调返回的是 fabric.Image 实例，传入 setElement 会导致
      //  _element 不是合法 image，fabric._renderFill 时 drawImage 抛错，
      //  且 src/naturalWidth 等 DOM 属性全部丢失，图片彻底不显示）
      fabric.util.loadImage(
        placeholder,
        (imgEl, isError) => {
          if (isError || !imgEl) return;
          const { left, top, scaleX, scaleY, width, height } = obj;
          obj.setElement(imgEl);
          // 同上：setElement 不清对象缓存，强制刷新避免画面停留在旧图缓存
          obj.dirty = true;
          obj.set('src', src);
          obj.set('isVariableImage', true);
          obj.set('variableLabel', this._extractVariableLabel(src));
          obj.set('showPlaceholderText', true);
          // 旧文件未挂载叠加层时补挂（type 保持 image）
          if (!(obj instanceof VariableImage) && !obj._variableOverlayAttached) {
            this._attachVariableOverlay(obj);
          }
          obj.set({ left, top, scaleX, scaleY, width, height });
          obj.setCoords();
          this.canvas.requestRenderAll();
          // 流式尺寸联动：占位图恢复为原始尺寸后，画布可能变化
          this.editor.emit('variable:previewRefresh');
        },
        this,
        'anonymous'
      );
    });
  }

  /* ---------- 非破坏性预览 ---------- */
  enterPreview() {
    if (this.previewing) return;
    // 预热占位图 element 缓存：进入预览期间异步完成加载，
    // 保证退出预览时能【同步】恢复占位图，避免占位图异步加载期间
    // 画布渲染出"测试图 × 占位图 transform"的中间帧（退出瞬间闪测试图）
    this._warmPlaceholderCache();
    this._snapshot = [];
    this._collectSnapshot(this.canvas.getObjects());
    if (this._snapshot.length === 0) {
      this._snapshot = [];
      return;
    }
    this._applySnapshot(true);
    // 预览期锁定元素编辑：不可选中/双击/拖拽/缩放，仅保留画布视图缩放与平移
    this._lockObjects(true);
    this.previewing = true;
    this.editor.emit('variable:previewChange', true);
    this.canvas.requestRenderAll();
    // 流式尺寸联动：预览后内容尺寸可能变化（文本渲染更长等）
    this.editor.emit('variable:previewRefresh');
  }
  exitPreview() {
    if (!this.previewing) return;
    this._applySnapshot(false);
    this._lockObjects(false);
    this.previewing = false;
    this._snapshot = [];
    this.editor.emit('variable:previewChange', false);
    this.canvas.requestRenderAll();
    // 流式尺寸联动：退出预览后内容尺寸可能变化
    this.editor.emit('variable:previewExit');
  }
  // 锁定/解锁画布所有对象（进入预览锁定，退出预览恢复原交互状态）
  _lockObjects(lock) {
    const objs = this.canvas.getObjects();
    if (lock) {
      this._lockSnapshot = objs.map((obj) => ({
        obj,
        selectable: obj.selectable,
        evented: obj.evented,
        hasControls: obj.hasControls,
        editable: obj.editable,
        lockMovementX: obj.lockMovementX,
        lockMovementY: obj.lockMovementY,
        lockRotation: obj.lockRotation,
        lockScalingX: obj.lockScalingX,
        lockScalingY: obj.lockScalingY,
      }));
      objs.forEach((obj) => {
        obj.set({
          selectable: false,
          evented: false,
          hasControls: false,
          editable: false,
          lockMovementX: true,
          lockMovementY: true,
          lockRotation: true,
          lockScalingX: true,
          lockScalingY: true,
        });
      });
      // 画布级：禁用框选与目标 hover 检测，取消鼠标拖拽/框选交互；
      // 画布视图缩放（滚轮）与平移（Alt/中键拖拽）不受影响
      this._lockCanvasState = {
        selection: this.canvas.selection,
        skipTargetFind: this.canvas.skipTargetFind,
        defaultCursor: this.canvas.defaultCursor,
      };
      this.canvas.selection = false;
      this.canvas.skipTargetFind = true;
      this.canvas.defaultCursor = 'default';
      // 每次鼠标抬起后强制锁回 selection，抵御 DringPlugin 平移结束时的状态还原
      this.canvas.on('mouse:up', this._onMouseUpKeepLock);
      // 预览期禁用右键菜单（DOM contextmenu 与插件菜单收集均被 enabled 拦截）
      if (this.editor && this.editor.contextMenu) {
        this.editor.contextMenu.setEnabled(false);
        this.editor.contextMenu.hideAll();
      }
    } else {
      this._lockSnapshot.forEach(({ obj, ...props }) => obj.set(props));
      this._lockSnapshot = [];
      if (this._lockCanvasState) {
        Object.assign(this.canvas, this._lockCanvasState);
        this._lockCanvasState = null;
      }
      this.canvas.off('mouse:up', this._onMouseUpKeepLock);
      // 恢复右键菜单
      if (this.editor && this.editor.contextMenu) {
        this.editor.contextMenu.setEnabled(true);
      }
    }
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }
  isPreviewing() {
    return this.previewing;
  }
  // 预览态下测试数据变化时刷新
  refreshPreview() {
    if (!this.previewing) return;
    this._applySnapshot(true);
    this.canvas.requestRenderAll();
    // 流式尺寸联动：测试数据变化后内容尺寸可能变化（文本变长/图片变大）
    this.editor.emit('variable:previewRefresh');
  }
  _collectSnapshot(objects) {
    objects.forEach((obj) => {
      if (obj.objects && Array.isArray(obj.objects)) {
        this._collectSnapshot(obj.objects);
        return;
      }
      getVariableFieldOfObject(obj).forEach((field) => {
        const value = getByPath(obj, field);
        if (typeof value === 'string' && containsVariable(value, this.delimiter)) {
          const item = { obj, field, oldValue: value };
          // 图片 src / 二维码 data / 条形码 value：同时记录原始 transform，
          // 否则预览期为了等比缩放而修改的 width/height/left/top 会污染模板
          if (field === 'src' || field === 'extension.data' || field === 'extension.value') {
            item.oldTransform = {
              left: obj.left,
              top: obj.top,
              scaleX: obj.scaleX,
              scaleY: obj.scaleY,
              width: obj.width,
              height: obj.height,
              angle: obj.angle || 0,
            };
          }
          this._snapshot.push(item);
        }
      });
    });
  }
  _applySnapshot(toPreview) {
    // 本次应用快照的令牌：其后发起的所有异步加载都带上它，
    // 期间若发生新的应用快照（退出预览、改测试数据重新预览等），
    // 旧令牌的加载回调一律丢弃，避免过期结果覆盖当前状态
    const token = ++this._previewToken;
    this._snapshot.forEach(({ obj, field, oldValue, oldTransform }) => {
      if (field === 'text') {
        const next = toPreview ? render(oldValue, this.testData, this.delimiter) : oldValue;
        obj.set('text', next);
        obj.initDimensions && obj.initDimensions();
        obj.setCoords && obj.setCoords();
      } else if (field === 'src') {
        // 背景图：预览按真实尺寸重排 workspace 铺满布局，退出恢复占位布局
        if (obj.id === 'backgroundImage') {
          this._applyBackgroundPreview(obj, oldValue, toPreview, oldTransform, token);
          return;
        }
        // 图片：预览期按替换后 URL 加载；退出时【同步】恢复原始 src 属性，异步仅用于刷新展示
        const next = toPreview ? render(oldValue, this.testData, this.delimiter) : oldValue;
        obj.set('src', next); // 同步更新 src 属性，保证 getJson 拿到正确值
        // 退出预览：先恢复原始 transform，再加载占位图
        // 避免预览期为了等比缩放而改写 left/top/width/height 污染模板
        if (!toPreview && oldTransform) {
          obj.set(oldTransform);
        }
        this._reloadImageSrc(obj, next, oldTransform, token);
      } else if (field === 'extension.data' || field === 'extension.value') {
        // 二维码/条形码：内容在 extension 子字段，预览期渲染内容并按原版位重绘图像；
        // 退出时恢复原始内容与 transform，异步仅用于刷新展示
        const next = toPreview ? render(oldValue, this.testData, this.delimiter) : oldValue;
        setByPath(obj, field, next); // 同步更新存储值，保证 getJson 拿到正确值
        // 退出预览：先恢复原始 transform，再重绘原图
        if (!toPreview && oldTransform) {
          obj.set(oldTransform);
        }
        this._reloadExtensionImage(obj, field, oldTransform, toPreview, token);
      }
    });
  }
  // 背景图变量预览/恢复：
  // - 预览：src 替换为真实 URL → 加载真实图 → 按真实自然尺寸 + 背景 mode/position
  //   重铺 workspace（image 形态 setElement+layout；tile 形态重建 Pattern source）
  // - 退出：恢复快照中的占位布局（oldTransform）+ 占位图（不污染模板配置）
  _applyBackgroundPreview(obj, oldValue, toPreview, oldTransform, token) {
    const mode = obj.get('backgroundImageMode') || 'cover';
    const position = obj.get('backgroundPosition') || { x: 0.5, y: 0.5 };
    const next = toPreview ? render(oldValue, this.testData, this.delimiter) : oldValue;
    obj.set('src', next);
    // 退出预览：先恢复占位布局，再异步换回占位图展示资源
    if (!toPreview && oldTransform) {
      obj.set(oldTransform);
    }
    const isVariableSrc = containsVariable(next, this.delimiter);
    const loadSrc = isVariableSrc ? this._makePlaceholder() : next;
    fabric.util.loadImage(
      loadSrc,
      (imgEl, isError) => {
        // 过期结果丢弃：加载期间若已退出预览（或重新预览），
        // 该回调对应的画面已不属于当前状态，继续应用会覆盖编辑态占位图
        if (token !== undefined && token !== this._previewToken) return;
        if (isError || !imgEl) return;
        if (mode === 'tile' || obj.type === 'rect') {
          // tile 形态：保留 Rect，仅重建 Pattern source
          replaceTilePatternSource(obj, imgEl, obj.fill && obj.fill.repeat);
        } else {
          // image 形态：按真实/占位尺寸重铺 workspace
          const imgSize = {
            w: imgEl.naturalWidth || imgEl.width || 0,
            h: imgEl.naturalHeight || imgEl.height || 0,
          };
          if (!(imgSize.w > 0) || !(imgSize.h > 0)) return;
          const ws = this.canvas.getObjects().find((o) => o && o.id === 'workspace');
          const layout = computeBackgroundLayout({
            workspace: ws,
            imageSize: imgSize,
            mode,
            position,
          });
          if (layout) obj.set(layout);
          obj.setElement(imgEl);
        }
        obj.set('showPlaceholderText', isVariableSrc);
        obj.dirty = true;
        obj.setCoords && obj.setCoords();
        this.canvas.requestRenderAll();
        this.editor.emit('variable:previewRefresh');
      },
      this,
      'anonymous'
    );
  }
  _reloadImageSrc(img, src, oldTransform, token) {
    // 仅替换展示资源，不改变已设置的 src 属性（src 属性已由 _applySnapshot 同步设置）
    // 变量 URL 无法直接加载，回退为占位图展示（用于退出预览时恢复编辑态表现）
    const isVariableSrc = typeof src === 'string' && containsVariable(src, this.delimiter);
    // 退出预览恢复占位图：若缓存 element 已就绪则【同步】替换展示资源并还原
    // shadow/clipPath 补偿。否则退出预览后、占位图异步加载完成前的第一次渲染
    // 会把"测试图 element × 占位图 transform × 还原前 clip"画上屏，
    // 表现为退出预览瞬间闪一下测试数据图片（随后才被占位图覆盖）。
    if (isVariableSrc && this._placeholderEl) {
      this._restorePlaceholderSync(img, this._placeholderEl, src, oldTransform);
      return;
    }
    const loadSrc = isVariableSrc ? this._makePlaceholder(src) : src;
    // 注意：setElement 需要原生 HTMLImageElement，不能用 fabric.Image.fromURL
    // （fromURL 的回调返回的是 fabric.Image 实例，传入 setElement 会导致
    //  _element 不是合法 image，fabric._renderFill 时 drawImage 抛错，与
    //  _restoreVariableImages 是同一类问题）
    fabric.util.loadImage(
      loadSrc,
      (imgEl, isError) => {
        // 过期结果丢弃：图片异步加载期间可能已退出预览（或改测试数据重新预览），
        // 此时该回调对应的资源已过期，写回会把编辑态占位图替换成测试数据图
        if (token !== undefined && token !== this._previewToken) return;
        if (!isError && imgEl) {
          // 优先使用快照中的原始 transform；缺失时退化用当前值（占位图场景）
          const t = oldTransform || {
            left: img.left,
            top: img.top,
            scaleX: img.scaleX,
            scaleY: img.scaleY,
            width: img.width,
            height: img.height,
          };
          img.setElement(imgEl);
          // setElement 只移除 WebGL 纹理缓存，不会清空对象 _cacheCanvas；
          // 若此处未置 dirty，画布渲染会直接绘制旧缓存（预览态测试图画面、
          // 裁切位置/大小停留在预览状态），导致退出预览后画面异常。
          // 强制 dirty，让下一次渲染用新 element + 当前 clipPath 重建缓存。
          img.dirty = true;
          // 预览真实图时关闭占位叠加层；退出预览恢复占位图时打开，并重算变量名
          img.set('showPlaceholderText', isVariableSrc);
          if (isVariableSrc) {
            img.set('variableLabel', this._extractVariableLabel(src));
          }
          if (isVariableSrc) {
            // 退出预览（恢复占位图）：还原预览期阴影/clipPath 补偿，避免污染模板配置
            this._restorePreviewShadow(img);
            this._restorePreviewClipPath(img);
          }
          if (isVariableSrc || !oldTransform) {
            // 占位图 / 无原始 transform 记录：按原尺寸展示
            img.set(t);
          } else {
            // 真实图：缩放到占位框当前显示尺寸（displayedW = width×scaleX，displayedH = height×scaleY）
            // 模板作者在属性面板调整占位图宽高（改 scale）即确定版位尺寸；
            // 真实数据渲染时把图片按版位尺寸直接缩放（改 scale），left/top 不变（版位左上角不动）。
            // 注：图片比例与版位不一致时会拉伸，模板作者应把版位拖成接近真实图片的比例。
            const naturalW = imgEl.width || imgEl.naturalWidth || 0;
            const naturalH = imgEl.height || imgEl.naturalHeight || 0;
            const displayedW = t.width * t.scaleX;
            const displayedH = t.height * t.scaleY;
            if (naturalW > 0 && naturalH > 0 && displayedW > 0 && displayedH > 0) {
              const prevScaleX = t.scaleX || 1;
              const prevScaleY = t.scaleY || 1;
              const nextScaleX = displayedW / naturalW;
              const nextScaleY = displayedH / naturalH;
              img.set({
                scaleX: nextScaleX,
                scaleY: nextScaleY,
                left: t.left,
                top: t.top,
              });
              // 阴影补偿：fabric 渲染阴影时 blur/offset 乘对象 scale（fabric _setShadow），
              // 真实图为适配版位把 scale 缩小（如 0.31/0.12），阴影随之成倍缩小。
              // 按"预览阴影 = 占位图编辑态阴影"反缩放补偿，退出预览时 _restorePreviewShadow 还原。
              this._compensatePreviewShadow(img, prevScaleX, prevScaleY, nextScaleX, nextScaleY);
              // clipPath（形状裁切）补偿：裁切框以"对象局部坐标 + 1/scale 补偿"定义，
              // 对象 scale 变化后需按 oldScale/newScale 换算 left/top/scaleX/scaleY，
              // 使裁切框屏幕位置/大小与占位图一致，退出预览时 _restorePreviewClipPath 还原。
              this._compensatePreviewClipPath(img, prevScaleX, prevScaleY, nextScaleX, nextScaleY);
            } else {
              img.set(t);
            }
          }
          img.setCoords();
          img.initDimensions && img.initDimensions();
          this.canvas.requestRenderAll();
          // 流式尺寸联动：预览/恢复加载完成后尺寸可能变化
          this.editor.emit('variable:previewRefresh');
        }
      },
      this,
      'anonymous'
    );
  }
  // 二维码/条形码预览/恢复：内容（extension.data / extension.value）更新后重绘图像。
  // 复用 QrCodePlugin/BarCodePlugin 生成 base64，再 setSrc 替换展示资源（不换对象）。
  // - 预览：新生成的条码按原版位显示尺寸等比缩放（left/top 不动，width/height 取新图自然尺寸）
  // - 退出：恢复原始 transform（原内容生成的图像自然尺寸与快照一致，直接还原版位）
  _reloadExtensionImage(obj, field, oldTransform, toPreview, token) {
    const isQr = obj.get('extensionType') === 'qrcode';
    const pluginName = isQr ? 'QrCodePlugin' : 'BarCodePlugin';
    const plugin = this.editor.getPlugin && this.editor.getPlugin(pluginName);
    // 插件缺失：仅存储值已更新，保留当前图像（编辑期占位），降级不崩溃
    if (!plugin) {
      this.canvas.requestRenderAll();
      return;
    }
    const options = { ...(obj.get('extension') || {}) };
    let raw;
    try {
      raw = isQr
        ? plugin._getBase64Str(plugin._paramsToOption(options))
        : plugin._getBase64Str(options);
    } catch (e) {
      this.canvas.requestRenderAll();
      return;
    }
    Promise.resolve(raw)
      .then((base64) => {
        // 过期结果丢弃：生成/加载期间若已退出预览或重新预览，当前结果不再适用
        if (token !== undefined && token !== this._previewToken) return;
        if (!base64 || typeof base64 !== 'string') {
          this.canvas.requestRenderAll();
          return;
        }
        obj.setSrc(
          base64,
          (newImg, isError) => {
            if (token !== undefined && token !== this._previewToken) return;
            if (isError || !newImg) return;
            const t = oldTransform || {
              left: obj.left,
              top: obj.top,
              scaleX: obj.scaleX,
              scaleY: obj.scaleY,
              width: obj.width,
              height: obj.height,
            };
            if (!toPreview) {
              // 退出预览：恢复原始版位与尺寸
              newImg.set(t);
            } else {
              // 预览：新生成的条码按原版位显示尺寸等比缩放
              const naturalW = newImg.width || newImg.naturalWidth || 0;
              const naturalH = newImg.height || newImg.naturalHeight || 0;
              const displayedW = t.width * t.scaleX;
              const displayedH = t.height * t.scaleY;
              if (naturalW > 0 && naturalH > 0 && displayedW > 0 && displayedH > 0) {
                newImg.set({
                  scaleX: displayedW / naturalW,
                  scaleY: displayedH / naturalH,
                  left: t.left,
                  top: t.top,
                });
              } else {
                newImg.set(t);
              }
            }
            newImg.setCoords();
            newImg.initDimensions && newImg.initDimensions();
            this.canvas.requestRenderAll();
            // 流式尺寸联动：重绘后尺寸可能变化
            this.editor.emit('variable:previewRefresh');
          },
          { crossOrigin: 'anonymous' }
        );
      })
      .catch(() => {
        this.canvas.requestRenderAll();
      });
  }

  // 预览真实图时的阴影补偿：fabric _setShadow 按对象 scale 缩放阴影
  // （shadowBlur ∝ (scaleX+scaleY)/4，offset ∝ scale），真实图 scale 变小导致阴影缩小。
  // 记录原始 shadow 值（仅首次），并基于原始值乘以补偿因子，使"预览阴影 = 占位图编辑态阴影"。
  _compensatePreviewShadow(img, prevScaleX, prevScaleY, nextScaleX, nextScaleY) {
    const shadow = img.shadow;
    if (!shadow) return;
    if (!img._previewShadow) {
      img._previewShadow = {
        blur: shadow.blur,
        offsetX: shadow.offsetX,
        offsetY: shadow.offsetY,
      };
    }
    const base = img._previewShadow;
    shadow.blur = base.blur * ((prevScaleX + prevScaleY) / (nextScaleX + nextScaleY) || 1);
    shadow.offsetX = base.offsetX * (prevScaleX / nextScaleX || 1);
    shadow.offsetY = base.offsetY * (prevScaleY / nextScaleY || 1);
  }
  // 退出预览：还原阴影补偿前的原始值（_previewShadow 为临时挂载属性，不参与序列化）
  _restorePreviewShadow(img) {
    const shadow = img.shadow;
    const base = img._previewShadow;
    if (!shadow || !base) return;
    shadow.blur = base.blur;
    shadow.offsetX = base.offsetX;
    shadow.offsetY = base.offsetY;
    img._previewShadow = null;
    // 直接改 shadow 属性不会触发对象重绘标记，强制刷新缓存
    img.dirty = true;
  }
  // 预览真实图时的 clipPath（形状裁切）补偿。
  // SimpleClipImagePlugin.correctPosition 把裁切框定义为"对象局部坐标 + 1/scale 补偿"
  // （absolutePositioned:false，left/top 与 scale 均按对象 scale 计算），渲染时裁切框
  // 屏幕位置/大小 = clip 局部值 × clip.scale × 对象 scale。对象 scale 从占位图值
  // （prevScale）变为真实图适配值（nextScale）后，clip 的局部值与补偿若不联动，
  // 裁切框会偏移、缩小、非等比时变形。
  // 修复：left/top/scaleX/scaleY 统一按 prevScale/nextScale 反缩放换算，保证
  // "裁切框屏幕位置与大小 = 占位图编辑态"。记录原始值（仅首次），退出预览时还原。
  _compensatePreviewClipPath(img, prevScaleX, prevScaleY, nextScaleX, nextScaleY) {
    const clip = img.clipPath;
    if (!clip) return;
    if (!img._previewClip) {
      img._previewClip = {
        left: clip.left,
        top: clip.top,
        scaleX: clip.scaleX,
        scaleY: clip.scaleY,
      };
    }
    const base = img._previewClip;
    const kx = prevScaleX / nextScaleX || 1;
    const ky = prevScaleY / nextScaleY || 1;
    clip.left = base.left * kx;
    clip.top = base.top * ky;
    clip.scaleX = base.scaleX * kx;
    clip.scaleY = base.scaleY * ky;
    clip.setCoords && clip.setCoords();
    clip.dirty = true;
    // 直接改 clip 属性不会触发对象重绘标记，强制刷新对象缓存
    img.dirty = true;
  }
  // 退出预览：还原 clipPath 换算前的原始值（_previewClip 为临时挂载属性，不参与序列化）
  _restorePreviewClipPath(img) {
    const clip = img.clipPath;
    const base = img._previewClip;
    if (!clip || !base) return;
    clip.left = base.left;
    clip.top = base.top;
    clip.scaleX = base.scaleX;
    clip.scaleY = base.scaleY;
    clip.setCoords && clip.setCoords();
    clip.dirty = true;
    img._previewClip = null;
    // 直接改 clip 属性不会触发对象重绘标记，强制刷新对象缓存
    img.dirty = true;
  }

  /* ---------- 保存钩子：强制退出预览，保证模板 JSON 用原始占位符 ---------- */
  hookSaveBefore() {
    if (this.previewing) this.exitPreview();
    return Promise.resolve();
  }

  /* ---------- 保存时把 variableMeta 写入模板 JSON 顶层 ---------- */
  getVariableMeta() {
    const variables = this.getVariables();
    return {
      delimiter: { ...this.delimiter },
      variables: variables.map((path) => ({
        path,
        name: path,
        // 测试值为编辑端临时预览数据，完整导出时保留；精简导出由导出管线剔除
        example: this.testData[path] !== undefined ? this.testData[path] : '',
        required: false,
      })),
    };
  }

  destroy() {
    this.canvas.off('object:modified', this._onObjectModified);
    this.canvas.off('mouse:up', this._onMouseUpKeepLock);
  }
}

VariablePlugin.pluginName = 'VariablePlugin';
VariablePlugin.apis = [
  'getDelimiter',
  'setDelimiter',
  'getTestData',
  'setTestData',
  'updateTestData',
  'getVariables',
  'containsVariable',
  'createVariableImage',
  'updateVariableImage',
  'enterPreview',
  'exitPreview',
  'isPreviewing',
  'refreshPreview',
  'getVariableMeta',
];
VariablePlugin.events = [
  'variable:delimiterChange',
  'variable:testDataChange',
  'variable:previewChange',
];

export default VariablePlugin;
