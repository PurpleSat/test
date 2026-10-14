/** @jest-environment node */
import type { AdminConfig } from '../admin.types';
import {
  filterSitesByGroup,
  getDefaultRegisterGroup,
  getDiscoveredUserGroup,
  getSitesForUser,
  getUserGroup,
  sanitizeSourceKeys,
} from '../user-groups';

const src = (key: string, extra: Partial<AdminConfig['SourceConfig'][number]> = {}) => ({
  key,
  name: key,
  api: `https://${key}.example/api`,
  from: 'config' as const,
  ...extra,
});

const base = (): AdminConfig => ({
  SiteConfig: {
    SiteName: 's',
    Announcement: '',
    SearchDownstreamMaxPage: 5,
    SiteInterfaceCacheTime: 100,
    ImageProxy: '',
  },
  UserConfig: {
    AllowRegister: true,
    Users: [
      { username: 'boss', role: 'owner' },
      { username: 'old', role: 'user' }, // 升级前的老用户：无 group
      { username: 'a1', role: 'user', group: 'A' },
      { username: 'b1', role: 'user', group: 'B' },
      { username: 'adm', role: 'admin', group: 'B' },
    ],
  },
  SourceConfig: [src('s1'), src('s2'), src('s3', { from: 'custom' }), src('off', { disabled: true })],
});

describe('user groups', () => {
  it('站长恒为 A 组，老用户（无 group）为 A 组', () => {
    const c = base();
    expect(getUserGroup(c, 'boss', 'boss')).toBe('A');
    expect(getUserGroup(c, 'old', 'boss')).toBe('A');
    expect(getUserGroup(c, 'b1', 'boss')).toBe('B');
  });

  it('未知 / 无身份用户取最小权限 B 组', () => {
    const c = base();
    expect(getUserGroup(c, 'ghost', 'boss')).toBe('B');
    expect(getUserGroup(c, null, 'boss')).toBe('B');
  });

  it('站长即使被篡改成 B 也按 A 处理', () => {
    const c = base();
    c.UserConfig.Users[0].group = 'B';
    expect(getUserGroup(c, 'boss', 'boss')).toBe('A');
  });

  it('A 组：全部已启用源（含自定义），被禁用的除外', () => {
    const c = base();
    c.GroupConfig = { DefaultRegisterGroup: 'B', GroupBSourceKeys: ['s1'] };
    expect(filterSitesByGroup(c, 'A').map((s) => s.key)).toEqual(['s1', 's2', 's3']);
  });

  it('B 组：只有站长指定且已启用的源；陈旧 / 被禁用的 key 被忽略', () => {
    const c = base();
    c.GroupConfig = { DefaultRegisterGroup: 'B', GroupBSourceKeys: ['s1', 'off', 'gone'] };
    expect(filterSitesByGroup(c, 'B').map((s) => s.key)).toEqual(['s1']);
  });

  it('B 组指定为空列表 → 无任何资源站', () => {
    const c = base();
    c.GroupConfig = { DefaultRegisterGroup: 'B', GroupBSourceKeys: [] };
    expect(filterSitesByGroup(c, 'B')).toEqual([]);
  });

  it('未启用分组配置时 B 组暂时等同全部已启用源（升级后行为不变）', () => {
    const c = base();
    expect(filterSitesByGroup(c, 'B').map((s) => s.key)).toEqual(['s1', 's2', 's3']);
  });

  it('后新增的源不会自动开放给 B 组，但 A 组可用', () => {
    const c = base();
    c.GroupConfig = { DefaultRegisterGroup: 'B', GroupBSourceKeys: ['s1'] };
    c.SourceConfig.push(src('new1', { from: 'custom' }));
    expect(filterSitesByGroup(c, 'B').map((s) => s.key)).toEqual(['s1']);
    expect(filterSitesByGroup(c, 'A').map((s) => s.key)).toContain('new1');
  });

  it('getSitesForUser 不暴露多余字段且按分组过滤', () => {
    const c = base();
    c.GroupConfig = { DefaultRegisterGroup: 'B', GroupBSourceKeys: ['s2'] };
    const r = getSitesForUser(c, 'b1');
    expect(r.group).toBe('B');
    expect(r.sites.map((s) => s.key)).toEqual(['s2']);
    expect(Object.keys(r.sites[0]).sort()).toEqual(['api', 'detail', 'key', 'name']);
  });

  it('默认注册分组缺省为 B；发现型用户在未启用分组配置时为 A', () => {
    const c = base();
    expect(getDefaultRegisterGroup(c)).toBe('B');
    expect(getDiscoveredUserGroup(c)).toBe('A');
    c.GroupConfig = { DefaultRegisterGroup: 'B', GroupBSourceKeys: [] };
    expect(getDiscoveredUserGroup(c)).toBe('B');
    c.GroupConfig.DefaultRegisterGroup = 'A';
    expect(getDiscoveredUserGroup(c)).toBe('A');
  });

  it('sanitizeSourceKeys：去重；含未知 key / 非数组 / 非字符串则拒绝', () => {
    const c = base();
    expect(sanitizeSourceKeys(c, ['s1', 's1', 's2'])).toEqual(['s1', 's2']);
    expect(sanitizeSourceKeys(c, ['s1', 'nope'])).toBeNull();
    expect(sanitizeSourceKeys(c, 's1')).toBeNull();
    expect(sanitizeSourceKeys(c, [1])).toBeNull();
    expect(sanitizeSourceKeys(c, [])).toEqual([]);
  });
});
