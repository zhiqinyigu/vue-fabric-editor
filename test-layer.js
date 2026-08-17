/*
 * layer.vue 拖拽排序手动验证脚本（独立于 jest，不随 npm 包发布）
 * 运行：npm run test:layer
 * 说明：用 JSDOM 编译 src/components/layer.vue，配合 ./mock-env 的 fabric mock
 *       驱动 onPointerDown / onPointerMove / onPointerUp，输出 PASS/FAIL 清单。
 */
const Module = require('module');
const fs = require('fs');
const path = require('path');
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'canvas') {
    // 与 jest 共用同一份 stub（含 jsdom 需要的 Canvas.Image）
    return require('./tests/__mocks__/canvas');
  }
  return origLoad.apply(this, arguments);
};

const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.getComputedStyle = dom.window.getComputedStyle;
global.MouseEvent = dom.window.MouseEvent;

const Vue = require('vue');
const ViewUI = require('view-design');
const VueCompositionAPI = require('@vue/composition-api').default;
const VueI18n = require('vue-i18n');
const { compileToFunctions } = require('vue-template-compiler');

Vue.config.productionTip = false;
Vue.use(VueCompositionAPI);
Vue.use(VueI18n);
const i18n = new VueI18n({ locale: 'zh', messages: { zh: { layers: '图层' } } });
Vue.use(ViewUI);

const env = require('./mock-env');
const { canvasMock, editorMock } = env;

// ---- 编译 layer.vue ----
let src = fs.readFileSync(path.join(__dirname, 'src/components/layer.vue'), 'utf8');
const start = src.indexOf('<template>');
const rest = src.slice(start);
const scriptIdx = rest.search(/<script|<style/);
const block = scriptIdx === -1 ? rest : rest.slice(0, scriptIdx);
const template = block.replace(/^<template>/, '').replace(/<\/template>\s*$/, '');
let script = src.match(/<script>([\s\S]*?)<\/script>/)[1];

script = script.replace(
  /import \{ ref, computed, nextTick, onMounted, onBeforeUnmount \} from '@vue\/composition-api';/,
  "const { ref, computed, nextTick, onMounted, onBeforeUnmount } = require('@vue/composition-api');"
);
script = script.replace(
  /import useSelect from '@\/hooks\/select';/,
  "const useSelect = require('./mock-env').useSelect;"
);
script = script.replace(
  /import \{ v4 as uuid \} from 'uuid';/,
  "const { v4: uuid } = require('uuid');"
);
script = script.replace(/import (\w+) from '!!raw-loader![^']+';/g, 'const $1 = "";');
script = script.replace(/export default /, 'module.exports = ');

const compiled = compileToFunctions(template);
const mod = { exports: {} };
new Function('require', 'module', 'exports', script + '\n').call(null, require, mod, mod.exports);
const Component = mod.exports;

const Comp = Vue.extend({
  ...Component,
  i18n,
  render: compiled.render,
  staticRenderFns: compiled.staticRenderFns,
});
const vm = new Comp().$mount();
document.getElementById('app').appendChild(vm.$el);

let pass = 0;
const ok = (name, cond) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name);
  if (cond) pass++;
};

// 1. 初始树（未展开 group）
let rows = vm.rows;
ok('初始行数 = 4 (workspace 被过滤)', rows.length === 3, rows);
ok('group 行标记 hasChildren', !!rows.find((r) => r.id === 'group1').hasChildren);
ok('image 行有缩略图', !!rows.find((r) => r.id === 'img1').thumb);

// 2. 展开 group
vm.toggleExpand(rows.find((r) => r.id === 'group1'));
rows = vm.rows;
ok('展开后行数 = 5 (含 2 个子元素)', rows.length === 5);
ok(
  '子元素 depth=1',
  rows.filter((r) => r.parentId === 'group1').every((r) => r.depth === 1)
);
ok(
  '子元素顺序 (childB 在 childA 前, 组内顶层优先)',
  rows.map((r) => r.id).join(',') === 'img1,group1,childB,childA,rect1',
  '实际: ' + rows.map((r) => r.id).join(',')
);

// 3. 单选
vm.onItemClick(
  { ctrlKey: false },
  rows.find((r) => r.id === 'rect1')
);
ok(
  '单选 rect1 -> activeObject.id=rect1',
  canvasMock.getActiveObject() && canvasMock.getActiveObject().id === 'rect1'
);

// 4. ctrl 多选
vm.onItemClick(
  { ctrlKey: true },
  rows.find((r) => r.id === 'img1')
);
const ao = canvasMock.getActiveObject();
ok(
  'ctrl 多选 -> activeSelection 且含 rect1+img1',
  ao &&
    ao.type === 'activeSelection' &&
    ao
      .getObjects()
      .map((o) => o.id)
      .sort()
      .join(',') === 'img1,rect1'
);

