/**
 * 用户分组权限（纯函数，可单元测试）
 *
 * - A 组：可访问全部「已启用」的资源站（含站长自行添加的自定义源）
 * - B 组：只能访问站长指定的资源站（GroupBSourceKeys）
 * - 站长恒为 A 组；老用户（无 group 字段）按 A 组处理，升级后不会突然失去权限
 * - 被后台禁用的资源站，对所有分组都不可用（全局开关优先）
 * - 未启用分组配置（GroupConfig 为空）时，B 组暂时等同可访问全部已启用资源站
 * - 本地存储模式（无账户体系）不分组，全部可用
 */
import type { AdminConfig, UserGroup } from './admin.types';

export const DEFAULT_REGISTER_GROUP: UserGroup = 'B';

export interface SiteLike {
  key: string;
  name: string;
  api: string;
  detail?: string;
}

export function isUserGroup(v: unknown): v is UserGroup {
  return v === 'A' || v === 'B';
}

/** 新注册用户应得到的分组 */
export function getDefaultRegisterGroup(config: AdminConfig): UserGroup {
  const g = config.GroupConfig?.DefaultRegisterGroup;
  return isUserGroup(g) ? g : DEFAULT_REGISTER_GROUP;
}

/**
 * 在 DB 中存在、但配置里还没有条目的用户（多为刚注册或升级前的老用户）应得到的分组：
 * - 已启用分组配置：按默认注册分组
 * - 尚未启用分组配置：A 组（保证升级后老用户权限不变）
 */
export function getDiscoveredUserGroup(config: {
  GroupConfig?: AdminConfig['GroupConfig'];
}): UserGroup {
  const g = config.GroupConfig?.DefaultRegisterGroup;
  return config.GroupConfig && isUserGroup(g) ? g : 'A';
}

export function getUserGroup(
  config: AdminConfig,
  username: string | null | undefined,
  ownerUsername: string | undefined = process.env.USERNAME
): UserGroup {
  if (!username) return 'B'; // 无法识别身份：最小权限
  if (ownerUsername && username === ownerUsername) return 'A';
  const entry = config.UserConfig.Users.find((u) => u.username === username);
  if (!entry) return 'B';
  if (entry.role === 'owner') return 'A';
  return isUserGroup(entry.group) ? entry.group : 'A';
}

export function filterSitesByGroup<T extends SiteLike>(
  config: AdminConfig,
  group: UserGroup
): T[] {
  const enabled = config.SourceConfig.filter((s) => !s.disabled) as unknown as T[];
  if (group === 'A') return enabled;
  const gc = config.GroupConfig;
  if (!gc) return enabled;
  const allowed = new Set(gc.GroupBSourceKeys || []);
  return enabled.filter((s) => allowed.has(s.key));
}

export function getSitesForUser(
  config: AdminConfig,
  username: string | null | undefined
): { group: UserGroup; sites: SiteLike[] } {
  const group = getUserGroup(config, username);
  const sites = filterSitesByGroup<SiteLike>(config, group).map((s) => ({
    key: s.key,
    name: s.name,
    api: s.api,
    detail: s.detail,
  }));
  return { group, sites };
}

/** 校验并清洗后台提交的 B 组资源站列表：只保留真实存在的 key，去重 */
export function sanitizeSourceKeys(
  config: AdminConfig,
  keys: unknown
): string[] | null {
  if (!Array.isArray(keys) || keys.length > 1000) return null;
  const valid = new Set(config.SourceConfig.map((s) => s.key));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    if (typeof k !== 'string') return null;
    if (!valid.has(k)) return null;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
