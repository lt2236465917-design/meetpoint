import type { City } from "@/types/domain";

export const CITIES: City[] = [
  { code: "beijing", name: "北京", province: "北京", lat: 39.9042, lng: 116.4074, isMunicipality: true, isAirportHub: true, isRailHub: true },
  { code: "shanghai", name: "上海", province: "上海", lat: 31.2304, lng: 121.4737, isMunicipality: true, isAirportHub: true, isRailHub: true },
  { code: "guangzhou", name: "广州", province: "广东", lat: 23.1291, lng: 113.2644, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "shenzhen", name: "深圳", province: "广东", lat: 22.5431, lng: 114.0579, isAirportHub: true, isRailHub: true },
  { code: "wuhan", name: "武汉", province: "湖北", lat: 30.5928, lng: 114.3055, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "changsha", name: "长沙", province: "湖南", lat: 28.2282, lng: 112.9388, isProvincialCapital: true, isRailHub: true },
  { code: "hangzhou", name: "杭州", province: "浙江", lat: 30.2741, lng: 120.1551, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "nanjing", name: "南京", province: "江苏", lat: 32.0603, lng: 118.7969, isProvincialCapital: true, isRailHub: true },
  { code: "zhengzhou", name: "郑州", province: "河南", lat: 34.7466, lng: 113.6254, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "xian", name: "西安", province: "陕西", lat: 34.3416, lng: 108.9398, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "chengdu", name: "成都", province: "四川", lat: 30.5728, lng: 104.0668, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "chongqing", name: "重庆", province: "重庆", lat: 29.563, lng: 106.5516, isMunicipality: true, isAirportHub: true, isRailHub: true },
];

export function findCityByCode(code: string): City | undefined {
  return CITIES.find((city) => city.code === code);
}

export function searchLocalCities(query: string): City[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return CITIES.filter((city) => {
    return city.code.includes(normalized) || city.name.includes(query.trim());
  }).slice(0, 8);
}
