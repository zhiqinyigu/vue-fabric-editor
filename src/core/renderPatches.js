/*
 * @Author: cyc
 * @Date: 2026-08-27 11:12:28
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-01 10:27:16
 * 渲染所需对象补丁统一入口（编辑器与渲染器共用）
 * 一次性引入所有 fromObject / 原型补丁，保证两边加载出的对象渲染行为完全一致。
 */
import './objects/CustomRect';
import './objects/CustomTextbox';
import './objects/CustomIText';
import './objects/Arrow';
import './objects/ThinTailArrow';
import './objects/VariableImage';