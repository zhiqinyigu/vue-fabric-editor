<!--
 * @Author: 秦少卫
 * @Date: 2024-05-17 15:30:21
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-13 17:21:09
 * @Description: file content
-->
<template>
  <div class="home">
    <Layout>
      <!-- 头部区域 -->
      <Header :style="{ position: 'fixed', width: '100%', zIndex: 99 }">
        <div class="left">
          <Logo></Logo>
          <!-- 导入 -->
          <Divider type="vertical" />
          在线设计工具
        </div>

        <div class="right">
          <Button type="primary" to="/" size="smail" target="_blank">新建设计</Button>
          <!-- 预览 -->
          <Login></Login>
          <Lang></Lang>
        </div>
      </Header>

      <!-- banner -->
      <Content :style="{ margin: '40px 20px 0', minHeight: '500px', minWidth: '1200px' }">
        <Banner></Banner>
        <div class="search-box">
          <Input
            v-model="filters.name.$containsi"
            size="large"
            class="search-input"
            clearable
            search
            enter-button
            placeholder="请输入关键词"
            @on-search="search"
          />
          <TagSelect v-model="filters.templ_type.$in" @on-change="search">
            <TagSelectOption v-for="item in typeList" :key="item.id" :name="item.id">
              {{ item.name }}
            </TagSelectOption>
          </TagSelect>
        </div>

        <!-- grid布局 -->
        <div
          id="imgBox"
          v-masonry
          class="img-box grid"
          transition-duration="0.3s"
          :gutter="10"
          item-selector=".grid-item"
        >
          <div v-for="info in templList" :key="info.id" v-masonry-tile class="img-item grid-item">
            <Tooltip :content="info.name" placement="top">
              <img :src="info.src" :alt="info.name" @click="toInfo(info)" />
            </Tooltip>
          </div>
        </div>
        <Page
          v-model="page"
          class="page"
          :total="total"
          :page-size="pageSize"
          show-sizer
          @on-change="getTmplListHandel"
          @on-page-size-change="(val) => (pageSize = val)"
        />
      </Content>
      <Footer class="layout-footer-center">
        {{ year }} &copy; vue-fabric-editor（Vue 2 移植版）
      </Footer>
    </Layout>
  </div>
</template>

<script>
import { toRaw, ref, reactive, nextTick } from '@vue/composition-api';
import { Spin } from 'view-design';
import qs from 'qs';
import { useRouter } from '@/hooks/useRouter';
const router = useRouter();
// 路由
import Banner from './components/Banner.vue';
// 顶部组件
import Logo from '@/components/Logo.vue';
import Lang from '@/components/Lang.vue';
import Login from '@/components/Login';

import { getMaterialPreviewUrl } from '@/hooks/usePageList';
import { getTmplTypes, getTmplList } from '@/api/material';

export default {
  name: 'Home',
  components: {
    Banner,
    Logo,
    Lang,
    Login,
  },
  setup() {
    // 分类列表
    const typeList = ref([]);
    // 备案年份
    const year = ref(new Date().getFullYear());
    const getTypeListHandel = async () => {
      const res = await getTmplTypes();
      typeList.value = res.data.data.map((item) => {
        return {
          id: item.id,
          name: item.attributes.name,
        };
      });
    };
    getTypeListHandel();

    // 模板列表
    const templList = ref([]);
    const total = ref(0);
    const page = ref(1);
    const pageSize = ref(20);

    const filters = reactive({
      name: {
        $containsi: '',
      },
      templ_type: {
        $in: [],
      },
    });

    const getTmplListHandel = async () => {
      const params = {
        populate: {
          img: '*',
        },
        filters: toRaw(filters),
        fields: ['name'],
        pagination: {
          page: page.value,
          pageSize: pageSize.value,
        },
      };
      Spin.show();
      try {
        const res = await getTmplList(qs.stringify(params));
        templList.value = [];
        await nextTick();
        total.value = res.data.meta.pagination.total;
        templList.value = res.data.data.map((item) => ({
          id: item.id,
          name: item.attributes.name,
          src: getMaterialPreviewUrl(item.attributes.img),
        }));
      } catch (error) {
        console.log(error);
      }
      Spin.hide();
    };

    const search = () => {
      page.value = 1;
      getTmplListHandel();
    };
    getTmplListHandel();

    const toInfo = (info) => {
      const href = router.resolve({
        path: '/',
        query: {
          tempId: info.id,
        },
      });
      console.log(href, 1111);
      // 点击事件
      window.open(href.href, '_blank');
    };

    return {
      typeList,
      year,
      templList,
      total,
      page,
      pageSize,
      filters,
      search,
      getTmplListHandel,
      toInfo,
    };
  },
};
</script>
<style lang="less" scoped>
// header
/deep/ .ivu-layout-header {
  --height: 45px;
  padding: 0 0px;
  border-bottom: 1px solid #eef2f8;
  background: #fff;
  height: var(--height);
  line-height: var(--height);
  display: flex;
  justify-content: space-between;

  .left,
  .right {
    display: flex;
    align-items: center;
    img {
      display: block;
      margin-right: 10px;
    }
  }
}

// footer
.layout-footer-center {
  text-align: center;
}

// 搜索弹框
.search-box {
  width: 1200px;
  margin: 20px auto;
  border-radius: 10px;
  background: #ffffffed;
  padding: 20px;
  border: 2px solid #fff;

  /deep/ .ivu-tag-select {
    line-height: 32px;
    max-height: none;
    margin-left: 0;
    margin-top: 20px;
    .ivu-tag {
      font-size: 20px;
      line-height: 32px;
      height: 32px;
    }
  }
}

// 流布局
.img-box {
  width: 1200px;
  margin: 0 auto;
  .grid-item {
    width: 232px;
    cursor: pointer;
    margin-bottom: 5px;

    img {
      width: 100%;
      border-radius: 10px;
      &:hover {
        transform: scale(1.02);
      }
    }
  }
}

// 分页
.page {
  margin: 20px auto;
  text-align: center;
}
</style>
