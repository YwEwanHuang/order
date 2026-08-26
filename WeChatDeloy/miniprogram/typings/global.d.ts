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

// 重载：Page 接受 IPageOptions（带泛型便于 data/this 类型推导），this 上下文由接口本身保证
declare function Page<TData = Record<string, unknown>, TCustom = Record<string, unknown>>(
  options: IPageOptions & ThisType<IPageInstance & TCustom & { data: TData }>
): void;

// 重载：App 接受 IAppOptions
declare function App(options: IAppOptions): void;

// 微信小程序事件类型命名空间（运行时由 WechatMiniprogram 提供；这里只声明 spec 用到的子集）
declare namespace WechatMiniprogram {
  interface BaseEvent {
    currentTarget: { dataset: Record<string, unknown> };
    target: { dataset: Record<string, unknown> };
  }
  interface CustomEvent<T = unknown> {
    detail: T;
    currentTarget: { dataset: Record<string, unknown> };
    target: { dataset: Record<string, unknown> };
  }
  type PickerChange = CustomEvent<{ value: string }>;
  type Input = CustomEvent<{ value: string }>;
  type TextareaInput = CustomEvent<{ value: string }>;
  type SwitchChange = CustomEvent<{ value: boolean }>;
}

declare function Component<T = object>(options: T): void;
declare function getApp<T = Record<string, unknown>>(): T;
declare function getCurrentPages(): IPageInstance[];

// wx 全局对象（精简版，覆盖用到的内容）
declare const wx: {
  cloud: {
    init(options: { traceUser?: boolean }): void;
    callContainer(config: object): Promise<unknown>;
    uploadFile(options: {
      cloudPath: string;
      filePath: string;
      success?: (res: { fileID: string }) => void;
      fail?: (err: unknown) => void;
    }): void;
    deleteFile(options: {
      fileList: string[];
      success?: (res: { fileList: Array<{ fileID: string; status: number }> }) => void;
      fail?: (err: unknown) => void;
    }): void;
  };
  showToast(options: { title: string; icon?: string; duration?: number }): void;
  showModal(options: object): Promise<{ confirm: boolean; cancel: boolean }>;
  showLoading(options: { title?: string }): void;
  hideLoading(): void;
  chooseImage(options: { count?: number; sizeType?: string[] }): Promise<{ tempFilePaths: string[] }>;
  chooseMedia(options: {
    count?: number;
    mediaType?: Array<'image' | 'video'>;
    sizeType?: Array<'original' | 'compressed'>;
    sourceType?: Array<'album' | 'camera'>;
    success?: (res: { tempFiles: Array<{ tempFilePath: string; size: number }> }) => void;
    fail?: (err: WechatMiniprogram.GeneralCallbackResult) => void;
  }): void;
  compressImage(options: {
    src: string;
    quality?: number;
    success?: (res: { tempFilePath: string }) => void;
    fail?: (err: WechatMiniprogram.GeneralCallbackResult) => void;
  }): void;
  requestSubscribeMessage(options: { tmplIds: string[]; success?: (res: Record<string, string>) => void; fail?: (err: unknown) => void }): void;
  navigateTo(options: { url: string }): void;
  navigateBack(options?: object): void;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  stopPullDownRefresh(): void;
  setClipboardData(options: {
    data: string;
    success?: () => void;
    fail?: (err: unknown) => void;
  }): void;
  enableAlertBeforeUnload(options: { message: string }): void;
  disableAlertBeforeUnload(): void;
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