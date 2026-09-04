import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CustomerList from "./CustomerList";
import FacialContacts from "./FacialContacts";
import Prospects from "./Prospects";

const VALID_TABS = ["customers", "prospects", "facial-contacts"] as const;
type Tab = (typeof VALID_TABS)[number];

export default function Clients() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab");
  const tab: Tab = VALID_TABS.includes(raw as Tab) ? (raw as Tab) : "customers";

  const setTab = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Clients</h1>
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="prospects">Prospects</TabsTrigger>
            <TabsTrigger value="facial-contacts">Facial Contacts</TabsTrigger>
          </TabsList>
          <TabsContent value="customers">
            <CustomerList embedded />
          </TabsContent>
          <TabsContent value="prospects">
            <Prospects embedded />
          </TabsContent>
          <TabsContent value="facial-contacts">
            <FacialContacts embedded />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
