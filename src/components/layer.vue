<!--
 * @Author: 秦少卫
 * @Date: 2022-09-03 19:16:55
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:20:43
 * @Description: 图层面板
-->

<template>
  <div class="box">
    <template v-if="rows.length">
      <Divider plain orientation="left">{{ $t('layers') }}</Divider>
      <div class="layer-box" :class="{ 'is-dragging': dragState.active }">
        <transition-group name="layer-item" tag="div">
          <div
            v-for="row in rows"
            :key="row._key"
            class="layer-item"
            :class="{
              active: isSelect(row),
              'is-group': row.isGroup,
              'is-child': row.depth > 0,
              'is-dragging': isDraggingSource(row),
            }"
            :style="{ paddingLeft: 10 + row.depth * 16 + 'px' }"
            :data-row-id="row.id"
            @mousedown="(e) => onPointerDown(e, row)"
            @click="(e) => onItemClick(e, row)"
            @contextmenu.prevent="(e) => onContextMenu(e, row)"
          >
            <!-- 展开箭头 / 占位 -->
            <span
              v-if="row.hasChildren"
              class="expand-btn"
              :class="{ expanded: row.expanded }"
              @click.stop="toggleExpand(row)"
            ></span>
            <span v-else class="expand-placeholder"></span>

            <!-- 类型图标 / 图片缩略图 -->
            <span class="item-icon">
              <img
                v-if="row.type === 'image' && row.thumb"
                :src="row.thumb"
                alt=""
                draggable="false"
              />
              <span v-else v-html="iconType(row.type)"></span>
            </span>

            <!-- 名称 / 重命名输入框 -->
            <input
              v-if="editingId && editingId === row.id"
              :ref="setRenameInput"
              v-model="renameText"
              class="rename-input"
              @keydown.enter.prevent="confirmRename"
              @keydown.esc.prevent="cancelRename"
              @blur="confirmRename"
            />
            <span v-else class="item-name" :title="displayName(row)">
              {{ displayName(row) }}
            </span>

            <!-- 右侧操作按钮 -->
            <span class="item-actions" @click.stop>
              <Tooltip content="重命名" placement="top" transfer>
                <Button
                  type="text"
                  size="small"
                  icon="md-create"
                  class="action-btn"
                  @click.stop="startRename(row)"
                ></Button>
              </Tooltip>
              <Tooltip :content="row.isLock ? '解锁' : '锁定'" placement="top" transfer>
                <Button
                  type="text"
                  size="small"
                  :icon="row.isLock ? 'md-lock' : 'md-unlock'"
                  class="action-btn"
                  :class="{ 'lock-active': row.isLock }"
                  @click.stop="(e) => onToggleLock(e, row)"
                ></Button>
              </Tooltip>
              <Tooltip :content="row.visible ? '隐藏' : '显示'" placement="top" transfer>
                <Button
                  type="text"
                  size="small"
                  :icon="row.visible ? 'md-eye' : 'md-eye-off'"
                  class="action-btn"
                  :class="{ 'hide-active': !row.visible }"
                  @click.stop="(e) => onToggleVisible(e, row)"
                ></Button>
              </Tooltip>
            </span>
          </div>
        </transition-group>
      </div>
    </template>
    <template v-else>
      <div class="empty-text">{{ $t('emptyLayer') }}</div>
    </template>
    <!-- 拖拽浮层：脱离文档流跟随鼠标（源行原位以 is-dragging 占位撑开），外观与真身一致 -->
    <div
      v-if="ghostRow"
      class="layer-item layer-item-ghost"
      :class="{ 'is-child': ghostRow.depth > 0 }"
      :style="ghostStyle"
    >
      <span
        v-if="ghostRow.hasChildren"
        class="expand-btn"
        :class="{ expanded: ghostRow.expanded }"
      ></span>
      <span v-else class="expand-placeholder"></span>
      <span class="item-icon">
        <img
          v-if="ghostRow.type === 'image' && ghostRow.thumb"
          :src="ghostRow.thumb"
          alt=""
          draggable="false"
        />
        <span v-else v-html="iconType(ghostRow.type)"></span>
      </span>
      <span class="item-name" :title="displayName(ghostRow)">{{ displayName(ghostRow) }}</span>
    </div>
  </div>
