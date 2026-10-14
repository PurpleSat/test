/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedAuthUser } from '@/lib/auth-server';
import { getConfig, withConfigConflictRetry } from '@/lib/config';
import { checkCsrf } from '@/lib/csrf-guard';
import { getStorage } from '@/lib/db';
import { IStorage } from '@/lib/types';
import { isUserGroup, sanitizeSourceKeys } from '@/lib/user-groups';

export const runtime = 'edge';

/**
 * 用户分组管理（仅站长）。
 * 只允许站长操作：若管理员也能改分组，就能把自己提升到 A 组，等于越权。
 *
 *  - setGroupConfig : { defaultRegisterGroup: 'A'|'B', groupBSourceKeys: string[] }
 *  - setUserGroup   : { targetUsername, group: 'A'|'B' }
 */
export async function POST(request: NextRequest) {
  const csrf = checkCsrf(request);
  if (!csrf.ok) return csrf.response!;

  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { error: '不支持本地存储进行管理员配置' },
      { status: 400 }
    );
  }

  try {
    const authUser = await getVerifiedAuthUser(request, { requiredRole: 'owner' });
    if (!authUser || authUser.username !== process.env.USERNAME) {
      return NextResponse.json({ error: '仅站长可管理用户分组' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as any;
    const action = body?.action;
    if (action !== 'setGroupConfig' && action !== 'setUserGroup') {
      return NextResponse.json({ error: '参数格式错误' }, { status: 400 });
    }

    return await withConfigConflictRetry(async () => {
      const adminConfig = await getConfig();
      const storage: IStorage | null = getStorage();

      if (action === 'setGroupConfig') {
        const { defaultRegisterGroup, groupBSourceKeys } = body;
        if (!isUserGroup(defaultRegisterGroup)) {
          return NextResponse.json({ error: '默认注册分组必须为 A 或 B' }, { status: 400 });
        }
        const keys = sanitizeSourceKeys(adminConfig, groupBSourceKeys);
        if (!keys) {
          return NextResponse.json(
            { error: 'B 组资源站列表无效（包含不存在的资源站）' },
            { status: 400 }
          );
        }
        adminConfig.GroupConfig = {
          DefaultRegisterGroup: defaultRegisterGroup,
          GroupBSourceKeys: keys,
        };
        // 首次启用分组配置：把尚无分组的用户固化为 A 组，保证其权限不因此变化
        adminConfig.UserConfig.Users.forEach((u) => {
          if (!isUserGroup(u.group)) u.group = 'A';
        });
      } else {
        const { targetUsername, group } = body;
        if (typeof targetUsername !== 'string' || !isUserGroup(group)) {
          return NextResponse.json({ error: '参数格式错误' }, { status: 400 });
        }
        const target = adminConfig.UserConfig.Users.find(
          (u) => u.username === targetUsername
        );
        if (!target) {
          return NextResponse.json({ error: '目标用户不存在' }, { status: 404 });
        }
        if (target.role === 'owner' || targetUsername === process.env.USERNAME) {
          return NextResponse.json({ error: '站长恒为 A 组，无法修改' }, { status: 400 });
        }
        target.group = group;
      }

      if (storage && typeof (storage as any).setAdminConfig === 'function') {
        await (storage as any).setAdminConfig(adminConfig);
      }
      return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    });
  } catch (error) {
    console.error('用户分组操作失败:', error);
    return NextResponse.json(
      { error: '用户分组操作失败', details: (error as Error).message },
      { status: 500 }
    );
  }
}
