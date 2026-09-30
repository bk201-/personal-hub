export const PRESET_COLORS = [
  '#1677ff', // blue (default)
  '#52c41a', // green
  '#fa8c16', // orange
  '#eb2f96', // pink
  '#722ed1', // purple
  '#13c2c2', // cyan
  '#f5222d', // red
  '#faad14', // gold
  '#8c8c8c', // gray
  '#2f54eb', // geekblue
];

export interface GroupFormValues {
  name: string;
  color: string;
  pin?: string;
  removePin?: boolean;
}
