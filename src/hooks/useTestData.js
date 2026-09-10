/*
 * @Author: cyc
 * @Date: 2026-08-27 11:05:58
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-10 16:04:07
 * @Description: 测试数据映射表 / 变量表（schema） 与 VariablePlugin 的胶水层
 */
import { ref, computed } from '@vue/composition-api';
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
  // 变量表（变量字典）：业务注入的会话态 schema
  const schema = ref(canvasEditor.getVariableSchema());
  // 变量表懒加载状态
  const schemaLoading = ref(false);
  // 变量表可用性（有 adapter 或会话表非空）：接入点据此决定是否渲染插入变量入口
  const schemaAvailable = computed(
    () =>
      schema.value.length > 0 ||
      !!(canvasEditor.getSchemaAdapter && canvasEditor.getSchemaAdapter())
  );

  // 重新收集占位符与测试数据（包裹符变更 / 变量弹窗打开时调用；
  // 导入模板时 VariablePlugin 会从 variableMeta.schema 快照还原变量表并
  // 预填 testData（旧契约 variables[].example 仅回填测试数据），
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

  /* ---------- 变量表（schema） ---------- */
  // 会话表快照
  const refreshSchema = () => {
    schema.value = canvasEditor.getVariableSchema();
  };
  // 懒加载（adapter 场景）：幂等；失败时保持当前表并由调用方提示
  const ensureSchemaLoaded = () => {
    if (schemaLoading.value) return Promise.resolve(schema.value);
    schemaLoading.value = true;
    return canvasEditor
      .ensureSchemaLoaded()
      .then((defs) => {
        schema.value = defs;
        return defs;
      })
      .catch(() => {
        // 降级：保持当前 schema（可能为空），错误由调用方处理
        return schema.value;
      })
      .finally(() => {
        schemaLoading.value = false;
      });
  };
  // 直接注入（无 adapter 静态场景）
  const setSchemaData = (defs) => {
    schema.value = canvasEditor.setVariableSchema(defs);
    return schema.value;
  };
  const addCustomVariable = (def) =>
    canvasEditor.addCustomVariable(def).then((defs) => {
      schema.value = defs;
      return defs;
    });
  const updateCustomVariable = (path, patch) =>
    canvasEditor.updateCustomVariable(path, patch).then((defs) => {
      schema.value = defs;
      return defs;
    });
  const removeCustomVariable = (path) =>
    canvasEditor.removeCustomVariable(path).then((defs) => {
      schema.value = defs;
      return defs;
    });
  // 保存到业务后台（adapter.save；未实现时 reject）
  const saveSchema = () => canvasEditor.saveVariableSchema();
  // 导出变量表 JSON 字符串（无 save 时的对接兜底）
  const exportSchema = () => canvasEditor.exportVariableSchema();
  // 该 path 是否为导入变量（只读）
  const isImportedVariable = (path) => canvasEditor.isImportedVariable(path);

  // 监听插件事件，同步状态
  canvasEditor.on &&
    canvasEditor.on('variable:previewChange', (val) => {
      previewing.value = val;
    });
  canvasEditor.on &&
    canvasEditor.on('variable:schemaChange', () => {
      refreshSchema();
    });
  canvasEditor.on &&
    canvasEditor.on('variable:testDataChange', () => {
      testData.value = canvasEditor.getTestData();
    });

  return {
    delimiter,
    variables,
    testData,
    previewing,
    schema,
    schemaLoading,
    schemaAvailable,
    refreshVariables,
    setDelimiter,
    updateTestData,
    setTestData,
    enterPreview,
    exitPreview,
    refreshSchema,
    ensureSchemaLoaded,
    setSchemaData,
    addCustomVariable,
    updateCustomVariable,
    removeCustomVariable,
    saveSchema,
    exportSchema,
    isImportedVariable,
  };
}
