import { useEffect, useMemo, useState, KeyboardEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckSquare, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocalToday, toLocalDateKey } from "@/lib/dateOnly";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

type Todo = { id: string; text: string; done: boolean };

export default function TodoListCard() {
  const { user, loading: authLoading } = useAuth();
  const dateKey = useMemo(() => toLocalDateKey(getLocalToday()), []);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("todos")
        .select("id, text, done")
        .eq("user_id", user.id)
        .eq("todo_date", dateKey)
        .order("created_at", { ascending: false });
      if (!cancelled) {
        if (error) {
          console.error("Failed to load todos:", error);
        } else {
          setTodos((data ?? []) as Todo[]);
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, dateKey]);

  const addTodo = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user || saving) return;
    setSaving(true);
    const tempId = `temp-${Date.now()}`;
    const optimistic: Todo = { id: tempId, text: trimmed, done: false };
    setTodos((prev) => [optimistic, ...prev]);
    setText("");

    const { data, error } = await supabase
      .from("todos")
      .insert({ user_id: user.id, text: trimmed, todo_date: dateKey })
      .select("id, text, done")
      .single();

    if (error || !data) {
      console.error("Failed to add todo:", error);
      setTodos((prev) => prev.filter((t) => t.id !== tempId));
      setText(trimmed);
      toast({ title: "Couldn't save task", description: error?.message, variant: "destructive" });
    } else {
      setTodos((prev) => prev.map((t) => (t.id === tempId ? (data as Todo) : t)));
    }
    setSaving(false);
  };

  const toggleTodo = async (id: string) => {
    const target = todos.find((t) => t.id === id);
    if (!target || id.startsWith("temp-")) return;
    const nextDone = !target.done;
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: nextDone } : t)));
    const { error } = await supabase.from("todos").update({ done: nextDone }).eq("id", id);
    if (error) {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !nextDone } : t)));
      toast({ title: "Couldn't update task", variant: "destructive" });
    }
  };

  const removeTodo = async (id: string) => {
    if (id.startsWith("temp-")) return;
    const prev = todos;
    setTodos((p) => p.filter((t) => t.id !== id));
    const { error } = await supabase.from("todos").delete().eq("id", id);
    if (error) {
      setTodos(prev);
      toast({ title: "Couldn't delete task", variant: "destructive" });
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTodo();
    }
  };

  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-slate-100 dark:bg-slate-900/40">
            <CheckSquare className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold text-foreground">My 6 Most Important Things</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Write your top priorities for today — aim for 6</p>
          </div>
          {todos.length > 0 && (
            <Badge variant={open.length <= 6 ? "secondary" : "destructive"} className="text-xs shrink-0">
              {open.length}/6
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a task…"
            className="h-9 text-sm"
            disabled={!user || authLoading}
          />
          <Button
            type="button"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={addTodo}
            disabled={!text.trim() || !user || saving}
            aria-label="Add task"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
        ) : todos.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No tasks yet — add one above.
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0 min-w-0">
            {open.map((t) => (
              <TodoRow key={t.id} todo={t} onToggle={toggleTodo} onRemove={removeTodo} />
            ))}
            {done.map((t) => (
              <TodoRow key={t.id} todo={t} onToggle={toggleTodo} onRemove={removeTodo} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TodoRow({
  todo,
  onToggle,
  onRemove,
}: {
  todo: Todo;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="py-1 flex items-center gap-1.5 group min-w-0">
      <Checkbox
        checked={todo.done}
        onCheckedChange={() => onToggle(todo.id)}
        className="shrink-0 h-3.5 w-3.5"
        aria-label={todo.done ? "Mark incomplete" : "Mark complete"}
      />
      <p
        className={cn(
          "flex-1 text-xs text-foreground leading-tight line-clamp-2",
          todo.done && "line-through text-muted-foreground",
        )}
      >
        {todo.text}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={() => onRemove(todo.id)}
        aria-label="Delete task"
      >
        <X className="w-3 h-3 text-muted-foreground" />
      </Button>
    </div>
  );
}
