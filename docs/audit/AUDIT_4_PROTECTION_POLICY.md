# Audit 4 — Protection policy contract

Policy responses are now versioned (`version: 2`) and carry canonical protection and preference fields. The
backend model includes favorite, active-squad, special, evolution, valuation, tradeable and duplicate metadata
without EA secrets. Locked remains an unconditional solver exclusion from Audit 1. Presets are deterministic and
unknown presets fail closed; the existing notes field remains informational and is not consulted for safety rules.
Round-trip API compatibility is preserved because all new fields have safe defaults.