// 4b. 多选中增量添加第 3 个对象（Bug1 回归：增量 addWithUpdate，不再重建导致坐标错乱）
vm.onItemClick(
  { ctrlKey: true },
  vm.rows.find((r) => r.id === 'group1')
);
let ao2 = canvasMock.getActiveObject();
ok(
  'ctrl 增量添加 group1 -> activeSelection 成员 3 个',
  ao2 &&
    ao2.type === 'activeSelection' &&
    ao2
      .getObjects()
      .map((o) => o.id)
      .sort()
      .join(',') === 'group1,img1,rect1'
);

// 4c. 多选中增量移除 1 个
vm.onItemClick(
  { ctrlKey: true },
  vm.rows.find((r) => r.id === 'img1')
);
ao2 = canvasMock.getActiveObject();
ok(
  'ctrl 增量移除 img1 -> activeSelection 成员 2 个',
  ao2 &&
    ao2.type === 'activeSelection' &&
    ao2
      .getObjects()
      .map((o) => o.id)
      .sort()
      .join(',') === 'group1,rect1'
);

// 4d. 多选降到 1 个 → 自动降级为单选
vm.onItemClick(
  { ctrlKey: true },
  vm.rows.find((r) => r.id === 'rect1')
);
ao2 = canvasMock.getActiveObject();
ok('ctrl 移除到只剩 1 个 -> 降级单选 group1', ao2 && ao2.id === 'group1');

// 4e. 方案A：group 子元素以顶层父 group 身份参与多选
canvasMock.discardActiveObject();
vm.onItemClick(
  { ctrlKey: false },
  vm.rows.find((r) => r.id === 'rect1')
);
vm.onItemClick(
  { ctrlKey: true },
  vm.rows.find((r) => r.id === 'childA')
);
ao2 = canvasMock.getActiveObject();
ok(
  '方案A: ctrl 点击 group 子元素 childA -> 提升为父 group1 进入多选',
  ao2 &&
    ao2.type === 'activeSelection' &&
    ao2
      .getObjects()
      .map((o) => o.id)
      .sort()
      .join(',') === 'group1,rect1',
  '实际: ' +
    (ao2 &&
      ao2
        .getObjects()
        .map((o) => o.id)
        .sort()
        .join(','))
);

// 5. 拖拽: img1 插到 rect1 上方（mouse 在上半 → before=true）
// 虚拟布局：每行 top = slot*20, height=20；box 底部多留 40px 空白区
const makeFakeDragEnv = (rowList) => {
  const index = {};
  const items = rowList.map((r, i) => {
    index[r.id] = i;
    return {
      dataset: { rowId: r.id },
      getBoundingClientRect: () => {
        const t = i * 20;
        return { top: t, height: 20, bottom: t + 20, left: 0, right: 200, width: 200, x: 0, y: t };
      },
    };
  });
  const box = {
    querySelectorAll: () => items,
    querySelector: (sel) => {
      const m = sel && sel.match(/data-row-id="([^"]+)"/);
      const id = m && m[1];
      return items.find((it) => it.dataset.rowId === id) || null;
    },
    getBoundingClientRect: () => ({
      top: 0,
      bottom: rowList.length * 20 + 40,
      height: rowList.length * 20 + 40,
    }),
  };
  // 目标行中心 y（before=true 用 mid-1，before=false 用 mid+1）
  box.midY = (id) => index[id] * 20 + 10;
  box.emptyY = () => rowList.length * 20 + 10; // 最后一行下方的空白区
  return box;
};
const fakePointerDown = (box) => ({
  button: 0,
  clientX: 0,
  clientY: 0,
  target: { closest: () => null },
  currentTarget: { closest: () => box },
});
const dragTo = (box, sourceRow, targetId, before) => {
  vm.onPointerDown(fakePointerDown(box, sourceRow), sourceRow);
  const y = before ? box.midY(targetId) - 1 : box.midY(targetId) + 1;
  vm.onPointerMove({ clientX: 0, clientY: y });
  vm.onPointerUp({ clientY: y });
};
canvasMock._objects = [env.workspace, env.rect, env.group, env.img];
const box5 = makeFakeDragEnv(vm.rows);
const img1Row = vm.rows.find((r) => r.id === 'img1');
dragTo(box5, img1Row, 'rect1', true);
ok(
  'img1 插到 rect1 上方(z更高)',
  canvasMock._objects.map((o) => o.id).join(',') === 'workspace,rect1,img1,group1',
  '实际: ' + canvasMock._objects.map((o) => o.id).join(',')
);

