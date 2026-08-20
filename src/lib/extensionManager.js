/*
 * @Author: cyc
 * @Date: 2026-08-20 10:15:11
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-01 10:27:16
 * 扩展管理器
 * - services   -> 自动注册进 adapter registry（随扩展注销而清理）
 * - panels     -> 按 region 归类（left/right/top），reactive，注册即出现
 * - overrides  -> 注册进 ui registry（组件覆盖）
 * - lifecycle  -> onReady / onDestroy
 */
import { reactive } from '@vue/composition-api';

const REGIONS = ['left', 'right', 'top'];

export function createExtensionManager({ registry, ui }) {
  const store = new Map();
  const panelsByRegion = reactive({ left: [], right: [], top: [] });
  let context = null;

  function refreshPanels() {
    REGIONS.forEach((region) => {
      panelsByRegion[region] = [];
    });
    store.forEach((ext) => {
      (ext.panels || []).forEach((panel) => {
        const region = REGIONS.includes(panel.region) ? panel.region : 'left';
        const tab = panel.tab || { key: ext.id, label: ext.id };
        panelsByRegion[region].push({
          key: tab.key || ext.id,
          extId: ext.id,
          tab,
          component: panel.component,
        });
      });
    });
  }

  function register(ext) {
    if (!ext || !ext.id) throw new Error('[fabric-editor] extension requires an id');
    if (store.has(ext.id)) throw new Error(`[fabric-editor] extension "${ext.id}" already registered`);
    const disposers = [];
    Object.keys(ext.services || {}).forEach((key) => {
      disposers.push(registry.register(key, ext.services[key]));
    });
    (ext.overrides || []).forEach((o) => {
      if (!o || !o.component) return;
      disposers.push(ui.register(o.component, o.with));
    });
    ext._disposers = disposers;
    store.set(ext.id, ext);
    refreshPanels();
    if (ext.lifecycle && ext.lifecycle.onReady) ext.lifecycle.onReady(context || {});
    return () => unregister(ext.id);
  }

  function unregister(id) {
    const ext = store.get(id);
    if (!ext) return;
    if (ext.lifecycle && ext.lifecycle.onDestroy) ext.lifecycle.onDestroy(context || {});
    (ext._disposers || []).forEach((d) => d());
    ext._disposers = [];
    store.delete(id);
    refreshPanels();
  }

  return {
    store,
    panelsByRegion,
    register,
    unregister,
    get: (id) => store.get(id),
    setContext: (ctx) => {
      context = ctx;
    },
  };
}