export interface Dish {
  id: number;
  name: string;
  category: string;
  is_active: number;
  sort_order: number;
  created_at?: string;
}

export function activeOnly(dishes: Dish[]): Dish[] {
  return dishes.filter((d) => d.is_active === 1);
}

export function sortDishes(dishes: Dish[]): Dish[] {
  return [...dishes].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id - b.id;
  });
}

export function groupByCategory(dishes: Dish[]): Dish[] {
  return sortDishes(dishes);
}