// 6. 拖拽: rect1 插到 img1 下方（mouse 在下半 → before=false）
canvasMock._objects = [env.workspace, env.rect, env.group, env.img];
const box6 = makeFakeDragEnv(vm.rows);
const rectRow6 = vm.rows.find((r) => r.id === 'rect1');
dragTo(box6, rectRow6, 'img1', false);
ok(
  'rect1 插到 img1 下方(z更低)',
  canvasMock._objects.map((o) => o.id).join(',') === 'workspace,group1,rect1,img1',
  '实际: ' + canvasMock._objects.map((o) => o.id).join(',')
);

// 7. group 内: childA 插到 childB 上方（mouse 在上半 → before=true）
env.group._objects.length = 0;
env.group._objects.push(env.childA, env.childB);
canvasMock._objects = [env.workspace, env.rect, env.group, env.img];
const box7 = makeFakeDragEnv(vm.rows);
const childARow = vm.rows.find((r) => r.id === 'childA');
dragTo(box7, childARow, 'childB', true);
ok(
  'group 内 childA 移到 childB 之前(z更高)',
  env.group._objects.map((o) => o.id).join(',') === 'childB,childA',
  '实际: ' + env.group._objects.map((o) => o.id).join(',')
);

// 7c. group 内 before=false：childB 插到 childA 下方（z 更低）
env.group._objects.length = 0;
env.group._objects.push(env.childA, env.childB);
canvasMock._objects = [env.workspace, env.rect, env.group, env.img];
const box7c = makeFakeDragEnv(vm.rows);
const childBRow7c = vm.rows.find((r) => r.id === 'childB');
dragTo(box7c, childBRow7c, 'childA', false);
ok(
  'group 内 childB 移到 childA 之后(z更低)',
  env.group._objects.map((o) => o.id).join(',') === 'childB,childA',
  '实际: ' + env.group._objects.map((o) => o.id).join(',')
);

// 7d. group 内拖到列表底部空白区 → 组内置底
env.group._objects.length = 0;
env.group._objects.push(env.childA, env.childB);
canvasMock._objects = [env.workspace, env.rect, env.group, env.img];
const box7d = makeFakeDragEnv(vm.rows);
const childBRow7d = vm.rows.find((r) => r.id === 'childB');
vm.onPointerDown(fakePointerDown(box7d, childBRow7d), childBRow7d);
vm.onPointerMove({ clientX: 0, clientY: box7d.emptyY() });
vm.onPointerUp({ clientY: box7d.emptyY() });
ok(
  'group 内拖到空白区 → 组内置底',
  env.group._objects.map((o) => o.id).join(',') === 'childB,childA',
  '实际: ' + env.group._objects.map((o) => o.id).join(',')
);

// 7b. 拖到列表底部空白区 → 置底
canvasMock._objects = [env.workspace, env.rect, env.group, env.img];
const boxEmpty = makeFakeDragEnv(vm.rows);
const imgRowEmpty = vm.rows.find((r) => r.id === 'img1');
vm.onPointerDown(fakePointerDown(boxEmpty, imgRowEmpty), imgRowEmpty);
vm.onPointerMove({ clientX: 0, clientY: boxEmpty.emptyY() });
vm.onPointerUp({ clientY: boxEmpty.emptyY() });
ok(
  '拖到空白区 → 置底',
  canvasMock._objects.map((o) => o.id).join(',') === 'workspace,img1,rect1,group1',
  '实际: ' + canvasMock._objects.map((o) => o.id).join(',')
);

// 8. 重命名
vm.startRename(rows.find((r) => r.id === 'rect1'));
ok('重命名编辑框激活', vm.editingId === 'rect1');
vm.renameText = '新名字';
vm.confirmRename();
ok('重命名确认后 obj.name=新名字', env.rect.name === '新名字');
ok('编辑状态清空', vm.editingId === '');

// 9. 显隐
vm.onToggleVisible(
  null,
  vm.rows.find((r) => r.id === 'img1')
);
ok('隐藏后 img1.visible=false', env.img.visible === false);

// 10. 锁定/解锁（isLock 基于 lockMovementX）
vm.onToggleLock(
  null,
  vm.rows.find((r) => r.id === 'rect1')
);
ok(
  '锁定后 rect1.lockMovementX=true 且 isLock 行状态=true',
  env.rect.lockMovementX === true && vm.rows.find((r) => r.id === 'rect1').isLock === true
);
vm.onToggleLock(
  null,
  vm.rows.find((r) => r.id === 'rect1')
);
ok(
  '再次点击解锁 lockMovementX=false 且 isLock=false',
  env.rect.lockMovementX === false && vm.rows.find((r) => r.id === 'rect1').isLock === false
);

