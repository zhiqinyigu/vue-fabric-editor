import hotkeys from 'hotkeys-js';
import ContextMenu from './ContextMenu.js';
import ServersPlugin from './ServersPlugin';
import Utils from './utils/utils';
import PluginEngine from './PluginEngine';
class Editor extends PluginEngine {
    constructor() {
        super(...arguments);
        this.canvas = null;
        this.contextMenu = null;
        // 自定义事件
        this.customEvents = [];
        // 自定义API
        this.customApis = [];
        // 生命周期函数名
        this.hooks = [
            'hookImportBefore',
            'hookImportAfter',
            'hookSaveBefore',
            'hookSaveAfter',
            'hookTransform',
        ];
    }
    init(canvas) {
        this.canvas = canvas;
        this.pluginMap = {};
        this._initContextMenu();
        this._bindContextMenu();
        this._initActionHooks();
        this._initServersPlugin();
        this.Utils = Utils;
    }
    get fabricCanvas() {
        return this.canvas;
    }
    // 引入组件
    use(plugin, options) {
        if (this._checkPlugin(plugin) && this.canvas) {
            this._saveCustomAttr(plugin);
            const pluginRunTime = this._bindPlugin(plugin, options);
            this._bindingHotkeys(pluginRunTime);
            this._bindingApis(pluginRunTime);
        }
        return this;
    }
    destory() {
        this.canvas = null;
        this.contextMenu = null;
        this.customEvents = [];
        this.customApis = [];
        super.destroy();
    }
    // 检查组件
    _checkPlugin(plugin) {
        const { pluginName, events = [], apis = [] } = plugin;
        //名称检查
        if (this.pluginMap[pluginName]) {
            throw new Error(pluginName + '插件重复初始化');
        }
        events.forEach((eventName) => {
            if (this.customEvents.find((info) => info === eventName)) {
                throw new Error(pluginName + '插件中' + eventName + '重复');
            }
        });
        apis.forEach((apiName) => {
            if (this.customApis.find((info) => info === apiName)) {
                throw new Error(pluginName + '插件中' + apiName + '重复');
            }
        });
        return true;
    }
    // 绑定hooks方法（已抽取至 BindPluginHooks / PluginEngine 共享，供渲染器复用）
    // 绑定快捷键
    _bindingHotkeys(plugin) {
        var _a;
        (_a = plugin === null || plugin === void 0 ? void 0 : plugin.hotkeys) === null || _a === void 0 ? void 0 : _a.forEach((keyName) => {
            // 支持 keyup
            hotkeys(keyName, { keyup: true }, (e) => {
                plugin.hotkeyEvent && plugin.hotkeyEvent(keyName, e);
            });
        });
    }
    // 保存组件自定义事件与API
    _saveCustomAttr(plugin) {
        const { events = [], apis = [] } = plugin;
        this.customApis = this.customApis.concat(apis);
        this.customEvents = this.customEvents.concat(events);
    }
    // 代理API事件
    _bindingApis(pluginRunTime) {
        const { apis = [] } = pluginRunTime.constructor || {};
        apis.forEach((apiName) => {
            this[apiName] = function () {
                // eslint-disable-next-line prefer-rest-params
                return pluginRunTime[apiName].apply(pluginRunTime, [...arguments]);
            };
        });
    }
    // 右键菜单
    _bindContextMenu() {
        this.canvas &&
            this.canvas.on('mouse:down', (opt) => {
                if (opt.button === 3) {
                    let menu = [];
                    Object.keys(this.pluginMap).forEach((pluginName) => {
                        const pluginRunTime = this.pluginMap[pluginName];
                        const pluginMenu = pluginRunTime.contextMenu && pluginRunTime.contextMenu();
                        if (pluginMenu) {
                            menu = menu.concat(pluginMenu);
                        }
                    });
                    this._renderMenu(opt, menu);
                }
            });
    }
    // 渲染右键菜单
    _renderMenu(opt, menu) {
        if (menu.length !== 0 && this.contextMenu && this.contextMenu.enabled) {
            this.contextMenu.hideAll();
            this.contextMenu.setData(menu);
            this.contextMenu.show(opt.e.clientX, opt.e.clientY);
        }
    }
    // 生命周期事件（hooksEntity 由 PluginEngine._initHooks 创建）
    _initActionHooks() {
        this._initHooks(this.hooks);
    }
    _initContextMenu() {
        this.contextMenu = new ContextMenu(this.canvas.wrapperEl, []);
        this.contextMenu.install();
    }
    _initServersPlugin() {
        this.use(ServersPlugin);
    }
}
export default Editor;