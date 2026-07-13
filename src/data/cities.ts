import type { City } from "@/types/domain";

export const CITIES: City[] = [
  { code: "beijing", name: "北京", province: "北京", lat: 39.9042, lng: 116.4074, isMunicipality: true, isAirportHub: true, isRailHub: true },
  { code: "tianjin", name: "天津", province: "天津", lat: 39.3434, lng: 117.3616, isMunicipality: true, isAirportHub: true, isRailHub: true },
  { code: "shanghai", name: "上海", province: "上海", lat: 31.2304, lng: 121.4737, isMunicipality: true, isAirportHub: true, isRailHub: true },
  { code: "guangzhou", name: "广州", province: "广东", lat: 23.1291, lng: 113.2644, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "shenzhen", name: "深圳", province: "广东", lat: 22.5431, lng: 114.0579, isAirportHub: true, isRailHub: true },
  { code: "foshan", name: "佛山", province: "广东", lat: 23.0218, lng: 113.1214, isRailHub: true },
  { code: "dongguan", name: "东莞", province: "广东", lat: 23.0207, lng: 113.7518, isRailHub: true },
  { code: "wuhan", name: "武汉", province: "湖北", lat: 30.5928, lng: 114.3055, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "changsha", name: "长沙", province: "湖南", lat: 28.2282, lng: 112.9388, isProvincialCapital: true, isRailHub: true },
  { code: "hangzhou", name: "杭州", province: "浙江", lat: 30.2741, lng: 120.1551, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "ningbo", name: "宁波", province: "浙江", lat: 29.8683, lng: 121.544, isAirportHub: true, isRailHub: true },
  { code: "nanjing", name: "南京", province: "江苏", lat: 32.0603, lng: 118.7969, isProvincialCapital: true, isRailHub: true },
  { code: "suzhou", name: "苏州", province: "江苏", lat: 31.2989, lng: 120.5853, isRailHub: true },
  { code: "wuxi", name: "无锡", province: "江苏", lat: 31.4912, lng: 120.3119, isRailHub: true },
  { code: "qingdao", name: "青岛", province: "山东", lat: 36.0671, lng: 120.3826, isAirportHub: true, isRailHub: true },
  { code: "jinan", name: "济南", province: "山东", lat: 36.6512, lng: 117.1201, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "zhengzhou", name: "郑州", province: "河南", lat: 34.7466, lng: 113.6254, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "xian", name: "西安", province: "陕西", lat: 34.3416, lng: 108.9398, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "chengdu", name: "成都", province: "四川", lat: 30.5728, lng: 104.0668, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "chongqing", name: "重庆", province: "重庆", lat: 29.563, lng: 106.5516, isMunicipality: true, isAirportHub: true, isRailHub: true },
  { code: "xiamen", name: "厦门", province: "福建", lat: 24.4798, lng: 118.0894, isAirportHub: true, isRailHub: true },
  { code: "fuzhou", name: "福州", province: "福建", lat: 26.0745, lng: 119.2965, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "kunming", name: "昆明", province: "云南", lat: 25.0389, lng: 102.7183, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "hefei", name: "合肥", province: "安徽", lat: 31.8206, lng: 117.2272, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
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
