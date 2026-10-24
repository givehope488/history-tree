/**
 * Liveblocks 全局类型声明。
 * Presence 是「每个人自己的临时状态」，不进共享文档、刷新即消失，
 * 用来显示「谁在线、谁正在编辑哪个节点」。
 */
declare global {
  interface Liveblocks {
    Presence: {
      /** 昵称：首次进入时填一次，之后记在浏览器里 */
      nickname: string | null;
      /** 头像底色，进房间时随机分配，用来区分不同的人 */
      color: string;
      /** 正在编辑哪个事件节点；null 表示没在编辑 */
      editingEventId: string | null;
    };
  }
}

export {};