</template>

<script>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from '@vue/composition-api';
import { v4 as uuid } from 'uuid';
import useSelect from '@/hooks/select';
import groupIcon from '!!raw-loader!@/assets/icon/layer/group.svg';
import textbox from '!!raw-loader!@/assets/icon/layer/textbox.svg';
import iText from '!!raw-loader!@/assets/icon/layer/iText.svg';
import imageIcon from '!!raw-loader!@/assets/icon/layer/image.svg';
import rectIcon from '!!raw-loader!@/assets/icon/layer/rect.svg';
import circleIcon from '!!raw-loader!@/assets/icon/layer/circle.svg';
import triangleIcon from '!!raw-loader!@/assets/icon/layer/triangle.svg';
import polygonIcon from '!!raw-loader!@/assets/icon/layer/polygon.svg';

const defaultIcon =
  '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4" y="4" width="16" height="16" fill="none" stroke="#555" stroke-width="1.5" rx="2"/></svg>';

// ============================================================
// 组合函数拆分（均保留在当前文件），setup 只负责组装与生命周期
// ============================================================

/**
 * 图层树：扁平行构建、对象查找、图标/名称展示、展开收起。
 * 树刷新需感知"是否正在重命名"（重命名时暂停刷新，避免输入框被打断），
 * 通过共享的 renameState.editingId 与重命名逻辑联动。
 */
