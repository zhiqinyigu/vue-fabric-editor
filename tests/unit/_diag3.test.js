import { fabric } from 'fabric';
import '../../src/core/objects/CustomTextbox';

// 诊断输出已关闭（需要时取消注释下面的日志）
function show(_label, _tb) {
  // const lines = _tb._textLines.map((l) => l.join('')).join(' | ');
  // console.log(
  //   `${_label} frameH=${_tb.frameHeight} h=${_tb.height} w=${_tb.width} lh=${_tb
  //     .getHeightOfLine(0)
  //     .toFixed(2)} => ${lines}`
  // );
}

it('diag: sequential drag 1.5 -> <1 line on SAME textbox', () => {
  const text = 'aab cc dd eeeeeeeeeee fg hh';
  const tb = new fabric.Textbox(text, { width: 100, fontSize: 20 });
  tb.set({ clipEnabled: true, ellipsisEnabled: true });
  tb.syncFrame();
  show('init', tb);
  tb.setFrameHeight(39); // 1.5 行
  show('1.5行', tb);
  tb.setFrameHeight(20); // < 1 行
  show('<1行', tb);
  tb.setFrameHeight(15);
  show('<1行x2', tb);
});

it('diag: corner drag small box (width also small)', () => {
  const text = 'aab cc dd eeeeeeeeeee fg hh';
  const tb = new fabric.Textbox(text, { width: 100, fontSize: 20 });
  tb.set({ clipEnabled: true, ellipsisEnabled: true });
  tb.syncFrame();
  tb.setFrameHeight(20);
  tb.set({ width: 25 });
  tb.initDimensions();
  show('w25', tb);
});
