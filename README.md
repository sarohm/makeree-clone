# Makeree clone

Local copy of https://g.makeree.com/makeree: every lab (section), project (guide), stage (step), tip and media file.

- `data/app.json`: home page, labs menu, theme colours
- `data/sections/<id>.json`: the guides in each lab (16 labs)
- `data/projects/<id>/{eng,heb,fra,_default}.json`: each guide in every language (98 guides)
- `media/<host>/<path>`: all images and videos (about 5,100 files, 735 MB); `media-manifest.json` maps original URL → local file
- `media-failed.json`: files the original site can't serve either (33 videos on the offline learn.forrealteam.com, 1 image returning 403)
- `index.html`, `assets/app.js`, `assets/style.css`: the site (no build step). Style lives in `assets/style.css`.

Run: `python3 -m http.server 8766 --directory .` and open http://localhost:8766
Re-sync from the live site: `python3 -I tools/crawl.py "$PWD"` (skips media already downloaded)