function useLayerTree(canvasEditor, fabric, renameState) {
  const rows = ref([]);
  const expandedIds = new Set();

  // 图标映射
  const iconType = (type) => {
    const iconMap = {
      group: groupIcon,
      textbox: textbox,
      'i-text': iText,
      image: imageIcon,
      rect: rectIcon,
      circle: circleIcon,
      triangle: triangleIcon,
      polygon: polygonIcon,
    };
    return iconMap[type] || defaultIcon;
  };
  const textType = (type, row) => {
    if (type && type.includes('text')) {
      return row.name || row.text || '文字';
    }
    const typeText = {
      group: '组合',
      image: '图片',
      rect: '矩形',
      circle: '圆形',
      triangle: '三角形',
      polygon: '多边形',
      path: '路径',
      line: '线条',
      arrow: '箭头',
      thinTailArrow: '箭头',
    };
    return typeText[type] || '元素';
  };
  const displayName = (row) => {
    return row.name || row.text || textType(row.type, row);
  };

  // 递归查找对象（含 group 子元素）
  const findObjById = (id) => {
    const search = (list) => {
      for (const o of list) {
        if (o.id === id) return o;
        if (o.type === 'group' && o.getObjects) {
          const found = search(o.getObjects());
          if (found) return found;
        }
      }
      return null;
    };
    return search(canvasEditor.canvas.getObjects());
  };
  // 查找直接父级 group
  const findParentGroup = (obj) => {
    const search = (list) => {
      for (const o of list) {
        if (o.type === 'group' && o.getObjects) {
          if (o.getObjects().includes(obj)) return o;
          const found = search(o.getObjects());
          if (found) return found;
        }
      }
      return null;
    };
    return search(canvasEditor.canvas.getObjects());
  };
  // 取 group 真实内部子元素数组：fabric 的 Group.getObjects() 返回拷贝（concat），
  // 直接改它不会生效，需改内部 _objects 才能改变组内 z 序
  const getLiveChildren = (obj) =>
    obj && Array.isArray(obj._objects) ? obj._objects : obj.getObjects();

  // 变量图片缩略图缓存：以变量名为 key，避免每次刷新重复生成
  const variableThumbCache = new Map();
  // 生成占位图样式缩略图（纯色底 + 边框 + 变量名），与画布占位图视觉一致
  const renderVariableThumb = (label) => {
    try {
      if (!document || !document.createElement) return '';
      const size = 60;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      // 纯色底
      ctx.fillStyle = '#F1F3F5';
      ctx.fillRect(0, 0, size, size);
      if (fabric.VariableImageOverlay && fabric.VariableImageOverlay.paint) {
        // 复用叠加层绘制：边框 + 变量名（字号按 85% 宽度动态计算），保证与画布一致
        ctx.save();
        ctx.translate(size / 2, size / 2);
        fabric.VariableImageOverlay.paint(ctx, size, size, label, 1);
        ctx.restore();
      } else {
        ctx.strokeStyle = '#D5DBE0';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, size - 2, size - 2);
      }
      return canvas.toDataURL('image/png');
    } catch (e) {
      return '';
    }
  };
  const getVariableThumb = (obj) => {
    const label = obj.variableLabel || 'variable';
    if (variableThumbCache.has(label)) return variableThumbCache.get(label);
    const url = renderVariableThumb(label);
    if (url) variableThumbCache.set(label, url);
    return url;
  };

  const getImgThumb = (obj) => {
    try {
      // 变量图片：getSrc 返回变量 URL（如 {{user.id}}）无法加载，
      // 缩略图改用占位图样式（纯色底 + 边框 + 变量名）
      if (obj.isVariableImage === true) {
        return getVariableThumb(obj);
      }
      return obj.getSrc && obj.getSrc();
    } catch (e) {
      return '';
    }
  };

  // 构建扁平行（自上而下）
  const buildRows = () => {
    // 先收集所有 group 子元素 id（含未展开的），避免双击编辑时子元素同时出现在顶层
    const allGroupChildIds = new Set();
    const allObjs = canvasEditor.canvas.getObjects();
    for (const item of allObjs) {
      if (item.type === 'group' && item.getObjects && item.getObjects().length) {
        item.getObjects().forEach((child) => {
          if (!child.id) child.id = uuid();
          allGroupChildIds.add(child.id);
        });
      }
    }
    const objs = allObjs.filter((item) => {
      return !(
        item instanceof fabric.GuideLine ||
        item.id === 'workspace' ||
        item.id === 'backgroundImage' ||
        // 避免双击编辑时子元素同时出现在顶层和 group 展开中
        (item.type !== 'group' && allGroupChildIds.has(item.id))
      );
    });
    const list = [];
    const walk = (obj, depth, parentId) => {
      // 组合克隆等场景可能丢失自定义 id，这里补一个稳定的 id
      if (!obj.id) obj.id = uuid();
      const id = obj.id;
      const isGroup = obj.type === 'group';
      const hasChildren = isGroup && obj.getObjects && obj.getObjects().length > 0;
      list.push({
        id,
        _key: id,
        type: obj.type,
        name: obj.name || '',
        text: obj.text || '',
        isLock: obj.lockMovementX === true,
        visible: obj.visible !== false,
        isGroup,
        hasChildren,
        expanded: hasChildren && expandedIds.has(id),
        depth,
        parentId: parentId || '',
        thumb: obj.type === 'image' ? getImgThumb(obj) : '',
      });
      if (isGroup && hasChildren && expandedIds.has(id)) {
        const children = obj.getObjects().slice().reverse();
        children.forEach((child) => walk(child, depth + 1, id));
      }
    };
    objs
      .slice()
      .reverse()
      .forEach((obj) => walk(obj, 0, ''));
    return list;
  };
  const refresh = () => {
    if (renameState.editingId.value) return;
    rows.value = buildRows();
  };

  // 展开/收起
  const toggleExpand = (row) => {
    if (expandedIds.has(row.id)) {
      expandedIds.delete(row.id);
    } else {
      expandedIds.add(row.id);
    }
    refresh();
  };

  return {
    rows,
    expandedIds,
    iconType,
    textType,
    displayName,
    findObjById,
    findParentGroup,
    getLiveChildren,
    getImgThumb,
    buildRows,
    refresh,
    toggleExpand,
  };
}

