"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface LocationSuggestion {
  name: string;
  country: string;
  state?: string;
  lat: number;
  lon: number;
}

interface LocationInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function LocationInput({ value, onChange, placeholder, className }: LocationInputProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSuggestions = async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`
      );
      const data = await response.json();
      
      if (data.results) {
        setSuggestions(
          data.results.map((result: any) => ({
            name: result.name,
            country: result.country,
            state: result.admin1,
            lat: result.latitude,
            lon: result.longitude,
          }))
        );
      } else {
        setSuggestions([]);
      }
    } catch (error) {
      console.error("Failed to fetch location suggestions:", error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (newValue: string) => {
    onChange(newValue);
    setShowSuggestions(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(newValue);
    }, 300);
  };

  const handleSelectSuggestion = (suggestion: LocationSuggestion) => {
    const displayValue = suggestion.state
      ? `${suggestion.name}, ${suggestion.state}, ${suggestion.country}`
      : `${suggestion.name}, ${suggestion.country}`;
    onChange(displayValue);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => value && setShowSuggestions(true)}
        className={cn("h-14 text-base bg-card border-border placeholder:text-muted-foreground/50", className)}
      />

      {showSuggestions && (suggestions.length > 0 || isLoading) && (
        <div className="absolute z-50 w-full mt-2 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : (
            suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.name}-${suggestion.lat}-${index}`}
                onClick={() => handleSelectSuggestion(suggestion)}
                className="w-full px-4 py-3 text-left hover:bg-secondary transition-colors text-sm"
              >
                <div className="font-medium">{suggestion.name}</div>
                <div className="text-muted-foreground text-xs">
                  {suggestion.state ? `${suggestion.state}, ` : ""}{suggestion.country}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
