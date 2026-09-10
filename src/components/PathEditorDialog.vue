<!--
 * @Author: cyc
 * @Date: 2026-09-10 18:49:20
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-10 18:49:20
 * @Description: 路径编辑弹窗（基于 svg-path-editor-lib）
-->

<template>
  <Modal
    v-model="visible"
    :width="980"
    :styles="{ top: '30px' }"
    footer-hide
    :mask-closable="false"
  >
    <div class="spe-root" @keydown.stop>
      <div class="spe-toolbar">
        <Dropdown @on-click="onAddCommandClick">
          <Button type="primary" shape="circle" icon="md-add" />
          <DropdownMenu slot="list">
            <DropdownItem v-for="c in COMMANDS" :key="c.t" :name="c.t">{{ c.label }}</DropdownItem>
          </DropdownMenu>
        </Dropdown>
        <ButtonGroup size="small">
          <Button :disabled="historyIndex < 1" @click="undo">
            <Icon type="ios-undo" size="18" />
          </Button>
          <Button :disabled="historyIndex >= history.length - 1" @click="redo">
            <Icon type="ios-redo" size="18" />
          </Button>
        </ButtonGroup>
        <ButtonGroup size="small">
          <Button @click="zoomBy(0.8)">
            <BigIcon width="14" height="14" />
          </Button>
          <Button @click="zoomBy(1.25)">
            <SmallIcon width="14" height="14" />
          </Button>
          <Button icon="ios-expand" @click="zoomFit"></Button>
        </ButtonGroup>
      </div>

      <div ref="wrapEl" class="spe-canvas">
        <svg
          ref="svgEl"
          :viewBox="viewBoxStr"
          preserveAspectRatio="none"
          class="spe-svg"
          tabindex="0"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @wheel.prevent="onWheel"
          @keydown="onKeydown"
        >
          <rect
            :x="viewBox.x"
            :y="viewBox.y"
            :width="viewBox.w"
            :height="viewBox.h"
            fill="#ffffff"
            stroke="#e2e2e2"
            stroke-width="1"
          />
          <path
            :d="pathD"
            data-kind="segment"
            fill="none"
            stroke="#2f7de1"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <g v-for="(c, i) in controls" :key="'c' + i">
            <line
              :x1="c.from.x"
              :y1="c.from.y"
              :x2="c.x"
              :y2="c.y"
              stroke="#b0b0b0"
              stroke-width="1"
              stroke-dasharray="4,3"
            />
            <circle
              class="spe-control"
              :cx="c.x"
              :cy="c.y"
              r="5"
              fill="#ffffff"
              stroke="#8a8a8a"
              stroke-width="1.5"
              :data-kind="'control'"
              :data-index="i"
            />
          </g>
          <rect
            v-for="(a, i) in anchors"
            :key="'a' + i"
            class="spe-anchor"
            :x="a.x - 4"
            :y="a.y - 4"
            :width="8"
            :height="8"
            :fill="isAnchorSelected(a) ? '#ffb800' : '#ffffff'"
            :stroke="isAnchorSelected(a) ? '#e09000' : '#333333'"
            stroke-width="1.5"
            :data-kind="'anchor'"
            :data-index="i"
          />
        </svg>
        <div class="spe-tip">{{ tipText }}</div>
      </div>

      <div v-if="menu" class="spe-menu" :style="{ left: menu.x + 'px', top: menu.top + 'px' }">
        <div class="spe-menu-item spe-has-sub" :class="{ 'spe-has-sub--left': menu.flip }">
          插入
          <div class="spe-sub">
            <div
              v-for="c in COMMANDS"
              :key="c.t"
              class="spe-menu-item"
              @click="insertAfter(menu.item, c.t)"
            >
              {{ c.label }}
            </div>
          </div>
        </div>
        <div class="spe-menu-item spe-has-sub" :class="{ 'spe-has-sub--left': menu.flip }">
          转换为
          <div class="spe-sub">
            <div
              v-for="c in COMMANDS"
              :key="c.t"
              class="spe-menu-item"
              @click="convertTo(menu.item, c.t)"
            >
              {{ c.label }}
            </div>
          </div>
        </div>
        <div class="spe-menu-item" @click="toggleItemRelative(menu.item)">切换相对/绝对</div>
      </div>

      <div class="spe-output">
        <Input
          v-model="pathInput"
          size="small"
          placeholder="输入 SVG path 的 d（实时生效）"
          @on-focus="onInputFocus"
          @on-blur="onInputBlur"
          @on-enter="onInputBlur"
        />
        <Button size="small" @click="copyPath">复制</Button>
        <Button size="small" type="primary" @click="doApply">应用</Button>
      </div>
    </div>
  </Modal>
