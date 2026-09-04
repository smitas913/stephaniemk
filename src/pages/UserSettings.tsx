import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import ZoomDefaultsSettings from "@/components/ZoomDefaultsSettings";
import ScheduleSettings from "@/components/ScheduleSettings";
import CatalogMailDateSettings from "@/components/CatalogMailDateSettings";
import EmailPreferenceSettings from "@/components/EmailPreferenceSettings";
import FinancialDefaultsSettings from "@/components/FinancialDefaultsSettings";
import DiscountTypeSettings from "@/components/DiscountTypeSettings";
import MergeDuplicates from "@/components/MergeDuplicates";
import ResetMomentumTestData from "@/components/ResetMomentumTestData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarCog, MapPin, DollarSign, Upload, GitMerge, RotateCcw, ShoppingBag } from "lucide-react";

export default function UserSettings() {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Personal settings for your account. Changes here only affect you.
          </p>
        </div>

        <Tabs defaultValue="schedule" className="w-full">
          <TabsList className="flex flex-wrap h-auto justify-start gap-1">
            <TabsTrigger value="schedule" className="gap-1.5">
              <CalendarCog className="w-4 h-4" />
              Schedule
            </TabsTrigger>
            <TabsTrigger value="locations" className="gap-1.5">
              <MapPin className="w-4 h-4" />
              Event Locations
            </TabsTrigger>
            <TabsTrigger value="financial" className="gap-1.5">
              <DollarSign className="w-4 h-4" />
              Financial
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-1.5">
              <ShoppingBag className="w-4 h-4" />
              Order Options
            </TabsTrigger>
            <TabsTrigger value="data" className="gap-1.5">
              <Upload className="w-4 h-4" />
              My Data
            </TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="space-y-4 mt-4">
            <ScheduleSettings />
            <CatalogMailDateSettings />
            <EmailPreferenceSettings />
          </TabsContent>

          <TabsContent value="locations" className="mt-4">
            <ZoomDefaultsSettings />
          </TabsContent>

          <TabsContent value="financial" className="mt-4">
            <FinancialDefaultsSettings />
          </TabsContent>

          <TabsContent value="orders" className="mt-4">
            <DiscountTypeSettings />
          </TabsContent>

          <TabsContent value="data" className="space-y-4 mt-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Upload className="w-4 h-4 text-primary" />
                    Import Customers
                  </div>
                  <p className="text-xs text-muted-foreground">Import your customers from a CSV file</p>
                  <Button size="sm" variant="outline" onClick={() => navigate("/import-customers")}>
                    Go to Import
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <RotateCcw className="w-4 h-4 text-primary" />
                    Restore Contact Dates
                  </div>
                  <p className="text-xs text-muted-foreground">Re-import last contacted dates & rebuild follow-ups</p>
                  <Button size="sm" variant="outline" onClick={() => navigate("/restore-contact-dates")}>
                    Restore Dates
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <GitMerge className="w-4 h-4 text-primary" />
                    Merge Duplicates
                  </div>
                  <p className="text-xs text-muted-foreground">Find and merge duplicate customer records</p>
                  <MergeDuplicates />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Reset Activity Data</h3>
                <p className="text-xs text-muted-foreground">Remove test or incorrect activity entries from your momentum tracking</p>
              </div>
              <ResetMomentumTestData />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
