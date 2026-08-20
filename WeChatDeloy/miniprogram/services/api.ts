// WeChatDeloy/miniprogram/services/api.ts
const app = getApp<{ globalData: { cloudEnvId: string; cloudServiceName: string } }>();

export interface Dish {
  id: number;
  name: string;
  category: string;
  is_active: number;
  sort_order: number;
  created_at?: string;
}

export interface MealPlan {
  date: string;
  dish_ids: number[];
  note: string | null;
  updated_at: string;
  updated_by: string | null;
}

export class ApiException extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message?: string) {
    super(message || code);
    this.code = code;
    this.statusCode = statusCode;
  }
}

interface CallInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  data?: unknown;
  header?: Record<string, string>;
}

async function call<T>(path: string, init: CallInit = {}): Promise<T> {
  const res = (await wx.cloud.callContainer({
    config: { env: app.globalData.cloudEnvId },
    path,
    service: app.globalData.cloudServiceName,
    method: init.method || 'GET',
    header: { 'content-type': 'application/json', ...(init.header || {}) },
    data: init.data,
  } as any)) as { statusCode: number; data: any };
  if (res.statusCode >= 200 && res.statusCode < 300) {
    return res.data as T;
  }
  const code = (res.data && res.data.error) || `http_${res.statusCode}`;
  throw new ApiException(code, res.statusCode);
}

export const api = {
  listDishes: (includeInactive = false): Promise<Dish[]> =>
    call<Dish[]>(`/api/v1/dishes${includeInactive ? '?includeInactive=true' : ''}`),

  createDish: (body: { name: string; category: string }): Promise<Dish> =>
    call<Dish>('/api/v1/dishes', { method: 'POST', data: body }),

  updateDish: (
    id: number,
    body: Partial<{ name: string; category: string; is_active: boolean; sort_order: number }>
  ): Promise<Dish> => call<Dish>(`/api/v1/dishes/${id}`, { method: 'PATCH', data: body }),

  deleteDish: (id: number): Promise<{ ok: true }> =>
    call<{ ok: true }>(`/api/v1/dishes/${id}`, { method: 'DELETE' }),

  getMealPlan: (date: string): Promise<MealPlan | null> =>
    call<MealPlan | null>(`/api/v1/meal-plans?date=${date}`),

  putMealPlan: (body: { date: string; dish_ids: number[]; note?: string }): Promise<MealPlan> =>
    call<MealPlan>('/api/v1/meal-plans', { method: 'PUT', data: body }),
};