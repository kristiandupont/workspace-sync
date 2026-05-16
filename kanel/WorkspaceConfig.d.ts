export type WorkspaceConfig = {
  name: string;
  schema: string;
  anchor: string;
  tables: Record<string, WorkspaceTableConfig>;
};

export type WorkspaceTableConfig = {
  link: string;
  omittedColumns?: string[];
};
