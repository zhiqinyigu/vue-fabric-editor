<!--
 * @Author: 秦少卫
 * @Date: 2024-06-11 09:12:24
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-06-12 09:02:50
 * @Description: logo
-->

<template>
  <div class="logo">
    <a :href="webInfo.url" target="_blank">
      <img :src="webInfo.img" alt="webInfo.name" />
    </a>
  </div>
</template>

<script>
import { ref } from '@vue/composition-api';
import { getWebInfo } from '@/api/material';
import { get, pick } from 'lodash-es';

export default {
  name: 'Logo',
  setup() {
    const baseURL = process.env.VUE_APP_APIHOST;

    const webInfo = ref({
      name: '',
      logo: '',
      url: '',
    });

    const getWebInfoFun = async () => {
      const res = await getWebInfo();
      const info = pick(res.data.data.attributes, ['name', 'url']);
      info.img = baseURL + get(res.data, 'data.attributes.logo.data.attributes.url');
      webInfo.value = info;
    };

    getWebInfoFun();

    return {
      webInfo,
    };
  },
};
</script>
<style scoped lang="less">
.logo {
  width: 117px;
  height: 44px;
  display: inline-block;
  margin-right: 10px;
  margin-left: 2px;
  a {
    display: flex;
    height: 100%;
    align-items: center;
    img {
      display: inline-block;
      height: 80%;
    }
    span {
      font-size: 18px;
      font-weight: bold;
      margin-left: 6px;
    }
  }
  // text-align: center;
  // vertical-align: middle;
  // .ivu-icon {
  //   vertical-align: super;
  // }
}
</style>
