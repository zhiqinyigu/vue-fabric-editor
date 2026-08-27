/*
 * @Author: cyc
 * @Date: 2026-08-27 11:05:58
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-10 16:04:07
 * @Description: 测试数据映射表 与 VariablePlugin 的胶水层
 */
import { ref } from '@vue/composition-api';
import { inject } from '@vue/composition-api';

export default function useTestData() {
  const canvasEditor = inject('canvasEditor');

  // 包裹符
  const delimiter = ref(canvasEditor.getDelimiter());
  // 占位符变量列表
  const variables = ref(canvasEditor.getVariables());
  // 测试数据映射表：path -> value
  const testData = ref(canvasEditor.getTestData());
  // 是否处于预览模式
  const previewing = ref(canvasEditor.isPreviewing());

  // 重新收集占位符与测试数据（包裹符变更 / 变量弹窗打开时调用；
  // 导入模板时 VariablePlugin 会回填 variableMeta.variables[].example 到 testData，
  // 这里需一并刷新才能让弹窗回显）
  const refreshVariables = () => {
    variables.value = canvasEditor.getVariables();
    testData.value = canvasEditor.getTestData();
  };
  // 更新包裹符
  const setDelimiter = (next) => {
    canvasEditor.setDelimiter(next);
    delimiter.value = canvasEditor.getDelimiter();
    refreshVariables();
  };
  // 更新某个变量测试值
  const updateTestData = (path, value) => {
    canvasEditor.updateTestData(path, value);
    testData.value = canvasEditor.getTestData();
  };
  const setTestData = (data) => {
    canvasEditor.setTestData(data);
    testData.value = canvasEditor.getTestData();
  };
  // 进入预览
  const enterPreview = () => {
    canvasEditor.enterPreview();
    previewing.value = canvasEditor.isPreviewing();
  };
  // 退出预览
  const exitPreview = () => {
    canvasEditor.exitPreview();
    previewing.value = canvasEditor.isPreviewing();
  };

  // 监听插件事件，同步状态
  canvasEditor.on &&
    canvasEditor.on('variable:previewChange', (val) => {
      previewing.value = val;
    });

  return {
    delimiter,
    variables,
    testData,
    previewing,
    refreshVariables,
    setDelimiter,
    updateTestData,
    setTestData,
    enterPreview,
    exitPreview,
  };
}
