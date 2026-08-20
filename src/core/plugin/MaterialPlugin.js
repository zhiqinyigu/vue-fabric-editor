/*
 * @Author: 秦少卫
 * @Date: 2023-08-04 21:13:16
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-05-11 14:20:26
 * @Description: 素材插件（仅保留画布尺寸能力，数据由业务注入）
 */
class MaterialPlugin {
    constructor(canvas, editor, config) {
        this.canvas = canvas;
        this.editor = editor;
        // 尺寸数据提供者：由业务注入（返回 [{ id, name, width, height, unit }]）
        this.getSizes = config.getSizes || (() => Promise.resolve([]));
    }
    // 获取画布预设尺寸
    getSizeList() {
        return this.getSizes().then((list) => (Array.isArray(list) ? list : []));
    }
}
MaterialPlugin.pluginName = 'MaterialPlugin';
MaterialPlugin.apis = ['getSizeList'];
export default MaterialPlugin;