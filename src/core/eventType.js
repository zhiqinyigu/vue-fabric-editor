/*
 * @Author: 秦少卫
 * @Date: 2024-04-10 14:00:05
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-04-10 14:01:39
 * @Description: 事件类型
 */
// 选择模式
export var SelectMode;
(function (SelectMode) {
    SelectMode["EMPTY"] = "";
    SelectMode["ONE"] = "one";
    SelectMode["MULTI"] = "multiple";
})(SelectMode || (SelectMode = {}));
// 选择事件（用于广播）
export var SelectEvent;
(function (SelectEvent) {
    SelectEvent["ONE"] = "selectOne";
    SelectEvent["MULTI"] = "selectMultiple";
    SelectEvent["CANCEL"] = "selectCancel";
})(SelectEvent || (SelectEvent = {}));
export default { SelectMode, SelectEvent };
