/** 用户分组：A 组可访问全部已启用资源站；B 组只能访问站长指定的资源站 */
export type UserGroup = 'A' | 'B';

export interface AdminConfig {
  configVersion?: number;
  SiteConfig: {
    SiteName: string;
    Announcement: string;
    SearchDownstreamMaxPage: number;
    SiteInterfaceCacheTime: number;
    ImageProxy: string;
  };
  UserConfig: {
    AllowRegister: boolean;
    Users: {
      username: string;
      role: 'user' | 'admin' | 'owner';
      banned?: boolean;
      /** 缺省视为 A 组（兼容升级前的老用户）；站长恒为 A 组 */
      group?: UserGroup;
    }[];
  };
  /**
   * 分组配置。未配置（undefined）表示站长尚未启用分组限制：
   * B 组暂时可访问全部已启用资源站，新注册用户仍会被标记为 B 组。
   */
  GroupConfig?: {
    /** 新注册用户（及后台新增用户）的默认分组 */
    DefaultRegisterGroup: UserGroup;
    /** B 组可访问的资源站 key 列表 */
    GroupBSourceKeys: string[];
  };
  SourceConfig: {
    key: string;
    name: string;
    api: string;
    detail?: string;
    from: 'config' | 'custom';
    disabled?: boolean;
  }[];
}

export interface AdminConfigResult {
  Role: 'owner' | 'admin';
  Config: AdminConfig;
}
