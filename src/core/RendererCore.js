/*
 * @Author: cyc
 * @Date: 2026-08-27 11:12:28
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-27 11:12:28
 * 渲染引擎（前台渲染器专用，轻量、无编辑能力）
 * - 与编辑器共享：PluginEngine 基类（插件容器/hooks 契约）、renderPatches 对象补丁、
 *   ServersPlugin.loadJSON 全管线（资源清单展开 / 缺省字段补回 / 二维码·条形码参数还原 / 字体加载 / crossOrigin）
 * - 渲染业务逻辑全部在插件中（RendererWorkspacePlugin / RendererAutoGrowPlugin），
 *   与 Editor.js 一致：引擎只做"容器 + 插件注册 + 加载管线"。
 * - 不引入 Editor / hotkeys / ContextMenu / 任何交互插件，打包体积小。
 */
import PluginEngine from './PluginEngine';
import ServersPlugin from './ServersPlugin';
import QrCodePlugin from './plugin/QrCodePlugin';
import BarCodePlugin from './plugin/BarCodePlugin';
import FontPlugin from './plugin/FontPlugin';
import RendererWorkspacePlugin from './plugin/RendererWorkspacePlugin';
import RendererAutoGrowPlugin from './plugin/RendererAutoGrowPlugin';
import {
  installImageCorsFallback,
  setCorsFallbackEnabled,
  normalizeCrossOrigin,
  isStrictCrossOrigin,
  addCorsFallbackListener,
} from './imageLoader';
import './renderPatches';

class RendererCore extends PluginEngine {
  constructor(canvas, options = {}) {
    super(...arguments);
    this.canvas = canvas;
    this.options = options;
    this.pluginMap = {};
    // 远程图片 CORS 回退：服务器无 Access-Control-* 时仍能显示背景/图片（代价：画布被污染、导出受限）。
    // options.crossOrigin = 'strict' 关闭回退（严格 CORS，失败即不显示）。
    setCorsFallbackEnabled(!isStrictCrossOrigin(options.crossOrigin));
    installImageCorsFallback();
    // 发生 CORS 回退 → 画布被污染（导出受限），emit 供宿主提示
    this.canvasTainted = false;
    this._offCorsFallback = addCorsFallbackListener((info) => {
      this.canvasTainted = true;
      this.emit('renderer:warn', { code: 'IMAGE_CORS_FALLBACK', ...info });
    });
    this._initHooks();
    // 渲染所需插件
    this.use(ServersPlugin);
    this.use(QrCodePlugin, { defaultData: options.defaultQrCodeData });
    this.use(BarCodePlugin);
    this.use(RendererWorkspacePlugin);
    this.use(RendererAutoGrowPlugin);
    if (options.getFonts) {
      this.use(FontPlugin, { getFonts: options.getFonts });
    }
  }
  use(plugin, options) {
    if (!plugin || !plugin.pluginName || this.pluginMap[plugin.pluginName]) return this;
    this._bindPlugin(plugin, options);
    return this;
  }
  // loadJSON 封装为 Promise（内部复用 ServersPlugin 全管线）
  loadJSON(json, callback) {
    // 远程图片默认以 crossOrigin 加载，避免画布被污染（Tainted canvas）导致 toDataURL 导出失败；
    // 服务器不支持 CORS 时可置 options.crossOrigin = null 关闭（此时仅可显示、不可导出）；
    // options.crossOrigin = 'strict' 保持严格 CORS（不启用自动回退）。
    const opts = this.options || {};
    const crossOrigin = normalizeCrossOrigin(opts.crossOrigin);
    return new Promise((resolve, reject) => {
      try {
        this.getPlugin('ServersPlugin').loadJSON(
          json,
          () => {
            resolve();
            callback && callback();
          },
          crossOrigin
        );
      } catch (e) {
        reject(e);
        callback && callback();
      }
    });
  }
  // 画布是否已被跨域回退图片污染（污染后 toDataURL 会抛 SecurityError，导出受限）
  isCanvasTainted() {
    return this.canvasTainted === true;
  }
  destroy() {
    if (this._offCorsFallback) {
      this._offCorsFallback();
      this._offCorsFallback = null;
    }
    if (this.canvas && this.canvas.dispose) {
      this.canvas.dispose();
    }
    super.destroy();
  }
}

export default RendererCore;
