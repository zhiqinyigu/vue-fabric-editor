import Vue from 'vue';
import { extend } from 'Utils';
import UploadImgBox from '@@widgets/upload-img-box.vue';
import ColorSelect from '@@widgets/form-control/color-select';
import SmartEditor from '@@widgets/smart-editor';

const CFormItem = Vue.component('c-form-item');
const ElInput = Vue.component('ElInput');
const ElSwitch = Vue.component('ElSwitch');
const ElDatePicker = Vue.component('ElDatePicker');

export const CustomAttributeControlList = Vue.extend({
  props: {
    source: null,
  },

  created() {
    this.change = this.change.bind(this);
  },

  methods: {
    change(item, value) {
      this.$set(item, 'value', value);
      item.onInput && item.onInput(value);
      // this.$emit('change', {prop, value});
    },
  },

  render(h) {
    const { isDetail, change, source } = this;

    function renderItem(item, type, inputHandler) {
      const uploadConfig = item.uploadParams || { businessName: 'ceping', cdnVisit: 1 };
      const directives = item.validate ? [{ name: 'validate', value: item.validate }] : [];
      const controlParams = item.controlParams || {};
      const controlAttrs = item.controlAttrs || {};
      const disabled = item.disabled;

      switch (type) {
        case 'input':
        case 'text':
        case 'number':
        case 'textarea':
          return isDetail ? (
            <span>{item.value}</span>
          ) : (
            <ElInput
              value={item.value}
              placeholder={item.placeholder}
              disabled={disabled}
              onInput={inputHandler}
              {...{ directives, props: controlParams, attrs: controlAttrs }}
              type={type === 'input' ? '' : type}
              rows={8}
              style={item.style}
            />
          );

        case 'datetimerange':
          return (
            <ElDatePicker
              format="yyyy-MM-dd HH:mm:ss"
              value={item.value}
              onInput={inputHandler}
              type="datetimerange"
              default-time={['00:00:00', '23:59:59']}
              {...{ directives, props: controlParams, attrs: controlAttrs }}
              start-placeholder="选择时间范围"
              end-placeholder="选择时间范围"
            />
          );

        case 'rich-text':
          return (
            <SmartEditor
              value={item.value}
              onInput={inputHandler}
              disabled={disabled}
              {...{ directives, props: controlParams, attrs: controlAttrs }}
              style={item.style}
              editor="tinymceEditor"
              params={uploadConfig}
              data-ctrl-selector=".smart-editor"
            />
          );

        case 'switch':
          return (
            <ElSwitch
              {...{ directives, props: controlParams, attrs: controlAttrs }}
              value={item.value}
              disabled={disabled}
              onInput={inputHandler}
              style={item.style}
            />
          );

        case 'radio':
          return isDetail ? (
            <span>{item.value}</span>
          ) : (
            <el-radio-group
              value={item.value}
              disabled={disabled}
              onInput={inputHandler}
              {...{ directives, props: controlParams, attrs: controlAttrs }}
              style={item.style}
            >
              {item.options.map((_item) => {
                return (
                  <el-radio label={_item.id + ''} key={_item.id}>
                    {_item.name}
                  </el-radio>
                );
              })}
            </el-radio-group>
          );

        case 'img':
          return !isDetail || item.value[0] ? (
            <div class={item.fixedSize ? 'responsive-upload-box-wrap--qr' : ''}>
              <div class={item.fixedSize ? 'responsive-upload-box' : ''}>
                <UploadImgBox
                  params={uploadConfig}
                  value={item.value}
                  onInput={inputHandler}
                  disabled={disabled}
                  is-single
                  maxQuantity={1}
                  readOnly={item.static}
                  {...{ directives, props: controlParams, attrs: controlAttrs }}
                  style={item.style}
                />
              </div>
            </div>
          ) : (
            <span>-</span>
          );

        case 'static-select':
          return (
            <static-select
              value={item.value}
              disabled={disabled}
              onInput={inputHandler}
              style={item.style}
              {...{ directives, props: controlParams, attrs: controlAttrs }}
            />
          );

        case 'color':
          return (
            <ColorSelect
              value={item.value}
              disabled={disabled}
              onInput={inputHandler}
              {...{ directives, props: controlParams, attrs: controlAttrs }}
            />
          );

        default:
          return item.render(h, inputHandler, controlParams, controlAttrs);
      }
    }

    return (
      <div class="custom-attribute-control-list">
        {source.map(function (item) {
          const controlParams = item.controlParams || {};
          const inputHandler = function (e) {
            // change(item, e.target.value);
            change(item, e);
          };

          let itemName = item.name;
          const labelSlot = typeof itemName !== 'string' ? itemName : null;
          itemName = typeof itemName === 'string' ? itemName : '';

          switch (item.type) {
            case 'hidden':
              return <input type="hidden" value={item.value} />;
            case 'custom':
              return item.render(h, inputHandler, CustomAttributeControlList);
            case 'wrapper':
              return (
                <div {...{ attrs: controlParams }}>
                  <CustomAttributeControlList source={item.value} />
                </div>
              );
            case 'customAttributeControlList':
              return <CustomAttributeControlList source={item.value} />;
          }

          const control = renderItem(item, item.type, inputHandler);

          return (
            <CFormItem
              label={itemName}
              readOnly={isDetail}
              align="right"
              size={item.labelSize || 8}
              key={item.field || item.key || itemName}
              tips={item.tips}
              document={item.document}
            >
              {labelSlot ? <div slot="label">{labelSlot}</div> : null}
              {item.renderWrap ? item.renderWrap(h, control, source) : control}
              {item.text ? (
                <div class={item.textClass || 'fz12 color-gray lh1-6'}>{item.text}</div>
              ) : null}
            </CFormItem>
          );
        })}
      </div>
    );
  },
});

