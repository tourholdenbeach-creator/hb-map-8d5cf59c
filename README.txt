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

What is on the map
------------------
- Painted Holden Beach base map, with a Street names layer you can turn off
- 9 official parks / Fit Trail
- 24 landmarks
- 25 public beach accesses
- 7 public restrooms / porta-johns (the former PW1 porta-john and the
  OpenStreetMap toilet at The Point are not on this map)

Tap a marker for its name, address, details, and Walking / Biking
directions (Google Maps). Use the location button to show where you are.
There is no distance readout or measuring tool.

Map data © OpenStreetMap contributors (ODbL). Addresses: Town of Holden
Beach, Brunswick County GIS, and NC DCM. Decisions confirmed 15 Nov 2026.
