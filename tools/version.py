#!/usr/bin/env python3
# Writes version.json = { build, files }: the build number from src/main.js + every module the page loads. index.html reads it
# (uncached) and stamps ?v=<build> on every module URL, so a phone never runs a stale copy. RUN THIS EVERY BUILD (after bumping BUILD).
import json, re, glob, os
os.chdir(os.path.join(os.path.dirname(__file__), '..'))
build = re.search(r'export const BUILD = (\d+);', open('src/main.js').read()).group(1)
files = sorted(['./' + f for f in glob.glob('src/*.js')] + ['./' + f for f in glob.glob('vendor/**/*.js', recursive=True)])
json.dump({'build': int(build), 'files': files}, open('version.json', 'w'), indent=0)
print('version.json: build', build, len(files), 'files')
