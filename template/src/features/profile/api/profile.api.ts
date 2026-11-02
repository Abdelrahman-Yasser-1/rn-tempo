import { UserSchema } from '@features/auth';
import { request } from '@services/http/request';

import type { UpdateProfile } from './schemas';

export function updateProfile(id: number, body: Readonly<UpdateProfile>) {
  return request({ method: 'PUT', url: `/users/${String(id)}`, data: body }, UserSchema);
}
