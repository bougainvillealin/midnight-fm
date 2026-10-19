'use strict';
/* 念字 —— 换成你自己的。
   radio_api 只用这两样：

   synth(text) → Promise<{ hash, via?, skipped? }>
     把一句话念成音频存起来，回一个 hash；页面会去 /api/tts/<hash>.mp3 取（这个地址由你的服务器提供）。
     via：真的用了哪家（落回别家时不写 'ElevenLabs'，电台会换成 MiniMax 的写法重念）。
     念不了就回 { skipped: '原因' }，页面会照样显示字、停一会儿当它念过。

   cfg() → { provider, el_voice_id, el_env_file, el_host, el_port }
     provider 是 'elevenlabs' 且有 el_voice_id 时，电台会把 [whispers] 这种方括号原样送过去；
     不是的话（比如 MiniMax）会先换成 (sighs) 那种写法。el_* 那几个只有生成音效（genSe）时用。 */
module.exports = {
  cfg: () => ({ provider: 'none' }),
  synth: async () => ({ skipped: 'host/tts.js 还没接：见 README「接到你自己的 AI 上」' }),
};
