import { FilterDate, FilterSelect, FilterSearch } from "@/components/ui/filters";
import type { Dataset } from "@/server/reports/datasets";

type Opt = { value: string; label: string };

/** Inputs for a dataset's declared filters. Area and Lodge options are supplied by the page (RLS-filtered). */
export function DatasetFilterFields({ dataset, values, areas, lodges, prefix = "" }: {
  dataset: Pick<Dataset, "filters">; values: Record<string, string | undefined>; areas: Opt[]; lodges: Opt[]; prefix?: string;
}) {
  return (
    <>
      {(dataset.filters ?? []).map((f) => {
        const name = prefix + f.key;
        if (f.type === "date") return <FilterDate key={f.key} name={name} label={f.label} defaultValue={values[name]} />;
        if (f.type === "select") {
          const options = f.key === "area" && !f.options ? areas : f.key === "lodge" && !f.options ? lodges : f.options ?? [];
          return <FilterSelect key={f.key} name={name} label={f.label} defaultValue={values[name]} options={options} />;
        }
        return <FilterSearch key={f.key} name={name} label={f.label} defaultValue={values[name]} />;
      })}
    </>
  );
}
