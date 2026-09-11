import { SelectMode } from './eventType';
import i18n from '@/language';

class FontPlugin {
  constructor(canvas, editor, config) {
    // 快捷键 keyCode hotkeys-js
    this.hotkeys = ['backspace', 'space'];
    // 初始化
    this.canvas = canvas;
    this.editor = editor;
    // 可插入外部配置
    this.repoSrc = config.repoSrc;
  }
  // 钩子函数 hookImportAfter/hookSaveBefore/hookSaveAfter Promise
  hookImportBefore(json) {
    return this.downFontByJSON(json);
  }
  // 挂载API方法
  downFontByJSON() {
    //
  }
  // 私有方法 + 发布事件
  _createFontCSS() {
    const params = [];
    this.editor.emit('textEvent1', params);
  }
  // 右键菜单
  contextMenu() {
    const selectedMode = this.editor.getSelectMode();
    if (selectedMode === SelectMode.ONE) {
      return [
        null,
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
  // 快捷键
  hotkeyEvent(eventName, { type }) {
    // eventName：hotkeys中的属性 backspace、space
    // type：keyUp keyDown
    // code：hotkeys-js Code
    if (eventName === 'backspace' && type === 'keydown') {
      this.del();
    }
  }
  // 注销
  destroy() {
    console.log('pluginDestroy');
  }
}
// 插件名称
FontPlugin.pluginName = 'FontPlugin';
// 挂载API名称
FontPlugin.apis = ['downFontByJSON'];
// 发布事件
FontPlugin.events = ['textEvent1', 'textEvent2'];
export default FontPlugin;
