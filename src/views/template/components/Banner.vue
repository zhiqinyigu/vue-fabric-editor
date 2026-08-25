<!--
 * @Author: 秦少卫
 * @Date: 2024-06-12 16:48:10
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:05:39
 * @Description: 幻灯片
-->
<template>
  <div class="banner">
    <Carousel
      v-model="value"
      :height="250"
      :autoplay="setting.autoplay"
      :autoplay-speed="setting.autoplaySpeed"
      :dots="setting.dots"
      :radius-dot="setting.radiusDot"
      :trigger="setting.trigger"
      :arrow="setting.arrow"
    >
      <CarouselItem v-for="item in banners" :key="item.id" class="img-box">
        <a :href="item.url" target="_blank">
          <img :src="item.imgUrl" :alt="item.title" />
        </a>
      </CarouselItem>
    </Carousel>
  </div>
</template>
<script>
import { reactive, ref } from '@vue/composition-api';
import { commonBannerApi } from '@/api/material';

export default {
  name: 'Banner',
  setup() {
    const setting = reactive({
      autoplay: false,
      autoplaySpeed: 2000,
      dots: 'inside',
      radiusDot: false,
      trigger: 'click',
      arrow: 'hover',
    });

    const banners = ref([]);

    const value = 0;

    commonBannerApi.find({ populate: '*' }).then((res) => {
      banners.value = res.data;
    });

    return {
      value,
      setting,
      banners,
    };
  },
};
</script>
<style lang="less" scoped>
.banner {
  width: 1200px;
  margin: 0 auto;
  margin-top: 20px;
  border-radius: 10px;
  overflow: hidden;
}
.img-box {
  overflow: hidden;
  height: 100%;
  img {
    height: 100%;
    margin: 0 auto;
    display: block;
  }
}
</style>
