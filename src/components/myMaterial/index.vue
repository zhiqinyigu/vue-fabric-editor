<!--
 * @Author: 秦少卫
 * @Date: 2024-04-25 15:30:54
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-05-30 11:53:28
 * @Description: 我的素材
-->

<template>
  <div v-if="isLogin" class="my-material">
    <Tabs v-model="type">
      <TabPane label="模板" name="templ">
        <MyTempl v-if="type === 'templ'"></MyTempl>
      </TabPane>
      <TabPane label="图片" name="img">
        <UploadMaterial v-if="type === 'img'"></UploadMaterial>
      </TabPane>
    </Tabs>
  </div>
  <div v-else class="tip">请先登录</div>
</template>

<script>
import { ref } from '@vue/composition-api';
import { getFileList } from '@/api/user';
import UploadMaterial from './UploadMaterial';
import MyTempl from './MyTempl';

export default {
  name: 'ImportTmpl',
  components: {
    UploadMaterial,
    MyTempl,
  },
  setup() {
    const type = ref('templ');
    const isLogin = ref(false);
    const getFileListHandle = () => {
      // 获取素材列表
      getFileList()
        .then(() => {
          isLogin.value = true;
        })
        .catch(() => {
          isLogin.value = false;
        });
    };

    getFileListHandle();

    return {
      type,
      isLogin,
    };
  },
};
</script>

<style scoped lang="less">
.tip {
  padding: 20px;
  text-align: center;
}
</style>