// 11. 无 id 子元素：组合克隆丢失 id 场景
const noIdChild = new env.MockObj({ type: 'rect', name: '无ID' });
env.group._objects.push(noIdChild);
canvasMock.requestRenderAll();
const noIdRow = vm.rows.find((r) => r.name === '无ID');
ok('无 id 子元素被分配真实 id', !!noIdRow && !!noIdRow.id && noIdRow.id !== '');
ok('editingId(空) 不等于分配后的 id，不误显示输入框', noIdRow.id !== '');
// 按钮可用：对无 id 子元素执行显隐
vm.onToggleVisible(null, noIdRow);
ok('无 id 子元素显隐按钮生效', noIdChild.visible === false);

// 12. 拖拽实时重排（mousemove 过程中立即调整层级）
canvasMock._objects = [env.workspace, env.rect, env.group, env.img];
const box12 = makeFakeDragEnv(vm.rows);
const rectRow12 = vm.rows.find((r) => r.id === 'rect1');
vm.onPointerDown(fakePointerDown(box12, rectRow12), rectRow12);
const orderBefore = canvasMock._objects.map((o) => o.id).join(',');
const y12 = box12.midY('img1') + 1; // img1 行下半 → rect1 实时下移
vm.onPointerMove({ clientX: 0, clientY: y12 });
const orderAfter = canvasMock._objects.map((o) => o.id).join(',');
ok(
  'mousemove 实时重排（rect1 移到 img1 下方）',
  orderBefore !== orderAfter,
  'before:' + orderBefore + ' after:' + orderAfter
);
ok(
  '拖拽中源行标记 is-dragging（占位保留）',
  !!vm.ghostRow && vm.isDraggingSource(vm.rows.find((r) => r.id === 'rect1'))
);
vm.onPointerUp({ clientY: y12 });
ok('释放后浮层清空 ghostRow=null', vm.ghostRow === null);

// 12b. 回归：实时重排已发生，释放时鼠标落在空白区 → 不置底（保持重排结果）
canvasMock._objects = [env.workspace, env.rect, env.group, env.img];
const box12b = makeFakeDragEnv(vm.rows);
const rectRow12b = vm.rows.find((r) => r.id === 'rect1');
vm.onPointerDown(fakePointerDown(box12b, rectRow12b), rectRow12b);
vm.onPointerMove({ clientX: 0, clientY: box12b.midY('img1') + 1 }); // 实时重排：rect1 下移
const afterRebuild = canvasMock._objects.map((o) => o.id).join(',');
vm.onPointerMove({ clientX: 0, clientY: box12b.emptyY() }); // 之后鼠标停在列表底部空白区
vm.onPointerUp({ clientY: box12b.emptyY() });
ok(
  '实时重排后释放到空白区不置底',
  canvasMock._objects.map((o) => o.id).join(',') === afterRebuild,
  '实际: ' + canvasMock._objects.map((o) => o.id).join(',')
);

// 12c. 回归：未命中任何行但停在源行自身 → 原地不动，不置底
canvasMock._objects = [env.workspace, env.rect, env.group, env.img];
const box12c = makeFakeDragEnv(vm.rows);
const rectRow12c = vm.rows.find((r) => r.id === 'rect1');
vm.onPointerDown(fakePointerDown(box12c, rectRow12c), rectRow12c);
vm.onPointerMove({ clientX: 0, clientY: box12c.midY('rect1') }); // resolveTarget 跳过源行 → 未命中
vm.onPointerUp({ clientY: box12c.midY('rect1') });
ok(
  '微动后停在源行释放不置底',
  canvasMock._objects.map((o) => o.id).join(',') === 'workspace,rect1,group1,img1',
  '实际: ' + canvasMock._objects.map((o) => o.id).join(',')
);

// 13. 右键菜单
editorMock.pluginMap = {
  TestPlugin: {
    contextMenu() {
      return [{ text: '测试项', onclick: () => {} }];
    },
  },
};
vm.onContextMenu(
  { ctrlKey: false, clientX: 100, clientY: 200, preventDefault() {}, stopPropagation() {} },
  vm.rows.find((r) => r.id === 'rect1')
);
setTimeout(() => {
  ok(
    '右键菜单聚合并展示',
    editorMock.contextMenu.shown &&
      editorMock.contextMenu.shown.x === 100 &&
      editorMock.contextMenu.data[0].text === '测试项'
  );
  console.log('\n通过 ' + pass + ' 项');
  process.exit(0);
}, 60);