/**
 * 选择交互：单选 / ctrl 多选 / 点击选中 / 右键菜单。
 * dragShared.clickSuppressed 为拖拽模块写入，用于抑制拖拽结束后的本次 click。
 */
function useLayerSelect(canvasEditor, fabric, mixinState, tree, dragShared) {
  // 是否选中
  const isSelect = (row) => {
    return row.id === mixinState.mSelectId || (mixinState.mSelectIds || []).includes(row.id);
  };

  // 单选
  const selectOne = (obj) => {
    const canvas = canvasEditor.canvas;
    canvas.discardActiveObject();
    canvas.setActiveObject(obj);
    canvas.requestRenderAll();
  };
  // ctrl 多选切换
  // Bug1：多选采用 fabric 官方增量 addWithUpdate/removeWithUpdate，避免每次重建
  //   ActiveSelection 时成员坐标被二次变换导致全体位移。
  // Bug2（方案A）：分组内子元素以顶层父 group 身份参与多选，避免子元素进入
  //   ActiveSelection 后坐标错乱、边框/角拖跑到左上方。
  const toggleSelect = (obj) => {
    const canvas = canvasEditor.canvas;
    // 方案A：目标若在分组内，提升为顶层父 group
    const target = tree.findParentGroup(obj) || obj;
    const active = canvas.getActiveObject();

    // 无选中 → 单选目标
    if (!active) {
      canvas.setActiveObject(target);
      canvas.requestRenderAll();
      return;
    }

    // 已是多选 → 增量增减（fabric 官方模式，坐标不会错乱）
    // 注意：不能用 type === 'activeselection' 判断，fabric 5 的真实值是 'activeSelection'，
    // 用 instanceof 最健壮
    if (active instanceof fabric.ActiveSelection) {
      if (active.contains(target)) {
        active.removeWithUpdate(target);
        if (active.size() === 1) {
          // 只剩 1 个 → 降级为单选
          canvas.setActiveObject(active.item(0));
        } else {
          canvas.fire('selection:updated');
        }
      } else {
        active.addWithUpdate(target);
        canvas.fire('selection:updated');
      }
      canvas.requestRenderAll();
      return;
    }

    // 当前单选：当前选中对象同样提升后比较，点击自身则取消选择
    const activeTop = tree.findParentGroup(active) || active;
    if (activeTop === target) {
      canvas.discardActiveObject();
    } else {
      // 从单选升级为多选
      canvas.setActiveObject(new fabric.ActiveSelection([activeTop, target], { canvas }));
    }
    canvas.requestRenderAll();
  };

  const onItemClick = (e, row) => {
    if (dragShared.clickSuppressed) return;
    const obj = tree.findObjById(row.id);
    if (!obj) return;
    if (e.ctrlKey || e.metaKey) {
      toggleSelect(obj);
    } else {
      selectOne(obj);
    }
  };

  // 右键菜单（复用插件聚合）
  const onContextMenu = (e, row) => {
    e.preventDefault();
    e.stopPropagation();
    const obj = tree.findObjById(row.id);
    if (!obj) return;
    if (e.ctrlKey || e.metaKey) {
      toggleSelect(obj);
    } else {
      selectOne(obj);
    }
    nextTick(() => {
      let menu = [];
      Object.keys(canvasEditor.pluginMap).forEach((name) => {
        const p = canvasEditor.pluginMap[name];
        const pm = p && p.contextMenu && p.contextMenu();
        if (pm) menu = menu.concat(pm);
      });
      if (menu.length && canvasEditor.contextMenu) {
        canvasEditor.contextMenu.hideAll();
        canvasEditor.contextMenu.setData(menu);
        canvasEditor.contextMenu.show(e.clientX, e.clientY);
      }
    });
  };

  return { isSelect, selectOne, toggleSelect, onItemClick, onContextMenu };
}

