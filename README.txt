Holden Beach interactive map
============================

This folder is a self-contained static website. It does not need a database
or an internet connection for the map itself (tiles, data, and Leaflet are
all included). Google Maps walking and biking directions open in a new tab
and do need a network connection.

How to open
-----------
Serve this folder with any static web server, then open it in a browser.

  python3 -m http.server 8080
  # then visit http://localhost:8080/

Opening index.html as a file:// page is not recommended: some browsers
block the map tiles and data files.

On a phone, add the page to the home screen or open it in Chrome. The layout
is built for a phone-sized screen first.

What is on the map (updated 21 Nov 2026)
------------------
- Illustrated base map (default): the final Holden Beach Insider print art,
  without print labels, pins, insets, key or ads, rendered in UTM 17N
  (EPSG:32617) and warped to Web Mercator tiles (tiles/illustrated, webp,
  native to zoom 17, zoom 18 around the bridge). Bridge Area, Causeway and
  Supply detail art is blended in where it applies. Built by
  build_web_tiles.py in the print project (build_map_enh.py, read-only).
- Plain base map (Layers > Plain map), as before.
- Street names (overlay on the illustrated map up to zoom 16)
- 106 businesses on 89 numbered pins - numbers and names match the printed
  map and its Business Directory (Directory button, top right)
- 9 official parks / Fit Trail
- 15 landmarks (incl. Concert Stage at Block Q and the 6 full hook-up
  campsites at the pier property; realty offices and restaurants that are
  now business pins were removed from this layer)
- 25 public beach accesses (shown on the dune line, as printed)
- 7 public restrooms / porta-johns (Block Q restrooms moved per Keith;
  porta-johns stay online only)
- Parking areas: 10 mapped OpenStreetMap parking areas (off by default)

Tap a marker for its name, address, details, and Walking / Biking
directions (Google Maps). Use the location button to show where you are.
There is no distance readout or measuring tool.

Map data © OpenStreetMap contributors (ODbL). Addresses: Town of Holden
Beach, Brunswick County GIS, and NC DCM. Decisions confirmed 15 Nov 2026.