</template>

<script>
import { ref, computed, reactive, watch, onMounted, onBeforeUnmount } from '@vue/composition-api';
import { SvgPath, SvgItem } from 'svg-path-editor-lib';
import { nearestOnPath } from '@/utils/svgPathMath';
import BigIcon from '@/assets/icon/zoom/big.svg';
import SmallIcon from '@/assets/icon/zoom/small.svg';

const COMMANDS = [
  { t: 'M', label: 'M 移动到' },
  { t: 'L', label: 'L 直线至' },
  { t: 'V', label: 'V 垂直线至' },
  { t: 'H', label: 'H 水平线至' },
  { t: 'C', label: 'C 曲线至' },
  { t: 'S', label: 'S 速写曲线至' },
  { t: 'Q', label: 'Q 二次贝塞尔曲线至' },
  { t: 'T', label: 'T 速记二次贝塞尔曲线至' },
  { t: 'A', label: 'A 椭圆弧至' },
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

const DEBUG = false;
function dbg(...args) {
  if (DEBUG) {
    console.log('[PathEditor]', ...args);
  }
}

export default {
  name: 'PathEditorDialog',
  components: { BigIcon, SmallIcon },
  props: {
    value: { type: Boolean, default: false },
    initialPath: { type: String, default: '' },
  },
  setup(props, { emit }) {
    const visible = computed({
      get: () => props.value,
      set: (v) => {
        emit('input', v);
        emit('update:value', v);
      },
    });

    const svgEl = ref(null);
    const wrapEl = ref(null);
    const svgPath = ref(null);
    const pathD = ref('');
    const anchors = ref([]);
    const controls = ref([]);
    const viewBox = reactive({ x: 0, y: 0, w: 800, h: 500 });
    const selected = ref(null);
    const history = ref([]);
    const historyIndex = ref(-1);
    const pendingAdd = ref(null); // { type, after } 待放置的命令
    const menu = ref(null); // { x, top, item, flip } 线段/点右键菜单
    const pathInput = ref('');
    const inputFocused = ref(false);

    const viewBoxStr = computed(() => `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    const tipText = computed(() => {
      if (pendingAdd.value) {
        const label = COMMANDS.find((c) => c.t === pendingAdd.value.type);
        return `请点击画布放置「${label ? label.label : pendingAdd.value.type}」命令`;
      }
      return '拖拽控制点实时编辑；点击线段/路径点弹出菜单；空白拖拽平移，滚轮缩放';
    });

    let drag = null; // { ref, pan, moved, pressKind, clickPoint, latestPt, lastClientX, lastClientY, panAcc, lastStamp }
    let focusStartPath = '';
    let skipInputWatch = false;
    let rafId = null;

    function init() {
      const d = (props.initialPath || '').trim();
      let parsed = null;
      try {
        parsed = new SvgPath(d || 'M 30 60 L 100 30 L 150 90');
      } catch (e) {
        parsed = new SvgPath('M 30 60 L 100 30 L 150 90');
      }
      svgPath.value = parsed;
      selected.value = null;
      history.value = [];
      historyIndex.value = -1;
      pendingAdd.value = null;
      menu.value = null;
      inputFocused.value = false;
      drag = null;
      cancelRaf();
      refresh();
      requestAnimationFrame(() => zoomFit());
    }

    function refresh() {
      const sp = svgPath.value;
      if (!sp) return;
      anchors.value = sp.targetLocations().map((p) => ({ x: p.x, y: p.y, ref: p }));
      controls.value = sp.controlLocations().map((c) => ({
        x: c.x,
        y: c.y,
        ref: c,
        from: { x: c.itemReference.targetLocation().x, y: c.itemReference.targetLocation().y },
      }));
      try {
        pathD.value = sp.asString(4);
      } catch (e) {
        dbg('asString ERROR', e && e.message);
      }
      if (selected.value && !sp.path.includes(selected.value)) {
        selected.value = null;
      }
      if (!inputFocused.value) {
        skipInputWatch = true;
        pathInput.value = pathD.value;
        skipInputWatch = false;
      }
    }

    function isAnchorSelected(a) {
      return !!selected.value && !!a.ref && a.ref.itemReference === selected.value;
    }

    function commitSnapshot() {
      history.value = history.value.slice(0, historyIndex.value + 1);
      history.value.push(svgPath.value.asString(8));
      historyIndex.value = history.value.length - 1;
    }

    function restoreSnapshot(d) {
      try {
        svgPath.value = new SvgPath(d);
        selected.value = null;
        refresh();
      } catch (e) {
        /* ignore */
      }
    }

    function undo() {
      if (historyIndex.value > 0) {
        historyIndex.value--;
        restoreSnapshot(history.value[historyIndex.value]);
      }
    }

    function redo() {
      if (historyIndex.value < history.value.length - 1) {
        historyIndex.value++;
        restoreSnapshot(history.value[historyIndex.value]);
      }
    }

    function toPathPoint(e) {
      const rect = svgEl.value.getBoundingClientRect();
      return {
        x: viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.w,
        y: viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.h,
      };
    }

    function toPixel(p) {
      const rect = svgEl.value.getBoundingClientRect();
      return {
        x: ((p.x - viewBox.x) / viewBox.w) * rect.width,
        y: ((p.y - viewBox.y) / viewBox.h) * rect.height,
      };
    }

    function cancelRaf() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function scheduleRaf() {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!drag) return;
        if (drag.pan) {
          viewBox.x -= drag.panAcc.x;
          viewBox.y -= drag.panAcc.y;
          drag.panAcc.x = 0;
          drag.panAcc.y = 0;
        }
      });
    }

    function onPointerDown(e) {
      const t = e.target;
      const kind = t.getAttribute && t.getAttribute('data-kind');
      const pt = toPathPoint(e);
      if (kind === 'anchor' || kind === 'control') {
        const idx = Number(t.getAttribute('data-index'));
        const arr = kind === 'anchor' ? anchors.value : controls.value;
        const handle = arr[idx];
        dbg(
          'down',
          kind,
          idx,
          'client=',
          e.clientX,
          e.clientY,
          'pt=',
          pt.x.toFixed(1),
          pt.y.toFixed(1),
          'handle?',
          !!handle
        );
        if (!handle) return;
        e.preventDefault();
        if (svgEl.value.setPointerCapture && e.pointerId != null) {
          svgEl.value.setPointerCapture(e.pointerId);
        }
        commitSnapshot();
        if (handle.ref.itemReference) selected.value = handle.ref.itemReference;
        drag = {
          ref: handle.ref,
          index: idx,
          moved: false,
          pressKind: kind,
          clickPoint: pt,
          latestPt: pt,
          downClientX: e.clientX,
          downClientY: e.clientY,
          lastClientX: e.clientX,
          lastClientY: e.clientY,
          lastStamp: -1,
        };
        bindFallbackListeners();
        return;
      }
      if (svgEl.value.setPointerCapture && e.pointerId != null) {
        svgEl.value.setPointerCapture(e.pointerId);
      }
      drag = {
        pan: true,
        moved: false,
        pressKind: kind || 'empty',
        clickPoint: pt,
        latestPt: pt,
        panAcc: { x: 0, y: 0 },
        downClientX: e.clientX,
        downClientY: e.clientY,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        lastStamp: -1,
      };
      bindFallbackListeners();
    }

    function bindFallbackListeners() {
      window.addEventListener('pointermove', onFallbackMove);
      window.addEventListener('pointerup', onFallbackUp);
    }

    function unbindFallbackListeners() {
      window.removeEventListener('pointermove', onFallbackMove);
      window.removeEventListener('pointerup', onFallbackUp);
    }

    // svg 与 window 兜底都会触发；用事件 timeStamp 去重，避免平移被重复累加
    function handleDragMove(e) {
      if (!drag) return;
      if (e.timeStamp === drag.lastStamp) {
        dbg('move-dedup', e.timeStamp);
        return;
      }
      drag.lastStamp = e.timeStamp;
      const dxScreen = e.clientX - drag.lastClientX;
      const dyScreen = e.clientY - drag.lastClientY;
      drag.lastClientX = e.clientX;
      drag.lastClientY = e.clientY;
      // 距按下点的总距离（屏幕像素）判定拖拽意图，比相邻事件增量更稳
      const distDown = Math.hypot(e.clientX - drag.downClientX, e.clientY - drag.downClientY);
      if (distDown > 2) drag.moved = true;
      if (drag.ref) {
        // 控制点/锚点拖拽：仅真正拖拽过才跟随（避免点击微位移）
        const pt = toPathPoint(e);
        drag.latestPt = pt;
        dbg(
          'move-handle',
          'moved=',
          drag.moved,
          'distDown=',
          distDown.toFixed(1),
          'pt=',
          pt.x.toFixed(1),
          pt.y.toFixed(1)
        );
        if (drag.moved) {
          try {
            svgPath.value.setLocation(drag.ref, pt);
            refresh();
          } catch (err) {
            dbg('apply ERROR', err && err.message);
          }
          const movedAnchor = anchors.value[drag.index];
          dbg(
            'after-refresh anchor' + drag.index,
            movedAnchor ? movedAnchor.x.toFixed(1) + ',' + movedAnchor.y.toFixed(1) : 'GONE'
          );
        }
        return;
      }
      if (drag.pan) {
        const rect = svgEl.value.getBoundingClientRect();
        drag.panAcc.x += dxScreen * (viewBox.w / rect.width);
        drag.panAcc.y += dyScreen * (viewBox.h / rect.height);
        scheduleRaf();
      }
    }

    function onPointerMove(e) {
      handleDragMove(e);
    }

    function onFallbackMove(e) {
      handleDragMove(e);
    }

    function handleDragUp() {
      if (!drag) return;
      unbindFallbackListeners();
      cancelRaf();
      dbg('up', 'kind=', drag.pressKind, 'moved=', drag.moved, 'ref?', !!drag.ref);
      // 手柄：仅真正拖拽过才应用最终位置（避免点击微位移）
      if (drag.ref) {
        if (drag.moved) {
          try {
            svgPath.value.setLocation(drag.ref, drag.latestPt);
          } catch (err) {
            dbg('setLocation ERROR', err && err.message);
          }
          refresh();
        }
      } else if (drag.pan && (drag.panAcc.x || drag.panAcc.y)) {
        viewBox.x -= drag.panAcc.x;
        viewBox.y -= drag.panAcc.y;
        drag.panAcc.x = 0;
        drag.panAcc.y = 0;
      }
      if (!drag.moved) {
        const pt = drag.clickPoint;
        const kind = drag.pressKind;
        if (pendingAdd.value && kind !== 'control' && kind !== 'anchor') {
          placePending(pt);
        } else if (kind === 'segment') {
          openSegmentMenu(pt);
        } else if (kind === 'anchor' && drag.ref) {
          openItemMenu(drag.ref.itemReference, pt);
        } else {
          menu.value = null;
        }
      }
      drag = null;
    }

    function onPointerUp() {
      handleDragUp();
    }

    function onFallbackUp() {
      handleDragUp();
    }

    function placePending(pt) {
      const sp = svgPath.value;
      const type = pendingAdd.value.type.toUpperCase();
      commitSnapshot();
      if (sp.path.length === 0) {
        sp.insert(SvgItem.Make(['M', pt.x, pt.y]));
      } else {
        const after = pendingAdd.value.after || sp.path[sp.path.length - 1];
        const start = after.targetLocation();
        let item;
        if (type === 'V') {
          item = SvgItem.Make(['V', pt.y]);
        } else if (type === 'H') {
          item = SvgItem.Make(['H', pt.x]);
        } else if (type === 'A') {
          item = SvgItem.Make(['A', 20, 20, 0, 0, 0, pt.x, pt.y]);
        } else if (type === 'C') {
          item = SvgItem.Make([
            'C',
            lerp(start.x, pt.x, 1 / 3),
            lerp(start.y, pt.y, 1 / 3),
            lerp(start.x, pt.x, 2 / 3),
            lerp(start.y, pt.y, 2 / 3),
            pt.x,
            pt.y,
          ]);
        } else if (type === 'S') {
          item = SvgItem.Make([
            'S',
            lerp(start.x, pt.x, 1 / 3),
            lerp(start.y, pt.y, 1 / 3),
            pt.x,
            pt.y,
          ]);
        } else if (type === 'Q') {
          item = SvgItem.Make([
            'Q',
            lerp(start.x, pt.x, 0.5),
            lerp(start.y, pt.y, 0.5),
            pt.x,
            pt.y,
          ]);
        } else if (type === 'T') {
          item = SvgItem.Make(['T', pt.x, pt.y]);
        } else {
          item = SvgItem.Make([type, pt.x, pt.y]); // M/L
        }
        sp.insert(item, after);
      }
      refresh();
      pendingAdd.value = null;
    }

    function onAddCommandClick(name) {
      pendingAdd.value = { type: name, after: null };
      menu.value = null;
    }

    function openSegmentMenu(pt) {
      const hit = nearestOnPath(svgPath.value.path, pt, 32, { skipArc: false });
      if (!hit) return;
      const item = svgPath.value.path[hit.itemIndex];
      openItemMenu(item, pt);
    }

    function openItemMenu(item, pt) {
      if (!item) return;
      selected.value = item;
      const px = toPixel(pt);
      const rect = svgEl.value.getBoundingClientRect();
      menu.value = {
        x: px.x,
        top: px.y + (wrapEl.value ? wrapEl.value.offsetTop : 0),
        item,
        flip: px.x > rect.width / 2,
      };
    }

    function insertAfter(item, type) {
      pendingAdd.value = { type, after: item };
      menu.value = null;
    }

    function convertTo(item, type) {
      if (!item || item.getType(true).toUpperCase() === type) return;
      commitSnapshot();
      svgPath.value.changeType(item, type);
      refresh();
      menu.value = null;
    }

    function toggleItemRelative(item) {
      commitSnapshot();
      item.setRelative(!item.relative);
      svgPath.value.refreshAbsolutePositions();
      refresh();
      menu.value = null;
    }

    function zoomBy(factor) {
      const cx = viewBox.x + viewBox.w / 2;
      const cy = viewBox.y + viewBox.h / 2;
      viewBox.w *= factor;
      viewBox.h *= factor;
      viewBox.x = cx - viewBox.w / 2;
      viewBox.y = cy - viewBox.h / 2;
    }

    function onWheel(e) {
      const pt = toPathPoint(e);
      const factor = e.deltaY < 0 ? 0.85 : 1.18;
      const w2 = viewBox.w * factor;
      const h2 = viewBox.h * factor;
      viewBox.x = pt.x - ((pt.x - viewBox.x) / viewBox.w) * w2;
      viewBox.y = pt.y - ((pt.y - viewBox.y) / viewBox.h) * h2;
      viewBox.w = w2;
      viewBox.h = h2;
    }

    function zoomFit() {
      const sp = svgPath.value;
      if (!sp) return;
      const pts = [...sp.targetLocations(), ...sp.controlLocations()];
      if (!pts.length) {
        viewBox.x = 0;
        viewBox.y = 0;
        viewBox.w = 800;
        viewBox.h = 500;
        return;
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      pts.forEach((p) => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
      const pad = 40;
      minX -= pad;
      minY -= pad;
      maxX += pad;
      maxY += pad;
      const bw = maxX - minX;
      const bh = maxY - minY;
      const rect = wrapEl.value
        ? wrapEl.value.getBoundingClientRect()
        : { width: 800, height: 500 };
      const aspect = rect.width / rect.height;
      let w = Math.max(bw, 20);
      let h = Math.max(bh, 20);
      if (w / h > aspect) h = w / aspect;
      else w = h * aspect;
      viewBox.x = minX + (bw - w) / 2;
      viewBox.y = minY + (bh - h) / 2;
      viewBox.w = w;
      viewBox.h = h;
    }

    function onInputFocus() {
      inputFocused.value = true;
      focusStartPath = pathD.value;
    }

    function onInputBlur() {
      inputFocused.value = false;
      if (pathD.value !== focusStartPath) {
        commitSnapshot();
      }
      refresh();
    }

    function liveApplyPathText(d) {
      const v = (d || '').trim();
      try {
        svgPath.value = new SvgPath(v);
        selected.value = null;
        refresh();
      } catch (e) {
        /* ignore */
      }
    }

    watch(pathInput, (v) => {
      if (skipInputWatch) return;
      const d = (v || '').trim();
      // 与当前 pathD 一致 = refresh 同步显示，跳过重建（否则拖拽捕获的 ref 指向旧实例会失效）
      if (d === pathD.value) return;
      liveApplyPathText(d);
    });

    function copyPath() {
      const text = pathD.value;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
        } catch (err) {
          /* ignore */
        }
        document.body.removeChild(ta);
      }
    }

    function doApply() {
      emit('apply', pathD.value);
    }

    function onKeydown(e) {
      e.stopPropagation();
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selected.value) {
          commitSnapshot();
          svgPath.value.delete(selected.value);
          selected.value = null;
          refresh();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === 'Escape') {
        menu.value = null;
        pendingAdd.value = null;
        selected.value = null;
      }
    }

    function onResize() {
      if (props.value) zoomFit();
    }

    watch(
      () => props.value,
      (v) => {
        if (v) init();
      }
    );
    onMounted(() => window.addEventListener('resize', onResize));
    onBeforeUnmount(() => window.removeEventListener('resize', onResize));

    return {
      visible,
      COMMANDS,
      svgEl,
      wrapEl,
      pathD,
      anchors,
      controls,
      viewBox,
      viewBoxStr,
      selected,
      history,
      historyIndex,
      pendingAdd,
      menu,
      pathInput,
      tipText,
      onAddCommandClick,
      undo,
      redo,
      zoomBy,
      onWheel,
      zoomFit,
      copyPath,
      doApply,
      onInputFocus,
      onInputBlur,
      onKeydown,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      isAnchorSelected,
      insertAfter,
      convertTo,
      toggleItemRelative,
    };
  },
};
</script>

<style scoped lang="less">
.spe-root {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.spe-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px; // 添加 / 撤销重做 / 缩放组 之间留间距
  padding-right: 28px; // 避开右上角关闭按钮
}
.spe-canvas {
  position: relative;
  height: 520px;
  border: 1px solid #e2e2e2;
  border-radius: 4px;
  overflow: hidden;
}
.spe-svg {
  width: 100%;
  height: 100%;
  display: block;
  cursor: crosshair;
  touch-action: none;
  outline: none;
  .spe-anchor,
  .spe-control {
    cursor: pointer;
  }
}
.spe-tip {
  position: absolute;
  left: 8px;
  bottom: 6px;
  font-size: 12px;
  color: #999;
  pointer-events: none;
}
.spe-output {
  display: flex;
  align-items: center;
  gap: 8px;
  :deep(.ivu-input-wrapper) {
    flex: 1;
  }
}
.spe-menu {
  position: absolute;
  z-index: 20;
  min-width: 120px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  padding: 4px 0;
  user-select: none;
}
.spe-menu-item {
  position: relative;
  padding: 5px 14px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
  white-space: nowrap;
  &:hover {
    background: #f0f7ff;
    color: #2d8cf0;
  }
}
.spe-has-sub {
  padding-right: 24px;
  &::after {
    content: '▸';
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 10px;
    color: #999;
  }
  .spe-sub {
    display: none;
    position: absolute;
    left: 100%;
    top: -4px;
    min-width: 140px;
    background: #f7f7f7; // 比一级菜单略深
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    padding: 4px 0;
    .spe-menu-item {
      color: #333; // 与一级菜单同色
    }
  }
  &:hover > .spe-sub {
    display: block;
  }
  &.spe-has-sub--left > .spe-sub {
    left: auto;
    right: 100%;
  }
}
</style>
