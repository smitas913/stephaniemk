import Layout from "@/components/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Archive, History } from "lucide-react";
import WeeklyUnitEmailTemplate from "@/components/WeeklyUnitEmailTemplate";

export default function Communications() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Communications</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Create, manage, and send team communications</p>
        </div>

        <Tabs defaultValue="templates" className="w-full">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="templates" className="gap-1.5">
              <FileText className="w-4 h-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="drafts" className="gap-1.5">
              <Archive className="w-4 h-4" />
              Drafts
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="w-4 h-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="templates">
            <div className="mt-4 space-y-4">
              <h3 className="text-lg font-semibold text-foreground">📨 Weekly Unit Email</h3>
              <p className="text-sm text-muted-foreground">
                A guided writing experience to craft your weekly unit email in 10–15 minutes.
              </p>
              <WeeklyUnitEmailTemplate />
            </div>
          </TabsContent>

          <TabsContent value="drafts">
            <div className="mt-4 flex flex-col items-center justify-center py-16 text-center">
              <Archive className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No drafts yet</p>
              <p className="text-xs text-muted-foreground mt-1">Saved drafts will appear here</p>
            </div>
          </TabsContent>

          <TabsContent value="history">
            <div className="mt-4 flex flex-col items-center justify-center py-16 text-center">
              <History className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No history yet</p>
              <p className="text-xs text-muted-foreground mt-1">Sent communications will appear here</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
