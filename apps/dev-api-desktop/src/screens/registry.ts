import type { ComponentType } from 'react';

import type { ProjectInfo } from '../client/types';

import { Overview } from './Overview';

export interface Screen {
  id: string;
  label: string;
  component: ComponentType<{ project: ProjectInfo }>;
  /** Only for standalone workspaces. */
  workspaceOnly?: boolean;
}

/** The project's tabs, in order. Each screen is one file in this folder. */
export const screens: Screen[] = [{ id: 'overview', label: 'Overview', component: Overview }];
