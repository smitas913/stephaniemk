import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Copy, Save, RefreshCw, Plus, Trash2, Video } from "lucide-react";
import { toast } from "sonner";

interface FocusArea {
  title: string;
  goal: string;
  currentProgress: string;
  incentive: string;
}

interface EmailData {
  subjectLine: string;
  openingMessage: string;
  includeVideo: boolean;
  videoLink: string;
  focusAreas: FocusArea[];
  mainFocusThisWeek: string;
  productName: string;
  whyItMatters: string;
  simpleWayToShare: string;
  growthType: string;
  growthTakeaway: string;
  recognition: string;
  actionSteps: string[];
  closing: string;
}

const emptyFocusArea: FocusArea = { title: "", goal: "", currentProgress: "", incentive: "" };

const initialData: EmailData = {
  subjectLine: "",
  openingMessage: "",
  includeVideo: false,
  videoLink: "",
  focusAreas: [{ ...emptyFocusArea }],
  mainFocusThisWeek: "",
  productName: "",
  whyItMatters: "",
  simpleWayToShare: "",
  growthType: "Mindset",
  growthTakeaway: "",
  recognition: "",
  actionSteps: [""],
  closing: "",
};

function SectionHeader({ emoji, title, helper }: { emoji: string; title: string; helper: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
        <span>{emoji}</span> {title}
      </h3>
      <p className="text-xs text-muted-foreground italic">{helper}</p>
    </div>
  );
}

function AiButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onClick}>
      <Sparkles className="w-3.5 h-3.5" />
      {label}
    </Button>
  );
}

