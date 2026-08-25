<!--
 * @Author: 秦少卫
 * @Date: 2022-09-03 19:16:55
 * @LastEditors: 秦少卫
 * @LastEditTime: 2025-03-18 19:01:39
 * @Description: 导入模板
-->

<template>
  <div>
    <!-- 搜索组件 -->
    <div class="search-box">
      <Select
        v-model="typeValue"
        class="select"
        :disabled="pageLoading"
        @on-change="changeSelectType"
      >
        <Option v-for="item in typeList" :key="item.value" :value="item.value">
          {{ item.label }}
        </Option>
      </Select>
      <Input
        v-model="searchKeyWord"
        class="input"
        :placeholder="`在${typeText}中搜索`"
        search
        :disabled="pageLoading"
        @on-search="startGetList"
      />
    </div>
    <!-- 列表 -->
    <div id="myTemplBox" style="height: calc(100vh - 108px)">
      <Scroll
        v-if="showScroll"
        key="mysscroll"
        :on-reach-bottom="nextPage"
        :height="scrollHeight"
        :distance-to-edge="[-1, -1]"
      >
        <!-- 列表 -->
        <div class="list-box">
          <Tooltip v-for="info in pageData" :key="info.src" :content="info.name" placement="top">
            <div class="tmpl-img-box">
              <Image
                lazy
                :src="info.previewSrc"
                fit="contain"
                height="100%"
                :alt="info.name"
                @click="beforeClearTip(info)"
              />
            </div>
          </Tooltip>
        </div>
        <Spin v-if="pageLoading" size="large" fix></Spin>

        <Divider v-if="isDownBottm" plain>已经到底了</Divider>
      </Scroll>
    </div>
  </div>
</template>

<script>
import { onMounted } from '@vue/composition-api';
import useSelect from '@/hooks/select';
import usePageList from '@/hooks/pageList';
import { Spin, Modal } from 'view-design';
import { debounce } from 'lodash-es';

import { useI18n } from '@/hooks/useI18n';
import { useRouter, useRoute } from '@/hooks/useRouter';

export default {
  name: 'ImportTmpl',
  setup() {
    const router = useRouter();
    const route = useRoute();
    const { t } = useI18n();
    const { canvasEditor } = useSelect();

    const {
      startPage,
      typeValue,
      typeText,
      typeList,
      pageLoading,
      pageData,
      searchKeyWord,
      isDownBottm,
      startGetList,
      nextPage,
      showScroll,
      scrollHeight,
      getInfo,
    } = usePageList({
      typeUrl: 'templ-types',
      listUrl: 'templs',
      searchTypeKey: 'templ_type',
      searchWordKey: 'name',
      pageSize: 10,
      scrollElement: '#myTemplBox',
      fields: ['name'],
    });

    typeValue.value = 20;

    // 替换提示
    const beforeClearTip = (info) => {
      Modal.confirm({
        title: t('tip'),
        content: `<p>${t('replaceTip')}</p>`,
        okText: t('ok'),
        cancelText: t('cancel'),
        onOk: () => getTempData(info),
      });
    };

    onMounted(() => {
      startPage();
      getTemplInfo();
    });

    // 获取模板数据
    const getTempData = async (info) => {
      Spin.show({
        render: (h) => h('div', t('alert.loading_data')),
      });
      const infoRes = await getInfo(info.id);
      if (route.query.admin) {
        router.replace('/?tempId=' + info.id + '&admin=true');
      } else {
        router.replace('/?tempId=' + info.id);
      }
      canvasEditor.loadJSON(JSON.stringify(infoRes.data.data.attributes.json), Spin.hide);
    };

    const getTemplInfo = async () => {
      if (route.query.tempId) {
        try {
          const infoRes = await getInfo(route.query.tempId);
          canvasEditor.loadJSON(JSON.stringify(infoRes.data.data.attributes.json), Spin.hide);
        } catch (error) {
          console.log(error);
        }
      }
    };

    const changeSelectType = debounce(() => {
      startGetList();
    }, 100);

    return {
      typeValue,
      typeText,
      typeList,
      pageLoading,
      pageData,
      searchKeyWord,
      isDownBottm,
      startGetList,
      nextPage,
      showScroll,
      scrollHeight,
      beforeClearTip,
      changeSelectType,
    };
  },
};
</script>

<style scoped lang="less">
.search-box {
  padding-top: 10px;
  padding-bottom: 10px;
  display: flex;
  .input {
    margin-left: 10px;
  }
  .select {
    width: 100px;
  }
}

.list-box {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
}

.tmpl-img-box {
  width: 140px;
  cursor: pointer;
  border-radius: 5px;
  overflow: hidden;
  &:hover {
    /deep/ .ivu-image-img {
      opacity: 0.8;
    }
  }
}
</style>
