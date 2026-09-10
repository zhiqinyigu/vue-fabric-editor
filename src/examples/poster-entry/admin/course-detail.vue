<template>
  <div>
    <CFormItem label="讨论区分享海报##发布者分享场景用##" :size="8" align="right">
      <div style="position: relative">
        <CustomAttributeControlList :source="courseSharePosterConfig" />
      </div>
    </CFormItem>
    <CFormItem label="讨论区分享海报##转发者分享场景用##" :size="8" align="right">
      <div style="position: relative">
        <CustomAttributeControlList :source="courseRelayPosterConfig" />
      </div>
    </CFormItem>
    <CFormItem label="观后感分享海报##如配置了观后感##" :size="8" align="right">
      <div style="position: relative">
        <CustomAttributeControlList :source="courseAfterthoughtPosterConfig" />
      </div>
    </CFormItem>
  </div>
</template>

<script>
import { keys, pick } from 'lodash';
import { checkJson } from 'Utils';

import customAttributeMixins from './custom-attribute-mixins';
import posterAttributeConfig, {
  createCustomAttributeUpdateHandler,
} from './poster-attribute-config';

const sharePosterVariableDescription = [
  { name: 'nickname', content: '当前登录用户的昵称' },
  { name: 'posterAction', content: `分享操作描述。例如“发布/转发了学习心得”` },
  { name: 'textAuthor', content: '文本内容的作者昵称' },
  { name: 'text', content: '分享的文本内容' },
  { name: 'courseName', content: '课程名称' },
  { name: 'periodName', content: '课时名称' },
  { name: 'bookshelfImage', content: '书架图链接' },
];

