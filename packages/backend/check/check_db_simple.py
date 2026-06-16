import sys
import json
sys.path.insert(0, '.')

from database import get_connection

# Check database
conn = get_connection()
cursor = conn.cursor()

cursor.execute("SELECT COUNT(*) FROM projects")
count = cursor.fetchone()[0]
print(f"Projects in DB: {count}")

if count > 0:
    cursor.execute("SELECT id, title FROM projects LIMIT 5")
    for row in cursor.fetchall():
        print(f"  - {row[0]}: {row[1]}")

conn.close()
