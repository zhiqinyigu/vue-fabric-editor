/*
 * @Author: 秦少卫
 * @Date: 2023-06-22 16:11:40
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-07-25 16:49:18
 * @Description: 组内文字编辑
 */
import { fabric } from 'fabric';
import { isGroup } from '../utils/utils';
import { v4 as uuid } from 'uuid';
import { pick } from 'lodash-es';
class GroupTextEditorPlugin {
  constructor(canvas, editor) {
    this.canvas = canvas;
    this.editor = editor;
    this.isDown = false;
    this._init();
  }
  // 组内文本输入
  _init() {
    this.canvas.on('mouse:down', (opt) => {
      this.isDown = true;
      // 重置选中controls
      if (
        opt.target &&
        !opt.target.lockMovementX &&
        !opt.target.lockMovementY &&
        !opt.target.lockRotation &&
        !opt.target.lockScalingX &&
        !opt.target.lockScalingY
      ) {
        opt.target.hasControls = true;
      }
    });
    this.canvas.on('mouse:up', () => {
      this.isDown = false;
    });
    this.canvas.on('mouse:dblclick', (opt) => {
      if (isGroup(opt.target)) {
        const selectedObject = this._getGroupObj(opt);
        if (!selectedObject) return;
        selectedObject.selectable = true;
        // 由于组内的元素，双击以后会导致controls偏移，因此隐藏他
        if (selectedObject.hasControls) {
          selectedObject.hasControls = false;
        }
        if (this.isText(selectedObject)) {
          this._bedingTextEditingEvent(selectedObject, opt.target);
          return;
        }
        this.canvas.setActiveObject(selectedObject);
        this.canvas.renderAll();
      }
    });
  }
  // 获取点击区域内的组内文字元素
  _getGroupTextObj(opt) {
    const pointer = this.canvas.getPointer(opt.e, true);
    if (!isGroup(opt.target)) return false;
    const clickObj = this.canvas._searchPossibleTargets(opt.target._objects, pointer);
    if (clickObj && this.isText(clickObj)) {
      return clickObj;
    }
    return false;
  }
  _getGroupObj(opt) {
    const pointer = this.canvas.getPointer(opt.e, true);
    if (!isGroup(opt.target)) return false;
    const clickObj = this.canvas._searchPossibleTargets(opt.target._objects, pointer);
    return clickObj;
  }
  // 通过组合重新组装来编辑文字，可能会耗性能。
  _bedingTextEditingEvent(textObject, groupObj) {
    var _a, _b, _c, _d, _e;
    const textObjectJSON = textObject.toObject();
    const groupMatrix = groupObj.calcTransformMatrix();
    const a = groupMatrix[0];
    const b = groupMatrix[1];
    const c = groupMatrix[2];
    const d = groupMatrix[3];
    const e = groupMatrix[4];
    const f = groupMatrix[5];
    const newX =
      a * ((_a = textObject.left) !== null && _a !== void 0 ? _a : 0) +
      c * ((_b = textObject.top) !== null && _b !== void 0 ? _b : 0) +
      e;
    const newY =
      b * ((_c = textObject.left) !== null && _c !== void 0 ? _c : 0) +
      d * ((_d = textObject.top) !== null && _d !== void 0 ? _d : 0) +
      f;
    const tempText = new textObject.constructor(
      (_e = textObject.text) !== null && _e !== void 0 ? _e : '',
      {
        ...textObjectJSON,
        scaleX: textObjectJSON.scaleX * a,
        scaleY: textObjectJSON.scaleY * a,
        textAlign: textObject.textAlign,
        left: newX,
        top: newY,
        styles: textObject.styles,
        groupCopyed: textObject.group,
      }
    );
    tempText.id = uuid();
    textObject.visible = false;
    groupObj.addWithUpdate();
    tempText.visible = true;
    tempText.selectable = true;
    tempText.hasControls = false;
    tempText.editable = true;
    this.canvas.add(tempText);
    this.canvas.setActiveObject(tempText);
    tempText.enterEditing();
    tempText.selectAll();
    tempText.on('editing:exited', () => {
      const attrs = tempText.toObject();
      // 进入编辑模式时触发
      textObject.set({
        ...pick(attrs, [
          'fill',
          'fontSize',
          'fontStyle',
          'fontFamily',
          'lineHeight',
          'backgroundColor',
        ]),
        text: tempText.text,
        visible: true,
      });
      groupObj.addWithUpdate();
      tempText.visible = false;
      this.canvas.remove(tempText);
      this.canvas.setActiveObject(groupObj);
    });
  }
  // 绑定编辑取消事件
  _bedingEditingEvent(textObject, opt) {
    if (!opt.target) return;
    const left = opt.target.left;
    const top = opt.target.top;
    const ids = this._unGroup() || [];
    const resetGroup = () => {
      const groupArr = this.canvas.getObjects().filter((item) => item.id && ids.includes(item.id));
      // 删除元素
      groupArr.forEach((item) => this.canvas.remove(item));
      // 生成新组
      const group = new fabric.Group([...groupArr]);
      group.set('left', left);
      group.set('top', top);
      group.set('id', uuid());
      textObject.off('editing:exited', resetGroup);
      this.canvas.add(group);
      this.canvas.discardActiveObject().renderAll();
    };
    // 绑定取消事件
    textObject.on('editing:exited', resetGroup);
  }
  // 拆分组合并返回ID
  _unGroup() {
    const ids = [];
    const activeObj = this.canvas.getActiveObject();
    if (!activeObj) return;
    activeObj.getObjects().forEach((item) => {
      const id = uuid();
      ids.push(id);
      item.set('id', id);
    });
    activeObj.toActiveSelection();
    return ids;
  }
  isText(obj) {
    return obj.type && ['i-text', 'text', 'textbox'].includes(obj.type);
  }
  destroy() {
    console.log('pluginDestroy');
  }
}
GroupTextEditorPlugin.pluginName = 'GroupTextEditorPlugin';
export default GroupTextEditorPlugin;
