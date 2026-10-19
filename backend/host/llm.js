'use strict';
/* 大模型的一次性调用 —— 换成你自己的。只在「冷场半小时自己收」时用：
   ask(prompt, opts) → Promise<string>
     prompt 里是这一晚的记录，要它用一两句话收掉。不需要工具，不需要历史。
     用你自己的 API 就行（Claude / OpenAI 兼容的都可以），回纯文本。 */
module.exports = {
  ask: async () => { throw new Error('host/llm.js 还没接：见 README「接到你自己的 AI 上」'); },
};