/**
 * 重命名：editingId 为共享 ref（renameState.editingId），
 * 树刷新会读取它，在重命名期间暂停刷新避免输入被打断。
 */
function useLayerRename(canvasEditor, tree, renameState) {
  const editingId = renameState.editingId;
  const renameText = ref('');
  let renameInputEl = null;

  const setRenameInput = (el) => {
    renameInputEl = el;
  };
  const startRename = (row) => {
    const obj = tree.findObjById(row.id);
    if (!obj) return;
    editingId.value = row.id;
    renameText.value = obj.name || obj.text || '';
    nextTick(() => {
      renameInputEl && renameInputEl.focus();
    });
  };
  const confirmRename = () => {
    const obj = tree.findObjById(editingId.value);
    if (obj) {
      obj.set('name', renameText.value);
      canvasEditor.canvas.requestRenderAll();
    }
    cancelRename();
  };
  const cancelRename = () => {
    editingId.value = '';
    renameText.value = '';
    tree.refresh();
  };

  return { editingId, renameText, setRenameInput, startRename, confirmRename, cancelRename };
}

/**
 * 拖拽换层：mousedown/mousemove/mouseup + fixed 浮层跟随鼠标。
 * dragShared.clickSuppressed 在拖拽开始后置 true，供点击逻辑抑制本次 click。
 */
