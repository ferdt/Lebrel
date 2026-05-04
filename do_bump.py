import glob
import os
import re

print("Updating version to 1.0.24 and cache to v24")

# Update HTML files
html_files = glob.glob('c:/repo/Lebrel/2_APP/*.html')
for f in html_files:
    with open(f, 'r', encoding='utf-8') as file:
        txt = file.read()
    txt = txt.replace('v1.0.19', 'v1.0.24')
    txt = re.sub(r'v=\d+', 'v=24', txt)
    with open(f, 'w', encoding='utf-8') as file:
        file.write(txt)

# Update config.js
config_file = 'c:/repo/Lebrel/2_APP/js/config.js'
with open(config_file, 'r', encoding='utf-8') as file:
    txt = file.read()
txt = txt.replace("VERSION: '1.0.19'", "VERSION: '1.0.24'")
txt = re.sub(r"CACHE_VERSION: '\d+'", "CACHE_VERSION: '24'", txt)
with open(config_file, 'w', encoding='utf-8') as file:
    file.write(txt)

# Update sw.js
sw_file = 'c:/repo/Lebrel/2_APP/sw.js'
with open(sw_file, 'r', encoding='utf-8') as file:
    txt = file.read()
txt = re.sub(r"CACHE_NAME = 'lebrel-v\d+'", "CACHE_NAME = 'lebrel-v24'", txt)
with open(sw_file, 'w', encoding='utf-8') as file:
    file.write(txt)

# Update update_version.py
uv_file = 'c:/repo/Lebrel/2_APP/update_version.py'
with open(uv_file, 'r', encoding='utf-8') as file:
    txt = file.read()
txt = re.sub(r'VERSION = "\d+"', 'VERSION = "24"', txt)
with open(uv_file, 'w', encoding='utf-8') as file:
    file.write(txt)

print("Done")
