import { SelectMode } from '../eventType';
import i18n from "@/language";
// import event from '@/utils/event/notifier';
class FlipPlugin {
    constructor(canvas, editor) {
        this.canvas = canvas;
        this.editor = editor;
    }
    flip(type) {
        const activeObject = this.canvas.getActiveObject();
        if (activeObject) {
            activeObject.set(`flip${type}`, !activeObject[`flip${type}`]).setCoords();
            this.canvas.requestRenderAll();
        }
    }
    contextMenu() {
        const selectedMode = this.editor.getSelectMode();
        const activeObject = this.canvas.getActiveObject();
        if (selectedMode === SelectMode.ONE && activeObject) {
            return [
                {
                    text: '翻转',
                    hotkey: '❯',
                    subitems: [
                        {
                            text: i18n.t('flip.x'),
                            hotkey: '|',
                            onclick: () => this.flip('X'),
                        },
                        {
                            text: i18n.t('flip.y'),
                            hotkey: '-',
                            onclick: () => this.flip('Y'),
                        },
                    ],
                },
            ];
        }
    }
    destroy() {
        console.log('pluginDestroy');
    }
}
FlipPlugin.pluginName = 'FlipPlugin';
FlipPlugin.apis = ['flip'];
export default FlipPlugin;
