/**
 * 编辑器命令式 API：变量表（schema）代理契约
 * api 层只做透传，方法签名与 VariablePlugin/Editor 代理保持一致
 */
import { createEditorApi } from '../../src/lib/api';

function makeEditor() {
  const calls = [];
  return {
    calls,
    setVariableSchema: (defs) => {
      calls.push(['setVariableSchema', defs]);
      return defs;
    },
    getVariableSchema: () => [{ path: 'a.b', label: 'x' }],
    ensureSchemaLoaded: () => Promise.resolve([{ path: 'a.b', label: 'x' }]),
    addCustomVariable: (def) => {
      calls.push(['addCustomVariable', def]);
      return Promise.resolve([]);
    },
    updateCustomVariable: (path, patch) => {
      calls.push(['updateCustomVariable', path, patch]);
      return Promise.resolve([]);
    },
    removeCustomVariable: (path) => {
      calls.push(['removeCustomVariable', path]);
      return Promise.resolve([]);
    },
    isImportedVariable: (path) => path === 'a.b',
    saveVariableSchema: () => Promise.resolve([]),
    exportVariableSchema: () => '[]',
    getVariableEntries: () => [{ path: 'a.b', fields: ['text'] }],
  };
}

describe('createEditorApi：变量表 schema 代理', () => {
  it('set/get/ensure 透传', async () => {
    const editor = makeEditor();
    const api = createEditorApi({ editor });
    const defs = [{ path: 'x.y', label: 'y' }];
    expect(api.setVariableSchema(defs)).toBe(defs);
    expect(editor.calls[0]).toEqual(['setVariableSchema', defs]);
    expect(api.getVariableSchema()).toEqual([{ path: 'a.b', label: 'x' }]);
    await expect(api.ensureVariableSchemaLoaded()).resolves.toEqual([{ path: 'a.b', label: 'x' }]);
  });

  it('自定义 CRUD / 保存 / 导出 / 扫描透传', async () => {
    const editor = makeEditor();
    const api = createEditorApi({ editor });
    await api.addCustomVariable({ path: 'x.y', label: 'y' });
    await api.updateCustomVariable('x.y', { label: 'z' });
    await api.removeCustomVariable('x.y');
    await api.saveVariableSchema();
    expect(editor.calls).toEqual([
      ['addCustomVariable', { path: 'x.y', label: 'y' }],
      ['updateCustomVariable', 'x.y', { label: 'z' }],
      ['removeCustomVariable', 'x.y'],
    ]);
    expect(api.isImportedVariable('a.b')).toBe(true);
    expect(api.isImportedVariable('x.y')).toBe(false);
    expect(api.exportVariableSchema()).toBe('[]');
    expect(api.getVariableEntries()).toEqual([{ path: 'a.b', fields: ['text'] }]);
  });
});
