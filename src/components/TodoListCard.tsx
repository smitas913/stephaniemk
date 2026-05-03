import { useEffect, useMemo, useState, KeyboardEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckSquare, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocalToday, toLocalDateKey } from "@/lib/dateOnly";

type Todo = { id: string; text: string; done: boolean };

const STORAGE_PREFIX = "today-todo-list:";

function loadTodos(dateKey: string): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + dateKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTodos(dateKey: string, todos: Todo[]) {
  try {
    localStorage.setItem(STORAGE_PREFIX + dateKey, JSON.stringify(todos));
  } catch {
    // ignore
  }
}

function pruneOldKeys(currentKey: string) {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX) && k !== STORAGE_PREFIX + currentKey) {
        keys.push(k);
      }
    }
    // keep last 7 days
    keys.sort();
    const toRemove = keys.slice(0, Math.max(0, keys.length - 7));
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

export default function TodoListCard() {
  const dateKey = useMemo(() => toLocalDateKey(getLocalToday()), []);
  const [todos, setTodos] = useState<Todo[]>(() => loadTodos(dateKey));
  const [text, setText] = useState("");

  useEffect(() => {
    saveTodos(dateKey, todos);
  }, [dateKey, todos]);

  useEffect(() => {
    pruneOldKeys(dateKey);
  }, [dateKey]);

  const addTodo = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTodos((prev) => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text: trimmed, done: false },
      ...prev,
    ]);
    setText("");
  };

  const toggleTodo = (id: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const removeTodo = (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
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
          <CardTitle className="text-sm font-semibold text-foreground">To-Do List</CardTitle>
          {todos.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {open.length}
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
          />
          <Button
            type="button"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={addTodo}
            disabled={!text.trim()}
            aria-label="Add task"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {todos.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Brain-dump tasks for today — they reset tomorrow.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-border/40">
            {open.map((t) => (
              <TodoRow key={t.id} todo={t} onToggle={toggleTodo} onRemove={removeTodo} />
            ))}
            {done.length > 0 && (
              <div className="pt-2">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground py-1">
                  Completed ({done.length})
                </p>
                {done.map((t) => (
                  <TodoRow key={t.id} todo={t} onToggle={toggleTodo} onRemove={removeTodo} />
                ))}
              </div>
            )}
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
    <div className="py-2 flex items-center gap-3 group">
      <Checkbox
        checked={todo.done}
        onCheckedChange={() => onToggle(todo.id)}
        aria-label={todo.done ? "Mark incomplete" : "Mark complete"}
      />
      <p
        className={cn(
          "flex-1 text-sm text-foreground break-words",
          todo.done && "line-through text-muted-foreground",
        )}
      >
        {todo.text}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onRemove(todo.id)}
        aria-label="Delete task"
      >
        <X className="w-3.5 h-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
}
