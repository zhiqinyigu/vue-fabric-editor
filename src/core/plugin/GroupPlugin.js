/*
 * @Author: 秦少卫
 * @Date: 2023-06-20 13:21:10
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-04-10 23:26:13
 * @Description: 组合拆分组合插件
 */
import { isGroup, isActiveSelection } from '../utils/utils';
import { v4 as uuid } from 'uuid';
class GroupPlugin {
    constructor(canvas, editor) {
        this.canvas = canvas;
        this.editor = editor;
    }
    // 拆分组
    unGroup() {
        const activeObject = this.canvas.getActiveObject();
        if (!activeObject)
            return;
        // 先获取当前选中的对象，然后打散
        const activeObjectList = activeObject.getObjects();
        activeObject.toActiveSelection();
        for (const item of activeObjectList) {
            item.set('id', uuid());
        }
        this.canvas.discardActiveObject().renderAll();
    }
    group() {
        // 组合元素
        const activeObj = this.canvas.getActiveObject();
        if (!activeObj)
            return;
        const activegroup = activeObj.toGroup();
        const objectsInGroup = activegroup.getObjects();
        activegroup.clone((newgroup) => {
            newgroup.set('id', uuid());
            this.canvas.remove(activegroup);
            objectsInGroup.forEach((object) => {
                this.canvas.remove(object);
            });
            this.canvas.add(newgroup);
            this.canvas.setActiveObject(newgroup);
        });
    }
    contextMenu() {
        const activeObject = this.canvas.getActiveObject();
        if (isActiveSelection(activeObject)) {
            return [{ text: '组合', hotkey: 'Ctrl+V', disabled: false, onclick: () => this.group() }];
        }
        if (isGroup(activeObject)) {
            return [
                { text: '拆分组合', hotkey: 'Ctrl+V', disabled: false, onclick: () => this.unGroup() },
            ];
        }
    }
    destroy() {
        console.log('pluginDestroy');
    }
}
GroupPlugin.pluginName = 'GroupPlugin';
GroupPlugin.apis = ['unGroup', 'group'];
export default GroupPlugin;