export default {
  components: {
    customAttributeControlList: CustomAttributeControlList,
  },

  methods: {
    customAttributeForParseModel(data, customAttribute, jsonParse = true) {
      const vm = this;
      const customAttributeForParseModel = this.customAttributeForParseModel.bind(this);

      // 自定义字段
      const customAttributeSheet = jsonParse ? (data ? JSON.parse(data) : {}) : data;
      return (customAttribute || this.customAttribute).map((attr) => {
        const { field, type } = attr;

        if (!field) return attr;

        const originalVal =
          field === '#'
            ? customAttributeSheet
            : customAttributeSheet
            ? customAttributeSheet[field]
            : customAttributeSheet;

        // 转换值
        let val = type === 'img' ? (originalVal ? [{ src: originalVal }] : []) : originalVal;

        switch (type) {
          case 'wrapper':
            val = vm.customAttributeForParseModel(val, attr.value, false);
            break;
        }

        if (attr.toModel) {
          val = attr.toModel(val, customAttributeForParseModel);
        }

        return Object.assign({}, attr, {
          value: val ? val : attr.value,
        });
      });
    },

    customAttributeForFormatModel(data, stringify = true) {
      const vm = this;
      const customAttributeForFormatModel = this.customAttributeForFormatModel.bind(this);
      const customAttribute = data.slice(0);
      let customAttributeSheet;

      for (var i = customAttribute.length - 1; i >= 0; i--) {
        let item = customAttribute[i];

        if (item.type === 'img') {
          item = extend({}, item);
          item.value = item.value[0] ? item.value[0].src : '';
          customAttribute.splice(i, 1, item);
        }
      }

      // [{name: xx, field: xx, value: xx}, ..]  => {[field1]: value1, [field2]: value2, ...}
      customAttributeSheet = customAttribute.reduce(function (result, item) {
        let key;
        let value = item.value;
        const field = item.field;

        if (typeof field !== 'undefined') {
          switch (item.type) {
            case 'wrapper':
              value = vm.customAttributeForFormatModel(value, false);
              break;
          }

          value = item.toValue ? item.toValue(value, customAttributeForFormatModel) : value;

          if (field === '#') {
            for (key in value) {
              if (Object.prototype.hasOwnProperty.call(value, key)) {
                result[key] = value[key];
              }
            }
          } else {
            result[field] = value;
          }
        }

        return result;
      }, {});

      return stringify ? JSON.stringify(customAttributeSheet) : customAttributeSheet;
    },
  },
};