export default {
  mixins: [customAttributeMixins],

  data() {
    return {
      submitJson: true,
      detailUrl: '',
      mediaPlayDomainDisabled: true,
      autoInitModel: true,

      jsonStringFieldList: [
        {
          name: 'marketConfig',
          field: [
            'courseSharePosterConfig',
            'courseRelayPosterConfig',
            'courseDiplomaPosterConfig',
            'courseAfterthoughtPosterConfig',
          ],
        },
      ],

      defaultData: {
        courseSharePosterConfig: posterAttributeConfig(
          { id: 'share-poster' },
          sharePosterVariableDescription
        ),
        courseRelayPosterConfig: posterAttributeConfig(
          { id: 'relay-poster' },
          sharePosterVariableDescription
        ),
        courseAfterthoughtPosterConfig: posterAttributeConfig({ id: 'afterthought-poster' }, [
          { name: 'nickname', content: '内容作者的昵称' },
          { name: 'avatar', content: '内容作者的头像' },
          { name: 'content', content: '观后感内容' },
          { name: 'recordUpdateTime', content: '内容的发布/更新时间' },
          { name: 'courseName', content: '课程名称' },
          { name: 'stageName', content: '营期名称' },
          { name: 'stageIndex', content: '营期所属期数' },
        ]),
        courseDiplomaPosterConfig: posterAttributeConfig({ id: 'diploma-poster' }),
      },
    };
  },

  methods: {
    getInitID() {
      return this.$route.params.id || this.operationCourseId;
    },
    getInitHttpData() {
      const id = this.getInitID();
      return typeof id === 'undefined'
        ? null
        : { courseId: id, id: id, ...this.likeCourseAjaxBaseParam }; // 参数 id 为请求编辑课程接口所新增
    },
    parseModel(data) {
      data = data.list ? data.list[0] : data;
      // unpackJsonStringField实现了类似的事情
      this.jsonStringFieldList.forEach((item) => {
        if (data[item.name]) {
          data[item.name] = JSON.parse(data[item.name]);
          item.field.forEach((key) => {
            data[key] = data[item.name][key];
          });
        }
      });
      // '{"background":"","canvasTextBaseline":"hanging","avatarPosition":"72,90,126","nickNamePosition":"2000,2000,#333","qrCodePosition":"842,1080,152","text":[{"text":"{nickname}","x":"228","y":"104","color":"#1F2229","size":"40","align":"left","lineHeight":"1","fontWeight":"bold","splitByGrapheme":false,"width":"","height":""},{"text":"{posterAction}","x":"228","y":"162","color":"#656A73","size":"34","align":"","lineHeight":"1","fontWeight":"","splitByGrapheme":false,"width":"","height":""},{"text":"{text}","x":"72","y":"266","color":"#1F2229","size":"44","align":"","lineHeight":"1.9","fontWeight":"","splitByGrapheme":true,"width":"936","height":"420"},{"text":"《{courseName}》","x":"256","y":"825","color":"#1F2229","size":"40","align":"","lineHeight":"1","fontWeight":"bold","splitByGrapheme":false,"width":"","height":""},{"text":"{periodName}","x":"277","y":"899","color":"#656A73","size":"36","align":"","lineHeight":"1","fontWeight":"","splitByGrapheme":false,"width":"","height":""},{"text":"长按识别二维码，查看完整内容","x":"72","y":"1138","color":"#1F2229","size":"36","align":"","lineHeight":"1","fontWeight":"bold","splitByGrapheme":false,"width":"","height":""}],"img":[{"x":"104","y":"780","width":"141","height":"200","src":"{bookshelfImage}","crossOrigin":"anonymous"}],"jsonList":[{"json":"{\"type\": \"rect\",\"version\": \"3.6.6\",\"originX\": \"left\",\"originY\": \"top\",\"left\": 72,\"top\": 748,\"width\": 936,\"height\": 264,\"fill\": \"#fff\",\"stroke\": null,\"strokeWidth\": 1,\"strokeDashArray\": null,\"strokeLineCap\": \"butt\",\"strokeDashOffset\": 0,\"strokeLineJoin\": \"miter\",\"strokeMiterLimit\": 4,\"scaleX\": 1,\"scaleY\": 1,\"angle\": 0,\"flipX\": false,\"flipY\": false,\"opacity\": 1,\"shadow\": null,\"visible\": true,\"clipTo\": null,\"backgroundColor\": \"\",\"fillRule\": \"nonzero\",\"paintFirst\": \"fill\",\"globalCompositeOperation\": \"source-over\",\"transformMatrix\": null,\"skewX\": 0,\"skewY\": 0,\"rx\": 16,\"ry\": 16}","moveTo":"0"},{"json":"{\"type\": \"rect\",\"version\": \"3.6.6\",\"originX\": \"left\",\"originY\": \"top\",\"left\": 828,\"top\": 1066,\"width\": 180,\"height\": 180,\"fill\": \"#fff\",\"stroke\": null,\"strokeWidth\": 1,\"strokeDashArray\": null,\"strokeLineCap\": \"butt\",\"strokeDashOffset\": 0,\"strokeLineJoin\": \"miter\",\"strokeMiterLimit\": 4,\"scaleX\": 1,\"scaleY\": 1,\"angle\": 0,\"flipX\": false,\"flipY\": false,\"opacity\": 1,\"shadow\": null,\"visible\": true,\"clipTo\": null,\"backgroundColor\": \"\",\"fillRule\": \"nonzero\",\"paintFirst\": \"fill\",\"globalCompositeOperation\": \"source-over\",\"transformMatrix\": null,\"skewX\": 0,\"skewY\": 0,\"rx\": 16,\"ry\": 16}","moveTo":"0"},{"json":"{\"type\": \"triangle\",\"version\": \"5.3.0\",\"originX\": \"left\",\"originY\": \"top\",\"left\": 179,\"top\": 732,\"width\": 35,\"height\": 18,\"fill\": \"#fff\",\"stroke\": null,\"strokeWidth\": 1,\"strokeDashArray\": null,\"strokeLineCap\": \"butt\",\"strokeDashOffset\": 0,\"strokeLineJoin\": \"miter\",\"strokeUniform\": false,\"strokeMiterLimit\": 4,\"scaleX\": 1,\"scaleY\": 1,\"angle\": 0,\"flipX\": false,\"flipY\": false,\"opacity\": 1,\"shadow\": null,\"visible\": true,\"backgroundColor\": \"\",\"fillRule\": \"nonzero\",\"paintFirst\": \"fill\",\"globalCompositeOperation\": \"source-over\",\"skewX\": 0,\"skewY\": 0}","moveTo":"0"},{"json":"{\"type\": \"triangle\",\"version\": \"5.3.0\",\"originX\": \"left\",\"originY\": \"top\",\"left\": 612,\"top\": 1150,\"width\": 21,\"height\": 16,\"fill\": \"#1F2229\",\"stroke\": null,\"strokeWidth\": 1,\"strokeDashArray\": null,\"strokeLineCap\": \"butt\",\"strokeDashOffset\": 0,\"strokeLineJoin\": \"miter\",\"strokeUniform\": false,\"strokeMiterLimit\": 4,\"scaleX\": 1,\"scaleY\": 1,\"angle\": 90,\"flipX\": false,\"flipY\": false,\"opacity\": 1,\"shadow\": null,\"visible\": true,\"backgroundColor\": \"\",\"fillRule\": \"nonzero\",\"paintFirst\": \"fill\",\"globalCompositeOperation\": \"source-over\",\"skewX\": 0,\"skewY\": 0}","moveTo":"0"},{"json":"{\"type\": \"triangle\",\"version\": \"5.3.0\",\"originX\": \"left\",\"originY\": \"top\",\"left\": 639,\"top\": 1150,\"width\": 21,\"height\": 16,\"fill\": \"#1F2229\",\"stroke\": null,\"strokeWidth\": 1,\"strokeDashArray\": null,\"strokeLineCap\": \"butt\",\"strokeDashOffset\": 0,\"strokeLineJoin\": \"miter\",\"strokeUniform\": false,\"strokeMiterLimit\": 4,\"scaleX\": 1,\"scaleY\": 1,\"angle\": 90,\"flipX\": false,\"flipY\": false,\"opacity\": 1,\"shadow\": null,\"visible\": true,\"backgroundColor\": \"\",\"fillRule\": \"nonzero\",\"paintFirst\": \"fill\",\"globalCompositeOperation\": \"source-over\",\"skewX\": 0,\"skewY\": 0}","moveTo":"0"},{"json":"{\"type\": \"triangle\",\"version\": \"5.3.0\",\"originX\": \"left\",\"originY\": \"top\",\"left\": 666,\"top\": 1150,\"width\": 21,\"height\": 16,\"fill\": \"#1F2229\",\"stroke\": null,\"strokeWidth\": 1,\"strokeDashArray\": null,\"strokeLineCap\": \"butt\",\"strokeDashOffset\": 0,\"strokeLineJoin\": \"miter\",\"strokeUniform\": false,\"strokeMiterLimit\": 4,\"scaleX\": 1,\"scaleY\": 1,\"angle\": 90,\"flipX\": false,\"flipY\": false,\"opacity\": 1,\"shadow\": null,\"visible\": true,\"backgroundColor\": \"\",\"fillRule\": \"nonzero\",\"paintFirst\": \"fill\",\"globalCompositeOperation\": \"source-over\",\"skewX\": 0,\"skewY\": 0}","moveTo":"0"}],"mode":"new"}'
      // '{"background":"http://ke-dev2.wzhxlx.com/ceping/2024/pictures/e9733647bf464d3c82cfb983fc7674c5.png","canvasTextBaseline":"hanging","avatarPosition":"0,0,0","nickNamePosition":"9999,0,#000000","qrCodePosition":"0,0,0","text":[{"text":"{graduationName}","x":0,"y":"490","color":"#000","size":"40","align":"center","lineHeight":"1","fontWeight":"","splitByGrapheme":true,"width":"1619","height":""}],"img":[],"jsonList":[],"mode":"new"}'
      // '{"background":"http://ke-test.wzhxlx.com/ceping/2024/pictures/9e38800f2d094d77bbb7abfea765af5c.png","canvasTextBaseline":"alphabetic","avatarPosition":"72,90,126","nickNamePosition":"2000,2000,#333","qrCodePosition":"842,1080,152","text":[{"text":"{nickname}","x":"228","y":"104","color":"#1F2229","size":"40","align":"right","lineHeight":"1","fontWeight":"bold","splitByGrapheme":false,"width":"0","height":""},{"text":"{posterAction}","x":"228","y":"162","color":"#656A73","size":"34","align":"","lineHeight":"1","fontWeight":"","splitByGrapheme":false,"width":"","height":""},{"text":"{textAuthor}：","x":"72","y":"266","color":"#1F2229","size":"44","align":"","lineHeight":"1.9","fontWeight":"bold","splitByGrapheme":false,"width":"","height":""},{"text":"{text}","x":"72","y":"350","color":"#1F2229","size":"44","align":"","lineHeight":"1.9","fontWeight":"","splitByGrapheme":true,"width":"936","height":"336"},{"text":"《{courseName}》","x":"256","y":"825","color":"#1F2229","size":"40","align":"","lineHeight":"1","fontWeight":"bold","splitByGrapheme":false,"width":"","height":""},{"text":"{periodName}","x":"277","y":"899","color":"#656A73","size":"36","align":"","lineHeight":"1","fontWeight":"","splitByGrapheme":false,"width":"","height":""},{"text":"长按识别二维码，查看完整内容","x":"72","y":"1138","color":"#1F2229","size":"36","align":"","lineHeight":"1","fontWeight":"bold","splitByGrapheme":false,"width":"","height":""}],"img":[{"x":"104","y":"780","width":"141","height":"200","src":"{bookshelfImage}","crossOrigin":"anonymous"}],"jsonList":[{"json":"{\"type\": \"rect\",\"version\": \"3.6.6\",\"originX\": \"left\",\"originY\": \"top\",\"left\": 72,\"top\": 748,\"width\": 936,\"height\": 264,\"fill\": \"#fff\",\"stroke\": null,\"strokeWidth\": 1,\"strokeDashArray\": null,\"strokeLineCap\": \"butt\",\"strokeDashOffset\": 0,\"strokeLineJoin\": \"miter\",\"strokeMiterLimit\": 4,\"scaleX\": 1,\"scaleY\": 1,\"angle\": 0,\"flipX\": false,\"flipY\": false,\"opacity\": 1,\"shadow\": null,\"visible\": true,\"clipTo\": null,\"backgroundColor\": \"\",\"fillRule\": \"nonzero\",\"paintFirst\": \"fill\",\"globalCompositeOperation\": \"source-over\",\"transformMatrix\": null,\"skewX\": 0,\"skewY\": 0,\"rx\": 16,\"ry\": 16}","moveTo":"0"},{"json":"{\"type\": \"rect\",\"version\": \"3.6.6\",\"originX\": \"left\",\"originY\": \"top\",\"left\": 828,\"top\": 1066,\"width\": 180,\"height\": 180,\"fill\": \"#fff\",\"stroke\": null,\"strokeWidth\": 1,\"strokeDashArray\": null,\"strokeLineCap\": \"butt\",\"strokeDashOffset\": 0,\"strokeLineJoin\": \"miter\",\"strokeMiterLimit\": 4,\"scaleX\": 1,\"scaleY\": 1,\"angle\": 0,\"flipX\": false,\"flipY\": false,\"opacity\": 1,\"shadow\": null,\"visible\": true,\"clipTo\": null,\"backgroundColor\": \"\",\"fillRule\": \"nonzero\",\"paintFirst\": \"fill\",\"globalCompositeOperation\": \"source-over\",\"transformMatrix\": null,\"skewX\": 0,\"skewY\": 0,\"rx\": 16,\"ry\": 16}","moveTo":"0"},{"json":"{\"type\": \"triangle\",\"version\": \"5.3.0\",\"originX\": \"left\",\"originY\": \"top\",\"left\": 179,\"top\": 732,\"width\": 35,\"height\": 18,\"fill\": \"#fff\",\"stroke\": null,\"strokeWidth\": 1,\"strokeDashArray\": null,\"strokeLineCap\": \"butt\",\"strokeDashOffset\": 0,\"strokeLineJoin\": \"miter\",\"strokeUniform\": false,\"strokeMiterLimit\": 4,\"scaleX\": 1,\"scaleY\": 1,\"angle\": 0,\"flipX\": false,\"flipY\": false,\"opacity\": 1,\"shadow\": null,\"visible\": true,\"backgroundColor\": \"\",\"fillRule\": \"nonzero\",\"paintFirst\": \"fill\",\"globalCompositeOperation\": \"source-over\",\"skewX\": 0,\"skewY\": 0}","moveTo":"0"},{"json":"{\"type\": \"triangle\",\"version\": \"5.3.0\",\"originX\": \"left\",\"originY\": \"top\",\"left\": 612,\"top\": 1150,\"width\": 21,\"height\": 16,\"fill\": \"#1F2229\",\"stroke\": null,\"strokeWidth\": 1,\"strokeDashArray\": null,\"strokeLineCap\": \"butt\",\"strokeDashOffset\": 0,\"strokeLineJoin\": \"miter\",\"strokeUniform\": false,\"strokeMiterLimit\": 4,\"scaleX\": 1,\"scaleY\": 1,\"angle\": 90,\"flipX\": false,\"flipY\": false,\"opacity\": 1,\"shadow\": null,\"visible\": true,\"backgroundColor\": \"\",\"fillRule\": \"nonzero\",\"paintFirst\": \"fill\",\"globalCompositeOperation\": \"source-over\",\"skewX\": 0,\"skewY\": 0}","moveTo":"0"},{"json":"{\"type\": \"triangle\",\"version\": \"5.3.0\",\"originX\": \"left\",\"originY\": \"top\",\"left\": 639,\"top\": 1150,\"width\": 21,\"height\": 16,\"fill\": \"#1F2229\",\"stroke\": null,\"strokeWidth\": 1,\"strokeDashArray\": null,\"strokeLineCap\": \"butt\",\"strokeDashOffset\": 0,\"strokeLineJoin\": \"miter\",\"strokeUniform\": false,\"strokeMiterLimit\": 4,\"scaleX\": 1,\"scaleY\": 1,\"angle\": 90,\"flipX\": false,\"flipY\": false,\"opacity\": 1,\"shadow\": null,\"visible\": true,\"backgroundColor\": \"\",\"fillRule\": \"nonzero\",\"paintFirst\": \"fill\",\"globalCompositeOperation\": \"source-over\",\"skewX\": 0,\"skewY\": 0}","moveTo":"0"},{"json":"{\"type\": \"triangle\",\"version\": \"5.3.0\",\"originX\": \"left\",\"originY\": \"top\",\"left\": 666,\"top\": 1150,\"width\": 21,\"height\": 16,\"fill\": \"#1F2229\",\"stroke\": null,\"strokeWidth\": 1,\"strokeDashArray\": null,\"strokeLineCap\": \"butt\",\"strokeDashOffset\": 0,\"strokeLineJoin\": \"miter\",\"strokeUniform\": false,\"strokeMiterLimit\": 4,\"scaleX\": 1,\"scaleY\": 1,\"angle\": 90,\"flipX\": false,\"flipY\": false,\"opacity\": 1,\"shadow\": null,\"visible\": true,\"backgroundColor\": \"\",\"fillRule\": \"nonzero\",\"paintFirst\": \"fill\",\"globalCompositeOperation\": \"source-over\",\"skewX\": 0,\"skewY\": 0}","moveTo":"0"}],"mode":"new"}'
      data.courseSharePosterConfig = this.customAttributeForParseModel(
        data.marketConfig.courseSharePosterConfig,
        this.courseSharePosterConfig
      );
      data.courseRelayPosterConfig = this.customAttributeForParseModel(
        data.marketConfig.courseRelayPosterConfig,
        this.courseRelayPosterConfig
      );
      data.courseDiplomaPosterConfig = this.customAttributeForParseModel(
        data.marketConfig.courseDiplomaPosterConfig,
        this.courseDiplomaPosterConfig
      );
      data.courseAfterthoughtPosterConfig = this.customAttributeForParseModel(
        data.marketConfig.courseAfterthoughtPosterConfig,
        this.courseAfterthoughtPosterConfig
      );

      this.convertDataParseModel(data);

      return data;
    },
    formatModel() {
      var data = pick(this, keys(this.modelSchema));
      this.convertDataFormatModel(data);
      checkJson(data, this.modelSchema);

      // pickJsonStringField实现了类似的事情
      this.jsonStringFieldList.forEach((item) => {
        data[item.name] = {};
        item.field.forEach((key) => {
          if (
            [
              'courseSharePosterConfig',
              'courseRelayPosterConfig',
              'courseDiplomaPosterConfig',
              'courseAfterthoughtPosterConfig',
            ].includes(key)
          ) {
            data[item.name][key] = this.customAttributeForFormatModel(data[key]);
          } else {
            data[item.name][key] = data[key];
          }
          delete data[key];
        });
        data[item.name] = JSON.stringify(data[item.name]);
      });

      return data;
    },
    updateCourseSharePoster(target) {
      createCustomAttributeUpdateHandler(this.courseSharePosterConfig)(target);
    },
    updateCourseRelayPoster(target) {
      createCustomAttributeUpdateHandler(this.courseRelayPosterConfig)(target);
    },
    updateCourseDiplomaPoster(target) {
      createCustomAttributeUpdateHandler(this.courseDiplomaPosterConfig)(target);
    },
    updateCourseAfterthoughtPoster(target) {
      createCustomAttributeUpdateHandler(this.courseAfterthoughtPosterConfig)(target);
    },
  },
};
</script>
