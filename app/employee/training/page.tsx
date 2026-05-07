import { TrainingManager } from "@/components/TrainingManager";
import type {
  ClientTrainingEvent,
  ClientTrainingEventModule,
  CompanyClient,
  TrainingModule,
  TrainingModuleFile,
} from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";

export default async function TrainingPage() {
  const supabase = await createClient();

  const [
    { data: clients },
    { data: modules },
    { data: files },
    { data: events },
    { data: eventModules },
  ] = supabase
    ? await Promise.all([
        supabase.from("company_clients").select("*").neq("status", "Archived").order("name"),
        supabase.from("training_modules").select("*").order("updated_at", { ascending: false }),
        supabase.from("training_module_files").select("*").order("sort_order").order("created_at", { ascending: false }),
        supabase.from("client_training_events").select("*").order("scheduled_start_at", { ascending: true }),
        supabase.from("client_training_event_modules").select("*").order("sort_order"),
      ])
    : [{ data: null }, { data: null }, { data: null }, { data: null }, { data: null }];

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Training</div>
          <h1>Training modules and client events</h1>
          <p>Upload reusable class materials, schedule client training, and open presentation files from one internal workspace.</p>
        </div>
      </div>

      <TrainingManager
        clients={(clients ?? []) as CompanyClient[]}
        initialEventModules={(eventModules ?? []) as ClientTrainingEventModule[]}
        initialEvents={(events ?? []) as ClientTrainingEvent[]}
        initialFiles={(files ?? []) as TrainingModuleFile[]}
        initialModules={(modules ?? []) as TrainingModule[]}
      />
    </>
  );
}
