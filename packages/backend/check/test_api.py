#!/usr/bin/env python3
import sys
sys.path.insert(0, 'packages/backend')

from models import get_projects

projects = get_projects()
print(f"Total projects from backend: {len(projects)}")
for p in projects:
    print(f"  - {p['id']}: {p['title']}")
    print(f"    Summary: {p['summary'][:50]}...")
    print(f"    Milestones: {len(p.get('milestones', []))}")
    print(f"    News: {len(p.get('news', []))}")