function useLayerDrag(canvasEditor, tree, dragShared) {
  const dragState = ref({
    active: false,
    sourceId: '',
    targetId: '',
    beforeTarget: false,
  });
  // mouse 拖拽内部状态（不进模板）
  const DRAG_THRESHOLD = 5;
  let pendingDrag = null; // { row, startX, startY }
  let dragging = false; // 是否超过阈值进入拖拽
  let hasMoved = false; // 本次拖拽是否已实时调整过层级
  let lastTargetId = '';
  let lastBefore = false;
  let dragScope = null; // 本次拖拽的作用域容器（.layer-box）

  // 拖拽浮层状态：源行留在原位（is-dragging 占位防塌陷），浮层 fixed 跟随鼠标
  const ghostRow = ref(null);
  const ghostPos = ref({ x: 0, y: 0 });
  const ghostWidth = ref(220);
  const ghostStyle = computed(() => {
    const g = ghostRow.value;
    return {
      left: ghostPos.value.x + 'px',
      top: ghostPos.value.y + 'px',
      width: ghostWidth.value + 'px',
      // 与真身行一致的左内边距（缩进由 depth 决定），保证图标/缩略图到左边缘的间距一致
      paddingLeft: 10 + (g ? g.depth : 0) * 16 + 'px',
    };
  });
  const isDraggingSource = (row) => dragState.value.active && dragState.value.sourceId === row.id;

  const workspaceSendToBack = () => {
    const w = canvasEditor.canvas.getObjects().find((o) => o.id === 'workspace');
    w && w.sendToBack();
  };
  const applyMove = (from, to, before, silent = false) => {
    // 顶层对象
    const all = canvasEditor.canvas.getObjects();
    if (all.includes(from)) {
      const toC = all.indexOf(to);
      if (toC < 0) return;
      let target = before ? toC + 1 : toC;
      target = Math.max(0, Math.min(all.length - 1, target));
      canvasEditor.canvas.moveTo(from, target);
    } else {
      // group 子元素
      const parent = tree.findParentGroup(from);
      if (parent && parent.getObjects().includes(to)) {
        const children = tree.getLiveChildren(parent);
        const fromIdx = children.indexOf(from);
        const toIdx = children.indexOf(to);
        let target = before ? toIdx + 1 : toIdx;
        children.splice(fromIdx, 1);
        if (fromIdx < target) target--;
        target = Math.max(0, Math.min(children.length, target));
        children.splice(target, 0, from);
        parent.dirty = true;
      } else {
        return;
      }
    }
    if (!silent) {
      workspaceSendToBack();
      canvasEditor.canvas.requestRenderAll();
    }
  };
  // 鼠标命中：鼠标纵向落在某行的矩形范围内即命中（跳过源行），
  // 落在行间空隙/底部空白区则返回 null → 走置底逻辑
  const resolveTarget = (clientY) => {
    if (!dragScope) return null;
    const sourceId = dragState.value.sourceId;
    const items = Array.from(dragScope.querySelectorAll('.layer-item'));
    for (const el of items) {
      if (el.dataset.rowId === sourceId) continue;
      const rect = el.getBoundingClientRect();
      const top = rect.top;
      const bottom = top + rect.height;
      if (clientY >= top && clientY <= bottom) {
        const before = clientY < top + rect.height / 2;
        return { rowId: el.dataset.rowId, before };
      }
    }
    return null;
  };
  // 拖到列表空白区（未命中任何行）→ 移到最底层
  const dropToBottom = (sourceId) => {
    const from = tree.findObjById(sourceId);
    if (!from) return;
    const all = canvasEditor.canvas.getObjects();
    if (all.includes(from)) {
      canvasEditor.canvas.moveTo(from, 0);
    } else {
      const parent = tree.findParentGroup(from);
      if (parent) {
        const children = tree.getLiveChildren(parent);
        children.splice(children.indexOf(from), 1);
        children.unshift(from);
        parent.dirty = true;
      }
    }
    workspaceSendToBack();
    canvasEditor.canvas.requestRenderAll();
  };
  const clearDrag = () => {
    document.removeEventListener('mousemove', onPointerMove);
    document.removeEventListener('mouseup', onPointerUp);
    if (dragging) {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    pendingDrag = null;
    dragging = false;
    hasMoved = false;
    lastTargetId = '';
    lastBefore = false;
    dragScope = null;
    dragShared.clickSuppressed = false;
    ghostRow.value = null;
    dragState.value = { active: false, sourceId: '', targetId: '', beforeTarget: false };
    tree.refresh();
  };
  const onPointerDown = (e, row) => {
    if (e.button !== 0) return;
    const target = e.target;
    if (
      target.closest &&
      (target.closest('.item-actions') ||
        target.closest('.expand-btn') ||
        target.closest('.rename-input'))
    ) {
      return;
    }
    const rect =
      e.currentTarget.getBoundingClientRect &&
      typeof e.currentTarget.getBoundingClientRect === 'function'
        ? e.currentTarget.getBoundingClientRect()
        : null;
    dragShared.clickSuppressed = false;
    pendingDrag = {
      row,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: rect ? e.clientX - rect.left : 0,
      offsetY: rect ? e.clientY - rect.top : 0,
      width: rect ? rect.width : 220,
    };
    dragScope = e.currentTarget.closest('.layer-box');
    dragging = false;
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);
  };
  const onPointerMove = (e) => {
    if (!pendingDrag) return;
    if (!dragging) {
      const dx = e.clientX - pendingDrag.startX;
      const dy = e.clientY - pendingDrag.startY;
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
      dragging = true;
      dragShared.clickSuppressed = true;
      dragState.value = {
        active: true,
        sourceId: pendingDrag.row.id,
        targetId: '',
        beforeTarget: false,
      };
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      ghostRow.value = pendingDrag.row;
      ghostWidth.value = pendingDrag.width;
      ghostPos.value = { x: e.clientX - pendingDrag.offsetX, y: e.clientY - pendingDrag.offsetY };
      lastTargetId = '';
      lastBefore = false;
      hasMoved = false;
    }
    // 浮层始终跟随鼠标
    ghostPos.value = { x: e.clientX - pendingDrag.offsetX, y: e.clientY - pendingDrag.offsetY };
    const st = dragState.value;
    const hit = resolveTarget(e.clientY);
    if (!hit || hit.rowId === st.sourceId) {
      st.targetId = '';
      return;
    }
    st.targetId = hit.rowId;
    st.beforeTarget = hit.before;
    // 目标或插入方向变化时才真正调整层级，避免高频 mousemove 抖动
    if (lastTargetId === hit.rowId && lastBefore === hit.before) return;
    lastTargetId = hit.rowId;
    lastBefore = hit.before;
    const from = tree.findObjById(st.sourceId);
    const to = tree.findObjById(hit.rowId);
    if (!from || !to || from === to) return;
    applyMove(from, to, hit.before);
    hasMoved = true;
  };
  const onPointerUp = (e) => {
    if (!pendingDrag) return;
    const st = dragState.value;
    if (st.active) {
      if (st.targetId && st.sourceId !== st.targetId) {
        // 实时重排期间未移动过则补一次
        if (!hasMoved) {
          const from = tree.findObjById(st.sourceId);
          const to = tree.findObjById(st.targetId);
          if (from && to && from !== to) {
            applyMove(from, to, st.beforeTarget);
          }
        }
        workspaceSendToBack();
        canvasEditor.canvas.requestRenderAll();
      } else if (!st.targetId && !hasMoved) {
        // 拖拽期间从未命中过任何行：仅当鼠标明确落在列表空白区（非源行自身）时才置底，
        // 停在源行自身/面板外 → 保持原位
        const srcEl =
          dragScope && typeof dragScope.querySelector === 'function'
            ? dragScope.querySelector('.layer-item[data-row-id="' + st.sourceId + '"]')
            : null;
        const srcRect = srcEl && srcEl.getBoundingClientRect();
        const onSource =
          srcRect && e.clientY >= srcRect.top && e.clientY <= srcRect.top + srcRect.height;
        if (!onSource) {
          const scopeRect = dragScope && dragScope.getBoundingClientRect();
          if (scopeRect && e.clientY >= scopeRect.top && e.clientY <= scopeRect.bottom) {
            dropToBottom(st.sourceId);
          }
        }
      }
    }
    clearDrag();
  };

  return {
    dragState,
    ghostRow,
    ghostPos,
    ghostWidth,
    ghostStyle,
    isDraggingSource,
    workspaceSendToBack,
    applyMove,
    resolveTarget,
    dropToBottom,
    clearDrag,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}

/**
 * 锁定 / 显隐切换
 */
function useLayerLock(canvasEditor, tree, select) {
  // 锁定/解锁
  const onToggleLock = (e, row) => {
    const obj = tree.findObjById(row.id);
    if (!obj) return;
    select.selectOne(obj);
    if (obj.lockMovementX) {
      canvasEditor.unLock();
    } else {
      canvasEditor.lock();
    }
    canvasEditor.canvas.requestRenderAll();
    tree.refresh();
  };

  // 显示/隐藏
  const onToggleVisible = (e, row) => {
    const obj = tree.findObjById(row.id);
    if (!obj) return;
    obj.set('visible', obj.visible === false);
    const parent = tree.findParentGroup(obj);
    if (parent) parent.dirty = true;
    canvasEditor.canvas.requestRenderAll();
    tree.refresh();
  };

  return { onToggleLock, onToggleVisible };
}

export default {
  name: 'LayerTree',
  setup() {
    const { canvasEditor, fabric, mixinState } = useSelect();
    // 拖拽与点击共享：拖拽结束后抑制本次 click
    const dragShared = { clickSuppressed: false };
    // 重命名与树刷新共享：重命名中暂停树刷新
    const renameState = { editingId: ref('') };

    const tree = useLayerTree(canvasEditor, fabric, renameState);
    const select = useLayerSelect(canvasEditor, fabric, mixinState, tree, dragShared);
    const drag = useLayerDrag(canvasEditor, tree, dragShared);
    const rename = useLayerRename(canvasEditor, tree, renameState);
    const lock = useLayerLock(canvasEditor, tree, select);

    onMounted(() => {
      tree.refresh();
      canvasEditor.canvas.on('after:render', tree.refresh);
    });
    onBeforeUnmount(() => {
      document.removeEventListener('mousemove', drag.onPointerMove);
      document.removeEventListener('mouseup', drag.onPointerUp);
      canvasEditor.canvas.off('after:render', tree.refresh);
    });

    return {
      rows: tree.rows,
      dragState: drag.dragState,
      ghostRow: drag.ghostRow,
      ghostStyle: drag.ghostStyle,
      isDraggingSource: drag.isDraggingSource,
      isSelect: select.isSelect,
      iconType: tree.iconType,
      displayName: tree.displayName,
      onItemClick: select.onItemClick,
      toggleExpand: tree.toggleExpand,
      onPointerDown: drag.onPointerDown,
      onPointerMove: drag.onPointerMove,
      onPointerUp: drag.onPointerUp,
      setRenameInput: rename.setRenameInput,
      startRename: rename.startRename,
      confirmRename: rename.confirmRename,
      cancelRename: rename.cancelRename,
      editingId: rename.editingId,
      renameText: rename.renameText,
      onToggleLock: lock.onToggleLock,
      onToggleVisible: lock.onToggleVisible,
      onContextMenu: select.onContextMenu,
    };
  },
};
</script>

<style scoped lang="less">
.box {
  width: 100%;
}
.layer-box {
  height: calc(100vh - 170px);
  overflow-y: auto;
  margin-bottom: 5px;
  min-height: 60px;
}
// 拖拽中：整个列表区域统一 grabbing 光标，覆盖行的 pointer 悬停效果
.layer-box.is-dragging,
.layer-box.is-dragging * {
  cursor: grabbing !important;
}
.layer-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  margin: 4px 0;
  background: #f7f7f7;
  color: #555;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  user-select: none;
  border: 1px solid transparent;

  &:hover {
    background: #eef4ff;
  }
  &.active {
    color: #2d8cf0;
    background: #f0faff;
    border-color: #d0e5ff;
    .item-name {
      font-weight: bold;
    }
  }
  // 拖拽中的源行：内容隐藏、保留原位置作为占位，防止高度塌陷
  &.is-dragging {
    visibility: hidden;
    pointer-events: none;
  }
  // 组合子元素缩进辅助线
  &.is-child {
    &::before {
      content: '';
      position: absolute;
      left: 3px;
      top: 0;
      bottom: 0;
      width: 2px;
      background: #e8eaec;
      border-radius: 1px;
    }
  }
  .expand-btn {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;

    &::before {
      content: '';
      display: inline-block;
      width: 0;
      height: 0;
      border-top: 6px solid transparent;
      border-bottom: 6px solid transparent;
      border-left: 7px solid #999;
      transition: transform 0.15s;
    }
    &.expanded::before {
      transform: rotate(90deg);
    }
  }
  .expand-placeholder {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  .item-icon {
    width: 22px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    img {
      width: 22px;
      height: 22px;
      object-fit: contain;
      border-radius: 2px;
    }
    svg {
      width: 20px;
      height: 20px;
      display: block;
    }
  }

  .item-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rename-input {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    padding: 1px 4px;
    border: 1px solid #2d8cf0;
    border-radius: 3px;
    outline: none;
    line-height: 22px;
  }

  .item-actions {
    display: inline-flex;
    align-items: center;
    gap: 0;
    flex-shrink: 0;

    .action-btn {
      padding: 0 3px;
      height: auto;
      font-size: 18px;
      color: #808695;
      &:hover {
        color: #2d8cf0;
      }
      &.lock-active {
        color: #2d8cf0;
      }
      &.hide-active {
        opacity: 0.5;
      }
    }
  }
}
// 拖拽浮层：脱离文档流（fixed）跟随鼠标
.layer-item.layer-item-ghost {
  position: fixed;
  z-index: 9999;
  top: 0;
  left: 0;
  margin: 0;
  box-sizing: border-box;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
  opacity: 0.9;
  cursor: grabbing;
  pointer-events: none;
}
// 拖拽实时重排时的排序过渡动画
.layer-item-move {
  transition: transform 0.2s ease;
}
.empty-text {
  width: 100%;
  text-align: center;
  padding-top: 10px;
  color: #999;
}
</style>
