#!/usr/bin/env python3
"""Test what the API returns."""
import sys
import json
sys.path.insert(0, 'packages/backend')

from models import get_projects

projects = get_projects()
print("=== Backend API Response ===")
print(json.dumps(projects[:1], indent=2, default=str))  # Print first project as JSON
print(f"\nTotal projects: {len(projects)}")
print("\nProject IDs:")
for p in projects:
    print(f"  - {p['id']}")
