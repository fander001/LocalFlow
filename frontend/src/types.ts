export type EntryKind = 'folder' | 'image' | 'video' | 'file';

export interface CatalogEntry {
  kind: EntryKind;
  name: string;
  path: string;
  size: number;
  modifiedUnixMs: number;
}

export interface Breadcrumb {
  name: string;
  path: string;
}

export interface FolderData {
  rootName: string;
  name: string;
  relativePath: string;
  depth: number;
  startDepth: number;
  mode: 'navigation' | 'feed';
  breadcrumbs: Breadcrumb[];
  folders: CatalogEntry[];
  media: CatalogEntry[];
  other: CatalogEntry[];
}

export interface StatusData {
  configured: boolean;
  rootName?: string;
  rootPath?: string;
  startDepth: number;
  lastFolder: string;
  lastStartDepth: number;
}
