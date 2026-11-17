import type { ComponentType } from 'react';

import type { ProjectInfo } from '../client/types';

import { Certificates } from './Certificates';
import { Data } from './Data';
import { Endpoints } from './Endpoints';
import { Overview } from './Overview';
import { Requests } from './Requests';

export interface Screen {
  id: string;
  label: string;
  component: ComponentType<{ project: ProjectInfo }>;
  /** Only for standalone workspaces. */
  workspaceOnly?: boolean;
}

/** The project's tabs, in order. Each screen is one file in this folder. */
export const screens: Screen[] = [
  { id: 'overview', label: 'Overview', component: Overview },
  { id: 'endpoints', label: 'Endpoints', component: Endpoints },
  { id: 'requests', label: 'Requests', component: Requests },
  { id: 'data', label: 'Data', component: Data },
  { id: 'certificates', label: 'Certificates', component: Certificates },
];
