const mixinState = { mSelectMode: '', mSelectId: '', mSelectIds: [], mSelectActive: [] };
class MockGuideLine {}
class MockActiveSelection {
  constructor(objects, opts) {
    // 与 fabric 5 一致：type 为驼峰 activeSelection
    this.type = 'activeSelection';
    this._objects = objects;
    this.canvas = opts && opts.canvas;
  }
  getObjects() {
    return this._objects;
  }
  contains(o) {
    return this._objects.includes(o);
  }
  size() {
    return this._objects.length;
  }
  item(i) {
    return this._objects[i];
  }
  addWithUpdate(o) {
    this._objects.push(o);
    return this;
  }
  removeWithUpdate(o) {
    const i = this._objects.indexOf(o);
    if (i > -1) this._objects.splice(i, 1);
    return this;
  }
}
const fabricMock = {
  GuideLine: MockGuideLine,
  ActiveSelection: MockActiveSelection,
};

class MockObj {
  constructor({ id, type, name, text, selectable, visible, children }) {
    this.id = id;
    this.type = type;
    this.name = name;
    this.text = text;
    this.selectable = selectable !== false;
    this.visible = visible !== false;
    // 与 fabric 语义一致：内部真实数组是 _objects
    this._objects = children || [];
    this.lockMovementX = false;
    this.dirty = false;
  }
  getObjects() {
    // 与 fabric 语义一致：Group.getObjects() 返回拷贝（concat），改它不影响内部顺序
    return this._objects.concat();
  }
  getSrc() {
    return 'data:image/png;base64,AAAA';
  }
  set(k, v) {
    this[k] = v;
  }
  sendToBack() {
    // 与 fabric 语义一致：移到画布最底层（index 0）
    const objs = canvasMock._objects;
    const idx = objs.indexOf(this);
    if (idx > 0) {
      objs.splice(idx, 1);
      objs.unshift(this);
    }
    canvasMock.renderAll();
  }
}

const workspace = new MockObj({ id: 'workspace', type: 'rect' });
const rect = new MockObj({ id: 'rect1', type: 'rect', name: '矩形' });
const childA = new MockObj({ id: 'childA', type: 'i-text', text: '文字A' });
const childB = new MockObj({ id: 'childB', type: 'image', name: '图片B' });
const group = new MockObj({ id: 'group1', type: 'group', name: '组合', children: [childA, childB] });
const img = new MockObj({ id: 'img1', type: 'image', name: '大图' });

let activeObject = null;
const listeners = {};
const canvasMock = {
  _objects: [workspace, rect, group, img],
  getObjects() {
    return this._objects;
  },
  getActiveObject() {
    return activeObject;
  },
  getActiveObjects() {
    return activeObject
      ? activeObject.type === 'activeSelection'
        ? activeObject.getObjects()
        : [activeObject]
      : [];
  },
  setActiveObject(o) {
    activeObject = o;
    this.fire('selection:created');
  },
  discardActiveObject() {
    activeObject = null;
    this.fire('selection:cleared');
  },
  requestRenderAll() {
    this.fire('after:render');
  },
  renderAll() {
    this.fire('after:render');
  },
  moveTo(object, index) {
    const objs = this._objects;
    const currentIndex = objs.indexOf(object);
    objs.splice(currentIndex, 1);
    if (currentIndex < index) index--;
    objs.splice(index, 0, object);
    this.renderAll();
  },
  on(evt, fn) {
    listeners[evt] = fn;
  },
  off() {},
  fire(evt) {
    listeners[evt] && listeners[evt]();
  },
};

const editorMock = {
  canvas: canvasMock,
  pluginMap: {},
  contextMenu: {
    hideAll() {},
    setData(d) {
      this.data = d;
    },
    show(x, y) {
      this.shown = { x, y };
    },
  },
  lock() {
    const o = canvasMock.getActiveObject();
    if (o) o.lockMovementX = true;
  },
  unLock() {
    const o = canvasMock.getActiveObject();
    if (o) o.lockMovementX = false;
  },
  on() {},
  off() {},
};

const useSelect = () => ({ canvasEditor: editorMock, fabric: fabricMock, mixinState });

module.exports = {
  canvasMock,
  editorMock,
  fabricMock,
  mixinState,
  useSelect,
  MockObj,
  workspace,
  rect,
  group,
  img,
  childA,
  childB,
};
