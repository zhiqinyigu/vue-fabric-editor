/*
 * @Author: cyc
 * @Date: 2026-08-27 11:12:28
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-27 11:12:28
 * 插件引擎基类（编辑器 Editor 与渲染器 RendererCore 共用）
 *
 * 职责（插件对引擎的全部依赖面）：
 * - pluginMap：插件实例容器
 * - hooksEntity：生命周期 hook（tapable AsyncSeriesHook），与 BindPluginHooks.PLUGIN_HOOKS 对齐
 * - _bindPlugin：实例化插件 + 注册 + 绑定 hooks（use() 内部复用）
 * - getPlugin / off / destroy
 *
 * 差异留给子类：
 * - Editor 在 init(canvas) 时才初始化 hooks；RendererCore 在构造时初始化
 * - use() 各自的额外行为（Editor：查重/快捷键/API 代理；RendererCore：缺省守卫）
 */
import { EventEmitter } from 'events';
import { AsyncSeriesHook } from 'tapable';
import { bindPluginHooks, PLUGIN_HOOKS } from './plugin/BindPluginHooks';

class PluginEngine extends EventEmitter {
  constructor(...args) {
    super(...args);
    this.pluginMap = {};
    this.hooksEntity = {};
    // 引擎销毁标记：异步加载管线（ServersPlugin.loadJSON）中途引擎被销毁时据此放弃，
    // 避免在已销毁画布上继续走 hook（hooksEntity 清空后 hookTransform 为 undefined → 崩溃）
    this.destroyed = false;
    // 右侧面板全部属性组件同时挂载时会瞬时产生 50+ 个对 selectOne/selectMultiple/
    // selectCancel 的合法订阅（成对 on/off，卸载即回收，无泄漏），events 默认上限 10
    // 及任何固定阈值都会误报 MaxListenersExceededWarning，置 0（events 约定为不限制）。
    this.setMaxListeners(0);
  }
  // 由子类在合适的时机调用（Editor.init / RendererCore 构造），hookNames 缺省用 PLUGIN_HOOKS
  _initHooks(hookNames) {
    const names = hookNames || PLUGIN_HOOKS;
    this.hooks = names;
    this.destroyed = false;
    this.hooksEntity = {};
    names.forEach((hookName) => {
      this.hooksEntity[hookName] = new AsyncSeriesHook(['data']);
    });
  }
  // 实例化插件 + 存入 pluginMap + 绑定 hooks；返回插件实例（use() 内复用）
  _bindPlugin(plugin, options) {
    const instance = new plugin(this.canvas, this, options || {});
    instance.pluginName = plugin.pluginName;
    this.pluginMap[plugin.pluginName] = instance;
    bindPluginHooks(this, instance);
    return instance;
  }
  // 获取插件实例
  getPlugin(name) {
    return this.pluginMap[name] || null;
  }
  // 解决 listener 为 undefined 的时候卸载错误
  off(eventName, listener) {
    // noinspection TypeScriptValidateTypes
    return listener ? super.off(eventName, listener) : this;
  }
  // 清理插件容器与 hooks（子类可补充自身资源清理）
  destroy() {
    this.destroyed = true;
    this.pluginMap = {};
    this.hooksEntity = {};
  }
}

export default PluginEngine;
