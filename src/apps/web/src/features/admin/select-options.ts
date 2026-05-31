import type { SelectFieldOption } from "@/components/ui/select";

export function toSelectOptions(options: [string, string][]): SelectFieldOption[] {
  return options.map(([value, label]) => ({ label, value }));
}
