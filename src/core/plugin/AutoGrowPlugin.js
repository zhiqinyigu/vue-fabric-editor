/*
 * @Author: cyc
 * @Date: 2026-08-24 21:53:21
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-01 10:27:16
 * @Description: 自适应增高插件：
 * - 文本块标记 autoGrow（仅尺寸锁 clipEnabled=false 时生效），内容变长后海报随之下增高；
 * - 任意对象标记 follow（引用 autoGrow 文本或另一个 follow 元素，支持链式），
 *   保持"编辑时相对间距"跟随锚点下移；
 * - 海报高度 = max(设计高, 各 autoGrow/follow 底部)，通过 setSizeSilent 静默调整（不改视口缩放）。
 * 增高时机：
 * - 编辑态：文本内容/尺寸变化（text:changed 防抖、object:modified 立即）实时增高，
 *   位移结果直接落为新的编辑态基准（只增不减）；
 * - 预览态：variable:previewRefresh 渲染真实数据后增高，退出预览恢复设计态。
 * 编辑态几何快照（designMap）在非预览态持续维护，进入预览后锁定，作为相对间距基准。
 */
import { computeAutoGrowSize } from '../variableEngine';

// 编辑态 text:changed 的同步防抖间隔（ms）
const EDIT_DEBOUNCE_MS = 150;

class AutoGrowPlugin {
  constructor(canvas, editor) {
    this.canvas = canvas;
    this.editor = editor;
    // 编辑态几何快照：{ [id]: { top, bottom } }，bottom = top + height（originY='top' 语义）
    this.designMap = {};
    // 预览进入前的设计尺寸（恢复用）
    this._designSize = { width: 0, height: 0 };
    // 预览期被位移的对象位置快照：{ [id]: { top } }，退出预览恢复
    this._prevPositions = {};
    // 预览中是否锁定 designMap 更新
    this._lockDesignMap = false;
    this._debounceTimer = null;
    this._initListeners();
    // 插件注册时画布可能已存在对象（导入/预设），全量重建一次
    this._rebuildDesignMap();
  }

