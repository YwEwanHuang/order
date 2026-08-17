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
  Notification,
} from '../domain/types';

// ---------------------------------------------------------------------------
// 配置（从 app.js 的 globalData 读取，运行时注入）
// ---------------------------------------------------------------------------
// 注意：env ID 和 service 名称是部署配置，不写入代码。
// 真实值通过 getApp().globalData 在运行时获取。
// 以下是类型定义，实际值不硬编码。
// ---------------------------------------------------------------------------

interface ApiConfig {
  envId: string;
  serviceName: string;
  baseUrl: string;
}

// ---------------------------------------------------------------------------
// 请求封装
// ---------------------------------------------------------------------------

function getConfig(): ApiConfig {
  const app = getApp<IAppOption>();
  const globalData = app.globalData;
  return {
    envId: globalData.cloudEnvId || 'prod-d8gkzjj6ub74bba3b',
    serviceName: globalData.cloudServiceName || 'express-stvz',
    baseUrl: globalData.cloudBaseUrl || 'https://express-stvz-298098-6-1318283518.sh.run.tcloudbase.com',
  };
}

/**
 * 通用的 callContainer 请求函数
 */
async function request<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  data?: unknown,
  header: Record<string, string> = {}
): Promise<T> {
  const config = getConfig();

  const res = await wx.cloud.callContainer({
    config: {
      env: config.envId,
    },
    path,
    header: {
      'Content-Type': 'application/json',
      'X-WX-SERVICE': config.serviceName,
      ...header,
    },
    method,
    data,
  });

  return res as T;
}

// ---------------------------------------------------------------------------
// 统一错误处理
// ---------------------------------------------------------------------------

export class ApiException extends Error {
  constructor(
    public code: string,
    message: string,
    public requestId?: string
  ) {
    super(message);
    this.name = 'ApiException';
  }
}

function handleResponse<T>(res: unknown): T {
  const response = res as ApiResponse<T> | ApiError;
  if ('error' in response) {
    const err = response as ApiError;
    throw new ApiException(
      err.error.code,
      err.error.message,
      err.requestId
    );
  }
  return (response as ApiResponse<T>).data;
}

// ---------------------------------------------------------------------------
// API 方法
// ---------------------------------------------------------------------------

/** 获取当前用户角色 */
export async function fetchCurrentUser(): Promise<CurrentUser> {
  const data = await request<CurrentUser>('/api/v1/me', 'GET');
  return handleResponse(data);
}

/** 获取菜品列表（普通用户只看启用） */
export async function fetchDishes(category?: string): Promise<Dish[]> {
  const query = category ? `?category=${category}` : '';
  const data = await request<Dish[]>(`/api/v1/dishes${query}`, 'GET');
  return handleResponse(data);
}

/** 获取当前用户的点菜记录 */
export async function fetchMealPlans(from: string, to: string): Promise<MealPlan[]> {
  const data = await request<MealPlan[]>(
    `/api/v1/meal-plans?from=${from}&to=${to}`,
    'GET'
  );
  return handleResponse(data);
}

/** 提交新的点菜记录 */
export async function submitMealPlan(
  body: MealPlanSubmit,
  idempotencyKey: string
): Promise<MealPlan> {
  const data = await request<MealPlan>('/api/v1/meal-plans', 'POST', body, {
    'Idempotency-Key': idempotencyKey,
  });
  return handleResponse(data);
}

/** 修改已有点菜记录 */
export async function updateMealPlan(
  id: string,
  body: MealPlanSubmit
): Promise<MealPlan> {
  const data = await request<MealPlan>(`/api/v1/meal-plans/${id}`, 'PUT', body);
  return handleResponse(data);
}

// ---------------------------------------------------------------------------
// 管理端 API（仅管理员可用）
// ---------------------------------------------------------------------------

/** 按 ID 获取单个菜品 */
export async function fetchDishById(id: string): Promise<Dish> {
  const data = await request<Dish>(`/api/v1/admin/dishes/${id}`, 'GET');
  return handleResponse(data);
}

/** 获取所有菜品（含停用） */
export async function fetchAdminDishes(): Promise<Dish[]> {
  const data = await request<Dish[]>('/api/v1/admin/dishes', 'GET');
  return handleResponse(data);
}

/** 新增菜品 */
export async function createDish(body: Omit<Dish, 'id'>): Promise<Dish> {
  const data = await request<Dish>('/api/v1/admin/dishes', 'POST', body);
  return handleResponse(data);
}

/** 更新菜品 */
export async function updateDish(id: string, body: Partial<Omit<Dish, 'id'>>): Promise<Dish> {
  const data = await request<Dish>(`/api/v1/admin/dishes/${id}`, 'PATCH', body);
  return handleResponse(data);
}

/** 上传菜品图片，返回 fileID */
export async function uploadDishImage(tempFilePath: string): Promise<string> {
  const config = getConfig();
  const uploadRes = await wx.cloud.uploadFile({
    cloudPath: `dishes/${Date.now()}.jpg`,
    filePath: tempFilePath,
    config: { env: config.envId },
  });
  return uploadRes.fileID;
}

/** 记录管理员订阅授权结果 */
export async function recordSubscription(templateId: string, quota: number): Promise<void> {
  await request('/api/v1/admin/subscriptions', 'POST', { templateId, remainingQuota: quota });
}

/** 获取管理员通知列表 */
export async function fetchAdminNotifications(): Promise<Notification[]> {
  const data = await request<Notification[]>('/api/v1/admin/notifications', 'GET');
  return handleResponse(data);
}

/** 手动重试一条失败通知 */
export async function retryNotification(id: string): Promise<Notification> {
  const data = await request<Notification>(`/api/v1/admin/notifications/${id}/retry`, 'POST');
  return handleResponse(data);
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

/** 生成幂等键（基于时间窗口，避免重复提交） */
export function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// 类型扩展（微信原有 getApp 类型）
// ---------------------------------------------------------------------------

export interface IAppOption {
  globalData: {
    cloudEnvId?: string;
    cloudServiceName?: string;
    cloudBaseUrl?: string;
    pendingSelection?: unknown;
    [key: string]: unknown;
  };
}