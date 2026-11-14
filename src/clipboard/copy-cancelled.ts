export class CopyCancelled extends Error { constructor() { super('已取消整段复制。'); this.name = 'CopyCancelled'; } }
