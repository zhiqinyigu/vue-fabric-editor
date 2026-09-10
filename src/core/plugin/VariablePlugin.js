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
  getValueByPath,
} from '../variableEngine';
import {
  inferVariableType,
  normalizeVariableDef,
  normalizeVariableDefs,
  validateVariableDef,
  applySchemaDefaultsFlat,
  applySchemaExamplesFlat,
} from '../variableSchema';
import { computeBackgroundLayout, replaceTilePatternSource } from '../workspaceGeometry';
import { extractVariableLabel as sharedExtractVariableLabel } from '../variablePlaceholder';
import {
  installVariablePlaceholderPatch,
  makeVariablePlaceholder,
  patchVariableImageGetSrc,
} from '../variablePlaceholderPatch';

class VariablePlugin {
  constructor(canvas, editor) {
    this.canvas = canvas;
    this.editor = editor;
    this.delimiter = { ...DEFAULT_DELIMITER };
    // 测试数据映射表：path -> value（仅存内存，不入库）
    this.testData = {};
    // 是否处于变量预览模式
    this.previewing = false;
    // 变量表（变量字典）：业务侧外部注入（adapter / api），会话内存为权威；
    // 模板持久化的是 variableMeta.schema 快照（完整导出全量 / 精简导出仅 defaultValue）
    this.variableSchema = [];
    // 会话内"导入"变量（来自 adapter.list / api 注入）的 path 集合：只读；
    // 不在集合内的即编辑器内新建的自定义变量（可编辑/删除）
    this._schemaImportedPaths = new Set();
    // 开发者后门：true 时跳过 imported 只读限制（可删除导入变量）。
    // 仅影响权限判定，不重建 _schemaImportedPaths，关掉即恢复只读
    this._schemaEditable = false;
    // 变量表注入协议实现（业务无关，可选）
    this.schemaAdapter = null;
    // schema 加载状态：_schemaLoaded 仅作状态记录（拉取不幂等，多人协同每次都拉最新）；_schemaLoading 并发去重
    this._schemaLoaded = false;
    this._schemaLoading = null;
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
    // 覆盖 fabric.Image.fromObject：保证所有加载路径（loadFromJSON / clone / fromObject）
    // 都能还原变量图片（与渲染器共用 variablePlaceholderPatch 单一事实源；delimiter 动态取值）
    installVariablePlaceholderPatch(() => this.delimiter);
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

  /* ---------- API: 变量表（schema，业务注入的变量字典） ---------- */
  getSchemaAdapter() {
    return this.schemaAdapter;
  }
  // 注入协议实现；不立即拉取（注入/更换时清掉 in-flight，下次 ensureSchemaLoaded 按新 adapter 拉取）
  setSchemaAdapter(adapter) {
    this.schemaAdapter =
      adapter && typeof adapter === 'object' && typeof adapter.list === 'function' ? adapter : null;
    this._schemaLoaded = false;
    this._schemaLoading = null;
    return this.schemaAdapter;
  }
  // 拉取变量表（每次调用都真实拉取最新，适配多人协同；同刻并发调用合并为一次请求）：
  // 有 adapter 且无 in-flight 时调 list()；无 adapter 直接返回当前会话表。失败 reject 并允许重试
  ensureSchemaLoaded() {
    if (this._schemaLoading) return this._schemaLoading;
    if (!this.schemaAdapter) return Promise.resolve(this.getVariableSchema());
    this._schemaLoading = this.schemaAdapter
      .list()
      .then((defs) => {
        // 导入为权威：同 path 的会话内自定义变量被覆盖
        const imported = normalizeVariableDefs(defs);
        const importedPaths = new Set(imported.map((d) => d.path));
        const customs = this.variableSchema.filter(
          (d) => !this._schemaImportedPaths.has(d.path) && !importedPaths.has(d.path)
        );
        this.variableSchema = [...imported, ...customs];
        this._schemaImportedPaths = importedPaths;
        this._schemaLoaded = true;
        this._schemaLoading = null;
        this._emitSchemaChange();
        return this.getVariableSchema();
      })
      .catch((err) => {
        this._schemaLoading = null;
        throw err;
      });
    return this._schemaLoading;
  }
  // 直接注入变量表（无 adapter 的静态场景）：视为导入（只读）；
  // 保留会话内不冲突的自定义变量
  setVariableSchema(defs) {
    const imported = normalizeVariableDefs(defs);
    const importedPaths = new Set(imported.map((d) => d.path));
    const customs = this.variableSchema.filter(
      (d) => !this._schemaImportedPaths.has(d.path) && !importedPaths.has(d.path)
    );
    this.variableSchema = [...imported, ...customs];
    this._schemaImportedPaths = importedPaths;
    this._schemaLoaded = true;
    this._emitSchemaChange();
    return this.getVariableSchema();
  }
  // 会话变量表快照（深拷贝，防外部改写内部状态）
  getVariableSchema() {
    return this.variableSchema.map((d) => ({ ...d }));
  }
  // 新建自定义变量（导入同 path 为权威，校验失败拒绝）
  addCustomVariable(def) {
    const normalized = normalizeVariableDef(def);
    if (!normalized) {
      return Promise.reject(this._schemaError('invalid_variable_def', ['empty_path']));
    }
    const { valid, errors } = validateVariableDef(normalized, {
      existingPaths: this.variableSchema.map((d) => d.path),
      delimiter: this.delimiter,
    });
    if (!valid) {
      return Promise.reject(this._schemaError('invalid_variable_def', errors));
    }
    this.variableSchema = [...this.variableSchema, normalized];
    this._emitSchemaChange();
    return Promise.resolve(this.getVariableSchema());
  }
  // 更新变量（path 不可改；导入变量可编辑，仅删除受限）
  updateCustomVariable(path, patch) {
    const target = this.variableSchema.find((d) => d.path === path);
    if (!target) {
      return Promise.reject(this._schemaError('variable_not_found', ['not_found']));
    }
    const next = normalizeVariableDef({ ...target, ...(patch || {}), path: target.path });
    if (!next) {
      return Promise.reject(this._schemaError('invalid_variable_def', ['empty_path']));
    }
    this.variableSchema = this.variableSchema.map((d) => (d.path === path ? next : d));
    this._emitSchemaChange();
    return Promise.resolve(this.getVariableSchema());
  }
  // 删除变量（导入变量不可删除，业务权威由后台管理生命周期；后门开启时放行）
  removeCustomVariable(path) {
    if (!this._schemaEditable && this._schemaImportedPaths.has(path)) {
      return Promise.reject(this._schemaError('imported_readonly', ['imported_readonly']));
    }
    this.variableSchema = this.variableSchema.filter((d) => d.path !== path);
    this._emitSchemaChange();
    return Promise.resolve(this.getVariableSchema());
  }
  // 开发者后门开关：setSchemaEditable(true) 后 imported 变量可删除，false 恢复只读
  setSchemaEditable(editable = true) {
    this._schemaEditable = !!editable;
    // 复用既有广播：VariableConfigModal 的 toDefRow 会重新求值 row.imported，
    // 删除按钮 v-if 自动显隐（Vue 侧无需改动）
    this.editor.emit('variable:schemaChange', this.getVariableSchema());
    return this.getVariableSchema();
  }
  isSchemaEditable() {
    return this._schemaEditable;
  }
  // 该 path 是否为导入变量（不可删除，其余可编辑），供 UI 区分来源
  isImportedVariable(path) {
    if (this._schemaEditable) return false; // 后门：全部视为可编辑
    return this._schemaImportedPaths.has(path);
  }
  // 全量保存到业务后台（last-write-wins，业务侧自 diff）；未实现 save 时 reject（UI 切导出）
  saveVariableSchema() {
    if (!this.schemaAdapter || typeof this.schemaAdapter.save !== 'function') {
      return Promise.reject(this._schemaError('save_not_implemented', ['save_not_implemented']));
    }
    return this.schemaAdapter.save(this.getVariableSchema()).then(() => this.getVariableSchema());
  }
  // 导出变量表 JSON 字符串（无 save 时的对接兜底）
  exportVariableSchema() {
    return JSON.stringify(this.getVariableSchema(), null, 2);
  }
  _schemaError(code, errors) {
    const err = new Error(`[VariablePlugin] ${code}: ${(errors || []).join(',')}`);
    err.code = code;
    err.errors = errors || [];
    return err;
  }
  // schema 变更统一出口：按 example 预填测试数据；预览态下补齐默认值并重刷，再广播
  _emitSchemaChange() {
    this._mergeSchemaPrefill();
    if (this.previewing) {
      this._mergeSchemaDefaults();
      this.refreshPreview();
    }
    this.editor.emit('variable:schemaChange', this.getVariableSchema());
  }
  // schema 注入/变更时按 example 预填测试数据（业务建议测试值）：
  // 仅缺失 key 写入，testData 已填值权威（与 variableMeta.example 回填同一语义）
  _mergeSchemaPrefill() {
    const next = applySchemaExamplesFlat(this.testData, this.variableSchema);
    if (next !== this.testData) {
      this.testData = next;
      this.editor.emit('variable:testDataChange', { ...this.testData });
    }
  }
  // 变量表默认值补齐测试数据（扁平映射表语义；testData 已填值权威，含空串不覆盖）
  _mergeSchemaDefaults() {
    const next = applySchemaDefaultsFlat(this.testData, this.variableSchema);
    if (next !== this.testData) {
      this.testData = next;
      this.editor.emit('variable:testDataChange', { ...this.testData });
    }
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
  // 扫描画布返回 [{ path, fields: string[] }]（变量表对齐视图与"收编"的数据源）：
  // 同一变量可能同时用于多个占位字段（文本/图片 URL），聚合去重
  getVariableEntries() {
    const map = new Map();
    const collect = (objs) => {
      objs.forEach((obj) => {
        if (obj.objects && Array.isArray(obj.objects)) {
          collect(obj.objects);
          return;
        }
        getVariableFieldOfObject(obj).forEach((field) => {
          const value = getByPath(obj, field);
          if (typeof value !== 'string') return;
          extractVariablesFromString(value, this.delimiter).forEach((p) => {
            if (!map.has(p)) map.set(p, []);
            const fields = map.get(p);
            if (!fields.includes(field)) fields.push(field);
          });
        });
      });
    };
    collect(this.canvas.getObjects());
    return Array.from(map, ([path, fields]) => ({ path, fields }));
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
  //（提取逻辑与渲染器占位兜底共用 variablePlaceholder.js，单一事实源）
  _extractVariableLabel(src) {
    return sharedExtractVariableLabel(src, this.delimiter);
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
  // 规格统一在 variablePlaceholder.js（与渲染器占位兜底共用同一工厂，单一事实源）
  _makePlaceholder() {
    return makeVariablePlaceholder();
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
  //（实现与渲染器共用 variablePlaceholderPatch，单一事实源）
  _patchGetSrc(imgEl) {
    return patchVariableImageGetSrc(imgEl);
  }
  // 注意：变量图的 fromObject 包装统一由 variablePlaceholderPatch 安装
  //（编辑器与渲染器共用；见构造函数里的 installVariablePlaceholderPatch）
  // 导入 JSON 前：读取 variableMeta 中的包裹符并应用；
  // 新契约（meta.schema）还原模板快照，旧契约（meta.variables[].example）仅回填测试数据
  hookImportBefore(jsonFile) {
    try {
      const json = typeof jsonFile === 'string' ? JSON.parse(jsonFile) : jsonFile;
      if (!json || !json.variableMeta) return Promise.resolve();
      const meta = json.variableMeta;
      if (meta.delimiter) {
        this.delimiter = { ...DEFAULT_DELIMITER, ...meta.delimiter };
      }
      if (Array.isArray(meta.schema) && meta.schema.length) {
        // 新契约：schema 快照（完整/精简形状均可），还原变量定义 + 测试数据
        this._applySnapshotSchema(meta.schema);
      } else if (Array.isArray(meta.variables)) {
        // 旧契约兼容：回填模板保存的测试数据（variableMeta.variables[].example），
        // 使"变量配置"弹窗打开时能回显该变量上次的测试值；
        // 仅当内存中还没有该变量值时回填，不覆盖当前会话已填写的值
        meta.variables.forEach((v) => {
          if (
            v &&
            typeof v.path === 'string' &&
            v.example !== undefined &&
            this.testData[v.path] === undefined
          ) {
            this.testData[v.path] = v.example;
          }
        });
      }
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
  // 字段未解析检测（预览隐藏判据）：该字段任一变量 key 在测试数据中缺失/为空即未填。
  // 注意在 enterPreview 的 _mergeSchemaDefaults 之后评估——schema defaultValue 已兜底，
  // 此处"缺失"即真的没有数据来源（与渲染器缺值空串 → 元素消失的语义对齐；
  // 区别于"整值都是变量"的空串特判，部分含变量的 URL（avatar 前缀）同样命中）
  _isUnresolved(oldValue) {
    return extractVariablesFromString(oldValue, this.delimiter).some((p) => {
      const v = getValueByPath(this.testData, p);
      return v == null || v === '';
    });
  }
  enterPreview() {
    if (this.previewing) return;
    // 变量表默认值补齐测试数据（仅缺失 key；testData 已填值权威）
    this._mergeSchemaDefaults();
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
  // 当前预览中因缺数据被隐藏的元素数（预览外恒为 0）；UI 层用于可读性提示
  getHiddenPreviewCount() {
    return this.previewing ? this._hiddenCount || 0 : 0;
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
          const item = { obj, field, oldValue: value, oldVisible: obj.visible !== false };
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
    // 预览侧隐藏计数（渲染器同语义：无数据/无默认值兜底的字段替换为空串 → 元素不显示）
    let hiddenCount = 0;
    this._snapshot.forEach((item) => {
      const { obj, field, oldValue, oldTransform } = item;
      // 快照记录的对象可见性（兼容模板本身 visible=false 的对象，退出预览还原）
      const oldVisible = item.oldVisible !== false;
      if (field === 'text') {
        const next = toPreview ? render(oldValue, this.testData, this.delimiter) : oldValue;
        // 文本变量维持替换语义（缺值替换为空串、元素本身仍可见仍锁定，与渲染器一致）；
        // 隐藏语义仅用于图片/背景/二维码等资源类字段
        obj.set('visible', oldVisible);
        obj.set('text', next);
        obj.initDimensions && obj.initDimensions();
        obj.setCoords && obj.setCoords();
      } else if (field === 'src') {
        const next = toPreview ? render(oldValue, this.testData, this.delimiter) : oldValue;
        // 未解析字段（无数据且无默认值兜底）：预览隐藏（渲染器同语义）
        if (toPreview && this._isUnresolved(oldValue)) {
          if (obj.visible !== false) hiddenCount++;
          obj.set('visible', false);
          return;
        }
        obj.set('visible', oldVisible);
        // 背景图：预览按真实尺寸重排 workspace 铺满布局，退出恢复占位布局
        if (obj.id === 'backgroundImage') {
          this._applyBackgroundPreview(obj, oldValue, toPreview, oldTransform, token);
          return;
        }
        // 图片：预览期按替换后 URL 加载；退出时【同步】恢复原始 src 属性，异步仅用于刷新展示
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
        // 未解析字段（无数据且无默认值兜底）：预览隐藏（渲染器同语义），
        // 同时跳过存储值写回，避免空串污染 extension
        if (toPreview && this._isUnresolved(oldValue)) {
          if (obj.visible !== false) hiddenCount++;
          obj.set('visible', false);
          return;
        }
        obj.set('visible', oldVisible);
        setByPath(obj, field, next); // 同步更新存储值，保证 getJson 拿到正确值
        // 退出预览：先恢复原始 transform，再重绘原图
        if (!toPreview && oldTransform) {
          obj.set(oldTransform);
        }
        this._reloadExtensionImage(obj, field, oldTransform, toPreview, token);
      } else if (!toPreview) {
        obj.set('visible', oldVisible);
      }
    });
    // 预览中隐藏的元素数（退出预览/未在预览时归零），供 UI 层提示"哪些预览不出"
    this._hiddenCount = toPreview ? hiddenCount : 0;
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
  /**
   * 模板变量元数据（variableMeta）双形状：
   * - complete=true（saveJson 完整导出）：全量会话表快照（src 来源标记 +
   *   example 承载测试数据：testData 已填值含空串优先，否则业务预设）；
   *   画布已用但未定义的 path 合成 def（label=path、按占位字段推断类型、src=custom）
   * - complete=false（剪贴板 / save-request 精简保存，面向 C 端渲染）：
   *   仅含「已使用 ∧ 有非空 defaultValue」的 { path, defaultValue } 条目
   */
  getVariableMeta(complete = true) {
    const meta = { version: 1, delimiter: { ...this.delimiter } };
    if (complete) {
      const definedPaths = new Set(this.variableSchema.map((d) => d.path));
      const synthesized = this.getVariableEntries()
        .filter((e) => !definedPaths.has(e.path))
        .map((e) =>
          normalizeVariableDef({
            path: e.path,
            label: e.path,
            type: this._inferTypeFromFields(e.fields),
            example: this.testData[e.path] !== undefined ? this.testData[e.path] : '',
            defaultValue: '',
            description: '',
          })
        )
        .filter(Boolean)
        .map((d) => ({ ...d, src: 'custom' }));
      const defs = this.variableSchema.map((d) => ({
        path: d.path,
        label: d.label,
        type: d.type,
        // example = 测试数据持久化形态：testData 已填值（含空串）权威，否则业务预设
        example: this.testData[d.path] !== undefined ? this.testData[d.path] : d.example || '',
        defaultValue: d.defaultValue,
        description: d.description,
        src: this._schemaImportedPaths.has(d.path) ? 'imported' : 'custom',
      }));
      meta.schema = [...defs, ...synthesized];
    } else {
      const used = new Set(this.getVariables());
      meta.schema = this.variableSchema
        .filter((d) => used.has(d.path) && typeof d.defaultValue === 'string' && d.defaultValue)
        .map((d) => ({ path: d.path, defaultValue: d.defaultValue }));
    }
    return meta;
  }
  // 按占位字段推断类型（多字段时取首个非 text 类型；与收编推断同源）
  _inferTypeFromFields(fields) {
    const type = (fields || []).map((f) => inferVariableType(f)).find((t) => t !== 'text');
    return type || 'text';
  }
  /**
   * 模板快照还原（hookImportBefore 专用）：按 src 还原来源权限
   * （imported → 只读 / custom → 可编辑）；不覆盖会话内已有定义
   * （adapter 拉取的业务权威 / 当前会话优先），随后 _emitSchemaChange
   * 统一做 example 预填与广播
   */
  _applySnapshotSchema(defs) {
    const existing = new Set(this.variableSchema.map((d) => d.path));
    const importedRaw = new Set(
      (Array.isArray(defs) ? defs : [])
        .filter((d) => d && d.src === 'imported' && typeof d.path === 'string')
        .map((d) => d.path.trim())
    );
    const restored = normalizeVariableDefs(defs).filter((d) => !existing.has(d.path));
    if (!restored.length) return;
    this.variableSchema = [...this.variableSchema, ...restored];
    restored.forEach((d) => {
      if (importedRaw.has(d.path)) this._schemaImportedPaths.add(d.path);
    });
    this._emitSchemaChange();
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
  'getVariableEntries',
  'containsVariable',
  'createVariableImage',
  'updateVariableImage',
  'enterPreview',
  'exitPreview',
  'isPreviewing',
  'getHiddenPreviewCount',
  'refreshPreview',
  'getVariableMeta',
  'getSchemaAdapter',
  'setSchemaAdapter',
  'ensureSchemaLoaded',
  'setVariableSchema',
  'getVariableSchema',
  'addCustomVariable',
  'updateCustomVariable',
  'removeCustomVariable',
  'isImportedVariable',
  'setSchemaEditable',
  'isSchemaEditable',
  'saveVariableSchema',
  'exportVariableSchema',
];
VariablePlugin.events = [
  'variable:delimiterChange',
  'variable:testDataChange',
  'variable:previewChange',
  'variable:schemaChange',
];

export default VariablePlugin;
