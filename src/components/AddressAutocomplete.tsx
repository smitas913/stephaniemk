import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Command, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { MapPin, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export interface ParsedAddress {
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  formatted: string;
}

interface Suggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect?: (parsed: ParsedAddress) => void;
  placeholder?: string;
  className?: string;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onAddressSelect,
  placeholder = "Start typing an address…",
  className,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const suppressFetch = useRef(false);

  const fetchSuggestions = useCallback(async (input: string) => {
    if (input.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("places-autocomplete", {
        body: { action: "autocomplete", input },
      });
      if (error) throw error;
      const items: Suggestion[] = data?.suggestions || [];
      setSuggestions(items);
      setIsOpen(items.length > 0);
    } catch (e) {
      console.error("Autocomplete error:", e);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = (val: string) => {
    onChange(val);
    if (suppressFetch.current) {
      suppressFetch.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  const handleSelect = async (suggestion: Suggestion) => {
    suppressFetch.current = true;
    onChange(suggestion.description);
    setIsOpen(false);
    setSuggestions([]);

    try {
      const { data, error } = await supabase.functions.invoke("places-autocomplete", {
        body: { action: "details", placeId: suggestion.placeId },
      });
      if (error) throw error;
      if (data && onAddressSelect) {
        onAddressSelect(data as ParsedAddress);
      }
    } catch (e) {
      console.error("Place details error:", e);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className={cn("h-10 pl-9", className)}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-md border border-border bg-popover shadow-md">
          <Command>
            <CommandList>
              <CommandEmpty>No addresses found</CommandEmpty>
              {suggestions.map((s) => (
                <CommandItem
                  key={s.placeId}
                  value={s.description}
                  onSelect={() => handleSelect(s)}
                  className="cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                  <div className="truncate">
                    <span className="font-medium text-foreground">{s.mainText}</span>
                    {s.secondaryText && (
                      <span className="text-muted-foreground ml-1 text-xs">{s.secondaryText}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}
