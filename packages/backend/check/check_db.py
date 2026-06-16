import sys
import os
sys.path.insert(0, 'packages/backend')
os.chdir('c:\\Users\\marle\\Documents\\Masterstudium\\Zuverlässige und sichere Systeme\\blockchain-donation')

from database import get_connection
c = get_connection().cursor()
c.execute('SELECT COUNT(*) FROM projects')
count = c.fetchone()[0]
print(f'Projects in DB: {count}')

if count > 0:
    c.execute('SELECT id, title FROM projects LIMIT 5')
    for row in c.fetchall():
        print(f'  - {row[0]}: {row[1]}')
