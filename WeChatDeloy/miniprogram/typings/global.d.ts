/**
 * 微信小程序全局类型声明
 * 为 TypeScript 编译器提供 wx、Page、App 等全局类型
 * 实际运行时由微信小程序 runtime 提供这些全局变量
 */

/** Page 实例的 this 类型（小程序 runtime 提供） */
interface IPageInstance {
  setData(data: Record<string, unknown>, callback?: () => void): void;
  data: Record<string, unknown>;
  [key: string]: unknown;
}

/** Page 选项对象 */
interface IPageOptions {
  data?: Record<string, unknown>;
  onLoad?(this: any, options?: Record<string, string | undefined>): void;
  onShow?(this: any): void;
  onHide?(this: any): void;
  onUnload?(this: any): void;
  onPullDownRefresh?(this: any): void;
  onReachBottom?(this: any): void;
  [key: string]: unknown;
}

/** App 选项对象 */
interface IAppOptions {
  globalData?: Record<string, unknown>;
  onLaunch?(this: IAppOptions): void;
  onShow?(this: IAppOptions): void;
  onHide?(this: IAppOptions): void;
  [key: string]: unknown;
}

// 重载：Page 接受 IPageOptions，this 上下文由接口本身保证
declare function Page(options: IPageOptions): void;

// 重载：App 接受 IAppOptions
declare function App(options: IAppOptions): void;

declare function Component<T = object>(options: T): void;
declare function getApp<T = Record<string, unknown>>(): T;
declare function getCurrentPages(): IPageInstance[];

// wx 全局对象（精简版，覆盖用到的内容）
declare const wx: {
  cloud: {
    init(options: { traceUser?: boolean }): void;
    callContainer(config: object): Promise<unknown>;
    uploadFile(options: object): Promise<{ fileID: string }>;
  };
  showToast(options: { title: string; icon?: string; duration?: number }): void;
  showModal(options: object): Promise<{ confirm: boolean; cancel: boolean }>;
  showLoading(options: { title?: string }): void;
  hideLoading(): void;
  chooseImage(options: { count?: number; sizeType?: string[] }): Promise<{ tempFilePaths: string[] }>;
  requestSubscribeMessage(options: { tmplIds: string[]; success?: (res: Record<string, string>) => void; fail?: (err: unknown) => void }): void;
  navigateTo(options: { url: string }): void;
  navigateBack(options?: object): void;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  [key: string]: unknown;
};

// 标准全局对象
declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
};

declare function setTimeout(callback: (...args: unknown[]) => void, ms?: number): number;
declare function clearTimeout(id?: number): void;
declare function setInterval(callback: (...args: unknown[]) => void, ms?: number): number;
declare function clearInterval(id?: number): void;

declare const require: (id: string) => unknown;
declare const module: { exports: unknown };
declare const exports: unknown;