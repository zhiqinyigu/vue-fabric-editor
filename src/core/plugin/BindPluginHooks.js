/*
 * @Author: cyc
 * @Date: 2026-08-27 11:12:28
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-01 10:27:16
 * 插件 hook 绑定（编辑器 Editor 与渲染器 RendererCore 共用）
 * 把插件实例的生命周期 hook（hookImportBefore/After / hookSaveBefore/After / hookTransform）
 * 以 tapPromise 方式挂到 core.hooksEntity 上，保证两边加载/渲染管线一致。
 */
export const PLUGIN_HOOKS = [
  'hookImportBefore',
  'hookImportAfter',
  'hookSaveBefore',
  'hookSaveAfter',
  'hookTransform',
];

export function bindPluginHooks(core, plugin) {
  const hookNames = core.hooks || PLUGIN_HOOKS;
  hookNames.forEach((hookName) => {
    const hook = plugin[hookName];
    if (hook && core.hooksEntity && core.hooksEntity[hookName]) {
      core.hooksEntity[hookName].tapPromise(plugin.pluginName + hookName, function () {
        // eslint-disable-next-line prefer-rest-params
        const result = hook.apply(plugin, [...arguments]);
        return result instanceof Promise ? result : Promise.resolve(result);
      });
    }
  });
}