export default function WeeklyUnitEmailTemplate() {
  const [data, setData] = useState<EmailData>(initialData);
  const [generatedEmail, setGeneratedEmail] = useState<string | null>(null);

  const update = <K extends keyof EmailData>(key: K, value: EmailData[K]) =>
    setData((prev) => ({ ...prev, [key]: value }));

  const updateFocusArea = (index: number, field: keyof FocusArea, value: string) => {
    const areas = [...data.focusAreas];
    areas[index] = { ...areas[index], [field]: value };
    setData((prev) => ({ ...prev, focusAreas: areas }));
  };

  const addFocusArea = () => {
    setData((prev) => ({ ...prev, focusAreas: [...prev.focusAreas, { ...emptyFocusArea }] }));
  };

  const removeFocusArea = (index: number) => {
    if (data.focusAreas.length <= 1) return;
    setData((prev) => ({ ...prev, focusAreas: prev.focusAreas.filter((_, i) => i !== index) }));
  };

  const updateActionStep = (index: number, value: string) => {
    const steps = [...data.actionSteps];
    steps[index] = value;
    setData((prev) => ({ ...prev, actionSteps: steps }));
  };

  const addActionStep = () => {
    setData((prev) => ({ ...prev, actionSteps: [...prev.actionSteps, ""] }));
  };

  const removeActionStep = (index: number) => {
    if (data.actionSteps.length <= 1) return;
    setData((prev) => ({ ...prev, actionSteps: prev.actionSteps.filter((_, i) => i !== index) }));
  };

  const handleAiPlaceholder = (section: string) => {
    toast.info(`AI generation for "${section}" coming soon!`, { description: "This will use AI to suggest ideas." });
  };

  const generateDraft = () => {
    const lines: string[] = [];

    if (data.openingMessage) {
      lines.push(data.openingMessage);
      lines.push("");
    }

    if (data.includeVideo && data.videoLink) {
      lines.push("🎥 **This Week's Video**");
      lines.push(data.videoLink);
      lines.push("");
    }

    const filledAreas = data.focusAreas.filter((a) => a.title || a.goal || a.currentProgress);
    if (filledAreas.length > 0 || data.mainFocusThisWeek) {
      lines.push("📊 **Unit Focus**");
      lines.push("");
      filledAreas.forEach((area) => {
        if (area.title) lines.push(`**${area.title}**`);
        if (area.goal) lines.push(`🎯 Goal: ${area.goal}`);
        if (area.currentProgress) lines.push(`📈 Current: ${area.currentProgress}`);
        if (area.incentive) lines.push(`🏅 Incentive: ${area.incentive}`);
        lines.push("");
      });
      if (data.mainFocusThisWeek) {
        lines.push(`➡️ Focus This Week: ${data.mainFocusThisWeek}`);
        lines.push("");
      }
    }

    if (data.productName) {
      lines.push("💄 **Product Spotlight**");
      lines.push(`✨ ${data.productName}`);
      if (data.whyItMatters) lines.push(`💡 Why: ${data.whyItMatters}`);
      if (data.simpleWayToShare) lines.push(`📲 Share it: ${data.simpleWayToShare}`);
      lines.push("");
    }

    if (data.growthTakeaway) {
      const emoji = data.growthType === "Podcast" ? "🎧" : data.growthType === "Book" ? "📖" : data.growthType === "Habit" ? "🔁" : "🧠";
      lines.push(`${emoji} **Growth Corner — ${data.growthType}**`);
      lines.push(data.growthTakeaway);
      lines.push("");
    }

    if (data.recognition) {
      lines.push("🏆 **Shoutouts**");
      lines.push(data.recognition);
      lines.push("");
    }

    const filledSteps = data.actionSteps.filter((s) => s.trim());
    if (filledSteps.length > 0) {
      lines.push("✅ **This Week's Action Steps**");
      filledSteps.forEach((s) => lines.push(`• ${s}`));
      lines.push("");
    }

    if (data.closing) {
      lines.push(data.closing);
    }

    setGeneratedEmail(lines.join("\n"));
    toast.success("Draft generated!");
  };

  const copyEmail = () => {
    const text = generatedEmail || "";
    if (!text) return toast.error("Generate a draft first");
    navigator.clipboard.writeText(text);
    toast.success("Email copied to clipboard!");
  };

  const saveDraft = () => {
    toast.info("Save Draft coming soon!", { description: "Drafts will be stored in your Communications history." });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* 1. Subject Line */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-3">
          <SectionHeader emoji="✉️" title="Subject Line" helper="Keep it short, curiosity-driven, and energetic" />
          <Input
            placeholder="e.g. This week's game plan 🔥"
            value={data.subjectLine}
            onChange={(e) => update("subjectLine", e.target.value)}
          />
          <AiButton label="Generate 3 Ideas" onClick={() => handleAiPlaceholder("Subject Line")} />
        </CardContent>
      </Card>

      {/* 2. Opening Message */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-3">
          <SectionHeader emoji="👋" title="Opening Message" helper="2–3 lines. Set the tone, celebrate something, or create momentum" />
          <Textarea
            placeholder="Hey team! What a week..."
            value={data.openingMessage}
            onChange={(e) => update("openingMessage", e.target.value)}
            rows={3}
          />
          <AiButton label="Give me 3 options" onClick={() => handleAiPlaceholder("Opening Message")} />
        </CardContent>
      </Card>

      {/* 3. Video Section */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <SectionHeader emoji="🎥" title="Video Section" helper="Paste YouTube or video link (2–5 min message recommended)" />
            <div className="flex items-center gap-2">
              <Label htmlFor="video-toggle" className="text-xs text-muted-foreground">Include Video</Label>
              <Switch id="video-toggle" checked={data.includeVideo} onCheckedChange={(v) => update("includeVideo", v)} />
            </div>
          </div>
          {data.includeVideo && (
            <div className="flex items-center gap-2">
              <Video className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input placeholder="https://youtube.com/watch?v=..." value={data.videoLink} onChange={(e) => update("videoLink", e.target.value)} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Unit Focus (Dynamic) */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-4">
          <SectionHeader emoji="📊" title="Unit Focus" helper="Track one or multiple goals/challenges. Keep it visual and simple." />
          {data.focusAreas.map((area, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-border/40 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Focus Area {i + 1}</span>
                {data.focusAreas.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeFocusArea(i)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Title</Label>
                <Input placeholder="e.g. Faces Challenge, Recruiting Push" value={area.title} onChange={(e) => updateFocusArea(i, "title", e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Goal</Label>
                  <Input placeholder="$12,000" value={area.goal} onChange={(e) => updateFocusArea(i, "goal", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Current Progress</Label>
                  <Input placeholder="$7,200" value={area.currentProgress} onChange={(e) => updateFocusArea(i, "currentProgress", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Incentive / Prize (optional)</Label>
                <Input placeholder="e.g. Free lipstick set for hitting goal" value={area.incentive} onChange={(e) => updateFocusArea(i, "incentive", e.target.value)} />
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addFocusArea}>
            <Plus className="w-3.5 h-3.5" /> Add Focus Area
          </Button>
          <div className="space-y-1 pt-2 border-t border-border/30">
            <Label className="text-xs text-muted-foreground">Main Focus This Week</Label>
            <Input placeholder="What matters MOST this week across all goals?" value={data.mainFocusThisWeek} onChange={(e) => update("mainFocusThisWeek", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* 5. Product Spotlight */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-3">
          <SectionHeader emoji="💄" title="Product Spotlight" helper="One product. Make it easy for them to talk about or sell this week" />
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Product Name</Label>
              <Input placeholder="TimeWise Miracle Set" value={data.productName} onChange={(e) => update("productName", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Why It Matters</Label>
              <Textarea placeholder="Our best-seller this month..." value={data.whyItMatters} onChange={(e) => update("whyItMatters", e.target.value)} rows={2} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Simple Way to Share</Label>
              <Input placeholder="Text a before/after photo" value={data.simpleWayToShare} onChange={(e) => update("simpleWayToShare", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 6. Growth Corner */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-3">
          <SectionHeader emoji="🌱" title="Growth Corner" helper="One quick mindset or something you're learning. Keep it practical" />
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={data.growthType} onValueChange={(v) => update("growthType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Podcast">🎧 Podcast</SelectItem>
                  <SelectItem value="Book">📖 Book</SelectItem>
                  <SelectItem value="Mindset">🧠 Mindset</SelectItem>
                  <SelectItem value="Habit">🔁 Habit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Takeaway</Label>
              <Textarea placeholder="The one thing I learned this week..." value={data.growthTakeaway} onChange={(e) => update("growthTakeaway", e.target.value)} rows={2} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 7. Recognition */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-3">
          <SectionHeader emoji="🏆" title="Recognition" helper="Keep it short. Highlight a few wins, not everyone" />
          <Textarea placeholder="Shoutout to Sarah for her first $600 week! 🎉" value={data.recognition} onChange={(e) => update("recognition", e.target.value)} rows={3} />
        </CardContent>
      </Card>

      {/* 8. Action Steps */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-3">
          <SectionHeader emoji="✅" title="Action Steps" helper="Be specific. What should they DO this week?" />
          <div className="space-y-2">
            {data.actionSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{i + 1}.</span>
                <Input placeholder={`Action step ${i + 1}`} value={step} onChange={(e) => updateActionStep(i, e.target.value)} />
                {data.actionSteps.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeActionStep(i)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addActionStep}>
            <Plus className="w-3.5 h-3.5" /> Add Step
          </Button>
        </CardContent>
      </Card>

      {/* 9. Closing */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-3">
          <SectionHeader emoji="💛" title="Closing" helper="1–2 lines. Encourage, reinforce belief, or create momentum" />
          <Input placeholder="You've got this — let's make it a great week! 💪" value={data.closing} onChange={(e) => update("closing", e.target.value)} />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button className="gap-2" onClick={generateDraft}>
          <Sparkles className="w-4 h-4" /> Generate Draft
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => handleAiPlaceholder("Regenerate Sections")}>
          <RefreshCw className="w-4 h-4" /> Regenerate Sections
        </Button>
        <Button variant="outline" className="gap-2" onClick={saveDraft}>
          <Save className="w-4 h-4" /> Save Draft
        </Button>
        <Button variant="outline" className="gap-2" onClick={copyEmail}>
          <Copy className="w-4 h-4" /> Copy Email
        </Button>
      </div>

      {/* Generated Preview */}
      {generatedEmail && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">📧 Email Preview</h3>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={copyEmail}>
                <Copy className="w-3.5 h-3.5" /> Copy
              </Button>
            </div>
            {data.subjectLine && (
              <p className="text-sm font-semibold text-foreground">Subject: {data.subjectLine}</p>
            )}
            <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{generatedEmail}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
