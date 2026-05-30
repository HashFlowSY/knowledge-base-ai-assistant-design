import type { SelectFieldOption } from "../ui/select-field";

export function toSelectOptions(options: [string, string][]): SelectFieldOption[] {
  return options.map(([value, label]) => ({ label, value }));
}
