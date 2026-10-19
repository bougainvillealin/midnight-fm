'use strict';
/* 记忆 / 事件流 —— 换成你自己的。不接也能跑，只是电台听过的东西不会被记住。

   remember(title, content, category, importance, tags) → Promise
     枕話收台时那一句摘要（原文不进），还有枕話冷场半小时自己收的那一句。

   eventAppend({ source, actor, kind, content, meta })
     故事 / 夜話 / 音樂冷场半小时，收成一两句记进你的时间线。 */
module.exports = {
  remember: async () => ({ ok: false, skipped: 'host/memory.js 还没接' }),
  eventAppend: () => 0,
};