  _initListeners() {
    // 非预览态维护编辑态几何快照（进入预览后锁定，预览中对象也被锁定不可编辑）
    this.canvas.on('object:added', (e) => this._updateDesignMap(e.target));
    this.canvas.on('object:modified', (e) => {
      this._cancelDebounce();
      const t = e.target;
      if (t && t.get && t.get('follow') && !t.get('autoGrow')) {
        // 用户手动定位 follow 元素：先落新位置为基准，再同步（保持其新位置不被吸附）
        this._updateDesignMap(t);
        this.syncEditorHeight();
      } else {
        // 锚点/普通对象变化：先按变化前快照保距同步（锚点变高/下移时 follow 跟随），再落新基准
        this.syncEditorHeight();
        this._updateDesignMap(t);
      }
    });
    this.canvas.on('object:removed', (e) => this._removeDesignMap(e.target));
    // 编辑态：文本内容输入过程中防抖增高（粘贴/输入长文本时海报实时跟随）
    this.canvas.on('text:changed', () => {
      this._cancelDebounce();
      this._debounceTimer = setTimeout(() => {
        this._debounceTimer = null;
        this.syncEditorHeight();
      }, EDIT_DEBOUNCE_MS);
    });

    // 预览时序：previewChange 记录设计尺寸并锁定快照；previewRefresh（进入/数据刷新）计算增高；previewExit 恢复
    this.editor.on('variable:previewChange', (previewing) => {
      this._cancelDebounce();
      const ws = this._getWorkspace();
      if (previewing && ws) {
        this._designSize = { width: ws.get('width'), height: ws.get('height') };
        this._prevPositions = {};
        this._lockDesignMap = true;
      } else {
        this._lockDesignMap = false;
      }
    });
    this.editor.on('variable:previewRefresh', () => this.applyAutoGrow());
    this.editor.on('variable:previewExit', () => this.restore());
  }
  _cancelDebounce() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }

  /* ---------- 编辑态几何快照 ---------- */
  _getWorkspace() {
    const ws = this.editor.getPlugin('WorkspacePlugin');
    return ws && ws.getWorkspase ? ws.getWorkspase() : null;
  }
  _updateDesignMap(target) {
    if (!target || this._lockDesignMap) return;
    if (target.objects && Array.isArray(target.objects)) return; // group 子对象坐标非画布级，暂不参与
    if (target.id == null) return;
    const top = target.get('top');
    // 拉伸走 scaleY，width/height 保持初始值；实际渲染高度 = height * scaleY
    const height = (target.get('height') || 0) * (target.get('scaleY') || 1);
    // originY 感知：与 variableEngine 的 designMap 语义保持一致（top 为对象顶边）
    const topEdge = target.get('originY') === 'center' ? top - height / 2 : top;
    this.designMap[String(target.id)] = {
      top: topEdge,
      bottom: topEdge + height,
    };
  }
  _removeDesignMap(target) {
    if (!target || target.id == null) return;
    delete this.designMap[String(target.id)];
  }
  // 全量重建设计快照（导入/清空/编辑态增高落位后兜底）
  _rebuildDesignMap() {
    this.designMap = {};
    this.canvas.getObjects().forEach((obj) => this._updateDesignMap(obj));
  }

  /* ---------- API: 锚点查询 ---------- */
  // 返回可作为 follow 锚点的 autoGrow 对象列表（供属性面板下拉）
  getAnchors() {
    const list = [];
    this.canvas.getObjects().forEach((obj) => {
      if (!obj || obj.objects) return;
      if (obj.get('autoGrow') && obj.id != null) {
        list.push({ id: obj.id, name: this._anchorName(obj) });
      }
    });
    return list;
  }
  _anchorName(obj) {
    if (obj.get('text')) return String(obj.get('text')).slice(0, 12);
    if (obj.get('name')) return String(obj.get('name'));
    return String(obj.id);
  }

  /* ---------- API: autoGrow / follow 设置 ---------- */
  // 设置文本块自适应增高（autoGrow 与尺寸锁互斥：开启 autoGrow 需关闭 clipEnabled）
  setAutoGrow(obj, enabled, minHeight, maxHeight) {
    if (!obj) return;
    const next = { autoGrow: !!enabled };
    next.autoGrowMinHeight = minHeight != null ? Number(minHeight) : null;
    next.autoGrowMaxHeight = maxHeight != null ? Number(maxHeight) : null;
    if (next.autoGrow && obj.clipEnabled) {
      // 尺寸锁开启时不允许增高：自动关闭尺寸锁（含省略号与框高）
      next.clipEnabled = false;
      next.ellipsisEnabled = false;
      next.frameHeight = null;
    }
    obj.set(next);
    // 触发 initDimensions 重新计算高度并钳制
    obj.set('dirty', true);
    obj.initDimensions && obj.initDimensions();
    // 编辑态开启/调整后立即按当前内容增高（sync 内部重建快照）
    this.syncEditorHeight();
    this.canvas.requestRenderAll();
    // 通知属性面板刷新锚点下拉（autoGrow 列表可能变化）
    this.editor.emit('autoGrow:change', obj.id);
  }
  // 设置元素跟随锚点（anchorId 为 autoGrow 文本或另一个 follow 元素的 id）
  setFollow(obj, anchorId) {
    if (!obj) return;
    if (anchorId == null || anchorId === '') {
      obj.set('follow', undefined);
    } else {
      obj.set('follow', String(anchorId));
    }
    // 编辑态设置跟随关系后立即按锚点当前内容位移（sync 内部重建快照）
    this.syncEditorHeight();
    this.canvas.requestRenderAll();
    this.editor.emit('autoGrow:change', obj.id);
  }
  clearFollow(obj) {
    this.setFollow(obj, null);
  }
  // 读取对象 autoGrow 配置
  getAutoGrowInfo(obj) {
    if (!obj) return { autoGrow: false, autoGrowMinHeight: null, autoGrowMaxHeight: null };
    return {
      autoGrow: !!obj.get('autoGrow'),
      autoGrowMinHeight: Number(obj.get('autoGrowMinHeight')) || null,
      autoGrowMaxHeight: Number(obj.get('autoGrowMaxHeight')) || null,
    };
  }

  /* ---------- 公共计算 ---------- */
  // 收集画布顶层对象几何（group 内对象坐标非画布级，暂不参与）
  _collectObjects() {
    const objects = [];
    const byId = {};
    this.canvas.getObjects().forEach((obj) => {
      if (!obj || obj.objects) return;
      if (obj.id == null) return;
      const item = {
        id: String(obj.id),
        top: obj.get('top'),
        height: obj.get('height') || 0,
        scaleX: obj.get('scaleX') || 1,
        scaleY: obj.get('scaleY') || 1,
        originY: obj.get('originY'),
        autoGrow: !!obj.get('autoGrow'),
        autoGrowMinHeight: Number(obj.get('autoGrowMinHeight')) || null,
        autoGrowMaxHeight: Number(obj.get('autoGrowMaxHeight')) || null,
        follow: obj.get('follow') != null ? String(obj.get('follow')) : null,
      };
      objects.push(item);
      byId[item.id] = obj;
    });
    return { objects, byId };
  }
  // 应用位移；recordPrev=true 时记录原位置供退出预览恢复
  _applyUpdates(updates, byId, recordPrev) {
    updates.forEach(({ id, top }) => {
      const obj = byId[id];
      if (!obj) return;
      if (recordPrev && this._prevPositions[id] === undefined) {
        this._prevPositions[id] = { top: obj.get('top') };
      }
      obj.set('top', top);
      if (obj.setCoords) obj.setCoords();
    });
  }
  // 静默调整海报高度（宽度不变，不改视口缩放；高度未变化则跳过）
  _resizeWorkspace(height) {
    const ws = this._getWorkspace();
    if (!ws || !(height > 0) || height === ws.get('height')) return;
    const wp = this.editor.getPlugin('WorkspacePlugin');
    wp && wp.setSizeSilent && wp.setSizeSilent(ws.get('width'), height);
  }

  /* ---------- 编辑态实时增高 ---------- */
  // 文本内容/尺寸变化后：海报随 autoGrow 内容增高、follow 元素保距下移。
  // 与预览态同一套规则；位移直接落为新的编辑态基准（重建快照），只增不减（当前高度为下限）。
  syncEditorHeight() {
    const vp = this.editor.getPlugin('VariablePlugin');
    if (vp && vp.isPreviewing()) return; // 预览态由 applyAutoGrow 处理
    const workspace = this._getWorkspace();
    if (!workspace) return;

    const { objects, byId } = this._collectObjects();
    const { height, updates } = computeAutoGrowSize(objects, {
      designHeight: workspace.get('height') || 0,
      designMap: this.designMap,
    });

    this._applyUpdates(updates, byId, false);
    // 位移 + 文本自身高度变化（text:changed）落为新的编辑态基准
    this._rebuildDesignMap();
    this._resizeWorkspace(height);
    this.canvas.requestRenderAll();
  }

  /* ---------- 预览联动 ---------- */
  // 渲染真实数据后：计算增高尺寸并应用位移（仅预览态生效）
  applyAutoGrow() {
    const vp = this.editor.getPlugin('VariablePlugin');
    if (!vp || !vp.isPreviewing()) return;
    const workspace = this._getWorkspace();
    if (!workspace) return;

    const { objects, byId } = this._collectObjects();
    const { height, updates } = computeAutoGrowSize(objects, {
      designHeight: this._designSize.height,
      designMap: this.designMap,
    });

    // 应用位移（记录原位置供退出恢复）
    this._applyUpdates(updates, byId, true);
    // 静默调整海报高度（宽度不变，不改视口缩放）
    this._resizeWorkspace(height);
    this.canvas.requestRenderAll();
  }
  // 退出预览：恢复对象位置与设计尺寸
  restore() {
    const byId = {};
    this.canvas.getObjects().forEach((obj) => {
      if (obj && obj.id != null) byId[String(obj.id)] = obj;
    });
    Object.keys(this._prevPositions).forEach((id) => {
      const obj = byId[id];
      if (obj && this._prevPositions[id]) {
        obj.set('top', this._prevPositions[id].top);
        if (obj.setCoords) obj.setCoords();
      }
    });
    this._prevPositions = {};
    this._resizeWorkspace(this._designSize.height);
    this.canvas.requestRenderAll();
  }

  destroy() {
    this._cancelDebounce();
    this.canvas.off('object:added');
    this.canvas.off('object:modified');
    this.canvas.off('object:removed');
    this.canvas.off('text:changed');
  }
}

AutoGrowPlugin.pluginName = 'AutoGrowPlugin';
AutoGrowPlugin.apis = [
  'getAnchors',
  'setAutoGrow',
  'setFollow',
  'clearFollow',
  'getAutoGrowInfo',
  'applyAutoGrow',
  'restore',
  'syncEditorHeight',
];

export default AutoGrowPlugin;
