<template>
  <div>
    <div class="tpl-search">
      <Input v-model="keyword" search placeholder="搜索模板" @on-search="reload" />
    </div>
    <Spin v-if="loading" size="large" fix></Spin>
    <div class="tpl-list">
      <div v-for="item in list" :key="item.id" class="tpl-item">
        <Tooltip :content="item.name" placement="top">
          <img :src="item.previewSrc" :alt="item.name" @click="load(item)" />
        </Tooltip>
        <div class="tpl-item-bar">
          <span class="tpl-name">{{ item.name }}</span>
          <Button type="text" size="small" @click.stop="remove(item.id)">
            <Icon type="ios-trash-outline" />
          </Button>
        </div>
      </div>
    </div>
    <div v-if="!list.length && !loading" class="tpl-empty">暂无模板</div>
  </div>
</template>

<script>
import { ref, onMounted } from '@vue/composition-api';
import { Message } from 'view-design';
import { useEditorContext } from '@/hooks/useEditorContext';

export default {
  name: 'TemplatePanel',
  setup() {
    const { registry, api } = useEditorContext();
    const template = registry.get('template');

    const keyword = ref('');
    const list = ref([]);
    const loading = ref(false);

    const reload = async () => {
      loading.value = true;
      try {
        const res = await template.list({ page: 1, pageSize: 20, keyword: keyword.value });
        list.value = res.list;
      } finally {
        loading.value = false;
      }
    };

    const load = async (item) => {
      try {
        const { json } = await template.get(item.id);
        api.loadJSON(json);
        Message.success('模板已加载');
      } catch (e) {
        Message.error(e.message || '加载失败');
      }
    };

    const remove = async (id) => {
      await template.remove(id);
      await reload();
    };

    onMounted(reload);

    return { keyword, list, loading, reload, load, remove };
  },
};
</script>

<style scoped lang="less">
.tpl-search {
  padding: 8px 0;
}
.tpl-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
}
.tpl-item {
  width: 48%;
  margin-bottom: 8px;
  border: 1px solid #eee;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;

  img {
    width: 100%;
    height: 90px;
    object-fit: cover;
    display: block;
  }
}
.tpl-item-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 6px;
}
.tpl-name {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tpl-empty {
  text-align: center;
  color: #999;
  padding: 24px 0;
}
</style>
