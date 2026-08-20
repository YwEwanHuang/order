/**
 * callContainer API 封装
 * 所有对云托管 Express API 的调用都通过这里
 */

import type {
  ApiResponse,
  ApiError,
  Dish,
  MealPlan,
  MealPlanSubmit,
  CurrentUser,
} from '../domain/types';

// ---------------------------------------------------------------------------
// 配置（从 app.ts 的 globalData 读取，运行时注入）
// envId / serviceName 由部署侧注入；客户端代码不含真实值。
// ---------------------------------------------------------------------------

interface ApiConfig {
  envId: string;
  serviceName: string;
}

function getConfig(): ApiConfig {
  const app = getApp<IAppOption>();
  const globalData = app.globalData;
  return {
    envId: globalData.cloudEnvId || '',
    serviceName: globalData.cloudServiceName || '',
  };
}

/**
 * 通用 callContainer 请求函数
 */
async function request<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  data?: unknown
): Promise<T> {
  const config = getConfig();
  const res = (await wx.cloud.callContainer({
    config: { env: config.envId },
    path,
    header: {
      'Content-Type': 'application/json',
      'X-WX-SERVICE': config.serviceName,
    },
    method,
    data,
  })) as { data: T };
  return res.data;
}

// ---------------------------------------------------------------------------
// 统一错误处理
// ---------------------------------------------------------------------------

export class ApiException extends Error {
  constructor(public code: string, message: string, public requestId?: string) {
    super(message);
    this.name = 'ApiException';
  }
}

function unwrap<T>(res: ApiResponse<T> | ApiError): T {
  if ('error' in res) {
    throw new ApiException(res.error.code, res.error.message, res.requestId);
  }
  return res.data;
}

// ---------------------------------------------------------------------------
// 用户 / 菜品
// ---------------------------------------------------------------------------

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const data = await request<ApiResponse<CurrentUser>>('/api/v1/me', 'GET');
  return unwrap(data);
}

export async function fetchDishes(category?: string): Promise<Dish[]> {
  const query = category ? `?category=${category}` : '';
  const data = await request<ApiResponse<Dish[]>>(`/api/v1/dishes${query}`, 'GET');
  return unwrap(data);
}

export async function submitMealPlan(body: MealPlanSubmit): Promise<MealPlan> {
  const data = await request<ApiResponse<MealPlan>>('/api/v1/meal-plans', 'POST', body);
  return unwrap(data);
}

export async function fetchMealPlans(from: string, to: string): Promise<MealPlan[]> {
  const data = await request<ApiResponse<MealPlan[]>>(
    `/api/v1/meal-plans?from=${from}&to=${to}`,
    'GET'
  );
  return unwrap(data);
}

// ---------------------------------------------------------------------------
// 管理端 API
// ---------------------------------------------------------------------------

export async function fetchDishById(id: string): Promise<Dish> {
  const data = await request<ApiResponse<Dish>>(`/api/v1/admin/dishes/${id}`, 'GET');
  return unwrap(data);
}

export async function fetchAdminDishes(): Promise<Dish[]> {
  const data = await request<ApiResponse<Dish[]>>('/api/v1/admin/dishes', 'GET');
  return unwrap(data);
}

export async function createDish(body: Omit<Dish, 'id'>): Promise<Dish> {
  const data = await request<ApiResponse<Dish>>('/api/v1/admin/dishes', 'POST', body);
  return unwrap(data);
}

export async function updateDish(id: string, body: Partial<Omit<Dish, 'id'>>): Promise<Dish> {
  const data = await request<ApiResponse<Dish>>(`/api/v1/admin/dishes/${id}`, 'PATCH', body);
  return unwrap(data);
}

/** 点菜看板：管理员视角按日期范围查看所有点菜记录 */
export async function fetchAdminMealPlans(from?: string, to?: string): Promise<MealPlan[]> {
  const parts: string[] = [];
  if (from) parts.push(`from=${from}`);
  if (to) parts.push(`to=${to}`);
  const qs = parts.length ? `?${parts.join('&')}` : '';
  const data = await request<ApiResponse<MealPlan[]>>(`/api/v1/admin/meal-plans${qs}`, 'GET');
  return unwrap(data);
}

/** 上传菜品图片，返回 cloud:// fileID */
export async function uploadDishImage(tempFilePath: string): Promise<string> {
  const config = getConfig();
  const uploadRes = await wx.cloud.uploadFile({
    cloudPath: `dishes/${Date.now()}.jpg`,
    filePath: tempFilePath,
    config: { env: config.envId },
  });
  return uploadRes.fileID;
}

// ---------------------------------------------------------------------------
// 全局类型扩展（微信 getApp）
// ---------------------------------------------------------------------------

export interface IAppOption {
  globalData: {
    cloudEnvId?: string;
    cloudServiceName?: string;
    pendingSelection?: unknown;
    [key: string]: unknown;
  };
}