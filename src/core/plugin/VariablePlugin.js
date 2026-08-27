/*
 * @Author: cyc
 * @Date: 2026-08-27 11:05:58
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-10 16:04:07
 * @Description: 模板变量插件：管理包裹符、测试数据映射表、变量预览切换
 */
import { v4 as uuid } from 'uuid';
import { fabric } from 'fabric';
import {
  DEFAULT_DELIMITER,
  containsVariable,
  render,
  extractVariablesFromString,
  getVariableFieldOfObject,
  getByPath,
  setByPath,
} from '../variableEngine';

class VariablePlugin {
  constructor(canvas, editor, options) {
    this.canvas = canvas;
    this.editor = editor;
    this.delimiter = { ...DEFAULT_DELIMITER };
    // 测试数据映射表：path -> value（仅存内存，不入库）
    this.testData = {};
    // 是否处于变量预览模式
    this.previewing = false;
    // 预览期快照：{ obj, field, oldValue }[]，用于退出时恢复
    this._snapshot = [];
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
  // URL 含变量时创建占位 image：真实 src 保留变量 URL，画布上显示占位图
  createVariableImage(src) {
    return new Promise((resolve, reject) => {
      const placeholder = this._makePlaceholder(src);
      fabric.Image.fromURL(
        placeholder,
        (imgEl, isError) => {
          if (isError || !imgEl) {
            reject(new Error('图片变量占位图生成失败'));
            return;
          }
          // 保留真实变量 URL 到 src（存储态），占位图仅用于编辑期展示
          imgEl.set('src', src);
          imgEl.set('isVariableImage', true);
          imgEl.set('id', uuid());
          this._patchGetSrc(imgEl);
          resolve(imgEl);
        },
        { crossOrigin: 'anonymous' }
      );
    });
  }
  // 生成"动态变量占位图"：灰底 + 图片图标 + 变量名
  _makePlaceholder(src) {
    const vars = extractVariablesFromString(src, this.delimiter);
    const label = vars.join(', ') || 'variable';
    const width = 240;
    const height = 160;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    // 灰底
    ctx.fillStyle = '#F1F3F5';
    ctx.fillRect(0, 0, width, height);
    // 边框
    ctx.strokeStyle = '#D5DBE0';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, width - 4, height - 4);
    // 图片图标
    ctx.fillStyle = '#AEB6BF';
    ctx.fillRect(width / 2 - 18, height / 2 - 26, 36, 28);
    ctx.strokeStyle = '#AEB6BF';
    ctx.lineWidth = 2;
    ctx.strokeRect(width / 2 - 10, height / 2 + 2, 20, 14);
    // 变量名
    ctx.fillStyle = '#9099A3';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, width / 2, height - 22);
    return canvas.toDataURL('image/png');
  }
  // 序列化（toObject/toJSON）时，变量图片应输出存储的变量 URL，而非占位图 dataURL
  // fabric.Image.getSrc 默认取 DOM 元素 src（即占位图 base64），这里按 isVariableImage 兜底返回 this.src
  _patchGetSrc(imgEl) {
    imgEl.getSrc = function (filtered) {
      if (this.get('isVariableImage') === true && typeof this.get('src') === 'string') {
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
      originalFromObject.call(
        this,
        { ..._object, src: placeholder },
        (instance, isError) => {
          if (!isError && instance) {
            instance.set('src', variableSrc);
            instance.set('isVariableImage', true);
            self._patchGetSrc(instance);
          }
          callback && callback(instance, isError);
        }
      );
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
          obj.set('src', src);
          obj.set('isVariableImage', true);
          obj.set({ left, top, scaleX, scaleY, width, height });
          obj.setCoords();
          this.canvas.requestRenderAll();
        },
        this,
        'anonymous'
      );
    });
  }

  /* ---------- 非破坏性预览 ---------- */
  enterPreview() {
    if (this.previewing) return;
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
  }
  exitPreview() {
    if (!this.previewing) return;
    this._applySnapshot(false);
    this._lockObjects(false);
    this.previewing = false;
    this._snapshot = [];
    this.editor.emit('variable:previewChange', false);
    this.canvas.requestRenderAll();
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
    this._snapshot.forEach(({ obj, field, oldValue, oldTransform }) => {
      if (field === 'text') {
        const next = toPreview ? render(oldValue, this.testData, this.delimiter) : oldValue;
        obj.set('text', next);
        obj.initDimensions && obj.initDimensions();
        obj.setCoords && obj.setCoords();
      } else if (field === 'src') {
        // 图片：预览期按替换后 URL 加载；退出时【同步】恢复原始 src 属性，异步仅用于刷新展示
        const next = toPreview ? render(oldValue, this.testData, this.delimiter) : oldValue;
        obj.set('src', next); // 同步更新 src 属性，保证 getJson 拿到正确值
        // 退出预览：先恢复原始 transform，再加载占位图
        // 避免预览期为了等比缩放而改写 left/top/width/height 污染模板
        if (!toPreview && oldTransform) {
          obj.set(oldTransform);
        }
        this._reloadImageSrc(obj, next, oldTransform);
      } else if (field === 'extension.data' || field === 'extension.value') {
        // 二维码/条形码：内容在 extension 子字段，预览期渲染内容并按原版位重绘图像；
        // 退出时恢复原始内容与 transform，异步仅用于刷新展示
        const next = toPreview ? render(oldValue, this.testData, this.delimiter) : oldValue;
        setByPath(obj, field, next); // 同步更新存储值，保证 getJson 拿到正确值
        // 退出预览：先恢复原始 transform，再重绘原图
        if (!toPreview && oldTransform) {
          obj.set(oldTransform);
        }
        this._reloadExtensionImage(obj, field, oldTransform, toPreview);
      }
    });
  }
  _reloadImageSrc(img, src, oldTransform) {
    // 仅替换展示资源，不改变已设置的 src 属性（src 属性已由 _applySnapshot 同步设置）
    // 变量 URL 无法直接加载，回退为占位图展示（用于退出预览时恢复编辑态表现）
    const isVariableSrc = typeof src === 'string' && containsVariable(src, this.delimiter);
    const loadSrc = isVariableSrc ? this._makePlaceholder(src) : src;
    // 注意：setElement 需要原生 HTMLImageElement，不能用 fabric.Image.fromURL
    // （fromURL 的回调返回的是 fabric.Image 实例，传入 setElement 会导致
    //  _element 不是合法 image，fabric._renderFill 时 drawImage 抛错，与
    //  _restoreVariableImages 是同一类问题）
    fabric.util.loadImage(
      loadSrc,
      (imgEl, isError) => {
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
              img.set({
                scaleX: displayedW / naturalW,
                scaleY: displayedH / naturalH,
                left: t.left,
                top: t.top,
              });
            } else {
              img.set(t);
            }
          }
          img.setCoords();
          img.initDimensions && img.initDimensions();
          this.canvas.requestRenderAll();
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
  _reloadExtensionImage(obj, field, oldTransform, toPreview) {
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
      raw = isQr ? plugin._getBase64Str(plugin._paramsToOption(options)) : plugin._getBase64Str(options);
    } catch (e) {
      this.canvas.requestRenderAll();
      return;
    }
    Promise.resolve(raw)
      .then((base64) => {
        if (!base64 || typeof base64 !== 'string') {
          this.canvas.requestRenderAll();
          return;
        }
        obj.setSrc(
          base64,
          (newImg, isError) => {
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
